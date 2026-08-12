import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/config.dart';
import 'auth_service.dart';

class TechnicianStockService {
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
    return 'Erreur de communication avec BlueVector';
  }

  static Future<List<Map<String, dynamic>>> getCustody() async {
    final token = await _token();
    final response = await http
        .get(
          AppConfig.apiUri('tech/jobs/stock-v2'),
          headers: _headers(token),
        )
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode != 200) {
      throw Exception(_detail(response));
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! List) return const [];
    return decoded
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
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
