import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/interventions/workflow_capabilities.dart';

JobWorkflowCapabilities capabilities(
  List<String> allowed, {
  bool canComplete = true,
  List<String> blocking = const [],
}) {
  return JobWorkflowCapabilities(
    jobId: 8,
    status: const JobStatusCapability(
      code: 'assigned',
      label: 'Affectée',
      orderOpen: true,
      fieldActive: true,
      canonical: 'assigned',
      category: 'field_active',
    ),
    allowedCommands: allowed.toSet(),
    completionAssessment: CompletionAssessmentCapability(
      canComplete: canComplete,
      blockingRequirements: blocking,
      warnings: const [],
      requiredFieldKeys: const [],
    ),
  );
}

void main() {
  test('server allowed_commands overrides the local status adapter', () {
    final command = TechnicianWorkflowCommandResolver.resolve(
      fallbackStatus: 'assigned',
      capabilities: capabilities(['arrive']),
    );
    expect(command?.code, 'arrive');
    expect(command?.label, 'Sur site');
    expect(command?.fromCompatibilityFallback, isFalse);
  });

  test('an explicit empty server capability hides the workflow CTA', () {
    final command = TechnicianWorkflowCommandResolver.resolve(
      fallbackStatus: 'assigned',
      capabilities: capabilities([]),
    );
    expect(command, isNull);
  });

  test('status mapping is only a controlled compatibility fallback', () {
    final command = TechnicianWorkflowCommandResolver.resolve(
      fallbackStatus: 'work_in_progress',
    );
    expect(command?.code, 'close_field_visit');
    expect(command?.label, 'Travail terminé · Envoyer pour validation');
    expect(command?.fromCompatibilityFallback, isTrue);
  });

  test('assigned technician sees a single En route start action', () {
    final command = TechnicianWorkflowCommandResolver.resolve(
      fallbackStatus: 'ASSIGNED',
    );
    expect(command?.code, 'accept_and_start');
    expect(command?.label, 'Accepter · En route');
  });

  test('on-site internal start_work never exposes a second workflow concept', () {
    final command = TechnicianWorkflowCommandResolver.resolve(
      fallbackStatus: 'on_site',
    );
    expect(command?.code, 'start_work');
    expect(command?.label, 'Travail terminé · Envoyer pour validation');
  });

  test('technician labels never expose start-work or final-close wording', () {
    for (final status in ['assigned', 'en_route', 'on_site', 'in_progress']) {
      final label = TechnicianWorkflowCommandResolver.resolve(
        fallbackStatus: status,
      )?.label;
      expect(label, isNotNull);
      expect(label!.contains('Commencer les travaux'), isFalse);
      expect(label.contains('Clôturer'), isFalse);
    }
  });

  test('missing template requirements are framed as completion, not closure', () {
    final command = TechnicianWorkflowCommandResolver.resolve(
      fallbackStatus: 'in_progress',
      capabilities: capabilities(
        ['close_field_visit'],
        canComplete: false,
        blocking: ['photo', 'mesure'],
      ),
    );
    expect(command?.label, 'À compléter · 2 éléments');
  });

  test('job capability preserves both lifecycle axes', () {
    final parsed = JobWorkflowCapabilities.fromJson({
      'job_id': 41,
      'status': {
        'code': 'en_attente_validation',
        'label': 'En attente de validation',
        'order_open': true,
        'field_active': false,
        'canonical': 'en_attente_validation',
        'category': 'awaiting_validation',
      },
      'allowed_commands': <String>[],
    });
    expect(parsed.status.orderOpen, isTrue);
    expect(parsed.status.fieldActive, isFalse);
  });
}
