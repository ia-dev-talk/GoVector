import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:uuid/uuid.dart';

import 'package:mobile_app/features/sync/technician_outbox_event.dart';
import 'package:mobile_app/services/technician_legacy_outbox_migrator.dart';
import 'package:mobile_app/services/technician_outbox_store.dart';
import 'package:mobile_app/services/technician_sync_service.dart';

void main() {
  sqfliteFfiInit();

  const ownerA = TechnicianOutboxOwner(userId: 3, technicianId: 3);
  const ownerB = TechnicianOutboxOwner(userId: 4, technicianId: 4);
  late Directory tempDirectory;
  late String databasePath;
  final openStores = <TechnicianOutboxStore>[];

  TechnicianOutboxStore createStore() {
    final store = TechnicianOutboxStore(
      databaseFactoryOverride: databaseFactoryFfi,
      databasePath: databasePath,
    );
    openStores.add(store);
    return store;
  }

  setUp(() async {
    tempDirectory = await Directory.systemTemp.createTemp('bluevector_outbox_');
    databasePath = '${tempDirectory.path}${Platform.pathSeparator}outbox.db';
    SharedPreferences.setMockInitialValues({});
  });

  tearDown(() async {
    for (final store in openStores) {
      await store.close();
    }
    openStores.clear();
    await tempDirectory.delete(recursive: true);
  });

  test(
    'enqueue generates one UUID and preserves it across a restart',
    () async {
      final firstStore = createStore();
      final event = await firstStore.enqueue(
        owner: ownerA,
        jobId: 8,
        type: 'intervention_comment',
        payload: {'value': 'Test terrain'},
      );

      expect(Uuid.isValidUUID(fromString: event.eventId), isTrue);
      await firstStore.close();
      openStores.remove(firstStore);

      final reopenedStore = createStore();
      final persisted = await reopenedStore.eventForOwner(
        ownerA,
        event.eventId,
      );
      expect(persisted?.eventId, event.eventId);
      expect(persisted?.payload['value'], 'Test terrain');
      expect(persisted?.status, TechnicianOutboxStatus.pending);
    },
  );

  test(
    'legacy SharedPreferences migration is idempotent and loses nothing',
    () async {
      final store = createStore();
      final rawActions = [
        jsonEncode({
          'action': 'intervention_comment',
          'data': {'job_id': 8, 'value': 'première'},
          'timestamp': '2026-08-05T08:00:00Z',
        }),
        jsonEncode({
          'action': 'intervention_comment',
          'data': {'job_id': 8, 'value': 'première'},
          'timestamp': '2026-08-05T08:00:00Z',
        }),
        jsonEncode({
          'action': 'equipment_scan',
          'data': {'job_id': 99, 'code': 'ONT-99'},
          'timestamp': '2026-08-05T08:01:00Z',
        }),
      ];
      SharedPreferences.setMockInitialValues({
        TechnicianLegacyOutboxMigrator.legacyPendingActionsKey: rawActions,
      });
      final preferences = await SharedPreferences.getInstance();
      const migrator = TechnicianLegacyOutboxMigrator();

      final first = await migrator.migrate(
        preferences: preferences,
        store: store,
        owner: ownerA,
        assignedJobIds: {8},
      );
      expect(first.migrated, 2);
      expect(first.quarantined, 1);
      expect(await store.nonAcknowledgedCount(ownerA), 2);
      expect(await store.quarantineCount(), 1);
      expect(
        preferences.containsKey(
          TechnicianLegacyOutboxMigrator.legacyPendingActionsKey,
        ),
        isFalse,
      );

      await preferences.setStringList(
        TechnicianLegacyOutboxMigrator.legacyPendingActionsKey,
        rawActions,
      );
      final second = await migrator.migrate(
        preferences: preferences,
        store: store,
        owner: ownerA,
        assignedJobIds: {8},
      );
      expect(second.alreadyPersisted, 3);
      expect(await store.nonAcknowledgedCount(ownerA), 2);
      expect(await store.quarantineCount(), 1);
    },
  );

  test('legacy data remains when SQLite persistence fails', () async {
    final rawActions = [
      jsonEncode({
        'action': 'intervention_comment',
        'data': {'job_id': 8, 'value': 'a conserver'},
        'timestamp': '2026-08-05T08:00:00Z',
      }),
    ];
    SharedPreferences.setMockInitialValues({
      TechnicianLegacyOutboxMigrator.legacyPendingActionsKey: rawActions,
    });
    final preferences = await SharedPreferences.getInstance();

    await expectLater(
      const TechnicianLegacyOutboxMigrator().migrate(
        preferences: preferences,
        store: _FailingLegacyImportStore(),
        owner: ownerA,
        assignedJobIds: {8},
      ),
      throwsStateError,
    );
    expect(
      preferences.getStringList(
        TechnicianLegacyOutboxMigrator.legacyPendingActionsKey,
      ),
      rawActions,
    );
  });

  test('17 acknowledgements leave only the one retryable event', () async {
    final store = createStore();
    final events = <TechnicianOutboxEvent>[];
    for (var index = 0; index < 18; index++) {
      events.add(
        await store.enqueue(
          owner: ownerA,
          jobId: 8,
          type: 'intervention_comment',
          payload: {'value': 'action $index'},
        ),
      );
    }

    await store.applyAcknowledgements(ownerA, [
      for (final event in events.take(17))
        TechnicianSyncEventAck(
          eventId: event.eventId,
          status: TechnicianOutboxStatus.acknowledged,
        ),
      TechnicianSyncEventAck(
        eventId: events.last.eventId,
        status: TechnicianOutboxStatus.retryable,
        error: 'réseau',
      ),
    ]);

    expect(await store.nonAcknowledgedCount(ownerA), 1);
    final retryBatch = await store.claimSyncBatch(ownerA);
    expect(retryBatch, hasLength(1));
    expect(retryBatch.single.eventId, events.last.eventId);
  });

  test('rejected and conflict events are retained but not resent', () async {
    final store = createStore();
    final rejected = await store.enqueue(
      owner: ownerA,
      jobId: 8,
      type: 'intervention_video',
      payload: {'local_path': '/private/video.mp4'},
    );
    final conflict = await store.enqueue(
      owner: ownerA,
      jobId: 8,
      type: 'complete_job',
      payload: const {},
    );

    await store.applyAcknowledgements(ownerA, [
      TechnicianSyncEventAck(
        eventId: rejected.eventId,
        status: TechnicianOutboxStatus.rejected,
        code: 'unsupported_action',
      ),
      TechnicianSyncEventAck(
        eventId: conflict.eventId,
        status: TechnicianOutboxStatus.conflict,
        code: 'invalid_job_status',
      ),
    ]);

    expect(await store.nonAcknowledgedCount(ownerA), 2);
    expect(await store.claimSyncBatch(ownerA), isEmpty);
  });

  test('awaiting media is counted but never sent before upload', () async {
    final store = createStore();
    await store.enqueue(
      owner: ownerA,
      jobId: 8,
      type: 'intervention_photo',
      payload: const {'attachment_id': 'attachment-1'},
      status: TechnicianOutboxStatus.awaitingMedia,
    );

    final summary = await store.summaryForOwner(ownerA);
    expect(summary.toSynchronize, 1);
    expect(summary.toReview, 0);
    expect(await store.claimSyncBatch(ownerA), isEmpty);
  });

  test('sync counters separate retryable from rejected', () async {
    final store = createStore();
    final retry = await store.enqueue(
      owner: ownerA,
      jobId: 8,
      type: 'intervention_comment',
      payload: const {'value': 'retry'},
    );
    final rejected = await store.enqueue(
      owner: ownerA,
      jobId: 8,
      type: 'client_signature',
      payload: const {'points': []},
    );
    await store.applyAcknowledgements(ownerA, [
      TechnicianSyncEventAck(
        eventId: retry.eventId,
        status: TechnicianOutboxStatus.retryable,
      ),
      TechnicianSyncEventAck(
        eventId: rejected.eventId,
        status: TechnicianOutboxStatus.rejected,
      ),
    ]);

    final summary = await store.summaryForOwner(ownerA);
    expect(summary.toSynchronize, 1);
    expect(summary.toReview, 1);
    expect(summary.total, 2);
  });

  test('user A and user B have isolated counts and sync batches', () async {
    final store = createStore();
    await store.enqueue(
      owner: ownerA,
      jobId: 8,
      type: 'intervention_comment',
      payload: const {'value': 'A'},
    );
    await store.enqueue(
      owner: ownerB,
      jobId: 41,
      type: 'intervention_comment',
      payload: const {'value': 'B'},
    );

    expect(await store.nonAcknowledgedCount(ownerA), 1);
    expect(await store.nonAcknowledgedCount(ownerB), 1);
    final batchA = await store.claimSyncBatch(ownerA);
    expect(batchA, hasLength(1));
    expect(batchA.single.ownerUserId, ownerA.userId);
    expect(await store.nonAcknowledgedCount(ownerB), 1);
  });

  test('sync is single-flight and applies individual server results', () async {
    final store = createStore();
    final first = await store.enqueue(
      owner: ownerA,
      jobId: 8,
      type: 'intervention_comment',
      payload: const {'value': 'ok'},
    );
    final second = await store.enqueue(
      owner: ownerA,
      jobId: 8,
      type: 'intervention_comment',
      payload: const {'value': 'retry'},
    );
    final releaseResponse = Completer<void>();
    var requestCount = 0;
    final client = MockClient((request) async {
      requestCount++;
      final sent = jsonDecode(request.body) as Map<String, dynamic>;
      final firstPayload = (sent['events'] as List).first as Map;
      expect(firstPayload.containsKey('owner_user_id'), isFalse);
      expect(firstPayload.containsKey('owner_technician_id'), isFalse);
      await releaseResponse.future;
      return http.Response(
        jsonEncode({
          'results': [
            {'event_id': first.eventId, 'status': 'acknowledged'},
            {
              'event_id': second.eventId,
              'status': 'retryable',
              'code': 'temporary_error',
            },
          ],
        }),
        200,
      );
    });
    final service = TechnicianSyncService(
      store: store,
      endpoint: Uri.parse('https://bluevector.test/api/v1/tech/sync'),
      tokenProvider: () async => 'jwt',
      onlineProbe: () async => true,
      client: client,
    );

    final runA = service.sync(ownerA);
    final runB = service.sync(ownerA);
    releaseResponse.complete();
    final results = await Future.wait([runA, runB]);

    expect(requestCount, 1);
    expect(results.first.synced, 1);
    expect(results.first.failed, 1);
    expect(await store.nonAcknowledgedCount(ownerA), 1);
    expect(
      (await store.eventForOwner(ownerA, first.eventId))?.status,
      TechnicianOutboxStatus.acknowledged,
    );
    expect(
      (await store.eventForOwner(ownerA, second.eventId))?.status,
      TechnicianOutboxStatus.retryable,
    );
  });
}

class _FailingLegacyImportStore extends TechnicianOutboxStore {
  _FailingLegacyImportStore()
    : super(
        databaseFactoryOverride: databaseFactoryFfi,
        databasePath: inMemoryDatabasePath,
      );

  @override
  Future<LegacyOutboxMigrationResult> importLegacyActions({
    required List<String> rawActions,
    required TechnicianOutboxOwner owner,
    required Set<int> assignedJobIds,
  }) {
    throw StateError('SQLite indisponible');
  }
}
