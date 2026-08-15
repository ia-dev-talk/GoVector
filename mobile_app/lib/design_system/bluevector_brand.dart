import 'package:flutter/material.dart';

import 'bluevector_tokens.dart';

class BlueVectorBrand extends StatelessWidget {
  const BlueVectorBrand({
    super.key,
    this.compact = false,
    this.showSubtitle = true,
  });

  final bool compact;
  final bool showSubtitle;

  @override
  Widget build(BuildContext context) {
    final markSize = compact ? 36.0 : 64.0;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: markSize,
          height: markSize,
          child: const CustomPaint(painter: _BlueVectorMarkPainter()),
        ),
        SizedBox(width: compact ? 8 : 14),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'BlueVector',
              style: TextStyle(
                color: BlueVectorColors.textPrimary,
                fontSize: compact ? 18 : 27,
                fontWeight: FontWeight.w800,
                letterSpacing: compact ? -0.5 : -0.8,
              ),
            ),
            if (showSubtitle)
              Text(
                'Technicien FTTH',
                style: TextStyle(
                  color: BlueVectorColors.textSecondary,
                  fontSize: compact ? 9 : 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _BlueVectorMarkPainter extends CustomPainter {
  const _BlueVectorMarkPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = BlueVectorColors.primaryBright
      ..style = PaintingStyle.fill;

    final secondaryPaint = Paint()
      ..color = BlueVectorColors.cyan
      ..style = PaintingStyle.fill;

    final width = size.width;
    final height = size.height;

    final left = Path()
      ..moveTo(width * 0.12, height * 0.42)
      ..lineTo(width * 0.31, height * 0.27)
      ..lineTo(width * 0.5, height * 0.47)
      ..lineTo(width * 0.31, height * 0.68)
      ..close();

    final right = Path()
      ..moveTo(width * 0.88, height * 0.42)
      ..lineTo(width * 0.69, height * 0.27)
      ..lineTo(width * 0.5, height * 0.47)
      ..lineTo(width * 0.69, height * 0.68)
      ..close();

    final stem = Path()
      ..moveTo(width * 0.41, height * 0.48)
      ..lineTo(width * 0.59, height * 0.48)
      ..lineTo(width * 0.59, height * 0.83)
      ..lineTo(width * 0.5, height * 0.92)
      ..lineTo(width * 0.41, height * 0.83)
      ..close();

    canvas.drawPath(left, paint);
    canvas.drawPath(right, secondaryPaint);
    canvas.drawPath(stem, paint);

    canvas.drawCircle(
      Offset(width * 0.5, height * 0.2),
      width * 0.1,
      secondaryPaint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
