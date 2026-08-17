import 'package:flutter/foundation.dart';

/// Configuration centralisée de l'application BlueVector pour Unifibre.
class AppConfig {
  static const String _configuredApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  /// URL locale utilisée uniquement pour le développement.
  static const String developmentApiBaseUrl =
      'http://192.168.1.225:8080/api/v1';

  /// URL de base de l'API.
  ///
  /// En debug, l'ancienne URL LAN reste disponible pour faciliter les tests
  /// terrain. En release, API_BASE_URL devient obligatoire et doit être HTTPS
  /// afin qu'une APK publique ne puisse jamais pointer silencieusement vers une
  /// machine locale ou une API non chiffrée.
  static String get apiBaseUrl => resolveApiBaseUrl(
        configuredUrl: _configuredApiBaseUrl,
        releaseMode: kReleaseMode,
      );

  /// Résout et valide l'URL API. Exposé pour pouvoir tester les invariants de
  /// release sans dépendre du mode de compilation du runner Flutter.
  static String resolveApiBaseUrl({
    required String configuredUrl,
    required bool releaseMode,
  }) {
    final configured = configuredUrl.trim();

    if (configured.isEmpty) {
      if (releaseMode) {
        throw StateError(
          'API_BASE_URL est obligatoire pour une build release BlueVector.',
        );
      }
      return developmentApiBaseUrl;
    }

    final uri = Uri.tryParse(configured);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      throw FormatException(
        'API_BASE_URL doit être une URL absolue valide: $configured',
      );
    }

    if (releaseMode && uri.scheme.toLowerCase() != 'https') {
      throw StateError(
        'API_BASE_URL doit utiliser HTTPS pour une build release BlueVector.',
      );
    }

    if (releaseMode && _isLocalHost(uri.host)) {
      throw StateError(
        'API_BASE_URL ne peut pas cibler une adresse locale en release.',
      );
    }

    return configured.endsWith('/')
        ? configured.substring(0, configured.length - 1)
        : configured;
  }

  static bool _isLocalHost(String host) {
    final normalized = host.toLowerCase();
    return normalized == 'localhost' ||
        normalized == '127.0.0.1' ||
        normalized == '::1';
  }

  /// Timeout des requêtes HTTP en secondes.
  static const int httpTimeoutSeconds = 30;
  static const Duration httpTimeout = Duration(seconds: httpTimeoutSeconds);

  /// Construit une URI API à partir d'un chemin relatif.
  static Uri apiUri(String path) {
    final normalizedPath = path.startsWith('/') ? path.substring(1) : path;
    return Uri.parse('$apiBaseUrl/$normalizedPath');
  }

  /// Nom de l'application.
  static const String appName = 'BlueVector';

  /// Version de l'application.
  static const String appVersion = '1.0.0';

  /// Intervalle de mise à jour GPS en secondes.
  static const int gpsUpdateIntervalSeconds = 15;

  /// Qualité de compression des photos (0-100).
  static const int photoQuality = 85;

  /// Mode debug (true = logs détaillés).
  static const bool debugMode = false;
}
