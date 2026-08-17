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
  static String get baseUrl => AppConfig.apiBaseUrl;

  static const String _tokenKey = 'tech_token';
  static const String _userIdKey = 'tech_user_id';
  static const String _techIdKey = 'tech_id';
  static const String _techNameKey = 'tech_name';

  static LoginFailure? _lastLoginFailure;
  static LoginFailure? get lastLoginFailure => _lastLoginFailure;

  static int? _positiveInt(dynamic value) {
    if (value is int && value > 0) {
      return value;
    }
    final parsed = int.tryParse('${value ?? ''}');
    return parsed != null && parsed > 0 ? parsed : null;
  }

  static String? _nonEmptyString(dynamic value) {
    if (value is! String) {
      return null;
    }
    final normalized = value.trim();
    return normalized.isEmpty ? null : normalized;
  }

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
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'username': username, 'password': password}),
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

      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        _lastLoginFailure = const LoginFailure(
          LoginFailureType.serverError,
          'Réponse invalide du serveur.',
        );
        return false;
      }

      final token = _nonEmptyString(decoded['access_token']);
      final technicianId = _positiveInt(decoded['technician_id']);
      final technicianName = _nonEmptyString(decoded['technician_name']);
      final userId = _positiveInt(decoded['user_id']);

      if (token == null || technicianId == null || technicianName == null) {
        _lastLoginFailure = const LoginFailure(
          LoginFailureType.serverError,
          'Réponse invalide du serveur.',
        );
        return false;
      }

      final prefs = await SharedPreferences.getInstance();

      // Replace the identity atomically from the app's point of view. In
      // particular, never retain a previous technician's owner IDs if an older
      // API response omits user_id: getUserId() can derive it from the new JWT.
      await prefs.remove(_userIdKey);
      await prefs.remove(_techIdKey);
      await prefs.remove(_techNameKey);
      await prefs.setString(_tokenKey, token);
      if (userId != null) {
        await prefs.setInt(_userIdKey, userId);
      }
      await prefs.setInt(_techIdKey, technicianId);
      await prefs.setString(_techNameKey, technicianName);

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
    final technicianId = prefs.getInt(_techIdKey);
    return technicianId != null && technicianId > 0 ? technicianId : null;
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
      final decoded = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
      );
      if (decoded is! Map<String, dynamic>) {
        return null;
      }
      final parsed = _positiveInt(decoded['sub']);
      if (parsed == null) {
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
    final name = prefs.getString(_techNameKey)?.trim();
    return name == null || name.isEmpty ? null : name;
  }

  // =========================
  // SESSION CHECK
  // =========================
  static Future<bool> isLoggedIn() async {
    final token = await getToken();
    final technicianId = await getTechnicianId();
    final userId = await getUserId();
    return token != null && technicianId != null && userId != null;
  }

  // =========================
  // LOGOUT
  // =========================
  static Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();

    await prefs.remove(_tokenKey);
    await prefs.remove(_userIdKey);
    await prefs.remove(_techIdKey);
    await prefs.remove(_techNameKey);

    await prefs.reload();
  }

  static Future<void> clearAuth() async {
    await logout();
  }
}
