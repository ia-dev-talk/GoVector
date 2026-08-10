/// Configuration centralisée de l'application BlueVector pour Unifibre.
class AppConfig {
  /// URL de base de l'API, surchargeable avec --dart-define=API_BASE_URL=...
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://192.168.1.225:8080/api/v1',
  );

  /// Timeout des requêtes HTTP en secondes
  static const int httpTimeoutSeconds = 30;
  static const Duration httpTimeout = Duration(seconds: httpTimeoutSeconds);

  /// Construit une URI API à partir d'un chemin relatif.
  static Uri apiUri(String path) {
    final normalizedPath = path.startsWith('/') ? path.substring(1) : path;
    final normalizedBaseUrl = apiBaseUrl.endsWith('/')
        ? apiBaseUrl.substring(0, apiBaseUrl.length - 1)
        : apiBaseUrl;
    return Uri.parse('$normalizedBaseUrl/$normalizedPath');
  }

  /// Nom de l'application
  static const String appName = 'BlueVector';

  /// Version de l'application
  static const String appVersion = '1.0.0';

  /// Intervalle de mise à jour GPS en secondes
  static const int gpsUpdateIntervalSeconds = 15;

  /// Qualité de compression des photos (0-100)
  static const int photoQuality = 85;

  /// Mode debug (true = logs détaillés)
  static const bool debugMode = false;
}
