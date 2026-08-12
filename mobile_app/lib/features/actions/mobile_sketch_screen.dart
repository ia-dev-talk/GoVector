import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:path/path.dart' as path_util;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../../design_system/bluevector_tokens.dart';

class MobileSketchScreen extends StatefulWidget {
  const MobileSketchScreen({
    super.key,
    this.title = 'Croquis terrain',
  });

  final String title;

  @override
  State<MobileSketchScreen> createState() => _MobileSketchScreenState();
}

class _MobileSketchScreenState extends State<MobileSketchScreen> {
  static const _colors = <Color>[
    Color(0xFF172033),
    Color(0xFFFF4D6D),
    Color(0xFFFFB84B),
    Color(0xFF34D399),
    Color(0xFF4B8DFF),
  ];

  final List<_SketchStroke> _strokes = [];
  Color _color = _colors.first;
  double _width = 0.008;
  bool _saving = false;
  bool _gridEnabled = true;

  void _start(DragStartDetails details, Size size) {
    if (_saving) return;
    setState(() {
      _strokes.add(
        _SketchStroke(
          color: _color,
          width: _width,
          points: [_normalize(details.localPosition, size)],
        ),
      );
    });
  }

  void _update(DragUpdateDetails details, Size size) {
    if (_saving || _strokes.isEmpty) return;
    setState(() {
      _strokes.last.points.add(_normalize(details.localPosition, size));
    });
  }

  Offset _normalize(Offset point, Size size) => Offset(
    (point.dx / size.width).clamp(0.0, 1.0).toDouble(),
    (point.dy / size.height).clamp(0.0, 1.0).toDouble(),
  );

  Future<void> _confirmClear() async {
    if (_strokes.isEmpty || _saving) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Effacer le croquis ?'),
        content: const Text(
          'Tous les traits de ce croquis seront supprimés. Cette action ne touche pas aux autres preuves de l’intervention.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Conserver'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Effacer'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      setState(_strokes.clear);
    }
  }

  Future<void> _save() async {
    if (_saving || _strokes.isEmpty) return;
    setState(() => _saving = true);

    try {
      const width = 1600;
      const height = 1000;
      final size = Size(width.toDouble(), height.toDouble());
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);

      canvas.drawRect(
        Offset.zero & size,
        Paint()..color = const Color(0xFFF8FAFD),
      );
      if (_gridEnabled) {
        _paintGrid(canvas, size);
      }
      _paintStrokes(canvas, size, _strokes);

      final rendered = await recorder.endRecording().toImage(width, height);
      final data = await rendered.toByteData(format: ui.ImageByteFormat.png);
      if (data == null) throw StateError('Croquis non exportable');

      final directory = await getTemporaryDirectory();
      final output = File(
        path_util.join(
          directory.path,
          'bluevector-sketch-${const Uuid().v4()}.png',
        ),
      );
      await output.writeAsBytes(data.buffer.asUint8List(), flush: true);
      rendered.dispose();

      if (mounted) Navigator.pop(context, output.path);
    } catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Croquis impossible : $error')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final strokeCount = _strokes.length;
    final widthLabel = (_width * 1000).round();

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
            tooltip: _gridEnabled ? 'Masquer la grille' : 'Afficher la grille',
            onPressed: _saving
                ? null
                : () => setState(() => _gridEnabled = !_gridEnabled),
            icon: Icon(
              _gridEnabled ? Icons.grid_on_rounded : Icons.grid_off_rounded,
            ),
          ),
          IconButton(
            tooltip: 'Annuler le dernier trait',
            onPressed: strokeCount == 0 || _saving
                ? null
                : () => setState(() => _strokes.removeLast()),
            icon: const Icon(Icons.undo_rounded),
          ),
          IconButton(
            tooltip: 'Effacer le croquis',
            onPressed: strokeCount == 0 || _saving ? null : _confirmClear,
            icon: const Icon(Icons.delete_outline_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                BlueVectorSpacing.md,
                BlueVectorSpacing.sm,
                BlueVectorSpacing.md,
                0,
              ),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(BlueVectorSpacing.sm),
                decoration: BoxDecoration(
                  color: BlueVectorColors.surface,
                  border: Border.all(color: BlueVectorColors.border),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.draw_outlined,
                      size: 20,
                      color: BlueVectorColors.primaryBright,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Preuve graphique terrain',
                            style: Theme.of(context).textTheme.labelLarge,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Dessinez le cheminement, un boîtier, un passage câble ou une observation utile.',
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: BlueVectorColors.textMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                      decoration: BoxDecoration(
                        color: BlueVectorColors.primary.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        '$strokeCount trait${strokeCount > 1 ? 's' : ''}',
                        style: const TextStyle(
                          color: BlueVectorColors.primaryBright,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(BlueVectorSpacing.md),
                  child: AspectRatio(
                    aspectRatio: 1.6,
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final size = Size(
                          constraints.maxWidth,
                          constraints.maxHeight,
                        );
                        return ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              border: Border.all(color: BlueVectorColors.border),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onPanStart: (details) => _start(details, size),
                              onPanUpdate: (details) => _update(details, size),
                              child: CustomPaint(
                                painter: _SketchPainter(
                                  strokes: _strokes,
                                  gridEnabled: _gridEnabled,
                                ),
                                child: const SizedBox.expand(),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.all(BlueVectorSpacing.md),
              decoration: const BoxDecoration(
                color: BlueVectorColors.surface,
                border: Border(top: BorderSide(color: BlueVectorColors.border)),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final color in _colors)
                              Semantics(
                                label: 'Couleur de trait',
                                selected: _color == color,
                                button: true,
                                child: InkWell(
                                  onTap: _saving
                                      ? null
                                      : () => setState(() => _color = color),
                                  borderRadius: BorderRadius.circular(20),
                                  child: Container(
                                    width: 32,
                                    height: 32,
                                    decoration: BoxDecoration(
                                      color: color,
                                      shape: BoxShape.circle,
                                      border: Border.all(
                                        color: _color == color
                                            ? BlueVectorColors.primaryBright
                                            : BlueVectorColors.border,
                                        width: _color == color ? 3 : 1,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 10),
                      SizedBox(
                        width: 170,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Épaisseur · $widthLabel',
                              style: const TextStyle(
                                color: BlueVectorColors.textMuted,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Slider(
                              min: 0.003,
                              max: 0.025,
                              value: _width,
                              onChanged: _saving
                                  ? null
                                  : (value) => setState(() => _width = value),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: BlueVectorSpacing.sm),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: strokeCount == 0 || _saving ? null : _save,
                      icon: _saving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.save_outlined),
                      label: Text(
                        _saving ? 'Préparation du fichier…' : 'Enregistrer le croquis',
                      ),
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    _gridEnabled
                        ? 'Grille activée · le croquis sera synchronisé comme preuve graphique de l’intervention.'
                        : 'Canevas libre · le croquis sera synchronisé comme preuve graphique de l’intervention.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: BlueVectorColors.textMuted,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SketchStroke {
  _SketchStroke({
    required this.color,
    required this.width,
    required this.points,
  });

  final Color color;
  final double width;
  final List<Offset> points;
}

void _paintGrid(Canvas canvas, Size size) {
  final paint = Paint()
    ..color = const Color(0xFFDDE5F0)
    ..strokeWidth = 1;
  const divisionsX = 16;
  const divisionsY = 10;

  for (var index = 1; index < divisionsX; index += 1) {
    final x = size.width * index / divisionsX;
    canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
  }
  for (var index = 1; index < divisionsY; index += 1) {
    final y = size.height * index / divisionsY;
    canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
  }
}

void _paintStrokes(
  Canvas canvas,
  Size size,
  List<_SketchStroke> strokes,
) {
  for (final stroke in strokes) {
    if (stroke.points.isEmpty) continue;
    final paint = Paint()
      ..color = stroke.color
      ..strokeWidth = stroke.width * size.shortestSide
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    final path = Path();
    final first = stroke.points.first;
    path.moveTo(first.dx * size.width, first.dy * size.height);
    if (stroke.points.length == 1) {
      path.lineTo(
        first.dx * size.width + 0.01,
        first.dy * size.height + 0.01,
      );
    } else {
      for (final point in stroke.points.skip(1)) {
        path.lineTo(point.dx * size.width, point.dy * size.height);
      }
    }
    canvas.drawPath(path, paint);
  }
}

class _SketchPainter extends CustomPainter {
  const _SketchPainter({
    required this.strokes,
    required this.gridEnabled,
  });

  final List<_SketchStroke> strokes;
  final bool gridEnabled;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = const Color(0xFFF8FAFD),
    );
    if (gridEnabled) _paintGrid(canvas, size);
    _paintStrokes(canvas, size, strokes);
  }

  @override
  bool shouldRepaint(covariant _SketchPainter oldDelegate) => true;
}
