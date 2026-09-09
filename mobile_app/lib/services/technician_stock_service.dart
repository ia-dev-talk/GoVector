import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/config.dart';
import 'auth_service.dart';

class TechnicianStockService {
  static const String materialCustodyPath = 'tech/jobs/stock-v2';
  static const String cableCataloguePath = 'tech/jobs/stock-v2/cables';
  static const String stockHistoryPath = 'tech/jobs/stock-v2/history';
  static const String serializedCustodyPath = 'tech/jobs/stock-v2/serialized';

  static const _materialCustodyCachePrefix =
      'govector:technician-custody:v2';
  static const _cableCatalogueCachePrefix =
      'govector:technician-cables:v1';
  static const _stockHistoryCachePrefix =
      'govector:technician-stock-history:v1';
  static const _serializedCustodyCachePrefix =
      'govector:technician-serialized-custody:v2';

  static Future<String> _token() async {
    final token = await AuthService.getToken();
    if (token == null || token.isEmpty) {
      throw Exception('Session technicien manquante');
    }
    return token;
  }

  static Map<String, String> _headers(String token) => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      };

  static String _detail(http.Response response) {
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) {
        final detail = decoded['detail'];
        if (detail is Map<String, dynamic>) {
          return detail['message']?.toString() ??
              detail['code']?.toString() ??
              'Action refusée';
        }
        return detail?.toString() ??
            decoded['message']?.toString() ??
            'Action refusée';
      }
    } catch (_) {}
    return 'Erreur de communication avec GoVector';
  }

  static String _cacheKey(String prefix, String token) {
    final sessionFingerprint = sha256
        .convert(utf8.encode(token))
        .toString()
        .substring(0, 20);
    return '$prefix:$sessionFingerprint';
  }

  static List<Map<String, dynamic>> _decodeRows(String raw) {
    final decoded = jsonDecode(raw);
    if (decoded is! List) return const [];
    return decoded
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }

  static Future<void> _cacheRows(
    String prefix,
    String token,
    List<Map<String, dynamic>> rows,
  ) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      _cacheKey(prefix, token),
      jsonEncode(rows),
    );
  }

  static Future<List<Map<String, dynamic>>?> _cachedRows(
    String prefix,
    String token,
  ) async {
    final preferences = await SharedPreferences.getInstance();
    final key = _cacheKey(prefix, token);
    final cached = preferences.getString(key);
    if (cached == null || cached.trim().isEmpty) return null;
    try {
      return _decodeRows(cached);
    } catch (_) {
      await preferences.remove(key);
      return null;
    }
  }

  static bool canUseCustodyCacheForStatus(int statusCode) {
    return statusCode == 408 || statusCode == 429 || statusCode >= 500;
  }

  static Future<List<Map<String, dynamic>>> _fallbackRows(
    String prefix,
    String token,
    Object error,
  ) async {
    final cached = await _cachedRows(prefix, token);
    if (cached != null) return cached;
    throw error;
  }

  static Future<List<Map<String, dynamic>>> _getCustodyRows({
    required String path,
    required String cachePrefix,
  }) async {
    final token = await _token();
    late final http.Response response;

    try {
      response = await http
          .get(
            AppConfig.apiUri(path),
            headers: _headers(token),
          )
          .timeout(AppConfig.httpTimeout);
    } catch (error) {
      return _fallbackRows(cachePrefix, token, error);
    }

    if (response.statusCode != 200) {
      final error = Exception(_detail(response));
      if (canUseCustodyCacheForStatus(response.statusCode)) {
        return _fallbackRows(cachePrefix, token, error);
      }
      throw error;
    }

    try {
      final rows = _decodeRows(response.body);
      await _cacheRows(cachePrefix, token, rows);
      return rows;
    } catch (error) {
      return _fallbackRows(cachePrefix, token, error);
    }
  }

  static Future<List<Map<String, dynamic>>> getCustody() {
    return _getCustodyRows(
      path: materialCustodyPath,
      cachePrefix: _materialCustodyCachePrefix,
    );
  }

  /// Governed cable references visible even when known technician stock is 0.
  /// This is the field truth path: a real measured cable use must not disappear
  /// merely because its prior allocation was missing from the system.
  static Future<List<Map<String, dynamic>>> getCableCatalogue() {
    return _getCustodyRows(
      path: cableCataloguePath,
      cachePrefix: _cableCatalogueCachePrefix,
    );
  }

  static Future<List<Map<String, dynamic>>> getStockHistory() {
    return _getCustodyRows(
      path: '$stockHistoryPath?limit=100',
      cachePrefix: _stockHistoryCachePrefix,
    );
  }

  static Future<List<Map<String, dynamic>>> getSerializedCustody() {
    return _getCustodyRows(
      path: serializedCustodyPath,
      cachePrefix: _serializedCustodyCachePrefix,
    );
  }

  static Future<Map<String, dynamic>> resolveScan({
    required int jobId,
    required String code,
  }) async {
    final token = await _token();
    final response = await http
        .post(
          AppConfig.apiUri('tech/jobs/scan/resolve'),
          headers: _headers(token),
          body: jsonEncode({'job_id': jobId, 'code': code}),
        )
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode != 200) {
      throw Exception(_detail(response));
    }
    return Map<String, dynamic>.from(jsonDecode(response.body) as Map);
  }
}
