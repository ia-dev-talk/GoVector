import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/app/mobile_bootstrap.dart';
import 'package:mobile_app/design_system/bluevector_theme.dart';
import 'package:mobile_app/features/history/technician_history_detail_screen.dart';
import 'package:mobile_app/features/history/technician_history_models.dart';
import 'package:mobile_app/features/history/technician_history_repository.dart';
import 'package:mobile_app/features/history/technician_history_screen.dart';
import 'package:mobile_app/features/interventions/completion_requirement_label.dart';
import 'package:mobile_app/features/interventions/current_intervention_screen.dart';
import 'package:mobile_app/features/profile/mobile_profile_screen.dart';
import 'package:mobile_app/models/job.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _historyItem = {
  'job_id': 8,
  'job_number': 'DTLI-8',
  'date': '2026-08-06T10:00:00Z',
  'activity': 'INSTALLATION',
  'client': 'Client pilote',
  'address': '10 rue du Pilote',
  'status': 'completed',
  'result': 'Validée',
  'operator': 'Orange',
  'technician_name': 'Tech 3',
  'is_current': false,
  'timeline': <dynamic>[],
};

Map<String, dynamic> _page() => {
  'items': [_historyItem],
  'page': 1,
  'page_size': 20,
  'total': 1,
  'pages': 1,
};

Map<String, dynamic> _detail() => {
  'intervention': _historyItem,
  'activity_log': [
    {
      'action': 'status_change',
      'description': 'Installation terminée',
      'created_at': '2026-08-06T10:00:00Z',
    },
  ],
  'field_data': {'pto': 'PTO-12'},
  'failures': <dynamic>[],
  'postponements': <dynamic>[],
  'materials': <dynamic>[],
  'media_references': <dynamic>[],
  'read_only': true,
};

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'tech_token': 'token'});
  });

  test('history cache is durable and isolated between users', () async {
    final online = TechnicianHistoryRepository(
      client: MockClient((_) async => http.Response(jsonEncode(_page()), 200)),
    );
    final first = await online.loadPersonal(ownerUserId: 3, technicianId: 3);
    expect(first.fromCache, isFalse);

    final offline = TechnicianHistoryRepository(
      client: MockClient((_) async => throw const SocketException('offline')),
    );
    final cached = await offline.loadPersonal(ownerUserId: 3, technicianId: 3);
    expect(cached.fromCache, isTrue);
    expect(cached.value.items.single.jobId, 8);

    await expectLater(
      offline.loadPersonal(ownerUserId: 4, technicianId: 4),
      throwsA(isA<SocketException>()),
    );
  });

  test('site detail uses the authorized current-job contract', () async {
    late Uri requested;
    final repository = TechnicianHistoryRepository(
      client: MockClient((request) async {
        requested = request.url;
        return http.Response(jsonEncode(_detail()), 200);
      }),
    );

    await repository.loadDetail(
      ownerUserId: 3,
      technicianId: 3,
      historicalJobId: 8,
      currentSiteJobId: 41,
    );

    expect(requested.path, endsWith('/tech/jobs/41/site-history/8'));
  });

  test('authorization failures never fall back to a cached history', () async {
    final online = TechnicianHistoryRepository(
      client: MockClient((_) async => http.Response(jsonEncode(_page()), 200)),
    );
    await online.loadPersonal(ownerUserId: 3, technicianId: 3);

    final forbidden = TechnicianHistoryRepository(
      client: MockClient(
        (_) async => http.Response(jsonEncode({'detail': 'Accès refusé'}), 403),
      ),
    );

    await expectLater(
      forbidden.loadPersonal(ownerUserId: 3, technicianId: 3),
      throwsA(isA<TechnicianHistoryHttpException>()),
    );
  });

  test('pilot field labels contain no false required marker', () {
    expect(
      completionRequirementLabel(
        label: 'Numéro PTO',
        fieldKey: 'pto',
        requiredFieldKeys: {},
      ),
      'Numéro PTO',
    );
    expect(
      completionRequirementLabel(
        label: 'Numéro PTO',
        fieldKey: 'pto',
        requiredFieldKeys: {'pto'},
      ),
      'Numéro PTO *',
    );
  });

  testWidgets('profile exposes personal history', (tester) async {
    var opened = false;
    await tester.pumpWidget(
      MaterialApp(
        theme: BlueVectorTheme.dark,
        home: Scaffold(
          body: MobileProfileScreen(
            technicianId: 3,
            technicianName: 'Tech 3',
            isOnline: true,
            pendingActions: 0,
            lastSync: null,
            onSync: () async {},
            onOpenHistory: () => opened = true,
            onLogout: () async {},
          ),
        ),
      ),
    );

    await tester.drag(find.byType(ListView), const Offset(0, -500));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Historique de mes interventions').last);
    expect(opened, isTrue);
  });

  testWidgets('current intervention exposes site history', (tester) async {
    var opened = false;
    final job = Job(
      id: 41,
      jobNumber: 'DTLI-41',
      jobType: 'INSTALLATION',
      status: 'in_progress',
      customerName: 'Client pilote',
      serviceAddress: '10 rue du Pilote',
      assignedTechId: 3,
      latitude: 33.57,
      longitude: -7.59,
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: BlueVectorTheme.dark,
        home: Scaffold(
          body: CurrentInterventionScreen(
            job: job,
            isOnline: true,
            pendingActions: 0,
            onOpenActions: () {},
            onAdvanceWorkflow: () {},
            workflowActionLabel: 'Clôturer l’intervention',
            onCallClient: () {},
            onNavigate: () {},
            onOpenSiteHistory: () => opened = true,
            onFailure: () {},
            onPostpone: () {},
          ),
        ),
      ),
    );

    await tester.scrollUntilVisible(find.text('Historique du site'), 250);
    await tester.tap(find.text('Historique du site'));
    expect(opened, isTrue);
  });

  testWidgets('historical detail is read-only', (tester) async {
    await initializeBlueVectorMobile();
    final repository = TechnicianHistoryRepository(
      client: MockClient(
        (_) async => http.Response(jsonEncode(_detail()), 200),
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: BlueVectorTheme.dark,
        home: TechnicianHistoryDetailScreen(
          ownerUserId: 3,
          technicianId: 3,
          historicalJobId: 8,
          initialItem: TechnicianHistoryItem.fromJson(_historyItem),
          repository: repository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Consultation uniquement'), findsOneWidget);
    expect(find.text('Installation terminée'), findsOneWidget);
    expect(find.textContaining('Modifier'), findsNothing);
    expect(find.textContaining('Terminer'), findsNothing);
  });

  testWidgets('personal history renders list, search and filters', (
    tester,
  ) async {
    await initializeBlueVectorMobile();
    final repository = TechnicianHistoryRepository(
      client: MockClient((_) async => http.Response(jsonEncode(_page()), 200)),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: BlueVectorTheme.dark,
        home: TechnicianHistoryScreen.personal(
          ownerUserId: 3,
          technicianId: 3,
          repository: repository,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Client pilote'), findsOneWidget);
    expect(find.text('Statut'), findsOneWidget);
    expect(find.textContaining('Client, adresse'), findsOneWidget);
  });
}
