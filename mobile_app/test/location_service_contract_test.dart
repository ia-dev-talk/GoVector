import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/services/location_service.dart';

void main() {
  test('GPS payload never fabricates unavailable battery telemetry', () {
    final payload = LocationService.buildGpsPayload(
      latitude: 33.58,
      longitude: -7.60,
      speed: 0,
      heading: 0,
      accuracy: 4.2,
      observedAt: DateTime.utc(2026, 8, 7, 12, 30),
      jobId: 8,
    );

    expect(payload['job_id'], 8);
    expect(payload['observed_at'], '2026-08-07T12:30:00.000Z');
    expect(payload.containsKey('battery_level'), isFalse);
  });

  test('GPS payload omits invalid optional device telemetry', () {
    final payload = LocationService.buildGpsPayload(
      latitude: 33.58,
      longitude: -7.60,
      speed: -1,
      heading: -1,
      accuracy: -1,
      jobId: 8,
    );

    expect(payload.containsKey('speed'), isFalse);
    expect(payload.containsKey('heading'), isFalse);
    expect(payload.containsKey('accuracy'), isFalse);
    expect(payload['job_id'], 8);
  });
}
