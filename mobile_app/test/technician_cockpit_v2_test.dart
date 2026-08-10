import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app/design_system/bluevector_theme.dart';
import 'package:mobile_app/features/actions/technician_job_picker_sheet.dart';
import 'package:mobile_app/features/interventions/mobile_job_presenter.dart';
import 'package:mobile_app/features/interventions/technician_job_status.dart';
import 'package:mobile_app/models/job.dart';

Job _job(int id, String status) => Job(
  id: id,
  jobNumber: 'DTLI-$id',
  jobType: 'INSTALLATION',
  status: status,
  customerName: 'Client $id',
  serviceAddress: 'Adresse $id',
  assignedTechId: 3,
  latitude: 33.57,
  longitude: -7.59,
);

void main() {
  test('terminal and active technician statuses have one source of truth', () {
    for (final status in [
      'FAILED',
      'POSTPONED',
      'CLIENT_ABSENT',
      'EN_ATTENTE_VALIDATION',
      'COMPLETED',
      'CANCELLED',
    ]) {
      expect(
        TechnicianJobStatus.isTechnicianTerminalStatus(status),
        isTrue,
        reason: status,
      );
      expect(
        TechnicianJobStatus.isTechnicianActiveStatus(status),
        isFalse,
        reason: status,
      );
      expect(MobileJobPresenter.isActive(_job(8, status)), isFalse);
    }
    expect(
      TechnicianJobStatus.isTechnicianActiveStatus('WORK_IN_PROGRESS'),
      isTrue,
    );
  });

  testWidgets('global add always asks for an eligible intervention', (
    tester,
  ) async {
    Job? selected;
    final jobs = [
      _job(8, 'in_progress'),
      _job(41, 'assigned'),
      _job(9, 'failed'),
    ];
    await tester.pumpWidget(
      MaterialApp(
        theme: BlueVectorTheme.dark,
        home: Builder(
          builder: (context) => Scaffold(
            body: FilledButton(
              onPressed: () async {
                selected = await showTechnicianJobPickerSheet(
                  context: context,
                  jobs: jobs,
                  currentJobId: 8,
                );
              },
              child: const Text('Ajouter'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Ajouter'));
    await tester.pumpAndSettle();
    expect(find.text('Pour quelle intervention ?'), findsOneWidget);
    expect(find.text('DTLI-8'), findsOneWidget);
    expect(find.text('DTLI-41'), findsOneWidget);
    expect(find.text('DTLI-9'), findsNothing);
    expect(selected, isNull);

    await tester.tap(find.text('DTLI-41'));
    await tester.pumpAndSettle();
    expect(selected?.id, 41);
  });
}
