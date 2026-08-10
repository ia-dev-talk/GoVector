import 'package:flutter/material.dart';

abstract final class BlueVectorColors {
  static const background = Color(0xFF06111C);
  static const backgroundDeep = Color(0xFF030A12);
  static const surface = Color(0xFF0B1925);
  static const surfaceRaised = Color(0xFF102230);
  static const surfaceSoft = Color(0xFF132938);
  static const border = Color(0xFF203848);
  static const borderStrong = Color(0xFF315064);

  static const primary = Color(0xFF1267F4);
  static const primaryBright = Color(0xFF2D7BFF);
  static const primarySoft = Color(0xFF102E5E);

  static const cyan = Color(0xFF43B8FF);
  static const success = Color(0xFF27D17F);
  static const warning = Color(0xFFFFA51F);
  static const danger = Color(0xFFFF4D67);
  static const violet = Color(0xFF9A68FF);

  static const textPrimary = Color(0xFFF4F8FC);
  static const textSecondary = Color(0xFFA7B9C8);
  static const textMuted = Color(0xFF6E8495);
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
