import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:path/path.dart' as path_util;
import 'package:sqflite/sqflite.dart';
import 'package:uuid/uuid.dart';

import '../features/sync/technician_outbox_event.dart';

class LegacyOutboxMigrationResult {
  const LegacyOutboxMigrationResult({
    required this.migrated,
    required this.quarantined,
    required this.alreadyPersisted,
  });

  final int migrated;
  final int quarantined;
  final int alreadyPersisted;
}

class TechnicianOutboxStore {
  TechnicianOutboxStore({
    DatabaseFactory? databaseFactoryOverride,
    String? databasePath,
    DateTime Function()? clock,
    String Function()? eventIdGenerator,
  }) : _databaseFactory = databaseFactoryOverride ?? databaseFactory,
       _databasePath = databasePath,
       _clock = clock ?? DateTime.now,
       _eventIdGenerator = eventIdGenerator ?? const Uuid().v4;

  static const _databaseName = 'bluevector_technician_outbox.db';
  static const _databaseVersion = 1;

  final DatabaseFactory _databaseFactory;
  final String? _databasePath;
  final DateTime Function() _clock;
  final String Function() _eventIdGenerator;
  Database? _database;

  Future<Database> get database async {
    final open = _database;
    if (open != null) {
      return open;
    }

    final resolvedPath =
        _databasePath ??
        path_util.join(await getDatabasesPath(), _databaseName);
    final created = await _databaseFactory.openDatabase(
      resolvedPath,
      options: OpenDatabaseOptions(
        version: _databaseVersion,
        onConfigure: (db) => db.execute('PRAGMA foreign_keys = ON'),
        onCreate: _createSchema,
      ),
    );
    _database = created;
    return created;
  }

  Future<void> _createSchema(Database db, int version) async {
    await db.execute('''
      CREATE TABLE technician_outbox_events (
        event_id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        job_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        owner_user_id INTEGER NOT NULL,
        owner_technician_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        legacy_fingerprint TEXT UNIQUE
      )
    ''');
    await db.execute('''
      CREATE INDEX ix_technician_outbox_owner_status
      ON technician_outbox_events (
        owner_user_id,
        owner_technician_id,
        status,
        created_at
      )
    ''');
    await db.execute('''
      CREATE TABLE legacy_outbox_quarantine (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        legacy_fingerprint TEXT NOT NULL UNIQUE,
        raw_action TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    ''');
  }

  Future<TechnicianOutboxEvent> enqueue({
    required TechnicianOutboxOwner owner,
    required int jobId,
    required String type,
    required Map<String, dynamic> payload,
    DateTime? occurredAt,
    String? legacyFingerprint,
    TechnicianOutboxStatus status = TechnicianOutboxStatus.pending,
    String? eventId,
  }) async {
    final db = await database;
    final now = _clock();
    final event = TechnicianOutboxEvent(
      eventId: eventId ?? _eventIdGenerator(),
      schemaVersion: 1,
      jobId: jobId,
      type: type,
      payload: Map<String, dynamic>.from(payload),
      occurredAt: occurredAt ?? now,
      ownerUserId: owner.userId,
      ownerTechnicianId: owner.technicianId,
      status: status,
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
      legacyFingerprint: legacyFingerprint,
    );
    await db.insert('technician_outbox_events', _toRow(event));
    return event;
  }

  Future<List<TechnicianOutboxEvent>> nonAcknowledgedForOwner(
    TechnicianOutboxOwner owner,
  ) async {
    final db = await database;
    final rows = await db.query(
      'technician_outbox_events',
      where: '''
        owner_user_id = ? AND
        owner_technician_id = ? AND
        status != ?
      ''',
      whereArgs: [
        owner.userId,
        owner.technicianId,
        TechnicianOutboxStatus.acknowledged.name,
      ],
      orderBy: 'created_at ASC',
    );
    return rows.map(TechnicianOutboxEvent.fromRow).toList();
  }

  Future<int> nonAcknowledgedCount(TechnicianOutboxOwner owner) async {
    final db = await database;
    final result = await db.rawQuery(
      '''
      SELECT COUNT(*)
      FROM technician_outbox_events
      WHERE owner_user_id = ?
        AND owner_technician_id = ?
        AND status != ?
      ''',
      [
        owner.userId,
        owner.technicianId,
        TechnicianOutboxStatus.acknowledged.name,
      ],
    );
    return Sqflite.firstIntValue(result) ?? 0;
  }

  Future<TechnicianOutboxSummary> summaryForOwner(
    TechnicianOutboxOwner owner,
  ) async {
    final db = await database;
    final rows = await db.rawQuery(
      '''
      SELECT status, COUNT(*) AS count
      FROM technician_outbox_events
      WHERE owner_user_id = ? AND owner_technician_id = ?
      GROUP BY status
      ''',
      [owner.userId, owner.technicianId],
    );
    var toSynchronize = 0;
    var toReview = 0;
    for (final row in rows) {
      final count = row['count'] as int? ?? 0;
      switch (TechnicianOutboxStatus.parse(row['status']! as String)) {
        case TechnicianOutboxStatus.awaitingMedia:
        case TechnicianOutboxStatus.pending:
        case TechnicianOutboxStatus.sending:
        case TechnicianOutboxStatus.retryable:
          toSynchronize += count;
        case TechnicianOutboxStatus.conflict:
        case TechnicianOutboxStatus.rejected:
          toReview += count;
        case TechnicianOutboxStatus.acknowledged:
          break;
      }
    }
    return TechnicianOutboxSummary(
      toSynchronize: toSynchronize,
      toReview: toReview,
    );
  }

  Future<List<TechnicianOutboxEvent>> nonAcknowledgedForJob(
    TechnicianOutboxOwner owner,
    int jobId,
  ) async {
    final db = await database;
    final rows = await db.query(
      'technician_outbox_events',
      where: '''
        owner_user_id = ? AND owner_technician_id = ? AND
        job_id = ? AND status != ?
      ''',
      whereArgs: [
        owner.userId,
        owner.technicianId,
        jobId,
        TechnicianOutboxStatus.acknowledged.name,
      ],
      orderBy: 'occurred_at ASC',
    );
    return rows.map(TechnicianOutboxEvent.fromRow).toList();
  }

  Future<void> activateMediaEvent({
    required TechnicianOutboxOwner owner,
    required String eventId,
    required String mediaId,
  }) async {
    final db = await database;
    await db.transaction((transaction) async {
      final rows = await transaction.query(
        'technician_outbox_events',
        where:
            '''event_id = ? AND owner_user_id = ? AND owner_technician_id = ?''',
        whereArgs: [eventId, owner.userId, owner.technicianId],
        limit: 1,
      );
      if (rows.isEmpty) return;
      final event = TechnicianOutboxEvent.fromRow(rows.single);
      final payload = Map<String, dynamic>.from(event.payload)
        ..['media_id'] = mediaId;
      await transaction.update(
        'technician_outbox_events',
        {
          'payload': jsonEncode(payload),
          'status': TechnicianOutboxStatus.pending.name,
          'last_error': null,
          'updated_at': _clock().toIso8601String(),
        },
        where:
            '''event_id = ? AND owner_user_id = ? AND owner_technician_id = ?''',
        whereArgs: [eventId, owner.userId, owner.technicianId],
      );
    });
  }

  Future<int> requeueNowSupportedLegacyEvents(
    TechnicianOutboxOwner owner,
  ) async {
    final db = await database;
    return db.update(
      'technician_outbox_events',
      {
        'status': TechnicianOutboxStatus.pending.name,
        'last_error': null,
        'updated_at': _clock().toIso8601String(),
      },
      where: '''
        owner_user_id = ? AND owner_technician_id = ? AND status = ?
        AND type IN (?, ?, ?)
      ''',
      whereArgs: [
        owner.userId,
        owner.technicianId,
        TechnicianOutboxStatus.rejected.name,
        'intervention_comment',
        'custom_intervention_action',
        'equipment_scan',
      ],
    );
  }

  Future<TechnicianOutboxEvent?> eventForOwner(
    TechnicianOutboxOwner owner,
    String eventId,
  ) async {
    final db = await database;
    final rows = await db.query(
      'technician_outbox_events',
      where: '''
        event_id = ? AND
        owner_user_id = ? AND
        owner_technician_id = ?
      ''',
      whereArgs: [eventId, owner.userId, owner.technicianId],
      limit: 1,
    );
    if (rows.isEmpty) {
      return null;
    }
    return TechnicianOutboxEvent.fromRow(rows.single);
  }

  Future<List<TechnicianOutboxEvent>> claimSyncBatch(
    TechnicianOutboxOwner owner, {
    int limit = 100,
  }) async {
    final db = await database;
    return db.transaction((transaction) async {
      final rows = await transaction.query(
        'technician_outbox_events',
        where: '''
          owner_user_id = ? AND
          owner_technician_id = ? AND
          status IN (?, ?, ?)
        ''',
        whereArgs: [
          owner.userId,
          owner.technicianId,
          TechnicianOutboxStatus.pending.name,
          TechnicianOutboxStatus.retryable.name,
          TechnicianOutboxStatus.sending.name,
        ],
        orderBy: 'created_at ASC',
        limit: limit,
      );
      if (rows.isEmpty) {
        return <TechnicianOutboxEvent>[];
      }

      final now = _clock().toIso8601String();
      for (final row in rows) {
        await transaction.update(
          'technician_outbox_events',
          {
            'status': TechnicianOutboxStatus.sending.name,
            'attempt_count': (row['attempt_count']! as int) + 1,
            'last_error': null,
            'updated_at': now,
          },
          where: 'event_id = ?',
          whereArgs: [row['event_id']],
        );
      }

      final eventIds = rows.map((row) => row['event_id']! as String).toList();
      final placeholders = List.filled(eventIds.length, '?').join(',');
      final claimed = await transaction.query(
        'technician_outbox_events',
        where: 'event_id IN ($placeholders)',
        whereArgs: eventIds,
        orderBy: 'created_at ASC',
      );
      return claimed.map(TechnicianOutboxEvent.fromRow).toList();
    });
  }

  Future<void> applyAcknowledgements(
    TechnicianOutboxOwner owner,
    List<TechnicianSyncEventAck> acknowledgements,
  ) async {
    final db = await database;
    final acceptedStatuses = {
      TechnicianOutboxStatus.acknowledged,
      TechnicianOutboxStatus.retryable,
      TechnicianOutboxStatus.conflict,
      TechnicianOutboxStatus.rejected,
    };
    await db.transaction((transaction) async {
      for (final acknowledgement in acknowledgements) {
        final status = acceptedStatuses.contains(acknowledgement.status)
            ? acknowledgement.status
            : TechnicianOutboxStatus.retryable;
        final error = acknowledgement.error ?? acknowledgement.code;
        await transaction.update(
          'technician_outbox_events',
          {
            'status': status.name,
            'last_error': status == TechnicianOutboxStatus.acknowledged
                ? null
                : error,
            'updated_at': _clock().toIso8601String(),
          },
          where: '''
            event_id = ? AND
            owner_user_id = ? AND
            owner_technician_id = ?
          ''',
          whereArgs: [
            acknowledgement.eventId,
            owner.userId,
            owner.technicianId,
          ],
        );
      }
    });
  }

  Future<LegacyOutboxMigrationResult> importLegacyActions({
    required List<String> rawActions,
    required TechnicianOutboxOwner owner,
    required Set<int> assignedJobIds,
  }) async {
    final db = await database;
    var migrated = 0;
    var quarantined = 0;
    var alreadyPersisted = 0;

    await db.transaction((transaction) async {
      for (var index = 0; index < rawActions.length; index++) {
        final raw = rawActions[index];
        final fingerprint = sha256
            .convert(utf8.encode('$index\u0000$raw'))
            .toString();
        final existingOutbox = Sqflite.firstIntValue(
          await transaction.rawQuery(
            '''
            SELECT COUNT(*) FROM technician_outbox_events
            WHERE legacy_fingerprint = ?
            ''',
            [fingerprint],
          ),
        );
        final existingQuarantine = Sqflite.firstIntValue(
          await transaction.rawQuery(
            '''
            SELECT COUNT(*) FROM legacy_outbox_quarantine
            WHERE legacy_fingerprint = ?
            ''',
            [fingerprint],
          ),
        );
        if ((existingOutbox ?? 0) > 0 || (existingQuarantine ?? 0) > 0) {
          alreadyPersisted++;
          continue;
        }

        Map<String, dynamic>? decoded;
        Map<String, dynamic>? data;
        int? jobId;
        String? action;
        DateTime? occurredAt;
        try {
          decoded = (jsonDecode(raw) as Map).cast<String, dynamic>();
          action = decoded['action'] as String?;
          data = (decoded['data'] as Map?)?.cast<String, dynamic>();
          final rawJobId = data?['job_id'];
          jobId = rawJobId is int ? rawJobId : int.tryParse('$rawJobId');
          occurredAt = DateTime.tryParse('${decoded['timestamp'] ?? ''}');
        } catch (_) {
          // The raw value is preserved verbatim in quarantine below.
        }

        if (action != null &&
            action.isNotEmpty &&
            data != null &&
            jobId != null &&
            assignedJobIds.contains(jobId)) {
          final now = _clock();
          final payload = Map<String, dynamic>.from(data)..remove('job_id');
          final event = TechnicianOutboxEvent(
            eventId: _eventIdGenerator(),
            schemaVersion: 1,
            jobId: jobId,
            type: action,
            payload: payload,
            occurredAt: occurredAt ?? now,
            ownerUserId: owner.userId,
            ownerTechnicianId: owner.technicianId,
            status: TechnicianOutboxStatus.pending,
            attemptCount: 0,
            createdAt: now,
            updatedAt: now,
            legacyFingerprint: fingerprint,
          );
          await transaction.insert('technician_outbox_events', _toRow(event));
          migrated++;
          continue;
        }

        await transaction.insert('legacy_outbox_quarantine', {
          'legacy_fingerprint': fingerprint,
          'raw_action': raw,
          'reason': jobId == null
              ? 'legacy_invalid_or_missing_job_id'
              : 'legacy_unscoped',
          'created_at': _clock().toIso8601String(),
        });
        quarantined++;
      }
    });

    return LegacyOutboxMigrationResult(
      migrated: migrated,
      quarantined: quarantined,
      alreadyPersisted: alreadyPersisted,
    );
  }

  Future<int> quarantineCount() async {
    final db = await database;
    final result = await db.rawQuery(
      'SELECT COUNT(*) FROM legacy_outbox_quarantine',
    );
    return Sqflite.firstIntValue(result) ?? 0;
  }

  Future<void> close() async {
    final db = _database;
    _database = null;
    await db?.close();
  }

  Map<String, Object?> _toRow(TechnicianOutboxEvent event) => {
    'event_id': event.eventId,
    'schema_version': event.schemaVersion,
    'job_id': event.jobId,
    'type': event.type,
    'payload': jsonEncode(event.payload),
    'occurred_at': event.occurredAt.toIso8601String(),
    'owner_user_id': event.ownerUserId,
    'owner_technician_id': event.ownerTechnicianId,
    'status': event.status.name,
    'attempt_count': event.attemptCount,
    'last_error': event.lastError,
    'created_at': event.createdAt.toIso8601String(),
    'updated_at': event.updatedAt.toIso8601String(),
    'legacy_fingerprint': event.legacyFingerprint,
  };
}
