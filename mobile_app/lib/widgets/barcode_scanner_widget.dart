import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

enum EquipmentCategory { ont, routeur, boitierWifi, pto, splitter, autre }

class EquipmentScanResult {
  final String code;
  final EquipmentCategory category;
  final String? label;

  const EquipmentScanResult({
    required this.code,
    required this.category,
    this.label,
  });
}

class BarcodeScannerWidget extends StatefulWidget {
  final int? jobId;
  final Function(EquipmentScanResult)? onScanned;
  final VoidCallback? onClose;

  const BarcodeScannerWidget({
    super.key,
    this.jobId,
    this.onScanned,
    this.onClose,
  });

  @override
  State<BarcodeScannerWidget> createState() => _BarcodeScannerWidgetState();
}

class _BarcodeScannerWidgetState extends State<BarcodeScannerWidget> {
  bool _autoFillDone = false;
  String? _lastMessage;

  EquipmentCategory _guessCategory(String code) {
    final upper = code.toUpperCase();
    if (upper.contains('ONT') || upper.contains('ONU') || upper.startsWith('ONT')) {
      return EquipmentCategory.ont;
    }
    if (upper.contains('ROUTEUR') || upper.contains('ROUTER') || upper.contains('HG')) {
      return EquipmentCategory.routeur;
    }
    if (upper.contains('WIFI') || upper.contains('BOX')) {
      return EquipmentCategory.boitierWifi;
    }
    if (upper.contains('PTO')) {
      return EquipmentCategory.pto;
    }
    if (upper.contains('SPLIT')) {
      return EquipmentCategory.splitter;
    }
    return EquipmentCategory.autre;
  }

  String? _categoryLabel(EquipmentCategory category) {
    switch (category) {
      case EquipmentCategory.ont:
        return 'ONT';
      case EquipmentCategory.routeur:
        return 'Routeur';
      case EquipmentCategory.boitierWifi:
        return 'Boîtier WiFi';
      case EquipmentCategory.pto:
        return 'PTO';
      case EquipmentCategory.splitter:
        return 'Splitter';
      case EquipmentCategory.autre:
        return 'Équipement';
    }
  }

  void _onScan(String code) {
    final category = _guessCategory(code);
    final label = _categoryLabel(category);
    final result = EquipmentScanResult(code: code, category: category, label: label);

    if (widget.onScanned != null) {
      widget.onScanned!(result);
    }

    setState(() {
      _lastMessage = 'Scan détecté : ${label ?? "Équipement"}';
    });

    if (widget.jobId == null) {
      Navigator.pop(context, result);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scanner équipement'),
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          if (_lastMessage != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              color: Theme.of(context).colorScheme.errorContainer,
              child: Text(_lastMessage!),
            ),
          Expanded(
            child: MobileScanner(
              onDetect: (capture) {
                final barcode = capture.barcodes.firstOrNull;
                final code = barcode?.rawValue;
                if (code != null && code.isNotEmpty) {
                  _onScan(code);
                }
              },
            ),
          ),
        ],
      ),
    );
  }
}