import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app/bluevector_app_v2.dart';
import 'app/mobile_bootstrap.dart';
import 'screens/login_screen.dart';

Future<void> main() async {
  await initializeBlueVectorMobile();
  await SystemChrome.setPreferredOrientations(const [
    DeviceOrientation.portraitUp,
  ]);

  // Fixe l'orientation et harmonise la barre d'état système
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
    ),
  );

  runApp(const BlueVectorMobileApp());
}

// =============================================================================
// APP INITIALIZATION & ROOT WIDGET
// =============================================================================

class BlueVectorApp extends StatelessWidget {
  const BlueVectorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'GoVector',
      theme: _AppThemeEngine.buildTheme(Brightness.light),
      darkTheme: _AppThemeEngine.buildTheme(Brightness.dark),
      themeMode: ThemeMode.light,
      themeAnimationDuration: const Duration(milliseconds: 250),
      themeAnimationCurve: Curves.easeInOutCubic,

      builder: (context, child) {
        return MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(1.0)),
          child: child ?? const SizedBox.shrink(),
        );
      },
      home: const LoginScreen(),
    );
  }
}

// =============================================================================
// THEME ENGINE (DESIGN SYSTEM CENTRAL)
// =============================================================================

abstract class _AppThemeEngine {
  static ThemeData buildTheme(Brightness brightness) {
    final isDark = brightness == Brightness.dark;

    // Palette dynamique
    final surfaceColor = isDark
        ? const Color(0xFF161922)
        : AppColors.surfaceLight;
    final backgroundColor = isDark
        ? const Color(0xFF0D1117)
        : AppColors.surfaceLight;
    final cardColor = isDark ? const Color(0xFF1E2330) : Colors.white;
    final textPrimary = isDark ? Colors.white : AppColors.textPrimary;
    final textSecondary = isDark
        ? const Color(0xFF9CA3AF)
        : AppColors.textSecondary;
    final borderDividerColor = isDark
        ? Colors.white.withValues(alpha: 0.1)
        : Colors.grey.withValues(alpha: 0.15);

    // ColorScheme Material 3
    final colorScheme = ColorScheme(
      brightness: brightness,
      primary: AppColors.primary,
      onPrimary: Colors.white,
      primaryContainer: AppColors.primaryLight.withValues(alpha: 0.15),
      onPrimaryContainer: AppColors.primaryDark,
      secondary: AppColors.accent,
      onSecondary: Colors.white,
      secondaryContainer: AppColors.accentLight.withValues(alpha: 0.15),
      onSecondaryContainer: AppColors.accent,
      tertiary: AppColors.primaryLight,
      onTertiary: Colors.white,
      error: AppColors.error,
      onError: Colors.white,
      surface: surfaceColor,
      onSurface: textPrimary,
      onSurfaceVariant: textSecondary,
      outline: AppColors.borderLight,
      outlineVariant: borderDividerColor,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: backgroundColor,
      canvasColor: cardColor,
      cardColor: cardColor,

      // Sensibilité & Feedback
      visualDensity: VisualDensity.adaptivePlatformDensity,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      splashFactory: InkSparkle.splashFactory,
      splashColor: AppColors.primary.withValues(alpha: 0.05),
      highlightColor: Colors.transparent,

      // Transitions & Animations
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: ZoomPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),

      // Typographie
      typography: Typography.material2021(platform: TargetPlatform.android),
      textTheme: _buildTextTheme(textPrimary, textSecondary),

      // Thèmes des composants
      appBarTheme: _buildAppBarTheme(isDark, cardColor, textPrimary),
      cardTheme: _buildCardTheme(cardColor, borderDividerColor),
      inputDecorationTheme: _buildInputDecorationTheme(isDark, textSecondary),
      elevatedButtonTheme: _buildElevatedButtonTheme(),
      filledButtonTheme: _buildFilledButtonTheme(),
      outlinedButtonTheme: _buildOutlinedButtonTheme(),
      textButtonTheme: _buildTextButtonTheme(),
      segmentedButtonTheme: _buildSegmentedButtonTheme(),
      floatingActionButtonTheme: _buildFabTheme(),
      iconButtonTheme: _buildIconButtonTheme(),
      bottomNavigationBarTheme: _buildBottomNavigationBarTheme(
        isDark,
        cardColor,
      ),
      navigationBarTheme: _buildNavigationBarTheme(isDark, cardColor),
      navigationRailTheme: _buildNavigationRailTheme(isDark, cardColor),
      tabBarTheme: _buildTabBarTheme(textPrimary, textSecondary),
      dialogTheme: _buildDialogTheme(cardColor),
      bottomSheetTheme: _buildBottomSheetTheme(cardColor),
      menuTheme: _buildMenuTheme(cardColor),
      popupMenuTheme: _buildPopupMenuTheme(cardColor),
      chipTheme: _buildChipTheme(isDark, textPrimary),
      listTileTheme: _buildListTileTheme(isDark, textPrimary),
      dividerTheme: _buildDividerTheme(borderDividerColor),
      checkboxTheme: _buildCheckboxTheme(),
      radioTheme: _buildRadioTheme(),
      switchTheme: _buildSwitchTheme(isDark),
      sliderTheme: _buildSliderTheme(),
      tooltipTheme: _buildTooltipTheme(),
      snackBarTheme: _buildSnackBarTheme(),
      progressIndicatorTheme: _buildProgressIndicatorTheme(),
      badgeTheme: _buildBadgeTheme(),
      expansionTileTheme: _buildExpansionTileTheme(textPrimary),
      iconTheme: const IconThemeData(color: AppColors.primary, size: 24),
      textSelectionTheme: TextSelectionThemeData(
        cursorColor: AppColors.primaryLight,
        selectionColor: AppColors.primaryLight.withValues(alpha: 0.25),
        selectionHandleColor: AppColors.primaryLight,
      ),
      scrollbarTheme: ScrollbarThemeData(
        thumbVisibility: WidgetStateProperty.all(false),
        thickness: WidgetStateProperty.all(6),
        radius: const Radius.circular(8),
        thumbColor: WidgetStateProperty.all(
          AppColors.textSecondary.withValues(alpha: 0.3),
        ),
      ),
    );
  }

  // ===========================================================================
  // SUB-THEMES BUILDERS
  // ===========================================================================

  static TextTheme _buildTextTheme(Color textPrimary, Color textSecondary) {
    return TextTheme(
      displayLarge: TextStyle(
        color: textPrimary,
        fontSize: 32,
        fontWeight: FontWeight.w800,
        letterSpacing: -1.0,
      ),
      displayMedium: TextStyle(
        color: textPrimary,
        fontSize: 28,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.8,
      ),
      displaySmall: TextStyle(
        color: textPrimary,
        fontSize: 24,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.5,
      ),
      headlineMedium: TextStyle(
        color: textPrimary,
        fontSize: 20,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.4,
      ),
      headlineSmall: TextStyle(
        color: textPrimary,
        fontSize: 18,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.3,
      ),
      titleLarge: TextStyle(
        color: textPrimary,
        fontSize: 16,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.2,
      ),
      titleMedium: TextStyle(
        color: textPrimary,
        fontSize: 14,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.1,
      ),
      titleSmall: TextStyle(
        color: textSecondary,
        fontSize: 13,
        fontWeight: FontWeight.w500,
      ),
      bodyLarge: TextStyle(
        color: textPrimary,
        fontSize: 15,
        fontWeight: FontWeight.w400,
        height: 1.4,
      ),
      bodyMedium: TextStyle(
        color: textPrimary,
        fontSize: 14,
        fontWeight: FontWeight.w400,
        height: 1.35,
      ),
      bodySmall: TextStyle(
        color: textSecondary,
        fontSize: 12,
        fontWeight: FontWeight.w400,
        height: 1.3,
      ),
      labelLarge: const TextStyle(
        color: Colors.white,
        fontSize: 14,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.1,
      ),
      labelMedium: TextStyle(
        color: textSecondary,
        fontSize: 12,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.2,
      ),
      labelSmall: TextStyle(
        color: textSecondary,
        fontSize: 10,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.3,
      ),
    );
  }

  static AppBarTheme _buildAppBarTheme(
    bool isDark,
    Color cardColor,
    Color textPrimary,
  ) {
    return AppBarTheme(
      centerTitle: true,
      elevation: 0,
      scrolledUnderElevation: 1,
      backgroundColor: cardColor,
      foregroundColor: textPrimary,
      surfaceTintColor: Colors.transparent,
      iconTheme: IconThemeData(color: textPrimary, size: 22),
      actionsIconTheme: IconThemeData(color: textPrimary, size: 22),
      titleTextStyle: TextStyle(
        color: textPrimary,
        fontSize: 17,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.4,
      ),
    );
  }

  static CardThemeData _buildCardTheme(
    Color cardColor,
    Color borderDividerColor,
  ) {
    return CardThemeData(
      elevation: 0,
      color: cardColor,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: borderDividerColor, width: 1),
      ),
      clipBehavior: Clip.antiAlias,
      margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
    );
  }

  static InputDecorationTheme _buildInputDecorationTheme(
    bool isDark,
    Color textSecondary,
  ) {
    final fillColor = isDark ? const Color(0xFF1E2330) : Colors.grey.shade50;

    return InputDecorationTheme(
      filled: true,
      fillColor: fillColor,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      labelStyle: TextStyle(
        color: textSecondary,
        fontSize: 14,
        fontWeight: FontWeight.w400,
      ),
      floatingLabelStyle: const TextStyle(
        color: AppColors.primaryLight,
        fontSize: 14,
        fontWeight: FontWeight.w600,
      ),
      hintStyle: TextStyle(
        color: textSecondary.withValues(alpha: 0.7),
        fontSize: 14,
        fontWeight: FontWeight.w400,
      ),
      helperStyle: TextStyle(color: textSecondary, fontSize: 12),
      errorStyle: const TextStyle(
        color: AppColors.error,
        fontSize: 12,
        fontWeight: FontWeight.w500,
      ),
      prefixIconColor: AppColors.primary,
      suffixIconColor: textSecondary,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
          color: isDark
              ? Colors.white.withValues(alpha: 0.1)
              : Colors.grey.shade200,
        ),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.primaryLight, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.error, width: 1.5),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.error, width: 2),
      ),
    );
  }

  static ElevatedButtonThemeData _buildElevatedButtonTheme() {
    return ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        elevation: 0,
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        disabledBackgroundColor: AppColors.primary.withValues(alpha: 0.38),
        disabledForegroundColor: Colors.white.withValues(alpha: 0.6),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        minimumSize: const Size(88, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.2,
        ),
      ),
    );
  }

  static FilledButtonThemeData _buildFilledButtonTheme() {
    return FilledButtonThemeData(
      style: FilledButton.styleFrom(
        elevation: 0,
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        disabledBackgroundColor: Colors.grey.shade300,
        disabledForegroundColor: Colors.grey.shade500,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        minimumSize: const Size(88, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.2,
        ),
      ),
    );
  }

  static OutlinedButtonThemeData _buildOutlinedButtonTheme() {
    return OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.primary,
        disabledForegroundColor: AppColors.textSecondary.withValues(alpha: 0.4),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        minimumSize: const Size(88, 48),
        side: BorderSide(
          color: AppColors.primary.withValues(alpha: 0.3),
          width: 1.5,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.2,
        ),
      ),
    );
  }

  static TextButtonThemeData _buildTextButtonTheme() {
    return TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.primary,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.1,
        ),
      ),
    );
  }

  static SegmentedButtonThemeData _buildSegmentedButtonTheme() {
    return SegmentedButtonThemeData(
      style: ButtonStyle(
        shape: WidgetStateProperty.all(
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        backgroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return AppColors.primary;
          }
          return Colors.transparent;
        }),
        foregroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return Colors.white;
          }
          return AppColors.textPrimary;
        }),
      ),
    );
  }

  static FloatingActionButtonThemeData _buildFabTheme() {
    return FloatingActionButtonThemeData(
      backgroundColor: AppColors.accent,
      foregroundColor: Colors.white,
      elevation: 4,
      focusElevation: 6,
      hoverElevation: 6,
      highlightElevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      iconSize: 24,
    );
  }

  static IconButtonThemeData _buildIconButtonTheme() {
    return IconButtonThemeData(
      style: IconButton.styleFrom(
        foregroundColor: AppColors.primary,
        padding: const EdgeInsets.all(8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  static BottomNavigationBarThemeData _buildBottomNavigationBarTheme(
    bool isDark,
    Color cardColor,
  ) {
    return BottomNavigationBarThemeData(
      elevation: 0,
      backgroundColor: cardColor,
      selectedItemColor: AppColors.primary,
      unselectedItemColor: AppColors.textSecondary,
      selectedIconTheme: const IconThemeData(
        size: 24,
        color: AppColors.primary,
      ),
      unselectedIconTheme: const IconThemeData(
        size: 22,
        color: AppColors.textSecondary,
      ),
      selectedLabelStyle: const TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w600,
      ),
      unselectedLabelStyle: const TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w500,
      ),
      type: BottomNavigationBarType.fixed,
    );
  }

  static NavigationBarThemeData _buildNavigationBarTheme(
    bool isDark,
    Color cardColor,
  ) {
    return NavigationBarThemeData(
      elevation: 0,
      backgroundColor: cardColor,
      indicatorColor: AppColors.primaryLight.withValues(alpha: 0.15),
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      iconTheme: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const IconThemeData(color: AppColors.primary, size: 24);
        }
        return const IconThemeData(color: AppColors.textSecondary, size: 22);
      }),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: AppColors.primary,
          );
        }
        return const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: AppColors.textSecondary,
        );
      }),
    );
  }

  static NavigationRailThemeData _buildNavigationRailTheme(
    bool isDark,
    Color cardColor,
  ) {
    return NavigationRailThemeData(
      backgroundColor: cardColor,
      selectedIconTheme: const IconThemeData(
        color: AppColors.primary,
        size: 24,
      ),
      unselectedIconTheme: const IconThemeData(
        color: AppColors.textSecondary,
        size: 22,
      ),
      selectedLabelTextStyle: const TextStyle(
        color: AppColors.primary,
        fontSize: 13,
        fontWeight: FontWeight.w700,
      ),
      unselectedLabelTextStyle: const TextStyle(
        color: AppColors.textSecondary,
        fontSize: 13,
        fontWeight: FontWeight.w500,
      ),
      indicatorColor: AppColors.primaryLight.withValues(alpha: 0.15),
      elevation: 0,
    );
  }

  static TabBarThemeData _buildTabBarTheme(
    Color textPrimary,
    Color textSecondary,
  ) {
    return TabBarThemeData(
      labelColor: AppColors.primary,
      unselectedLabelColor: textSecondary,
      labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
      unselectedLabelStyle: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w500,
      ),
      indicatorColor: AppColors.primary,
      indicatorSize: TabBarIndicatorSize.label,
      dividerColor: Colors.transparent,
      overlayColor: WidgetStateProperty.all(
        AppColors.primary.withValues(alpha: 0.08),
      ),
    );
  }

  static DialogThemeData _buildDialogTheme(Color cardColor) {
    return DialogThemeData(
      backgroundColor: cardColor,
      surfaceTintColor: Colors.transparent,
      elevation: 8,
      shadowColor: Colors.black.withValues(alpha: 0.2),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      alignment: Alignment.center,
      titleTextStyle: const TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: AppColors.textPrimary,
      ),
      contentTextStyle: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        color: AppColors.textSecondary,
      ),
    );
  }

  static BottomSheetThemeData _buildBottomSheetTheme(Color cardColor) {
    return BottomSheetThemeData(
      backgroundColor: cardColor,
      surfaceTintColor: Colors.transparent,
      elevation: 8,
      modalBackgroundColor: cardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      clipBehavior: Clip.antiAlias,
      dragHandleColor: Colors.grey.shade400,
      dragHandleSize: const Size(36, 4),
      showDragHandle: true,
    );
  }

  static MenuThemeData _buildMenuTheme(Color cardColor) {
    return MenuThemeData(
      style: MenuStyle(
        backgroundColor: WidgetStateProperty.all(cardColor),
        elevation: WidgetStateProperty.all(6),
        padding: WidgetStateProperty.all(
          const EdgeInsets.symmetric(vertical: 8),
        ),
        shape: WidgetStateProperty.all(
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
    );
  }

  static PopupMenuThemeData _buildPopupMenuTheme(Color cardColor) {
    return PopupMenuThemeData(
      color: cardColor,
      elevation: 6,
      shadowColor: Colors.black.withValues(alpha: 0.15),
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      textStyle: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w500,
        color: AppColors.textPrimary,
      ),
    );
  }

  static ChipThemeData _buildChipTheme(bool isDark, Color textPrimary) {
    return ChipThemeData(
      backgroundColor: isDark ? const Color(0xFF252A37) : Colors.grey.shade100,
      disabledColor: Colors.grey.shade300,
      selectedColor: AppColors.primaryLight.withValues(alpha: 0.2),
      secondarySelectedColor: AppColors.primary,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      labelStyle: TextStyle(
        color: textPrimary,
        fontSize: 13,
        fontWeight: FontWeight.w500,
      ),
      secondaryLabelStyle: const TextStyle(
        color: Colors.white,
        fontSize: 13,
        fontWeight: FontWeight.w600,
      ),
      brightness: isDark ? Brightness.dark : Brightness.light,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(
          color: isDark ? Colors.transparent : Colors.grey.shade300,
        ),
      ),
    );
  }

  static ListTileThemeData _buildListTileTheme(bool isDark, Color textPrimary) {
    return ListTileThemeData(
      dense: false,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      iconColor: AppColors.primary,
      textColor: textPrimary,
      selectedColor: AppColors.primary,
      selectedTileColor: AppColors.primaryLight.withValues(alpha: 0.08),
      horizontalTitleGap: 12,
      minLeadingWidth: 20,
    );
  }

  static DividerThemeData _buildDividerTheme(Color borderDividerColor) {
    return DividerThemeData(
      color: borderDividerColor,
      thickness: 1,
      space: 1,
      indent: 0,
      endIndent: 0,
    );
  }

  static CheckboxThemeData _buildCheckboxTheme() {
    return CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return AppColors.primary;
        }
        return Colors.transparent;
      }),
      checkColor: WidgetStateProperty.all(Colors.white),
      side: const BorderSide(color: AppColors.textSecondary, width: 1.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
    );
  }

  static RadioThemeData _buildRadioTheme() {
    return RadioThemeData(
      fillColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return AppColors.primary;
        }
        return AppColors.textSecondary;
      }),
    );
  }

  static SwitchThemeData _buildSwitchTheme(bool isDark) {
    return SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return Colors.white;
        }
        return isDark ? Colors.grey.shade400 : Colors.grey.shade600;
      }),
      trackColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return AppColors.primaryLight;
        }
        return isDark ? const Color(0xFF2C3242) : Colors.grey.shade300;
      }),
      trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
    );
  }

  static SliderThemeData _buildSliderTheme() {
    return SliderThemeData(
      activeTrackColor: AppColors.primaryLight,
      inactiveTrackColor: AppColors.primaryLight.withValues(alpha: 0.2),
      thumbColor: AppColors.primary,
      overlayColor: AppColors.primary.withValues(alpha: 0.12),
      valueIndicatorColor: AppColors.primaryDark,
      valueIndicatorTextStyle: const TextStyle(
        color: Colors.white,
        fontSize: 12,
      ),
      trackHeight: 4,
    );
  }

  static TooltipThemeData _buildTooltipTheme() {
    return TooltipThemeData(
      decoration: BoxDecoration(
        color: AppColors.primaryDark.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(8),
      ),
      textStyle: const TextStyle(
        color: Colors.white,
        fontSize: 12,
        fontWeight: FontWeight.w500,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      waitDuration: const Duration(milliseconds: 500),
    );
  }

  static SnackBarThemeData _buildSnackBarTheme() {
    return SnackBarThemeData(
      backgroundColor: AppColors.primaryDark,
      contentTextStyle: const TextStyle(
        color: Colors.white,
        fontSize: 14,
        fontWeight: FontWeight.w500,
      ),
      actionTextColor: AppColors.accentLight,
      behavior: SnackBarBehavior.floating,
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    );
  }

  static ProgressIndicatorThemeData _buildProgressIndicatorTheme() {
    return const ProgressIndicatorThemeData(
      color: AppColors.primaryLight,
      linearTrackColor: Color(0xFFE5E7EB),
      refreshBackgroundColor: Colors.white,
    );
  }

  static BadgeThemeData _buildBadgeTheme() {
    return const BadgeThemeData(
      backgroundColor: AppColors.accent,
      textColor: Colors.white,
      padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      textStyle: TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
    );
  }

  static ExpansionTileThemeData _buildExpansionTileTheme(Color textPrimary) {
    return ExpansionTileThemeData(
      iconColor: AppColors.primary,
      collapsedIconColor: AppColors.textSecondary,
      textColor: textPrimary,
      collapsedTextColor: textPrimary,
      shape: const Border(),
      collapsedShape: const Border(),
    );
  }
}

// =============================================================================
// APP CONSTANTS & PALETTE (INCHANGÉE)
// =============================================================================

/// Constantes de couleurs globales pour toute l'application
class AppColors {
  static const Color primaryDark = Color(0xFF001F3F);
  static const Color primary = Color(0xFF003366);
  static const Color primaryLight = Color(0xFF0066CC);
  static const Color accent = Color(0xFFFF7900);
  static const Color accentLight = Color(0xFFFFA940);
  static const Color success = Color(0xFF00A86B);
  static const Color warning = Color(0xFFFFB800);
  static const Color error = Color(0xFFE53E3E);
  static const Color surfaceLight = Color(0xFFF5F7FA);
  static const Color textPrimary = Color(0xFF1A1D2E);
  static const Color textSecondary = Color(0xFF6B7280);
  static const Color borderLight = Color(0xFFE5E7EB);

  // Couleurs de statut d'intervention
  static const Color statusAssigned = Color(0xFF3B82F6);
  static const Color statusEnRoute = Color(0xFFF59E0B);
  static const Color statusArrived = Color(0xFF14B8A6);
  static const Color statusInProgress = Color(0xFF8B5CF6);
  static const Color statusCompleted = Color(0xFF10B981);
  static const Color statusFailed = Color(0xFFEF4444);
  static const Color statusCancelled = Color(0xFF9CA3AF);

  // Types d'intervention
  static const Color typeInstallation = Color(0xFF3B82F6);
  static const Color typeDepannage = Color(0xFFF59E0B);
  static const Color typeSauv = Color(0xFFEF4444);
  static const Color typeMigration = Color(0xFF8B5CF6);
  static const Color typeMaintenance = Color(0xFF14B8A6);
  static const Color typeAudit = Color(0xFF6366F1);
}
