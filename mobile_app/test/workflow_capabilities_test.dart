import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/interventions/workflow_capabilities.dart';

JobWorkflowCapabilities capabilities(List<String> allowed) {
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
  );
}

void main() {
  test('server allowed_commands overrides the local status adapter', () {
    final command = TechnicianWorkflowCommandResolver.resolve(
      fallbackStatus: 'assigned',
      capabilities: capabilities(['arrive']),
    );
    expect(command?.code, 'arrive');
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
    expect(command?.fromCompatibilityFallback, isTrue);
  });

  test('an assigned intervention exposes the technician start command', () {
    final command = TechnicianWorkflowCommandResolver.resolve(
      fallbackStatus: 'ASSIGNED',
    );
    expect(command?.code, 'accept_and_start');
    expect(command?.label, 'Accepter & démarrer');
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
