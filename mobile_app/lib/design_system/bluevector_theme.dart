import 'package:flutter/material.dart';

import 'bluevector_tokens.dart';

abstract final class BlueVectorTheme {
  static ThemeData get dark {
    const scheme = ColorScheme.dark(
      primary: BlueVectorColors.primaryBright,
      onPrimary: Colors.white,
      secondary: BlueVectorColors.cyan,
      onSecondary: BlueVectorColors.backgroundDeep,
      error: BlueVectorColors.danger,
      onError: Colors.white,
      surface: BlueVectorColors.surface,
      onSurface: BlueVectorColors.textPrimary,
      outline: BlueVectorColors.border,
      outlineVariant: BlueVectorColors.borderStrong,
    );

    final baseText = Typography.material2021(
      platform: TargetPlatform.android,
    ).white;

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: BlueVectorColors.background,
      canvasColor: BlueVectorColors.surface,
      cardColor: BlueVectorColors.surface,
      splashFactory: InkSparkle.splashFactory,
      visualDensity: VisualDensity.standard,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      textTheme: baseText.copyWith(
        displaySmall: baseText.displaySmall?.copyWith(
          color: BlueVectorColors.textPrimary,
          fontWeight: FontWeight.w800,
          letterSpacing: -1.0,
        ),
        headlineMedium: baseText.headlineMedium?.copyWith(
          color: BlueVectorColors.textPrimary,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.6,
        ),
        titleLarge: baseText.titleLarge?.copyWith(
          color: BlueVectorColors.textPrimary,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
        ),
        titleMedium: baseText.titleMedium?.copyWith(
          color: BlueVectorColors.textPrimary,
          fontWeight: FontWeight.w700,
        ),
        bodyLarge: baseText.bodyLarge?.copyWith(
          color: BlueVectorColors.textPrimary,
          height: 1.35,
        ),
        bodyMedium: baseText.bodyMedium?.copyWith(
          color: BlueVectorColors.textSecondary,
          height: 1.35,
        ),
        bodySmall: baseText.bodySmall?.copyWith(
          color: BlueVectorColors.textMuted,
          height: 1.3,
        ),
        labelLarge: baseText.labelLarge?.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w700,
        ),
        labelMedium: baseText.labelMedium?.copyWith(
          color: BlueVectorColors.textSecondary,
          fontWeight: FontWeight.w600,
        ),
      ),
      appBarTheme: const AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: BlueVectorColors.background,
        foregroundColor: BlueVectorColors.textPrimary,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: BlueVectorColors.textPrimary,
          fontSize: 20,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.5,
        ),
        iconTheme: IconThemeData(color: BlueVectorColors.textPrimary),
      ),
      cardTheme: CardThemeData(
        color: BlueVectorColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
          side: const BorderSide(color: BlueVectorColors.border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: BlueVectorColors.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 15,
          vertical: 15,
        ),
        labelStyle: const TextStyle(color: BlueVectorColors.textSecondary),
        hintStyle: const TextStyle(color: BlueVectorColors.textMuted),
        prefixIconColor: BlueVectorColors.textMuted,
        suffixIconColor: BlueVectorColors.textMuted,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(BlueVectorRadius.small),
          borderSide: const BorderSide(color: BlueVectorColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(BlueVectorRadius.small),
          borderSide: const BorderSide(color: BlueVectorColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(BlueVectorRadius.small),
          borderSide: const BorderSide(
            color: BlueVectorColors.primaryBright,
            width: 1.5,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(BlueVectorRadius.small),
          borderSide: const BorderSide(color: BlueVectorColors.danger),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          backgroundColor: BlueVectorColors.primary,
          foregroundColor: Colors.white,
          disabledBackgroundColor: BlueVectorColors.primarySoft,
          disabledForegroundColor: BlueVectorColors.textMuted,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(BlueVectorRadius.small),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          foregroundColor: BlueVectorColors.textPrimary,
          side: const BorderSide(color: BlueVectorColors.borderStrong),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(BlueVectorRadius.small),
          ),
        ),
      ),
      navigationBarTheme: const NavigationBarThemeData(
        backgroundColor: BlueVectorColors.backgroundDeep,
        indicatorColor: BlueVectorColors.primarySoft,
        surfaceTintColor: Colors.transparent,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: BlueVectorColors.surface,
        modalBackgroundColor: BlueVectorColors.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: BlueVectorColors.borderStrong,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(BlueVectorRadius.large),
          ),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: BlueVectorColors.border,
        thickness: 1,
        space: 1,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: BlueVectorColors.surfaceRaised,
        contentTextStyle: const TextStyle(color: BlueVectorColors.textPrimary),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BlueVectorRadius.small),
        ),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: BlueVectorColors.primaryBright,
        linearTrackColor: BlueVectorColors.surfaceSoft,
      ),
    );
  }
}
