class Incident {
  final int? id;
  final int? jobId;
  final String incidentType;
  final String severity;
  final String status;
  final String? description;
  final String? reportedBy;
  final String? assignedTo;
  final DateTime? slaDeadline;
  final int? resolutionTime;
  final String? rootCause;
  final String? correctiveAction;
  final int escalationLevel;
  final bool isEscalated;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? resolvedAt;

  Incident({
    this.id,
    this.jobId,
    required this.incidentType,
    this.severity = "MEDIUM",
    this.status = "OPEN",
    this.description,
    this.reportedBy,
    this.assignedTo,
    this.slaDeadline,
    this.resolutionTime,
    this.rootCause,
    this.correctiveAction,
    this.escalationLevel = 0,
    this.isEscalated = false,
    required this.createdAt,
    required this.updatedAt,
    this.resolvedAt,
  });

  factory Incident.fromJson(Map<String, dynamic> json) {
    return Incident(
      id: json['id'],
      jobId: json['job_id'],
      incidentType: json['incident_type'] ?? 'SAV',
      severity: json['severity'] ?? 'MEDIUM',
      status: json['status'] ?? 'OPEN',
      description: json['description'],
      reportedBy: json['reported_by'],
      assignedTo: json['assigned_to'],
      slaDeadline: json['sla_deadline'] != null ? DateTime.parse(json['sla_deadline']) : null,
      resolutionTime: json['resolution_time'],
      rootCause: json['root_cause'],
      correctiveAction: json['corrective_action'],
      escalationLevel: json['escalation_level'] ?? 0,
      isEscalated: json['is_escalated'] ?? false,
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: DateTime.parse(json['updated_at']),
      resolvedAt: json['resolved_at'] != null ? DateTime.parse(json['resolved_at']) : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'job_id': jobId,
      'incident_type': incidentType,
      'severity': severity,
      'status': status,
      'description': description,
      'reported_by': reportedBy,
      'assigned_to': assignedTo,
      'sla_deadline': slaDeadline?.toIso8601String(),
      'resolution_time': resolutionTime,
      'root_cause': rootCause,
      'corrective_action': correctiveAction,
      'escalation_level': escalationLevel,
      'is_escalated': isEscalated,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
      'resolved_at': resolvedAt?.toIso8601String(),
    };
  }
}