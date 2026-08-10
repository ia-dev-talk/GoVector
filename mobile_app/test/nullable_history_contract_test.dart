import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/history/technician_history_models.dart';

void main() {
  test('missing history dates remain null instead of Unix epoch', () {
    final item = TechnicianHistoryItem.fromJson({
      'job_id': 8,
      'activity': 'INSTALLATION',
      'client': 'Client',
      'address': 'Adresse',
      'status': 'failed',
    });
    final activity = TechnicianHistoryActivity.fromJson({'action': 'assigned'});

    expect(item.date, isNull);
    expect(activity.createdAt, isNull);
  });
}
