import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:path/path.dart' as path_util;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../services/offline_service.dart';

class ClientSignatureScreen extends StatefulWidget {
  const ClientSignatureScreen({
    super.key,
    required this.jobId,
    required this.customerName,
  });

  final int jobId;
  final String customerName;

  @override
  State<ClientSignatureScreen> createState() => _ClientSignatureScreenState();
}

class _ClientSignatureScreenState extends State<ClientSignatureScreen> {
  final List<Offset?> _points = [];
  final GlobalKey _signatureKey = GlobalKey();
  bool _saving = false;

  bool get _hasSignature => _points.whereType<Offset>().length > 4;

  void _startStroke(DragStartDetails details) {
    setState(() => _points.add(details.localPosition));
  }

  void _continueStroke(DragUpdateDetails details) {
    setState(() => _points.add(details.localPosition));
  }

  void _endStroke(DragEndDetails details) {
    setState(() => _points.add(null));
  }

  Future<void> _save() async {
    if (!_hasSignature || _saving) {
      return;
    }

    setState(() => _saving = true);

    final boundary =
        _signatureKey.currentContext?.findRenderObject()
            as RenderRepaintBoundary?;
    if (boundary == null) {
      setState(() => _saving = false);
      return;
    }
    final image = await boundary.toImage(pixelRatio: 2);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    if (data == null) {
      setState(() => _saving = false);
      return;
    }
    final support = await getApplicationSupportDirectory();
    final source = File(
      path_util.join(support.path, 'signature-${const Uuid().v4()}.png'),
    );
    await source.writeAsBytes(data.buffer.asUint8List(), flush: true);
    await OfflineService.addPendingMedia(
      jobId: widget.jobId,
      sourcePath: source.path,
      kind: 'signature',
      eventType: 'client_signature',
      mimeType: 'image/png',
      metadata: {
        'customer_name': widget.customerName,
        'signed_at': DateTime.now().toUtc().toIso8601String(),
      },
    );
    unawaited(OfflineService.syncPendingActions());

    if (!mounted) {
      return;
    }

    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Signature client'),
        actions: [
          TextButton(
            onPressed: _hasSignature && !_saving ? _save : null,
            child: const Text('Valider'),
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(BlueVectorSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Veuillez faire signer le client dans le cadre ci-dessous.',
                style: TextStyle(color: BlueVectorColors.textSecondary),
              ),
              if (widget.customerName.trim().isNotEmpty) ...[
                const SizedBox(height: BlueVectorSpacing.xs),
                Text(
                  widget.customerName,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
              const SizedBox(height: BlueVectorSpacing.lg),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: const Color(0xFFF4F7FA),
                      border: Border.all(color: BlueVectorColors.borderStrong),
                      borderRadius: BorderRadius.circular(
                        BlueVectorRadius.medium,
                      ),
                    ),
                    child: RepaintBoundary(
                      key: _signatureKey,
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onPanStart: _startStroke,
                        onPanUpdate: _continueStroke,
                        onPanEnd: _endStroke,
                        child: CustomPaint(
                          painter: _SignaturePainter(_points),
                          child: const SizedBox.expand(),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: BlueVectorSpacing.md),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _points.isEmpty || _saving
                          ? null
                          : () => setState(_points.clear),
                      child: const Text('Effacer'),
                    ),
                  ),
                  const SizedBox(width: BlueVectorSpacing.sm),
                  Expanded(
                    child: FilledButton(
                      onPressed: _hasSignature && !_saving ? _save : null,
                      child: _saving
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Valider'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SignaturePainter extends CustomPainter {
  const _SignaturePainter(this.points);

  final List<Offset?> points;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF07111B)
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..strokeWidth = 2.6;

    for (var index = 0; index < points.length - 1; index++) {
      final start = points[index];
      final end = points[index + 1];

      if (start != null && end != null) {
        canvas.drawLine(start, end, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _SignaturePainter oldDelegate) => true;
}
