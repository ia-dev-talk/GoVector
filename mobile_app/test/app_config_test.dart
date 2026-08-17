import 'package:flutter_test/flutter_test.dart';
import 'package:bluevector/config/config.dart';

void main() {
  group('AppConfig.resolveApiBaseUrl', () {
    test('keeps the development fallback outside release mode', () {
      final url = AppConfig.resolveApiBaseUrl(
        configuredUrl: '',
        releaseMode: false,
      );

      expect(url, AppConfig.developmentApiBaseUrl);
    });

    test('requires API_BASE_URL in release mode', () {
      expect(
        () => AppConfig.resolveApiBaseUrl(
          configuredUrl: '',
          releaseMode: true,
        ),
        throwsA(isA<StateError>()),
      );
    });

    test('requires HTTPS in release mode', () {
      expect(
        () => AppConfig.resolveApiBaseUrl(
          configuredUrl: 'http://api.example.com/api/v1',
          releaseMode: true,
        ),
        throwsA(isA<StateError>()),
      );
    });

    test('rejects localhost even when HTTPS is used in release mode', () {
      expect(
        () => AppConfig.resolveApiBaseUrl(
          configuredUrl: 'https://localhost:8080/api/v1',
          releaseMode: true,
        ),
        throwsA(isA<StateError>()),
      );
    });

    test('accepts and normalizes a production HTTPS URL', () {
      final url = AppConfig.resolveApiBaseUrl(
        configuredUrl: ' https://api.bluevector.example/api/v1/ ',
        releaseMode: true,
      );

      expect(url, 'https://api.bluevector.example/api/v1');
    });
  });
}
