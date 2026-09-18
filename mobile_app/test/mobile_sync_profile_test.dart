import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/design_system/bluevector_theme.dart';
import 'package:mobile_app/features/notifications/mobile_notifications_screen.dart';
import 'package:mobile_app/features/profile/mobile_profile_screen.dart';

void main() {
  testWidgets('offline alerts keep sync and review states distinct', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: BlueVectorTheme.light,
        home: MobileNotificationsScreen(
          jobs: const [],
          isOnline: false,
          pendingActions: 2,
          attentionActions: 1,
          syncing: false,
          onOpenJob: (_) {},
          onSync: () async {},
        ),
      ),
    );

    expect(find.text('Mode hors ligne'), findsOneWidget);
    expect(find.text('2 actions à synchroniser'), findsOneWidget);
    expect(find.text('1 action à vérifier'), findsOneWidget);
    expect(find.text('Synchroniser'), findsNothing);
  });

  testWidgets('profile separates pending work from actions to review', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: BlueVectorTheme.light,
        home: MobileProfileScreen(
          technicianId: 7,
          technicianName: 'Amine Benali',
          isOnline: true,
          pendingActions: 2,
          attentionActions: 1,
          lastSync: null,
          syncing: false,
          onSync: () async {},
          onOpenHistory: () {},
          onLogout: () async {},
        ),
      ),
    );

    expect(find.text('2 actions à synchroniser'), findsOneWidget);
    expect(find.text('À vérifier'), findsOneWidget);
    expect(find.text('1 action en conflit ou refusée'), findsOneWidget);
    expect(find.text('Synchroniser maintenant'), findsOneWidget);
  });

  testWidgets('profile disables repeated sync while a sync is running', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: BlueVectorTheme.light,
        home: MobileProfileScreen(
          technicianId: 7,
          technicianName: 'Amine Benali',
          isOnline: true,
          pendingActions: 2,
          attentionActions: 0,
          lastSync: null,
          syncing: true,
          onSync: () async {},
          onOpenHistory: () {},
          onLogout: () async {},
        ),
      ),
    );

    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Synchronisation…'),
    );

    expect(button.onPressed, isNull);
  });
}
