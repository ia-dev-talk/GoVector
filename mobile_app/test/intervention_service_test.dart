import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/services/intervention_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({'tech_token': 'test-token'});
  });

  test('startJob sends one backend business command only', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      return http.Response(jsonEncode({'id': 8, 'status': 'en_route'}), 200);
    });

    final result = await InterventionService.startJob(
      jobId: 8,
      latitude: 33.58,
      longitude: -7.60,
      client: client,
    );

    expect(result['status'], 'en_route');
    expect(requests, hasLength(1));
    expect(requests.single.method, 'POST');
    expect(requests.single.url.path, '/api/v1/tech/jobs/8/start');
  });
}
