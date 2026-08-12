import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../design_system/bluevector_tokens.dart';

enum EquipmentCategory { ont, routeur, boitierWifi, pto, splitter, autre }

class EquipmentScanResult {
  final String code;
  final EquipmentCategory category;
  final String? label;

  const EquipmentScanResult({
    required this.code,
    this.category = EquipmentCategory.autre,
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
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    facing: CameraFacing.back,
  );

  bool _processing = false;
  String? _lastCode;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onCapture(BarcodeCapture capture) {
    if (_processing) return;
    String? code;
    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue?.trim();
      if (value != null && value.isNotEmpty) {
        code = value;
        break;
      }
    }
    if (code == null || code == _lastCode) return;

    _processing = true;
    _lastCode = code;
    final result = EquipmentScanResult(code: code, label: 'Code équipement');

    if (widget.onScanned != null) {
      widget.onScanned!(result);
    }

    if (widget.jobId == null) {
      Navigator.pop(context, result);
      return;
    }

    setState(() {});
  }

  void _resume() {
    setState(() {
      _processing = false;
      _lastCode = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: const Text('Scanner le numéro de série'),
        backgroundColor: BlueVectorColors.backgroundDeep,
        foregroundColor: BlueVectorColors.textPrimary,
        actions: [
          IconButton(
            tooltip: 'Lampe',
            onPressed: _controller.toggleTorch,
            icon: const Icon(Icons.flashlight_on_outlined),
          ),
          IconButton(
            tooltip: 'Changer de caméra',
            onPressed: _controller.switchCamera,
            icon: const Icon(Icons.cameraswitch_outlined),
          ),
        ],
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onCapture,
          ),
          IgnorePointer(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.58),
                    Colors.transparent,
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.68),
                  ],
                  stops: const [0, .24, .72, 1],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(
                    BlueVectorSpacing.lg,
                    BlueVectorSpacing.lg,
                    BlueVectorSpacing.lg,
                    0,
                  ),
                  child: Text(
                    'Cadrez le QR code ou le code-barres imprimé sur le routeur, ONT ou boîtier. BlueVector vérifiera ensuite le SN, le modèle et l’opérateur.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      height: 1.45,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const Spacer(),
                Center(
                  child: Container(
                    width: 285,
                    height: 190,
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: _processing
                            ? BlueVectorColors.success
                            : BlueVectorColors.cyan,
                        width: 2.5,
                      ),
                      borderRadius: BorderRadius.circular(BlueVectorRadius.large),
                      boxShadow: [
                        BoxShadow(
                          color: (_processing
                                  ? BlueVectorColors.success
                                  : BlueVectorColors.cyan)
                              .withValues(alpha: .2),
                          blurRadius: 18,
                          spreadRadius: 2,
                        ),
                      ],
                    ),
                    child: _processing
                        ? const Center(
                            child: Icon(
                              Icons.check_circle_rounded,
                              color: BlueVectorColors.success,
                              size: 52,
                            ),
                          )
                        : null,
                  ),
                ),
                const Spacer(),
                Padding(
                  padding: const EdgeInsets.all(BlueVectorSpacing.lg),
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 180),
                    child: _processing
                        ? Container(
                            key: const ValueKey('captured'),
                            width: double.infinity,
                            padding: const EdgeInsets.all(BlueVectorSpacing.md),
                            decoration: BoxDecoration(
                              color: BlueVectorColors.surface.withValues(alpha: .95),
                              border: Border.all(color: BlueVectorColors.borderStrong),
                              borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
                            ),
                            child: Column(
                              children: [
                                const Text(
                                  'Code capturé',
                                  style: TextStyle(
                                    color: BlueVectorColors.success,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: BlueVectorSpacing.xs),
                                Text(
                                  _lastCode ?? '—',
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    color: BlueVectorColors.textPrimary,
                                    fontSize: 12,
                                  ),
                                ),
                                if (widget.jobId != null) ...[
                                  const SizedBox(height: BlueVectorSpacing.sm),
                                  OutlinedButton.icon(
                                    onPressed: _resume,
                                    icon: const Icon(Icons.qr_code_scanner_rounded),
                                    label: const Text('Scanner de nouveau'),
                                  ),
                                ],
                              ],
                            ),
                          )
                        : Container(
                            key: const ValueKey('waiting'),
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(
                              vertical: BlueVectorSpacing.sm,
                              horizontal: BlueVectorSpacing.md,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: .58),
                              borderRadius: BorderRadius.circular(BlueVectorRadius.pill),
                            ),
                            child: const Text(
                              'Détection automatique · gardez le code net dans le cadre',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: Colors.white70,
                                fontSize: 11,
                              ),
                            ),
                          ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
