import 'technician_job_status.dart';

class JobStatusCapability {
  const JobStatusCapability({
    required this.code,
    required this.label,
    required this.orderOpen,
    required this.fieldActive,
    required this.canonical,
    required this.category,
  });

  final String code;
  final String label;
  final bool orderOpen;
  final bool fieldActive;
  final String canonical;
  final String category;

  factory JobStatusCapability.fromJson(Map<String, dynamic> json) {
    return JobStatusCapability(
      code: json['code'] as String,
      label: json['label'] as String,
      orderOpen: json['order_open'] as bool,
      fieldActive: json['field_active'] as bool,
      canonical: json['canonical'] as String,
      category: json['category'] as String,
    );
  }
}

class JobWorkflowCapabilities {
  const JobWorkflowCapabilities({
    required this.jobId,
    required this.status,
    required this.allowedCommands,
  });

  final int jobId;
  final JobStatusCapability status;
  final Set<String> allowedCommands;

  factory JobWorkflowCapabilities.fromJson(Map<String, dynamic> json) {
    return JobWorkflowCapabilities(
      jobId: json['job_id'] as int,
      status: JobStatusCapability.fromJson(
        json['status'] as Map<String, dynamic>,
      ),
      allowedCommands: (json['allowed_commands'] as List<dynamic>? ?? const [])
          .map((value) => value.toString())
          .toSet(),
    );
  }
}

class TechnicianWorkflowCommand {
  const TechnicianWorkflowCommand({
    required this.code,
    required this.label,
    required this.fromCompatibilityFallback,
  });

  final String code;
  final String label;
  final bool fromCompatibilityFallback;
}

abstract final class TechnicianWorkflowCommandResolver {
  static const _labels = <String, String>{
    'accept_and_start': 'Accepter & démarrer',
    'arrive': 'Arrivé sur site',
    'start_work': 'Commencer les travaux',
    'close_field_visit': 'Clôturer l’intervention',
  };

  static TechnicianWorkflowCommand? resolve({
    required String fallbackStatus,
    JobWorkflowCapabilities? capabilities,
  }) {
    if (capabilities != null) {
      for (final code in _labels.keys) {
        if (capabilities.allowedCommands.contains(code)) {
          return TechnicianWorkflowCommand(
            code: code,
            label: _labels[code]!,
            fromCompatibilityFallback: false,
          );
        }
      }
      return null;
    }

    final fallbackCode = switch (TechnicianJobStatus.normalize(
      fallbackStatus,
    )) {
      'assigned' || 'affectee' || 'accepted' => 'accept_and_start',
      'en_route' => 'arrive',
      'on_site' || 'arrived' => 'start_work',
      'in_progress' ||
      'work_in_progress' ||
      'en_cours' ||
      'ftth_install' ||
      'installation_done' ||
      'client_validation' => 'close_field_visit',
      _ => null,
    };
    if (fallbackCode == null) return null;
    return TechnicianWorkflowCommand(
      code: fallbackCode,
      label: _labels[fallbackCode]!,
      fromCompatibilityFallback: true,
    );
  }
}
