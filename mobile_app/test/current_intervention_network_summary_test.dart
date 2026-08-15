import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/design_system/bluevector_theme.dart';
import 'package:mobile_app/features/interventions/current_intervention_screen.dart';
import 'package:mobile_app/models/job.dart';
import 'package:shared_preferences/shared_preferences.dart';

Job _job({
  String? operator,
  String? nro,
  String? sro,
  String? pbo,
  String? pto,
}) {
  return Job(
    id: 41,
    jobNumber: 'DTLI-41',
    jobType: 'INSTALLATION',
    status: 'in_progress',
    customerName: 'Client pilote',
    serviceAddress: '10 rue du Pilote',
    assignedTechId: 3,
    latitude: 33.57,
    longitude: -7.59,
    operator: operator,
    nro: nro,
    sro: sro,
    pbo: pbo,
    pto: pto,
  );
}

Widget _screen(Job job) {
  return MaterialApp(
    theme: BlueVectorTheme.dark,
    home: Scaffold(
      body: CurrentInterventionScreen(
        job: job,
        isOnline: true,
        pendingActions: 0,
        onOpenActions: () {},
        onAdvanceWorkflow: () {},
        workflowActionCode: null,
        workflowActionLabel: null,
        workflowBusy: false,
        onCallClient: () {},
        onNavigate: () {},
        onOpenSiteHistory: () {},
        onFailure: () {},
        onPostpone: () {},
      ),
    ),
  );
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'tech_token': 'token'});
  });

  testWidgets('current intervention hides empty prepared network panel', (
    tester,
  ) async {
    await tester.pumpWidget(_screen(_job()));
    await tester.pump();

    await tester.drag(find.byType(ListView), const Offset(0, -1400));
    await tester.pump();

    expect(find.text('Réseau préparé'), findsNothing);
  });

  testWidgets('current intervention shows only populated network references', (
    tester,
  ) async {
    await tester.pumpWidget(
      _screen(_job(operator: 'Orange', pbo: 'PBO-CASA-42')),
    );
    await tester.pump();

    await tester.scrollUntilVisible(
      find.text('Réseau préparé'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pump();

    expect(find.text('Réseau préparé'), findsOneWidget);
    expect(find.text('Opérateur'), findsOneWidget);
    expect(find.text('Orange'), findsOneWidget);
    expect(find.text('PBO'), findsOneWidget);
    expect(find.text('PBO-CASA-42'), findsOneWidget);
    expect(find.text('NRO'), findsNothing);
    expect(find.text('SRO'), findsNothing);
    expect(find.text('PTO'), findsNothing);
  });
}
