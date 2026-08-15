import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/interventions/mobile_job_presenter.dart';
import 'package:mobile_app/models/job.dart';

Job _job(
  String type, {
  String? priority,
  String? validationStatus,
}) => Job(
  id: 4,
  jobNumber: '',
  jobType: type,
  status: 'in_progress',
  customerName: 'Cafe Sidi Maarouf',
  serviceAddress: '78 Bd Sidi Maarouf',
  assignedTechId: 3,
  latitude: 33.547915,
  longitude: -7.595783,
  priority: priority,
  validationStatus: validationStatus,
);

void main() {
  group('MobileJobPresenter.title', () {
    test('humanizes common uppercase intervention types', () {
      expect(MobileJobPresenter.title(_job('DEPANNAGE')), 'Dépannage');
      expect(MobileJobPresenter.title(_job('INSTALLATION FTTH')), 'Installation FTTH');
      expect(MobileJobPresenter.title(_job('URGENCE')), 'Urgence');
    });

    test('humanizes unknown all-uppercase labels without altering mixed case', () {
      expect(MobileJobPresenter.title(_job('RACCORDEMENT CLIENT')), 'Raccordement Client');
      expect(MobileJobPresenter.title(_job('Audit réseau')), 'Audit réseau');
    });

    test('keeps the FTTH fallback when no type is configured', () {
      expect(MobileJobPresenter.title(_job('   ')), 'Intervention FTTH');
    });
  });

  group('MobileJobPresenter.isUrgent', () {
    test('uses the authoritative intervention priority from the API', () {
      expect(
        MobileJobPresenter.isUrgent(
          _job('DEPANNAGE', priority: 'URGENT'),
        ),
        isTrue,
      );
      expect(
        MobileJobPresenter.isUrgent(
          _job('DEPANNAGE', priority: 'normal'),
        ),
        isFalse,
      );
    });

    test('keeps legacy urgency signals for backward compatibility', () {
      expect(
        MobileJobPresenter.isUrgent(
          _job('DEPANNAGE', validationStatus: 'URGENT'),
        ),
        isTrue,
      );
      expect(MobileJobPresenter.isUrgent(_job('URGENCE')), isTrue);
    });
  });
}
