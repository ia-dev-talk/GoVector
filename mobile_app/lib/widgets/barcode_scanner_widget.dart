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

  void _complete(String rawCode, {String label = 'Code équipement'}) {
    final code = rawCode.trim();
    if (code.isEmpty || _processing) return;

    _processing = true;
    _lastCode = code;
    final result = EquipmentScanResult(code: code, label: label);

    if (widget.onScanned != null) {
      widget.onScanned!(result);
    }

    if (widget.jobId == null) {
      Navigator.pop(context, result);
      return;
    }

    setState(() {});
  }

  void _onCapture(BarcodeCapture capture) {
    if (_processing) return;

    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue?.trim();
      if (value != null && value.isNotEmpty && value != _lastCode) {
        _complete(value);
        return;
      }
    }
  }

  void _resume() {
    setState(() {
      _processing = false;
      _lastCode = null;
    });
  }

  Future<void> _manualEntry() async {
    final controller = TextEditingController();
    final value = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: BlueVectorColors.surface,
      builder: (sheetContext) {
        final keyboard = MediaQuery.viewInsetsOf(sheetContext).bottom;
        return Padding(
          padding: EdgeInsets.fromLTRB(
            BlueVectorSpacing.lg,
            BlueVectorSpacing.lg,
            BlueVectorSpacing.lg,
            BlueVectorSpacing.lg + keyboard,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Saisir le numéro de série',
                style: TextStyle(
                  color: BlueVectorColors.textPrimary,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: BlueVectorSpacing.xs),
              const Text(
                'Utilisez cette saisie si la caméra est indisponible ou si le code est abîmé.',
                style: TextStyle(
                  color: BlueVectorColors.textSecondary,
                  fontSize: 12,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: BlueVectorSpacing.md),
              TextField(
                controller: controller,
                autofocus: true,
                textCapitalization: TextCapitalization.characters,
                textInputAction: TextInputAction.done,
                decoration: const InputDecoration(
                  labelText: 'Numéro de série / code',
                  hintText: 'Ex. ALCLF1234567',
                ),
                onSubmitted: (raw) {
                  final code = raw.trim();
                  if (code.isNotEmpty) Navigator.pop(sheetContext, code);
                },
              ),
              const SizedBox(height: BlueVectorSpacing.md),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(sheetContext),
                      child: const Text('Annuler'),
                    ),
                  ),
                  const SizedBox(width: BlueVectorSpacing.sm),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: () {
                        final code = controller.text.trim();
                        if (code.isNotEmpty) Navigator.pop(sheetContext, code);
                      },
                      child: const Text('Valider le code'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
    controller.dispose();

    if (!mounted || value == null || value.trim().isEmpty) return;
    _complete(value, label: 'Code saisi manuellement');
  }

  Widget _cameraError(
    BuildContext context,
    MobileScannerException error,
    Widget? child,
  ) {
    final permissionDenied =
        error.errorCode == MobileScannerErrorCode.permissionDenied;
    return ColoredBox(
      color: BlueVectorColors.backgroundDeep,
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(BlueVectorSpacing.xl),
            child: Container(
              width: double.infinity,
              constraints: const BoxConstraints(maxWidth: 420),
              padding: const EdgeInsets.all(BlueVectorSpacing.lg),
              decoration: BoxDecoration(
                color: BlueVectorColors.surface,
                borderRadius: BorderRadius.circular(BlueVectorRadius.large),
                border: Border.all(color: BlueVectorColors.borderStrong),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 58,
                    height: 58,
                    decoration: BoxDecoration(
                      color: BlueVectorColors.warning.withValues(alpha: .12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.no_photography_outlined,
                      color: BlueVectorColors.warning,
                      size: 28,
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.md),
                  Text(
                    permissionDenied
                        ? 'Accès caméra refusé'
                        : 'Caméra indisponible',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: BlueVectorColors.textPrimary,
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.xs),
                  Text(
                    permissionDenied
                        ? 'Autorisez la caméra dans les réglages Android, ou continuez immédiatement avec le numéro de série.'
                        : 'Le scan automatique ne peut pas démarrer. Vous pouvez continuer l’intervention sans bloquer la synchronisation.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: BlueVectorColors.textSecondary,
                      fontSize: 12,
                      height: 1.45,
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.lg),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _manualEntry,
                      icon: const Icon(Icons.keyboard_alt_outlined),
                      label: const Text('Saisir le code manuellement'),
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.xs),
                  TextButton(
                    onPressed: widget.onClose ?? () => Navigator.maybePop(context),
                    child: const Text('Revenir à l’intervention'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
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
            errorBuilder: _cameraError,
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
                    Colors.black.withValues(alpha: 0.72),
                  ],
                  stops: const [0, .24, .68, 1],
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
                  child: Column(
                    children: [
                      AnimatedSwitcher(
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
                      if (!_processing) ...[
                        const SizedBox(height: BlueVectorSpacing.sm),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: _manualEntry,
                            icon: const Icon(Icons.keyboard_alt_outlined),
                            label: const Text('Saisir le code manuellement'),
                          ),
                        ),
                      ],
                    ],
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
