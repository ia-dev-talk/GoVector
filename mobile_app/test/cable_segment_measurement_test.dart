import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/actions/cable_segment_measurement.dart';

void main() {
  test('cable length follows a decreasing physical counter', () {
    expect(cableSegmentLength(startMeter: 1000, endMeterInput: '700'), 300);
    expect(cableSegmentLength(startMeter: 1500, endMeterInput: '1400'), 100);
    expect(cableSegmentLength(startMeter: 1400, endMeterInput: '1500'), isNull);
    expect(
      cableSegmentLength(startMeter: 125.5, endMeterInput: '100,25'),
      25.25,
    );
  });

  test('incomplete or invalid meter input never invents a length', () {
    expect(cableSegmentLength(startMeter: null, endMeterInput: '100'), isNull);
    expect(cableSegmentLength(startMeter: 100, endMeterInput: ''), isNull);
    expect(cableSegmentLength(startMeter: 100, endMeterInput: '-2'), isNull);
    expect(cableSegmentLength(startMeter: 100, endMeterInput: 'abc'), isNull);
  });

  test('meter display stays concise without losing useful decimals', () {
    expect(formatCableMeter(100), '100');
    expect(formatCableMeter(25.25), '25.25');
    expect(formatCableMeter(25.5), '25.5');
  });
}
