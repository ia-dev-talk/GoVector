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

abstract final class MobileFieldRole {
  static const technician = 'TECHNICIAN';
  static const fieldAgent = 'CHEF_ORIENTEUR';

  static String? normalize(Object? value) {
    final normalized = value?.toString().trim().toUpperCase();
    if (normalized == technician || normalized == fieldAgent) return normalized;
    return null;
  }
}

class AuthService {
  static String get baseUrl => AppConfig.apiBaseUrl;

  static const String _tokenKey = 'tech_token';
  static const String _userIdKey = 'tech_user_id';
  static const String _techIdKey = 'tech_id';
  static const String _techNameKey = 'tech_name';
  static const String _roleKey = 'field_role';
  static const String _orienteurIdKey = 'field_orienteur_id';
  static const String _fieldAgentNameKey = 'field_agent_name';

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
      final userId = _positiveInt(decoded['user_id']);
      final technicianId = _positiveInt(decoded['technician_id']);
      final technicianName = _nonEmptyString(decoded['technician_name']);
      final orienteurId = _positiveInt(decoded['orienteur_id']);
      final fieldAgentName = _nonEmptyString(decoded['field_agent_name']);
      // Backward-compatible technician inference lets a pilot app survive a
      // brief server/app version skew while role-aware servers are deployed.
      final role = MobileFieldRole.normalize(decoded['role']) ??
          (technicianId != null ? MobileFieldRole.technician : null);

      final validTechnician = role == MobileFieldRole.technician &&
          technicianId != null &&
          technicianName != null;
      final validAgent = role == MobileFieldRole.fieldAgent &&
          orienteurId != null &&
          fieldAgentName != null;
      if (token == null || role == null || (!validTechnician && !validAgent)) {
        _lastLoginFailure = const LoginFailure(
          LoginFailureType.serverError,
          'Réponse invalide du serveur.',
        );
        return false;
      }

      final prefs = await SharedPreferences.getInstance();

      // Replace role identity atomically from the app's point of view. Never
      // retain a previous technician/Agent identity when accounts are switched.
      for (final key in [
        _userIdKey,
        _techIdKey,
        _techNameKey,
        _roleKey,
        _orienteurIdKey,
        _fieldAgentNameKey,
      ]) {
        await prefs.remove(key);
      }
      await prefs.setString(_tokenKey, token);
      await prefs.setString(_roleKey, role);
      if (userId != null) await prefs.setInt(_userIdKey, userId);
      if (technicianId != null) await prefs.setInt(_techIdKey, technicianId);
      if (technicianName != null) await prefs.setString(_techNameKey, technicianName);
      if (orienteurId != null) await prefs.setInt(_orienteurIdKey, orienteurId);
      if (fieldAgentName != null) {
        await prefs.setString(_fieldAgentNameKey, fieldAgentName);
      }

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
  // TOKEN / IDENTITY
  // =========================
  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_tokenKey);
    return token == null || token.isEmpty ? null : token;
  }

  static Future<String?> getRole() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = MobileFieldRole.normalize(prefs.getString(_roleKey));
    if (stored != null) return stored;
    // Legacy local sessions were necessarily technician sessions.
    final technicianId = prefs.getInt(_techIdKey);
    return technicianId != null && technicianId > 0
        ? MobileFieldRole.technician
        : null;
  }

  static Future<int?> getTechnicianId() async {
    final prefs = await SharedPreferences.getInstance();
    final technicianId = prefs.getInt(_techIdKey);
    return technicianId != null && technicianId > 0 ? technicianId : null;
  }

  static Future<int?> getOrienteurId() async {
    final prefs = await SharedPreferences.getInstance();
    final id = prefs.getInt(_orienteurIdKey);
    return id != null && id > 0 ? id : null;
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
      if (parts.length != 3) return null;
      final decoded = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
      );
      if (decoded is! Map<String, dynamic>) return null;
      final parsed = _positiveInt(decoded['sub']);
      if (parsed == null) return null;
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

  static Future<String?> getFieldAgentName() async {
    final prefs = await SharedPreferences.getInstance();
    final name = prefs.getString(_fieldAgentNameKey)?.trim();
    return name == null || name.isEmpty ? null : name;
  }

  // =========================
  // SESSION CHECK
  // =========================
  static Future<bool> isLoggedIn() async {
    final token = await getToken();
    final userId = await getUserId();
    final role = await getRole();
    if (token == null || userId == null || role == null) return false;
    if (role == MobileFieldRole.technician) {
      return await getTechnicianId() != null;
    }
    if (role == MobileFieldRole.fieldAgent) {
      return await getOrienteurId() != null;
    }
    return false;
  }

  // =========================
  // LOGOUT
  // =========================
  static Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();

    for (final key in [
      _tokenKey,
      _userIdKey,
      _techIdKey,
      _techNameKey,
      _roleKey,
      _orienteurIdKey,
      _fieldAgentNameKey,
    ]) {
      await prefs.remove(key);
    }

    await prefs.reload();
  }

  static Future<void> clearAuth() async {
    await logout();
  }
}
