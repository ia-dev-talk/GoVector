import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Agent terrain keeps the GoVector P0 control workflow visible', () {
    final source = File(
      'lib/features/agent/field_agent_shell.dart',
    ).readAsStringSync();

    expect(source, contains('GoVector · Agent terrain'));
    expect(source, contains('Interventions de mon équipe'));
    expect(source, contains('À contrôler'));
    expect(source, contains('Photos'));
    expect(source, contains('Rapport'));
    expect(source, contains('GPS'));
    expect(source, contains('Retourner avec motif'));
    expect(source, contains('Transmettre à l’Orienteur'));
    expect(source, contains('seul responsable de la validation finale'));
  });

  test('Agent terrain keeps offline evidence and synchronization explicit', () {
    final source = File(
      'lib/features/agent/field_agent_shell.dart',
    ).readAsStringSync();

    expect(source, contains('Mode hors ligne'));
    expect(source, contains('les preuves restent sur l’appareil'));
    expect(source, contains('OfflineService.addPendingAction'));
    expect(source, contains('OfflineService.syncPendingActions'));
  });

  test('Agent decision waits for this job evidence to be synchronized', () {
    final source = File(
      'lib/features/agent/field_agent_shell.dart',
    ).readAsStringSync();

    expect(source, contains('OfflineService.getPendingEventsForJob(job.id)'));
    expect(
      source,
      contains(
        'Connexion requise avant de prendre une décision sur ce dossier.',
      ),
    );
    expect(source, contains('Réessayez la synchronisation avant la décision.'));
  });

  test(
    'Agent terrain exposes explicit GPS recovery and honest local evidence',
    () {
      final source = File(
        'lib/features/agent/field_agent_shell.dart',
      ).readAsStringSync();

      expect(source, contains('LocationService.refreshStatus()'));
      expect(source, contains('GpsAvailability.serviceDisabled'));
      expect(source, contains('LocationService.openLocationSettings()'));
      expect(source, contains('GpsAvailability.permissionDeniedForever'));
      expect(source, contains('LocationService.openAppSettings()'));

      expect(
        source,
        contains(
          'Position enregistrée sur l’appareil. Synchronisation lancée.',
        ),
      );
      expect(
        source,
        contains('Rapport enregistré sur l’appareil. Synchronisation lancée.'),
      );
      expect(source, contains('Photos conservées sur l’appareil.'));
    },
  );

  test(
    'Agent terrain exposes explicit GPS recovery and honest local evidence',
    () {
      final source = File(
        'lib/features/agent/field_agent_shell.dart',
      ).readAsStringSync();

      expect(source, contains('LocationService.refreshStatus()'));
      expect(source, contains('GpsAvailability.serviceDisabled'));
      expect(source, contains('LocationService.openLocationSettings()'));
      expect(source, contains('GpsAvailability.permissionDeniedForever'));
      expect(source, contains('LocationService.openAppSettings()'));

      expect(
        source,
        contains(
          'Position enregistrée sur l’appareil. Synchronisation lancée.',
        ),
      );
      expect(
        source,
        contains('Rapport enregistré sur l’appareil. Synchronisation lancée.'),
      );
      expect(source, contains('Photos conservées sur l’appareil.'));
    },
  );

  test('Agent detail uses the real technician stock contract', () {
    final source = File(
      'lib/features/agent/field_agent_shell.dart',
    ).readAsStringSync();

    expect(source, contains("stock['stock_summary']"));
    expect(source, contains("stock['vehicle_stock']"));
    expect(source, contains("'available_units'"));
    expect(source, contains("label: 'Stock tech.'"));
  });

  test('Agent terrain does not expose generic network labels', () {
    final source = File(
      'lib/features/agent/field_agent_shell.dart',
    ).readAsStringSync();

    for (final label in const ["'PBO'", "'NRO'", "'SRO'"]) {
      expect(source, isNot(contains(label)), reason: label);
    }
  });

  test(
    'Agent map refreshes technician positions without reloading planning',
    () {
      final agentSource = File(
        'lib/features/agent/field_agent_shell.dart',
      ).readAsStringSync();
      final mapSource = File(
        'lib/features/gps/mobile_gps_screen.dart',
      ).readAsStringSync();

      expect(
        agentSource,
        contains(
          'onRefreshTechnicianLocations: _refreshMapTechnicianLocations',
        ),
      );
      expect(
        agentSource,
        contains('FieldAgentService.getMyTeamTechnicianLocations()'),
      );
      expect(mapSource, contains('Timer.periodic'));
      expect(mapSource, contains('_technicianRefreshInterval'));
      expect(mapSource, contains('_refreshTechnicianLocations'));
    },
  );
}
