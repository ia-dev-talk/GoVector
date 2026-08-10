import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/models/job.dart';

void main() {
  test('missing coordinates are not converted into a known (0, 0)', () {
    final job = Job.fromJson({
      'id': 8,
      'job_type': 'INSTALLATION',
      'status': 'assigned',
      'customer_name': 'Client',
      'service_address': 'Adresse',
    });

    expect(job.hasServiceCoordinates, isFalse);
    expect(job.toJson()['latitude'], isNull);
    expect(job.toJson()['longitude'], isNull);
  });

  test('real equator/origin coordinates remain known values', () {
    final job = Job.fromJson({
      'id': 8,
      'job_type': 'INSTALLATION',
      'status': 'assigned',
      'customer_name': 'Client',
      'service_address': 'Adresse',
      'latitude': 0,
      'longitude': 0,
    });

    expect(job.hasServiceCoordinates, isTrue);
    expect(job.toJson()['latitude'], 0.0);
    expect(job.toJson()['longitude'], 0.0);
  });
}
