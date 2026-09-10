import 'package:flutter/material.dart';

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
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          label: 'GoVector',
          image: true,
          child: Image.asset(
            'assets/images/govector-logo.png',
            width: compact ? 120 : 210,
            fit: BoxFit.contain,
            filterQuality: FilterQuality.high,
          ),
        ),
        if (showSubtitle)
          Padding(
            padding: EdgeInsets.only(
              top: compact ? 2 : 4,
              left: compact ? 2 : 4,
            ),
            child: Text(
              'Application terrain',
              style: TextStyle(
                color: const Color(0xFF536B84),
                fontSize: compact ? 9 : 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
      ],
    );
  }
}
