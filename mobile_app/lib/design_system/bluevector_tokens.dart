import 'package:flutter/material.dart';

abstract final class BlueVectorColors {
  static const background = Color(0xFFF4F8FD);
  static const backgroundDeep = Color(0xFF071C34);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceRaised = Color(0xFFFFFFFF);
  static const surfaceSoft = Color(0xFFEEF5FC);
  static const border = Color(0xFFD9E4F0);
  static const borderStrong = Color(0xFFB7C8DB);

  static const primary = Color(0xFF0868E8);
  static const primaryBright = Color(0xFF0B78FF);
  static const primarySoft = Color(0xFFDDEEFF);

  static const cyan = Color(0xFF159FE5);
  static const success = Color(0xFF0BAA68);
  static const warning = Color(0xFFF59A18);
  static const danger = Color(0xFFE23D52);
  static const violet = Color(0xFF7657D8);

  static const textPrimary = Color(0xFF0A1F3C);
  static const textSecondary = Color(0xFF536B84);
  static const textMuted = Color(0xFF7D91A5);
}

abstract final class BlueVectorSpacing {
  static const xxs = 4.0;
  static const xs = 8.0;
  static const sm = 12.0;
  static const md = 16.0;
  static const lg = 20.0;
  static const xl = 24.0;
  static const xxl = 32.0;
}

abstract final class BlueVectorRadius {
  static const small = 10.0;
  static const medium = 14.0;
  static const large = 20.0;
  static const pill = 999.0;
}
