import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/services/technician_stock_service.dart';

void main() {
  group('TechnicianStockService custody cache policy', () {
    test('allows offline fallback for transient server failures', () {
      expect(
        TechnicianStockService.canUseCustodyCacheForStatus(408),
        isTrue,
      );
      expect(
        TechnicianStockService.canUseCustodyCacheForStatus(429),
        isTrue,
      );
      expect(
        TechnicianStockService.canUseCustodyCacheForStatus(500),
        isTrue,
      );
      expect(
        TechnicianStockService.canUseCustodyCacheForStatus(503),
        isTrue,
      );
    });

    test('never masks authentication or authorization failures with cache', () {
      expect(
        TechnicianStockService.canUseCustodyCacheForStatus(401),
        isFalse,
      );
      expect(
        TechnicianStockService.canUseCustodyCacheForStatus(403),
        isFalse,
      );
      expect(
        TechnicianStockService.canUseCustodyCacheForStatus(404),
        isFalse,
      );
      expect(
        TechnicianStockService.canUseCustodyCacheForStatus(422),
        isFalse,
      );
    });
  });
}
