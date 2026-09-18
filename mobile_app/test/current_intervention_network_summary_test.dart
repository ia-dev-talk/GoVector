import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/design_system/bluevector_theme.dart';
import 'package:mobile_app/features/interventions/current_intervention_screen.dart';
import 'package:mobile_app/models/job.dart';
import 'package:mobile_app/services/location_service.dart';
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

Widget _screen(
  Job job, {
  ValueListenable<GpsStatusSnapshot>? gpsStatusListenable,
  Future<void> Function()? onRequestGpsPermission,
  Future<void> Function()? onOpenGpsSettings,
  Future<void> Function()? onOpenGpsAppSettings,
}) {
  return MaterialApp(
    theme: BlueVectorTheme.light,
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
        gpsStatusListenable: gpsStatusListenable,
        onRequestGpsPermission: onRequestGpsPermission,
        onOpenGpsSettings: onOpenGpsSettings,
        onOpenGpsAppSettings: onOpenGpsAppSettings,
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

    expect(find.text('Informations utiles'), findsNothing);
  });

  testWidgets('current intervention shows only populated network references', (
    tester,
  ) async {
    await tester.pumpWidget(
      _screen(_job(operator: 'Orange', pto: 'PTO-CASA-42')),
    );
    await tester.pump();

    await tester.scrollUntilVisible(
      find.text('Informations utiles'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pump();

    expect(find.text('Informations utiles'), findsOneWidget);
    expect(find.text('Opérateur'), findsOneWidget);
    expect(find.text('Orange'), findsOneWidget);
    expect(find.text('PTO'), findsOneWidget);
    expect(find.text('PTO-CASA-42'), findsOneWidget);
    expect(find.text('NRO'), findsNothing);
    expect(find.text('SRO'), findsNothing);
    expect(find.text('PBO'), findsNothing);
  });

  testWidgets('current intervention shows live GPS accuracy', (tester) async {
    final gps = ValueNotifier<GpsStatusSnapshot>(
      const GpsStatusSnapshot(
        availability: GpsAvailability.ready,
        isLiveTracking: true,
        latitude: 33.57,
        longitude: -7.59,
        accuracy: 4.2,
      ),
    );
    addTearDown(gps.dispose);

    await tester.pumpWidget(_screen(_job(), gpsStatusListenable: gps));
    await tester.pump();

    expect(find.text('GPS'), findsOneWidget);
    expect(find.text('±4 m'), findsOneWidget);
    expect(find.text('GPS prêt'), findsNothing);
  });

  testWidgets('current intervention reacts when GPS is disabled', (
    tester,
  ) async {
    final gps = ValueNotifier<GpsStatusSnapshot>(
      const GpsStatusSnapshot(
        availability: GpsAvailability.ready,
        isLiveTracking: true,
      ),
    );
    addTearDown(gps.dispose);

    await tester.pumpWidget(_screen(_job(), gpsStatusListenable: gps));
    await tester.pump();

    expect(find.text('Recherche…'), findsOneWidget);

    gps.value = const GpsStatusSnapshot(
      availability: GpsAvailability.serviceDisabled,
      isLiveTracking: false,
    );
    await tester.pump();

    expect(find.text('Désactivé'), findsOneWidget);
    expect(find.text('Recherche…'), findsNothing);
  });

  testWidgets('current intervention can retry after GPS error', (tester) async {
    var retryCount = 0;

    final gps = ValueNotifier<GpsStatusSnapshot>(
      const GpsStatusSnapshot(
        availability: GpsAvailability.error,
        isLiveTracking: false,
        error: 'temporary GPS failure',
      ),
    );
    addTearDown(gps.dispose);

    await tester.pumpWidget(
      _screen(
        _job(),
        gpsStatusListenable: gps,
        onRequestGpsPermission: () async {
          retryCount++;
        },
      ),
    );
    await tester.pump();

    expect(find.text('Erreur'), findsOneWidget);
    expect(find.text('Position GPS indisponible'), findsOneWidget);
    expect(find.text('Réessayer'), findsOneWidget);

    await tester.tap(find.text('Réessayer'));
    await tester.pump();

    expect(retryCount, 1);
  });
  testWidgets('current intervention shows last known GPS position', (
    tester,
  ) async {
    final gps = ValueNotifier<GpsStatusSnapshot>(
      GpsStatusSnapshot(
        availability: GpsAvailability.ready,
        isLiveTracking: false,
        latitude: 33.57012,
        longitude: -7.58987,
        accuracy: 6.4,
        positionAt: DateTime(2026, 9, 17, 10, 30),
      ),
    );
    addTearDown(gps.dispose);

    await tester.pumpWidget(_screen(_job(), gpsStatusListenable: gps));
    await tester.pump();

    expect(find.text('Dernière position'), findsOneWidget);
    expect(find.text('33.57012, -7.58987 · ±6 m · 10:30'), findsOneWidget);
  });

  testWidgets('current intervention requests GPS permission when denied', (
    tester,
  ) async {
    var requestCount = 0;

    final gps = ValueNotifier<GpsStatusSnapshot>(
      const GpsStatusSnapshot(
        availability: GpsAvailability.permissionDenied,
        isLiveTracking: false,
      ),
    );
    addTearDown(gps.dispose);

    await tester.pumpWidget(
      _screen(
        _job(),
        gpsStatusListenable: gps,
        onRequestGpsPermission: () async {
          requestCount++;
        },
      ),
    );
    await tester.pump();

    expect(find.text('Autorisation GPS nécessaire'), findsOneWidget);
    expect(find.text('Autoriser'), findsOneWidget);

    await tester.tap(find.text('Autoriser'));
    await tester.pump();

    expect(requestCount, 1);
  });

  testWidgets('current intervention opens GPS settings when service disabled', (
    tester,
  ) async {
    var settingsCount = 0;

    final gps = ValueNotifier<GpsStatusSnapshot>(
      const GpsStatusSnapshot(
        availability: GpsAvailability.serviceDisabled,
        isLiveTracking: false,
      ),
    );
    addTearDown(gps.dispose);

    await tester.pumpWidget(
      _screen(
        _job(),
        gpsStatusListenable: gps,
        onOpenGpsSettings: () async {
          settingsCount++;
        },
      ),
    );
    await tester.pump();

    expect(find.text('GPS du téléphone désactivé'), findsOneWidget);
    expect(find.text('Réglages GPS'), findsOneWidget);

    await tester.tap(find.text('Réglages GPS'));
    await tester.pump();

    expect(settingsCount, 1);
  });

  testWidgets('current intervention opens app settings when GPS is blocked', (
    tester,
  ) async {
    var appSettingsCount = 0;

    final gps = ValueNotifier<GpsStatusSnapshot>(
      const GpsStatusSnapshot(
        availability: GpsAvailability.permissionDeniedForever,
        isLiveTracking: false,
      ),
    );
    addTearDown(gps.dispose);

    await tester.pumpWidget(
      _screen(
        _job(),
        gpsStatusListenable: gps,
        onOpenGpsAppSettings: () async {
          appSettingsCount++;
        },
      ),
    );
    await tester.pump();

    expect(find.text('Autorisation GPS bloquée'), findsOneWidget);
    expect(find.text('Réglages app'), findsOneWidget);

    await tester.tap(find.text('Réglages app'));
    await tester.pump();

    expect(appSettingsCount, 1);
  });
}
