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
          'technician_id': 42,
          'technician_name': 'Technicien Test',
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
    expect(await AuthService.getTechnicianId(), 42);
    expect(await AuthService.getTechnicianName(), 'Technicien Test');
  });

  test('session existante récupère user_id depuis le sub JWT', () async {
    SharedPreferences.setMockInitialValues({
      'tech_token': jwtWithSubject(19),
      'tech_id': 3,
    });

    expect(await AuthService.getUserId(), 19);
  });

  test(
    'nouveau login ne réutilise jamais le user_id du technicien précédent',
    () async {
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
            // Compatibilité API : user_id peut manquer, le JWT devient source
            // de secours mais l'ancien ID local doit être supprimé.
            'technician_id': 12,
            'technician_name': 'Nouveau Technicien',
          }),
          200,
        );
      });

      final success = await AuthService.login(
        'nouveau',
        'mot-de-passe',
        client: client,
      );

      expect(success, isTrue);
      expect(await AuthService.getUserId(), 19);
      expect(await AuthService.getTechnicianId(), 12);
      expect(await AuthService.getTechnicianName(), 'Nouveau Technicien');
      expect(await AuthService.isLoggedIn(), isTrue);
    },
  );

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

    final success = await AuthService.login(
      'autre',
      'mot-de-passe',
      client: client,
    );

    expect(success, isFalse);
    expect(AuthService.lastLoginFailure?.type, LoginFailureType.serverError);
    expect(await AuthService.getUserId(), 3);
    expect(await AuthService.getTechnicianId(), 3);
    expect(await AuthService.getTechnicianName(), 'Technicien Actuel');
  });

  test('logout préserve les actions legacy non synchronisées', () async {
    SharedPreferences.setMockInitialValues({
      'tech_token': 'jwt',
      'tech_user_id': 3,
      'tech_id': 3,
      'offline_pending_actions': ['action-terrain'],
    });

    await AuthService.logout();
    final preferences = await SharedPreferences.getInstance();

    expect(preferences.getStringList('offline_pending_actions'), [
      'action-terrain',
    ]);
    expect(await AuthService.getUserId(), isNull);
    expect(await AuthService.getTechnicianId(), isNull);
  });

  test(
    'login identifie uniquement une réponse 401 comme identifiants invalides',
    () async {
      final client = MockClient((_) async => http.Response('{}', 401));

      final success = await AuthService.login(
        'inconnu',
        'incorrect',
        client: client,
      );

      expect(success, isFalse);
      expect(
        AuthService.lastLoginFailure?.type,
        LoginFailureType.invalidCredentials,
      );
    },
  );

  test('login distingue un serveur inaccessible', () async {
    final client = MockClient((_) async {
      throw http.ClientException('Connexion refusée');
    });

    final success = await AuthService.login(
      'technicien',
      'test',
      client: client,
    );

    expect(success, isFalse);
    expect(
      AuthService.lastLoginFailure?.type,
      LoginFailureType.serverUnreachable,
    );
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

    final success = await AuthService.login(
      'technicien',
      'test',
      client: client,
    );

    expect(success, isFalse);
    expect(AuthService.lastLoginFailure?.type, LoginFailureType.serverError);
  });
}
