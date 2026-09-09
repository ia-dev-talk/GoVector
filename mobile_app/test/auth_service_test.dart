import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/config/config.dart';
import 'package:mobile_app/services/auth_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

String jwtWithSubject(int userId) {
  final payload = base64Url.encode(
    utf8.encode(jsonEncode({'sub': '$userId'})),
  );
  return 'header.$payload.signature';
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('AppConfig construit toutes les routes depuis la même URL API', () {
    expect(
      AppConfig.apiUri('/tech/login').toString(),
      '${AppConfig.apiBaseUrl}/tech/login',
    );
  });

  test('login conserve le JWT et les informations technicien', () async {
    final client = MockClient((request) async {
      expect(request.url, AppConfig.apiUri('tech/login'));
      expect(jsonDecode(request.body), {
        'username': 'technicien',
        'password': 'mot-de-passe',
      });
      return http.Response(
        jsonEncode({
          'access_token': 'jwt-test',
          'user_id': 7,
          'role': 'TECHNICIAN',
          'technician_id': 42,
          'technician_name': 'Technicien Test',
          'orienteur_id': 8,
        }),
        200,
      );
    });

    final success = await AuthService.login(
      'technicien',
      'mot-de-passe',
      client: client,
    );

    expect(success, isTrue);
    expect(AuthService.lastLoginFailure, isNull);
    expect(await AuthService.getToken(), 'jwt-test');
    expect(await AuthService.getUserId(), 7);
    expect(await AuthService.getRole(), MobileFieldRole.technician);
    expect(await AuthService.getTechnicianId(), 42);
    expect(await AuthService.getTechnicianName(), 'Technicien Test');
    expect(await AuthService.getOrienteurId(), 8);
    expect(await AuthService.isLoggedIn(), isTrue);
  });

  test('login Agent terrain ne fabrique jamais un faux technicien', () async {
    final client = MockClient((request) async {
      expect(request.url, AppConfig.apiUri('tech/login'));
      return http.Response(
        jsonEncode({
          'access_token': jwtWithSubject(21),
          'user_id': 21,
          'role': 'CHEF_ORIENTEUR',
          'technician_id': null,
          'technician_name': null,
          'orienteur_id': 5,
          'field_agent_name': 'Agent Casablanca',
        }),
        200,
      );
    });

    final success = await AuthService.login('agent', 'secret', client: client);

    expect(success, isTrue);
    expect(await AuthService.getUserId(), 21);
    expect(await AuthService.getRole(), MobileFieldRole.fieldAgent);
    expect(await AuthService.getTechnicianId(), isNull);
    expect(await AuthService.getOrienteurId(), 5);
    expect(await AuthService.getFieldAgentName(), 'Agent Casablanca');
    expect(await AuthService.isLoggedIn(), isTrue);
  });

  test('Agent sans rattachement équipe est refusé sans écraser la session', () async {
    SharedPreferences.setMockInitialValues({
      'tech_token': jwtWithSubject(3),
      'tech_user_id': 3,
      'field_role': 'TECHNICIAN',
      'tech_id': 3,
      'tech_name': 'Technicien Actuel',
    });
    final client = MockClient((_) async => http.Response(
          jsonEncode({
            'access_token': jwtWithSubject(22),
            'user_id': 22,
            'role': 'CHEF_ORIENTEUR',
            'orienteur_id': null,
            'field_agent_name': 'Agent sans équipe',
          }),
          200,
        ));

    expect(await AuthService.login('agent', 'secret', client: client), isFalse);
    expect(await AuthService.getRole(), MobileFieldRole.technician);
    expect(await AuthService.getTechnicianId(), 3);
  });

  test('session existante récupère user_id depuis le sub JWT', () async {
    SharedPreferences.setMockInitialValues({
      'tech_token': jwtWithSubject(19),
      'tech_id': 3,
    });

    expect(await AuthService.getUserId(), 19);
    expect(await AuthService.getRole(), MobileFieldRole.technician);
  });

  test('nouveau login ne réutilise jamais le user_id précédent', () async {
    SharedPreferences.setMockInitialValues({
      'tech_token': jwtWithSubject(3),
      'tech_user_id': 3,
      'tech_id': 3,
      'tech_name': 'Ancien Technicien',
    });

    final client = MockClient((_) async {
      return http.Response(
        jsonEncode({
          'access_token': jwtWithSubject(19),
          // Compatibilité API : user_id/role peuvent manquer pendant un court
          // version skew, technician_id rend la réponse sans ambiguïté.
          'technician_id': 12,
          'technician_name': 'Nouveau Technicien',
        }),
        200,
      );
    });

    final success = await AuthService.login('nouveau', 'mot-de-passe', client: client);

    expect(success, isTrue);
    expect(await AuthService.getUserId(), 19);
    expect(await AuthService.getRole(), MobileFieldRole.technician);
    expect(await AuthService.getTechnicianId(), 12);
    expect(await AuthService.getTechnicianName(), 'Nouveau Technicien');
    expect(await AuthService.isLoggedIn(), isTrue);
  });

  test('réponse login incomplète ne remplace pas une session existante', () async {
    SharedPreferences.setMockInitialValues({
      'tech_token': jwtWithSubject(3),
      'tech_user_id': 3,
      'tech_id': 3,
      'tech_name': 'Technicien Actuel',
    });

    final client = MockClient((_) async {
      return http.Response(
        jsonEncode({
          'access_token': jwtWithSubject(19),
          'technician_id': 0,
          'technician_name': 'Réponse invalide',
        }),
        200,
      );
    });

    final success = await AuthService.login('autre', 'mot-de-passe', client: client);

    expect(success, isFalse);
    expect(AuthService.lastLoginFailure?.type, LoginFailureType.serverError);
    expect(await AuthService.getUserId(), 3);
    expect(await AuthService.getTechnicianId(), 3);
    expect(await AuthService.getTechnicianName(), 'Technicien Actuel');
  });

  test('logout préserve les actions legacy non synchronisées et retire les rôles', () async {
    SharedPreferences.setMockInitialValues({
      'tech_token': 'jwt',
      'tech_user_id': 3,
      'tech_id': 3,
      'field_role': 'TECHNICIAN',
      'field_orienteur_id': 8,
      'offline_pending_actions': ['action-terrain'],
    });

    await AuthService.logout();
    final preferences = await SharedPreferences.getInstance();

    expect(preferences.getStringList('offline_pending_actions'), ['action-terrain']);
    expect(await AuthService.getUserId(), isNull);
    expect(await AuthService.getTechnicianId(), isNull);
    expect(await AuthService.getRole(), isNull);
    expect(await AuthService.getOrienteurId(), isNull);
  });

  test('login identifie uniquement une réponse 401 comme identifiants invalides', () async {
    final client = MockClient((_) async => http.Response('{}', 401));
    final success = await AuthService.login('inconnu', 'incorrect', client: client);
    expect(success, isFalse);
    expect(AuthService.lastLoginFailure?.type, LoginFailureType.invalidCredentials);
  });

  test('login distingue un serveur inaccessible', () async {
    final client = MockClient((_) async {
      throw http.ClientException('Connexion refusée');
    });
    final success = await AuthService.login('technicien', 'test', client: client);
    expect(success, isFalse);
    expect(AuthService.lastLoginFailure?.type, LoginFailureType.serverUnreachable);
  });

  test('login distingue un timeout', () async {
    final client = MockClient((_) async {
      await Future<void>.delayed(const Duration(milliseconds: 20));
      return http.Response('{}', 200);
    });
    final success = await AuthService.login(
      'technicien',
      'test',
      client: client,
      timeout: const Duration(milliseconds: 1),
    );
    expect(success, isFalse);
    expect(AuthService.lastLoginFailure?.type, LoginFailureType.timeout);
  });

  test('login distingue une erreur serveur', () async {
    final client = MockClient((_) async => http.Response('{}', 503));
    final success = await AuthService.login('technicien', 'test', client: client);
    expect(success, isFalse);
    expect(AuthService.lastLoginFailure?.type, LoginFailureType.serverError);
  });
}
