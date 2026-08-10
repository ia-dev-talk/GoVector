import 'dart:convert';

enum TechnicianOutboxStatus {
  awaitingMedia,
  pending,
  sending,
  retryable,
  acknowledged,
  conflict,
  rejected;

  static TechnicianOutboxStatus parse(String value) {
    return TechnicianOutboxStatus.values.firstWhere(
      (status) => status.name == value,
      orElse: () => TechnicianOutboxStatus.retryable,
    );
  }
}

class TechnicianOutboxSummary {
  const TechnicianOutboxSummary({
    required this.toSynchronize,
    required this.toReview,
  });

  final int toSynchronize;
  final int toReview;

  int get total => toSynchronize + toReview;
}

class TechnicianOutboxOwner {
  const TechnicianOutboxOwner({
    required this.userId,
    required this.technicianId,
  });

  final int userId;
  final int technicianId;
}

class TechnicianOutboxEvent {
  const TechnicianOutboxEvent({
    required this.eventId,
    required this.schemaVersion,
    required this.jobId,
    required this.type,
    required this.payload,
    required this.occurredAt,
    required this.ownerUserId,
    required this.ownerTechnicianId,
    required this.status,
    required this.attemptCount,
    required this.createdAt,
    required this.updatedAt,
    this.lastError,
    this.legacyFingerprint,
  });

  final String eventId;
  final int schemaVersion;
  final int jobId;
  final String type;
  final Map<String, dynamic> payload;
  final DateTime occurredAt;
  final int ownerUserId;
  final int ownerTechnicianId;
  final TechnicianOutboxStatus status;
  final int attemptCount;
  final String? lastError;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? legacyFingerprint;

  bool get isAcknowledged => status == TechnicianOutboxStatus.acknowledged;

  Map<String, dynamic> toSyncJson() => {
    'event_id': eventId,
    'schema_version': schemaVersion,
    'job_id': jobId,
    'type': type,
    'payload': payload,
    'occurred_at': occurredAt.toUtc().toIso8601String(),
  };

  Map<String, dynamic> toLegacyCompatibleMap() => {
    'event_id': eventId,
    'schema_version': schemaVersion,
    'job_id': jobId,
    'action': type,
    'data': {'job_id': jobId, ...payload},
    'timestamp': occurredAt.toIso8601String(),
    'owner_user_id': ownerUserId,
    'owner_technician_id': ownerTechnicianId,
    'status': status.name,
    'attempt_count': attemptCount,
    'last_error': lastError,
    'created_at': createdAt.toIso8601String(),
    'updated_at': updatedAt.toIso8601String(),
  };

  factory TechnicianOutboxEvent.fromRow(Map<String, Object?> row) {
    return TechnicianOutboxEvent(
      eventId: row['event_id']! as String,
      schemaVersion: row['schema_version']! as int,
      jobId: row['job_id']! as int,
      type: row['type']! as String,
      payload: (jsonDecode(row['payload']! as String) as Map)
          .cast<String, dynamic>(),
      occurredAt: DateTime.parse(row['occurred_at']! as String),
      ownerUserId: row['owner_user_id']! as int,
      ownerTechnicianId: row['owner_technician_id']! as int,
      status: TechnicianOutboxStatus.parse(row['status']! as String),
      attemptCount: row['attempt_count']! as int,
      lastError: row['last_error'] as String?,
      createdAt: DateTime.parse(row['created_at']! as String),
      updatedAt: DateTime.parse(row['updated_at']! as String),
      legacyFingerprint: row['legacy_fingerprint'] as String?,
    );
  }
}

class TechnicianSyncEventAck {
  const TechnicianSyncEventAck({
    required this.eventId,
    required this.status,
    this.code,
    this.error,
  });

  final String eventId;
  final TechnicianOutboxStatus status;
  final String? code;
  final String? error;
}
