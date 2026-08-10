import 'package:path/path.dart' as path_util;
import 'package:sqflite/sqflite.dart';

import '../features/sync/technician_attachment.dart';
import '../features/sync/technician_outbox_event.dart';

class TechnicianAttachmentStore {
  TechnicianAttachmentStore({
    DatabaseFactory? databaseFactoryOverride,
    String? databasePath,
    DateTime Function()? clock,
  }) : _databaseFactory = databaseFactoryOverride ?? databaseFactory,
       _databasePath = databasePath,
       _clock = clock ?? DateTime.now;

  static const _databaseName = 'bluevector_technician_attachments.db';
  final DatabaseFactory _databaseFactory;
  final String? _databasePath;
  final DateTime Function() _clock;
  Database? _database;

  Future<Database> get database async {
    if (_database != null) return _database!;
    final resolved =
        _databasePath ??
        path_util.join(await getDatabasesPath(), _databaseName);
    _database = await _databaseFactory.openDatabase(
      resolved,
      options: OpenDatabaseOptions(version: 1, onCreate: _createSchema),
    );
    return _database!;
  }

  Future<void> _createSchema(Database db, int version) async {
    await db.execute('''
      CREATE TABLE technician_attachments (
        attachment_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE,
        job_id INTEGER NOT NULL,
        owner_user_id INTEGER NOT NULL,
        owner_technician_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        event_type TEXT NOT NULL,
        local_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        media_id TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    ''');
    await db.execute('''
      CREATE INDEX ix_technician_attachments_owner_status
      ON technician_attachments(owner_user_id, owner_technician_id, status)
    ''');
  }

  Future<void> insert(TechnicianAttachment attachment) async {
    final db = await database;
    await db.insert('technician_attachments', _row(attachment));
  }

  Future<List<TechnicianAttachment>> readyForUpload(
    TechnicianOutboxOwner owner,
  ) async {
    final db = await database;
    final rows = await db.query(
      'technician_attachments',
      where: '''
        owner_user_id = ? AND owner_technician_id = ?
        AND status IN (?, ?, ?, ?)
      ''',
      whereArgs: [
        owner.userId,
        owner.technicianId,
        TechnicianAttachmentStatus.pending.name,
        TechnicianAttachmentStatus.retryable.name,
        TechnicianAttachmentStatus.uploading.name,
        TechnicianAttachmentStatus.acknowledged.name,
      ],
      orderBy: 'created_at ASC',
    );
    return rows.map(TechnicianAttachment.fromRow).toList();
  }

  Future<void> markUploading(
    TechnicianOutboxOwner owner,
    TechnicianAttachment attachment,
  ) async {
    await _update(owner, attachment.attachmentId, {
      'status': TechnicianAttachmentStatus.uploading.name,
      'attempt_count': attachment.attemptCount + 1,
      'last_error': null,
    });
  }

  Future<void> markAcknowledged(
    TechnicianOutboxOwner owner,
    String attachmentId,
    String mediaId,
  ) => _update(owner, attachmentId, {
    'status': TechnicianAttachmentStatus.acknowledged.name,
    'media_id': mediaId,
    'last_error': null,
  });

  Future<void> markFailed(
    TechnicianOutboxOwner owner,
    String attachmentId,
    TechnicianAttachmentStatus status,
    String error,
  ) => _update(owner, attachmentId, {
    'status': status.name,
    'last_error': error,
  });

  Future<void> _update(
    TechnicianOutboxOwner owner,
    String attachmentId,
    Map<String, Object?> values,
  ) async {
    final db = await database;
    await db.update(
      'technician_attachments',
      {...values, 'updated_at': _clock().toIso8601String()},
      where: '''
        attachment_id = ? AND owner_user_id = ? AND owner_technician_id = ?
      ''',
      whereArgs: [attachmentId, owner.userId, owner.technicianId],
    );
  }

  Future<void> close() async {
    final db = _database;
    _database = null;
    await db?.close();
  }

  Map<String, Object?> _row(TechnicianAttachment item) => {
    'attachment_id': item.attachmentId,
    'event_id': item.eventId,
    'job_id': item.jobId,
    'owner_user_id': item.ownerUserId,
    'owner_technician_id': item.ownerTechnicianId,
    'kind': item.kind,
    'event_type': item.eventType,
    'local_path': item.localPath,
    'mime_type': item.mimeType,
    'size_bytes': item.sizeBytes,
    'sha256': item.sha256,
    'metadata_json': item.metadataJson,
    'status': item.status.name,
    'attempt_count': item.attemptCount,
    'media_id': item.mediaId,
    'last_error': item.lastError,
    'created_at': item.createdAt.toIso8601String(),
    'updated_at': item.updatedAt.toIso8601String(),
  };
}
