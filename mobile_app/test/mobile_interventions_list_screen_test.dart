import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/app/mobile_bootstrap.dart';
import 'package:mobile_app/design_system/bluevector_theme.dart';
import 'package:mobile_app/features/interventions/mobile_interventions_list_screen.dart';
import 'package:mobile_app/models/job.dart';

Job _job({
  required int id,
  required String customer,
  required DateTime scheduledAt,
  String? operator,
  String? pto,
  String? priority,
}) {
  return Job(
    id: id,
    jobNumber: 'DTLI-$id',
    jobType: 'INSTALLATION',
    status: 'assigned',
    customerName: customer,
    serviceAddress: 'Adresse $customer',
    assignedTechId: 3,
    scheduledDate: scheduledAt.toIso8601String(),
    latitude: 33.57,
    longitude: -7.59,
    operator: operator,
    pto: pto,
    priority: priority,
  );
}

Widget _screen(List<Job> jobs) {
  return MaterialApp(
    theme: BlueVectorTheme.light,
    home: Scaffold(
      body: MobileInterventionsListScreen(
        jobs: jobs,
        loading: false,
        isOnline: true,
        lastSync: null,
        technicianName: 'Technicien test',
        onRefresh: () async {},
        onSelect: (_) {},
      ),
    ),
  );
}

void main() {
  setUpAll(() async {
    await initializeBlueVectorMobile();
  });

  testWidgets('planning orders today interventions chronologically', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final now = DateTime.now();
    final morning = DateTime(now.year, now.month, now.day, 9);
    final afternoon = DateTime(now.year, now.month, now.day, 15);

    await tester.pumpWidget(
      _screen([
        _job(id: 2, customer: 'Client après-midi', scheduledAt: afternoon),
        _job(id: 1, customer: 'Client matin', scheduledAt: morning),
      ]),
    );
    await tester.pump();

    expect(
      tester.getTopLeft(find.text('Client matin')).dy,
      lessThan(tester.getTopLeft(find.text('Client après-midi')).dy),
    );
  });

  testWidgets(
    'planning puts urgent intervention before standard intervention',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(430, 1600));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      final now = DateTime.now();
      final early = DateTime(now.year, now.month, now.day, 9);
      final later = DateTime(now.year, now.month, now.day, 15);

      await tester.pumpWidget(
        _screen([
          _job(id: 1, customer: 'Client normal', scheduledAt: early),
          _job(
            id: 2,
            customer: 'Client urgent',
            scheduledAt: later,
            priority: 'URGENT',
          ),
        ]),
      );
      await tester.pump();

      expect(
        tester.getTopLeft(find.text('Client urgent')).dy,
        lessThan(tester.getTopLeft(find.text('Client normal')).dy),
      );
      expect(find.text('Urgent'), findsOneWidget);
      expect(find.byIcon(Icons.priority_high_rounded), findsOneWidget);
    },
  );

  testWidgets('planning search includes PTO and can be cleared', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day, 10);

    await tester.pumpWidget(
      _screen([
        _job(
          id: 41,
          customer: 'Client PTO',
          scheduledAt: today,
          operator: 'Orange',
          pto: 'PTO-CASA-42',
        ),
        _job(
          id: 42,
          customer: 'Autre client',
          scheduledAt: today.add(const Duration(hours: 1)),
        ),
      ]),
    );
    await tester.pump();

    await tester.enterText(find.byType(TextField), 'PTO-CASA-42');
    await tester.pump();

    expect(find.text('Client PTO'), findsOneWidget);
    expect(find.text('Autre client'), findsNothing);
    expect(
      find.byWidgetPredicate(
        (widget) => widget is Text && widget.data == 'PTO-CASA-42',
      ),
      findsOneWidget,
    );
    expect(find.byIcon(Icons.router_outlined), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'introuvable');
    await tester.pump();

    expect(find.text('Aucun résultat pour « introuvable »'), findsOneWidget);

    await tester.tap(find.byTooltip('Effacer la recherche'));
    await tester.pump();

    expect(find.text('Client PTO'), findsOneWidget);
    expect(find.text('Autre client'), findsOneWidget);
  });
}
