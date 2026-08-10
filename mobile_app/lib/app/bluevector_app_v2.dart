import 'package:flutter/material.dart';

import '../design_system/bluevector_theme.dart';
import '../features/auth/session_gate.dart';

class BlueVectorMobileApp extends StatelessWidget {
  const BlueVectorMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BlueVector',
      debugShowCheckedModeBanner: false,
      theme: BlueVectorTheme.dark,
      darkTheme: BlueVectorTheme.dark,
      themeMode: ThemeMode.dark,
      themeAnimationDuration: const Duration(milliseconds: 220),
      themeAnimationCurve: Curves.easeOutCubic,
      builder: (context, child) {
        final mediaQuery = MediaQuery.of(context);

        return MediaQuery(
          data: mediaQuery.copyWith(textScaler: const TextScaler.linear(1.0)),
          child: child ?? const SizedBox.shrink(),
        );
      },
      home: const SessionGate(),
    );
  }
}
