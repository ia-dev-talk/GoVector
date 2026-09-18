import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/gps/mobile_gps_screen.dart';
import 'package:mobile_app/services/field_agent_service.dart';

void main() {
  group('technician location validity', () {
    test('accepts valid GPS coordinates', () {
      const serviceLocation = FieldAgentTechnicianLocation(
        id: 1,
        name: 'Tech',
        liveStatus: 'disponible',
        latitude: 33.5731,
        longitude: -7.5898,
      );

      const mapLocation = MobileTechnicianLocation(
        id: 1,
        name: 'Tech',
        liveStatus: 'disponible',
        latitude: 33.5731,
        longitude: -7.5898,
      );

      expect(serviceLocation.hasPosition, isTrue);
      expect(mapLocation.hasPosition, isTrue);
    });

    test('rejects missing or impossible GPS coordinates', () {
      const invalidService = FieldAgentTechnicianLocation(
        id: 1,
        name: 'Tech',
        liveStatus: 'disponible',
        latitude: 91,
        longitude: -7.5898,
      );

      const invalidMap = MobileTechnicianLocation(
        id: 1,
        name: 'Tech',
        liveStatus: 'disponible',
        latitude: 33.5731,
        longitude: 181,
      );

      const missingMap = MobileTechnicianLocation(
        id: 1,
        name: 'Tech',
        liveStatus: 'disponible',
        latitude: null,
        longitude: -7.5898,
      );

      expect(invalidService.hasPosition, isFalse);
      expect(invalidMap.hasPosition, isFalse);
      expect(missingMap.hasPosition, isFalse);
    });
  });
}
