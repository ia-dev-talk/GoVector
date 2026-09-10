import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'package:mobile_app/design_system/bluevector_theme.dart';
import 'package:mobile_app/features/interventions/mobile_interventions_list_screen.dart';
import 'package:mobile_app/models/job.dart';

Job _job({
  required int id,
  required String number,
  required String status,
  String? scheduledDate,
}) {
  return Job(
    id: id,
    jobNumber: number,
    jobType: 'SORTIE DE PCO - RACCORDEMENT FTTH',
    status: status,
    customerName: 'Client terrain avec un nom volontairement très long',
    serviceAddress:
        'Boulevard Al Qods, résidence longue dénomination, Sidi Maarouf, Casablanca',
    assignedTechId: 3,
    customerPhone: '+212600000000',
    scheduledDate: scheduledDate,
    latitude: 33.5721,
    longitude: -7.5898,
    operator: 'Opérateur FTTH',
    pbo: 'PBO-CASA-2026-000042',
  );
}

Future<void> _pumpPlanning(WidgetTester tester, {required Size size}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;

  await tester.pumpWidget(
    MaterialApp(
      theme: BlueVectorTheme.light,
      home: Scaffold(
        body: MobileInterventionsListScreen(
          jobs: [
            _job(
              id: 42,
              number: 'DTLI-2026-000042-LONGUE-REFERENCE',
              status: 'in_progress',
            ),
            _job(
              id: 43,
              number: 'DTLI-2026-000043-A-VENIR',
              status: 'assigned',
              scheduledDate: '2099-12-31T12:00:00',
            ),
          ],
          loading: false,
          isOnline: false,
          lastSync: null,
          technicianName: 'Technicien terrain au nom volontairement long',
          onRefresh: () async {},
          onSelect: (_) {},
        ),
      ),
    ),
  );

  await tester.pump();
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('fr_FR');
  });

  final viewports = <String, Size>{
    'small-phone-320x800': const Size(320, 800),
    'phone-360x800': const Size(360, 800),
    'phone-390x844': const Size(390, 844),
    'phone-430x932': const Size(430, 932),
    'long-tablet-600x1024': const Size(600, 1024),
    'long-tablet-720x1280': const Size(720, 1280),
    'tablet-768x1024': const Size(768, 1024),
    'long-tablet-800x1280': const Size(800, 1280),
    'tablet-landscape-1024x600': const Size(1024, 600),
  };

  for (final entry in viewports.entries) {
    testWidgets('technician planning stays usable on ${entry.key}', (
      tester,
    ) async {
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await _pumpPlanning(tester, size: entry.value);

      expect(find.text('Mes interventions'), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('Aujourd’hui'), findsOneWidget);
      expect(find.text('À venir'), findsOneWidget);
      expect(find.text('DTLI-2026-000042-LONGUE-REFERENCE'), findsOneWidget);

      expect(
        tester.takeException(),
        isNull,
        reason: 'No Flutter overflow/layout exception on ${entry.key}',
      );
    });
  }

  testWidgets('technician can switch planning tabs on a long tablet', (
    tester,
  ) async {
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await _pumpPlanning(tester, size: const Size(600, 1024));

    await tester.tap(find.text('À venir'));
    await tester.pumpAndSettle();

    expect(find.text('DTLI-2026-000043-A-VENIR'), findsOneWidget);
    expect(find.text('DTLI-2026-000042-LONGUE-REFERENCE'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
