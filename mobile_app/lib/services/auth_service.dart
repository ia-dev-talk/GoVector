import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/config.dart';

enum LoginFailureType {
  invalidCredentials,
  timeout,
  serverUnreachable,
  serverError,
}

class LoginFailure {
  const LoginFailure(this.type, this.message);

  final LoginFailureType type;
  final String message;
}

class AuthService {
  static const String baseUrl = AppConfig.apiBaseUrl;

  static const String _tokenKey = "tech_token";
  static const String _userIdKey = "tech_user_id";
  static const String _techIdKey = "tech_id";
  static const String _techNameKey = "tech_name";

  static LoginFailure? _lastLoginFailure;
  static LoginFailure? get lastLoginFailure => _lastLoginFailure;

  // =========================
  // LOGIN
  // =========================
  static Future<bool> login(
    String username,
    String password, {
    http.Client? client,
    Duration timeout = AppConfig.httpTimeout,
  }) async {
    _lastLoginFailure = null;
    final requestClient = client ?? http.Client();

    try {
      final response = await requestClient
          .post(
            AppConfig.apiUri('tech/login'),
            headers: {"Content-Type": "application/json"},
            body: jsonEncode({"username": username, "password": password}),
          )
          .timeout(timeout);

      if (response.statusCode == 401) {
        _lastLoginFailure = const LoginFailure(
          LoginFailureType.invalidCredentials,
          'Identifiants invalides.',
        );
        return false;
      }

      if (response.statusCode != 200) {
        _lastLoginFailure = const LoginFailure(
          LoginFailureType.serverError,
          'Erreur serveur. Réessayez dans quelques instants.',
        );
        return false;
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>?;

      if (data == null || data["access_token"] == null) {
        _lastLoginFailure = const LoginFailure(
          LoginFailureType.serverError,
          'Réponse invalide du serveur.',
        );
        return false;
      }

      final prefs = await SharedPreferences.getInstance();

      await prefs.setString(_tokenKey, data["access_token"]);
      final userId = data["user_id"];
      if (userId is int && userId > 0) {
        await prefs.setInt(_userIdKey, userId);
      }
      await prefs.setInt(_techIdKey, data["technician_id"] ?? 0);
      await prefs.setString(_techNameKey, data["technician_name"] ?? "");

      return true;
    } on TimeoutException {
      _lastLoginFailure = const LoginFailure(
        LoginFailureType.timeout,
        'Le serveur ne répond pas (délai dépassé).',
      );
      return false;
    } on SocketException catch (_) {
      _lastLoginFailure = const LoginFailure(
        LoginFailureType.serverUnreachable,
        'Serveur inaccessible. Vérifiez la connexion réseau.',
      );
      return false;
    } on http.ClientException catch (_) {
      _lastLoginFailure = const LoginFailure(
        LoginFailureType.serverUnreachable,
        'Serveur inaccessible. Vérifiez la connexion réseau.',
      );
      return false;
    } on FormatException catch (_) {
      _lastLoginFailure = const LoginFailure(
        LoginFailureType.serverError,
        'Réponse invalide du serveur.',
      );
      return false;
    } catch (_) {
      _lastLoginFailure = const LoginFailure(
        LoginFailureType.serverError,
        'Erreur serveur. Réessayez dans quelques instants.',
      );
      return false;
    } finally {
      if (client == null) {
        requestClient.close();
      }
    }
  }

  // =========================
  // TOKEN
  // =========================
  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_tokenKey);

    if (token == null || token.isEmpty) {
      return null;
    }

    return token;
  }

  static Future<int?> getTechnicianId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getInt(_techIdKey);
  }

  static Future<int?> getUserId() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getInt(_userIdKey);
    if (stored != null && stored > 0) {
      return stored;
    }

    final token = prefs.getString(_tokenKey);
    if (token == null || token.isEmpty) {
      return null;
    }
    try {
      final parts = token.split('.');
      if (parts.length != 3) {
        return null;
      }
      final payload =
          jsonDecode(
                utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
              )
              as Map<String, dynamic>;
      final parsed = int.tryParse('${payload['sub']}');
      if (parsed == null || parsed <= 0) {
        return null;
      }
      await prefs.setInt(_userIdKey, parsed);
      return parsed;
    } catch (_) {
      return null;
    }
  }

  static Future<String?> getTechnicianName() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_techNameKey);
  }

  // =========================
  // SESSION CHECK
  // =========================
  static Future<bool> isLoggedIn() async {
    final token = await getToken();
    return token != null;
  }

  // =========================
  // LOGOUT (FIX IMPORTANT)
  // =========================
  static Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();

    // suppression ciblée
    await prefs.remove(_tokenKey);
    await prefs.remove(_userIdKey);
    await prefs.remove(_techIdKey);
    await prefs.remove(_techNameKey);

    // sécurité supplémentaire (ANTI BUG SESSION BLOQUÉE)
    await prefs.reload();
  }

  // =========================
  // HARD RESET (UTIL POUR TON BUG ACTUEL)
  // =========================
  static Future<void> clearAuth() async {
    await logout();
  }
}
