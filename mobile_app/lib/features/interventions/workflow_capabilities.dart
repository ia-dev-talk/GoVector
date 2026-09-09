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

class CompletionAssessmentCapability {
  const CompletionAssessmentCapability({
    required this.canComplete,
    required this.blockingRequirements,
    required this.warnings,
    required this.requiredFieldKeys,
  });

  final bool canComplete;
  final List<String> blockingRequirements;
  final List<String> warnings;
  final List<String> requiredFieldKeys;

  int get missingCount => blockingRequirements.length;

  factory CompletionAssessmentCapability.fromJson(Map<String, dynamic> json) {
    List<String> strings(String key) =>
        (json[key] as List<dynamic>? ?? const [])
            .map((value) => value.toString().trim())
            .where((value) => value.isNotEmpty)
            .toList(growable: false);

    return CompletionAssessmentCapability(
      canComplete: json['can_complete'] == true,
      blockingRequirements: strings('blocking_requirements'),
      warnings: strings('warnings'),
      requiredFieldKeys: strings('required_field_keys'),
    );
  }
}

class JobWorkflowCapabilities {
  const JobWorkflowCapabilities({
    required this.jobId,
    required this.status,
    required this.allowedCommands,
    this.completionAssessment,
  });

  final int jobId;
  final JobStatusCapability status;
  final Set<String> allowedCommands;
  final CompletionAssessmentCapability? completionAssessment;

  factory JobWorkflowCapabilities.fromJson(Map<String, dynamic> json) {
    final assessment = json['completion_assessment'];
    return JobWorkflowCapabilities(
      jobId: json['job_id'] as int,
      status: JobStatusCapability.fromJson(
        json['status'] as Map<String, dynamic>,
      ),
      allowedCommands: (json['allowed_commands'] as List<dynamic>? ?? const [])
          .map((value) => value.toString())
          .toSet(),
      completionAssessment: assessment is Map<String, dynamic>
          ? CompletionAssessmentCapability.fromJson(assessment)
          : null,
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
  // Server commands stay canonical. Only the technician-facing wording is
  // collapsed to the deliberately tiny Praxedo-style field flow.
  static const _labels = <String, String>{
    'accept_and_start': 'Accepter · En route',
    'arrive': 'Sur site',
    // This command is only exposed as a recovery state when the automatic
    // ON_SITE -> IN_PROGRESS hop was interrupted. The shell then starts work
    // and submits in the same tap.
    'start_work': 'Travail terminé · Envoyer pour validation',
    'close_field_visit': 'Travail terminé · Envoyer pour validation',
  };

  static TechnicianWorkflowCommand? resolve({
    required String fallbackStatus,
    JobWorkflowCapabilities? capabilities,
  }) {
    if (capabilities != null) {
      for (final code in _labels.keys) {
        if (!capabilities.allowedCommands.contains(code)) continue;
        var label = _labels[code]!;
        if (code == 'close_field_visit' || code == 'start_work') {
          final readiness = capabilities.completionAssessment;
          if (readiness != null && !readiness.canComplete) {
            final count = readiness.missingCount;
            label = count > 0
                ? 'À compléter · $count élément${count > 1 ? 's' : ''}'
                : 'Vérifier avant envoi';
          }
        }
        return TechnicianWorkflowCommand(
          code: code,
          label: label,
          fromCompatibilityFallback: false,
        );
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
