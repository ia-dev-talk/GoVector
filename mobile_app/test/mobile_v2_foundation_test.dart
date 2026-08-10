import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:mobile_app/app/mobile_bootstrap.dart';
import 'package:mobile_app/design_system/bluevector_brand.dart';
import 'package:mobile_app/design_system/bluevector_theme.dart';
import 'package:mobile_app/features/actions/mobile_action_sheet.dart';
import 'package:mobile_app/models/job.dart';

void main() {
  test('Mobile V2 initializes French date symbols before rendering', () async {
    await initializeBlueVectorMobile();

    expect(
      DateFormat('EEEE d MMMM', 'fr_FR').format(DateTime(2026, 8, 4)),
      'mardi 4 août',
    );
  });

  testWidgets('Mobile V2 foundation renders the BlueVector dark brand', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: BlueVectorTheme.dark,
        home: const Scaffold(body: BlueVectorBrand()),
      ),
    );

    expect(find.text('BlueVector'), findsOneWidget);
    expect(BlueVectorTheme.dark.brightness, Brightness.dark);
  });

  testWidgets('Mobile action sheet exposes the field action grid', (
    tester,
  ) async {
    final job = Job(
      id: 42,
      jobNumber: 'DTLI-42',
      jobType: 'Installation FTTH',
      status: 'in_progress',
      customerName: 'Client test',
      serviceAddress: 'Adresse test',
      assignedTechId: 7,
      latitude: 0,
      longitude: 0,
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: BlueVectorTheme.dark,
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () => showMobileActionSheet(
                  context: context,
                  job: job,
                  technicianId: 7,
                  onDataChanged: () async {},
                ),
                child: const Text('Ouvrir'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Ouvrir'));
    await tester.pumpAndSettle();

    expect(find.text('Ajouter une action'), findsOneWidget);
    expect(find.text('DOCUMENTER'), findsOneWidget);
    expect(find.text('Photo'), findsOneWidget);
    expect(find.text('Vidéo'), findsOneWidget);
    expect(find.text('Signature client'), findsOneWidget);

    await tester.drag(find.byType(ListView).last, const Offset(0, -650));
    await tester.pumpAndSettle();
    expect(find.text('RELEVER SUR LE TERRAIN'), findsOneWidget);
    expect(find.text('Mesure / test'), findsOneWidget);
    expect(find.text('OTDR'), findsOneWidget);
    expect(find.text('Scan QR / code-barres'), findsOneWidget);

    await tester.drag(find.byType(ListView).last, const Offset(0, -650));
    await tester.pumpAndSettle();
    expect(find.text('RENDRE COMPTE'), findsOneWidget);
    expect(find.text('Autre action'), findsOneWidget);
  });
}
