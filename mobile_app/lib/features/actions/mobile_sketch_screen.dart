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
    if (_strokes.isEmpty) return;
    setState(() {
      _strokes.last.points.add(_normalize(details.localPosition, size));
    });
  }

  Offset _normalize(Offset point, Size size) => Offset(
    (point.dx / size.width).clamp(0.0, 1.0).toDouble(),
    (point.dy / size.height).clamp(0.0, 1.0).toDouble(),
  );

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
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
            tooltip: _gridEnabled ? 'Masquer la grille' : 'Afficher la grille',
            onPressed: () => setState(() => _gridEnabled = !_gridEnabled),
            icon: Icon(
              _gridEnabled ? Icons.grid_on_rounded : Icons.grid_off_rounded,
            ),
          ),
          IconButton(
            tooltip: 'Annuler le dernier trait',
            onPressed: _strokes.isEmpty
                ? null
                : () => setState(() => _strokes.removeLast()),
            icon: const Icon(Icons.undo_rounded),
          ),
          IconButton(
            tooltip: 'Effacer le croquis',
            onPressed: _strokes.isEmpty
                ? null
                : () => setState(_strokes.clear),
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
              child: Row(
                children: [
                  const Icon(
                    Icons.draw_outlined,
                    size: 18,
                    color: BlueVectorColors.primaryBright,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Dessinez le cheminement, un boîtier, un passage câble ou toute observation utile.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: BlueVectorColors.textMuted,
                      ),
                    ),
                  ),
                ],
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
                          child: GestureDetector(
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
                      for (final color in _colors)
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: InkWell(
                            onTap: () => setState(() => _color = color),
                            borderRadius: BorderRadius.circular(20),
                            child: Container(
                              width: 30,
                              height: 30,
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
                      const SizedBox(width: 6),
                      Expanded(
                        child: Slider(
                          min: 0.003,
                          max: 0.025,
                          value: _width,
                          onChanged: (value) => setState(() => _width = value),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: BlueVectorSpacing.sm),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _strokes.isEmpty || _saving ? null : _save,
                      icon: const Icon(Icons.save_outlined),
                      label: Text(
                        _saving ? 'Préparation…' : 'Enregistrer le croquis',
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Le croquis sera synchronisé comme une preuve graphique de l’intervention.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
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
