import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:mobile_app/app/mobile_bootstrap.dart';
import 'package:mobile_app/design_system/bluevector_brand.dart';
import 'package:mobile_app/design_system/bluevector_theme.dart';
import 'package:mobile_app/features/actions/mobile_action_sheet.dart';
import 'package:mobile_app/models/job.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('Mobile V2 initializes French date symbols before rendering', () async {
    await initializeBlueVectorMobile();

    expect(
      DateFormat('EEEE d MMMM', 'fr_FR').format(DateTime(2026, 8, 4)),
      'mardi 4 août',
    );
  });

  testWidgets('Mobile V2 foundation renders the GoVector light brand', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: BlueVectorTheme.light,
        home: const Scaffold(body: BlueVectorBrand()),
      ),
    );

    expect(find.byType(Image), findsOneWidget);
    expect(find.bySemanticsLabel('GoVector'), findsOneWidget);
    expect(BlueVectorTheme.light.brightness, Brightness.light);
  });

  testWidgets('Mobile action sheet exposes the pilot field workflow', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    await SharedPreferences.getInstance();
    await tester.binding.setSurfaceSize(const Size(430, 1800));
    addTearDown(() => tester.binding.setSurfaceSize(null));

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
        theme: BlueVectorTheme.light,
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
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.text('Ajouter une action'), findsOneWidget);
    expect(find.text('DOCUMENTER'), findsOneWidget);
    expect(find.text('Photo'), findsOneWidget);
    expect(find.text('Voir les photos'), findsOneWidget);
    expect(find.text('RELEVER SUR LE TERRAIN'), findsOneWidget);
    expect(find.text('Mesure / test'), findsOneWidget);
    expect(find.text('Entrée câble'), findsOneWidget);
    expect(find.text('Sortie câble'), findsOneWidget);
    expect(find.text('Matériel utilisé'), findsOneWidget);
    expect(find.text('RENDRE COMPTE'), findsOneWidget);
    expect(find.text('Commentaire'), findsOneWidget);
    expect(find.text('Incident / anomalie'), findsOneWidget);

    // Legacy BlueVector toolbox actions are deliberately hidden from the pilot.
    expect(find.text('Vidéo'), findsNothing);
    expect(find.text('Signature client'), findsNothing);
    expect(find.text('OTDR'), findsNothing);
    expect(find.text('Scan QR / code-barres'), findsNothing);
    expect(find.text('Autre action'), findsNothing);
  });
}
