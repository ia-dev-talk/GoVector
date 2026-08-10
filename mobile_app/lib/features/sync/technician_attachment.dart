enum TechnicianAttachmentStatus {
  pending,
  uploading,
  retryable,
  acknowledged,
  conflict,
  rejected;

  static TechnicianAttachmentStatus parse(String value) =>
      TechnicianAttachmentStatus.values.firstWhere(
        (item) => item.name == value,
        orElse: () => TechnicianAttachmentStatus.retryable,
      );
}

class TechnicianAttachment {
  const TechnicianAttachment({
    required this.attachmentId,
    required this.eventId,
    required this.jobId,
    required this.ownerUserId,
    required this.ownerTechnicianId,
    required this.kind,
    required this.eventType,
    required this.localPath,
    required this.mimeType,
    required this.sizeBytes,
    required this.sha256,
    required this.metadataJson,
    required this.status,
    required this.attemptCount,
    required this.createdAt,
    required this.updatedAt,
    this.mediaId,
    this.lastError,
  });

  final String attachmentId;
  final String eventId;
  final int jobId;
  final int ownerUserId;
  final int ownerTechnicianId;
  final String kind;
  final String eventType;
  final String localPath;
  final String mimeType;
  final int sizeBytes;
  final String sha256;
  final String metadataJson;
  final TechnicianAttachmentStatus status;
  final int attemptCount;
  final String? mediaId;
  final String? lastError;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory TechnicianAttachment.fromRow(Map<String, Object?> row) =>
      TechnicianAttachment(
        attachmentId: row['attachment_id']! as String,
        eventId: row['event_id']! as String,
        jobId: row['job_id']! as int,
        ownerUserId: row['owner_user_id']! as int,
        ownerTechnicianId: row['owner_technician_id']! as int,
        kind: row['kind']! as String,
        eventType: row['event_type']! as String,
        localPath: row['local_path']! as String,
        mimeType: row['mime_type']! as String,
        sizeBytes: row['size_bytes']! as int,
        sha256: row['sha256']! as String,
        metadataJson: row['metadata_json']! as String,
        status: TechnicianAttachmentStatus.parse(row['status']! as String),
        attemptCount: row['attempt_count']! as int,
        mediaId: row['media_id'] as String?,
        lastError: row['last_error'] as String?,
        createdAt: DateTime.parse(row['created_at']! as String),
        updatedAt: DateTime.parse(row['updated_at']! as String),
      );
}
