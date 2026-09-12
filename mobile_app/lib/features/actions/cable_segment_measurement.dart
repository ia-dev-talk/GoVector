double? parseCableMeterInput(String value) {
  final normalized = value.trim().replaceAll(',', '.');
  if (normalized.isEmpty) return null;

  final parsed = double.tryParse(normalized);
  if (parsed == null || !parsed.isFinite || parsed < 0) return null;
  return parsed;
}

double? cableSegmentLength({
  required double? startMeter,
  required String endMeterInput,
}) {
  final endMeter = parseCableMeterInput(endMeterInput);
  if (startMeter == null || endMeter == null) return null;
  if (endMeter >= startMeter) return null;
  return startMeter - endMeter;
}

String formatCableMeter(double value) {
  if (value == value.roundToDouble()) return value.toStringAsFixed(0);
  return value
      .toStringAsFixed(2)
      .replaceFirst(RegExp(r'0+$'), '')
      .replaceFirst(RegExp(r'\.$'), '');
}
