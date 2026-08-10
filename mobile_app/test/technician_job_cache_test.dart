import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/models/job.dart';
import 'package:mobile_app/services/offline_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

Job job(int id, int? technicianId) => Job(
  id: id,
  jobNumber: 'DTLI-$id',
  jobType: 'INSTALLATION',
  status: 'assigned',
  customerName: 'Client $id',
  serviceAddress: 'Adresse $id',
  assignedTechId: technicianId,
  latitude: 33.57,
  longitude: -7.59,
);

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('job cache is isolated by both user and technician', () async {
    await OfflineService.cacheJobs(
      [job(8, 3)],
      ownerUserId: 3,
      technicianId: 3,
    );

    expect(
      await OfflineService.getCachedJobs(ownerUserId: 4, technicianId: 4),
      isEmpty,
    );
    expect(
      (await OfflineService.getCachedJobs(
        ownerUserId: 3,
        technicianId: 3,
      )).single.id,
      8,
    );
  });

  test('same technician id under another user cannot read the cache', () async {
    await OfflineService.cacheJobs(
      [job(41, 3)],
      ownerUserId: 3,
      technicianId: 3,
    );

    expect(
      await OfflineService.getCachedJobs(ownerUserId: 99, technicianId: 3),
      isEmpty,
    );
  });

  test('legacy global cache is not adopted by a new account', () async {
    SharedPreferences.setMockInitialValues({
      'offline_jobs_cache': '[{"id":8,"assigned_tech_id":3}]',
    });

    expect(
      await OfflineService.getCachedJobs(ownerUserId: 4, technicianId: 4),
      isEmpty,
    );
  });
}
