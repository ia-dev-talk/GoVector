import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:path/path.dart' as path_util;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../../design_system/bluevector_tokens.dart';

class MobileImageAnnotationScreen extends StatefulWidget {
  const MobileImageAnnotationScreen({
    super.key,
    required this.sourcePath,
    this.title = 'Annoter la pièce',
  });

  final String sourcePath;
  final String title;

  @override
  State<MobileImageAnnotationScreen> createState() =>
      _MobileImageAnnotationScreenState();
}

class _MobileImageAnnotationScreenState
    extends State<MobileImageAnnotationScreen> {
  static const _colors = <Color>[
    Color(0xFFFF4D6D),
    Color(0xFFFFD166),
    Color(0xFF34D399),
    Color(0xFF4B8DFF),
    Colors.white,
  ];

  final List<_NormalizedStroke> _strokes = [];
  Color _color = _colors.first;
  double _width = 0.012;
  double? _aspectRatio;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _loadRatio();
  }

  Future<void> _loadRatio() async {
    final bytes = await File(widget.sourcePath).readAsBytes();
    final codec = await ui.instantiateImageCodec(bytes);
    final frame = await codec.getNextFrame();
    try {
      if (!mounted) return;
      setState(() => _aspectRatio = frame.image.width / frame.image.height);
    } finally {
      frame.image.dispose();
      codec.dispose();
    }
  }

  void _start(DragStartDetails details, Size size) {
    setState(() {
      _strokes.add(
        _NormalizedStroke(
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
      final sourceBytes = await File(widget.sourcePath).readAsBytes();
      final codec = await ui.instantiateImageCodec(sourceBytes);
      final frame = await codec.getNextFrame();
      final image = frame.image;
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);
      final target = Size(image.width.toDouble(), image.height.toDouble());
      canvas.drawImage(image, Offset.zero, Paint());
      _paintStrokes(canvas, target, _strokes);
      final rendered = await recorder.endRecording().toImage(
        image.width,
        image.height,
      );
      final data = await rendered.toByteData(format: ui.ImageByteFormat.png);
      if (data == null) throw StateError('Annotation non exportable');
      final directory = await getTemporaryDirectory();
      final output = File(
        path_util.join(directory.path, 'bluevector-annotation-${const Uuid().v4()}.png'),
      );
      await output.writeAsBytes(data.buffer.asUint8List(), flush: true);
      rendered.dispose();
      image.dispose();
      codec.dispose();
      if (mounted) Navigator.pop(context, output.path);
    } catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Annotation impossible : $error')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final ratio = _aspectRatio;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
            tooltip: 'Annuler le dernier trait',
            onPressed: _strokes.isEmpty
                ? null
                : () => setState(() => _strokes.removeLast()),
            icon: const Icon(Icons.undo_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Center(
                child: ratio == null
                    ? const CircularProgressIndicator()
                    : Padding(
                        padding: const EdgeInsets.all(BlueVectorSpacing.sm),
                        child: AspectRatio(
                          aspectRatio: ratio,
                          child: LayoutBuilder(
                            builder: (context, constraints) {
                              final size = Size(
                                constraints.maxWidth,
                                constraints.maxHeight,
                              );
                              return GestureDetector(
                                onPanStart: (details) => _start(details, size),
                                onPanUpdate: (details) => _update(details, size),
                                child: Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    Image.file(
                                      File(widget.sourcePath),
                                      fit: BoxFit.fill,
                                    ),
                                    CustomPaint(
                                      painter: _AnnotationPainter(_strokes),
                                    ),
                                  ],
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
                          min: 0.004,
                          max: 0.03,
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
                      icon: const Icon(Icons.send_outlined),
                      label: Text(
                        _saving ? 'Préparation…' : 'Partager l’annotation',
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'La pièce originale reste disponible.',
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

class _NormalizedStroke {
  _NormalizedStroke({
    required this.color,
    required this.width,
    required this.points,
  });

  final Color color;
  final double width;
  final List<Offset> points;
}

void _paintStrokes(
  Canvas canvas,
  Size size,
  List<_NormalizedStroke> strokes,
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

class _AnnotationPainter extends CustomPainter {
  const _AnnotationPainter(this.strokes);

  final List<_NormalizedStroke> strokes;

  @override
  void paint(Canvas canvas, Size size) => _paintStrokes(canvas, size, strokes);

  @override
  bool shouldRepaint(covariant _AnnotationPainter oldDelegate) => true;
}
