import 'dart:io';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile_app/features/sync/technician_attachment.dart';
import 'package:mobile_app/features/sync/technician_outbox_event.dart';
import 'package:mobile_app/services/technician_attachment_store.dart';
import 'package:mobile_app/services/technician_media_service.dart';
import 'package:mobile_app/services/technician_outbox_store.dart';

void main() {
  sqfliteFfiInit();
  late Directory directory;
  late String databasePath;
  final stores = <TechnicianAttachmentStore>[];

  TechnicianAttachmentStore store() {
    final value = TechnicianAttachmentStore(
      databaseFactoryOverride: databaseFactoryFfi,
      databasePath: databasePath,
    );
    stores.add(value);
    return value;
  }

  TechnicianAttachment attachment({int userId = 3, int technicianId = 3}) {
    final now = DateTime.utc(2026, 8, 6);
    return TechnicianAttachment(
      attachmentId: 'attachment-$userId',
      eventId: 'event-$userId',
      jobId: 8,
      ownerUserId: userId,
      ownerTechnicianId: technicianId,
      kind: 'photo',
      eventType: 'intervention_photo',
      localPath: '${directory.path}/photo-$userId.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 42,
      sha256: List.filled(64, 'a').join(),
      metadataJson: '{}',
      status: TechnicianAttachmentStatus.pending,
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    );
  }

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('bluevector_media_');
    databasePath = '${directory.path}${Platform.pathSeparator}media.db';
  });

  tearDown(() async {
    for (final value in stores) {
      await value.close();
    }
    stores.clear();
    await directory.delete(recursive: true);
  });

  test('attachment queue survives restart and remains owner scoped', () async {
    const ownerA = TechnicianOutboxOwner(userId: 3, technicianId: 3);
    const ownerB = TechnicianOutboxOwner(userId: 4, technicianId: 4);
    final first = store();
    await first.insert(attachment());
    await first.insert(attachment(userId: 4, technicianId: 4));
    await first.close();
    stores.remove(first);

    final reopened = store();
    final a = await reopened.readyForUpload(ownerA);
    final b = await reopened.readyForUpload(ownerB);
    expect(a, hasLength(1));
    expect(a.single.ownerUserId, 3);
    expect(b, hasLength(1));
    expect(b.single.ownerUserId, 4);
  });

  test(
    'media ACK activates exactly the matching structured outbox event',
    () async {
      const owner = TechnicianOutboxOwner(userId: 3, technicianId: 3);
      final attachmentStore = store();
      final outbox = TechnicianOutboxStore(
        databaseFactoryOverride: databaseFactoryFfi,
        databasePath: '${directory.path}${Platform.pathSeparator}outbox.db',
      );
      final item = attachment();
      await File(item.localPath).writeAsBytes([1, 2, 3, 4]);
      await attachmentStore.insert(item);
      await outbox.enqueue(
        owner: owner,
        jobId: item.jobId,
        type: item.eventType,
        payload: {'attachment_id': item.attachmentId},
        status: TechnicianOutboxStatus.awaitingMedia,
        eventId: item.eventId,
      );
      final service = TechnicianMediaService(
        attachmentStore: attachmentStore,
        outboxStore: outbox,
        endpoint: Uri.parse('https://bluevector.test/api/v1/tech/media'),
        tokenProvider: () async => 'jwt',
        client: MockClient((request) async {
          expect(request.headers['authorization'], 'Bearer jwt');
          return http.Response(
            jsonEncode({'media_id': '11111111-1111-4111-8111-111111111111'}),
            200,
          );
        }),
      );

      final result = await service.sync(owner);

      expect(result.synced, 1);
      final event = await outbox.eventForOwner(owner, item.eventId);
      expect(event?.status, TechnicianOutboxStatus.pending);
      expect(
        event?.payload['media_id'],
        '11111111-1111-4111-8111-111111111111',
      );
      await outbox.close();
    },
  );
}
