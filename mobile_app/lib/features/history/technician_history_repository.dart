import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../../config/config.dart';
import '../../services/auth_service.dart';
import 'technician_history_models.dart';

class TechnicianHistoryHttpException implements Exception {
  const TechnicianHistoryHttpException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => message;
}

class TechnicianHistoryRepository {
  const TechnicianHistoryRepository({this.client});

  final http.Client? client;

  Future<CachedHistory<TechnicianHistoryPage>> loadPersonal({
    required int ownerUserId,
    required int technicianId,
    int page = 1,
    int pageSize = 20,
    String? status,
    String? search,
  }) {
    final query = <String, String>{
      'page': '$page',
      'page_size': '$pageSize',
      if (status != null && status.isNotEmpty) 'status': status,
      if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
    };
    final scope = _scope(ownerUserId, technicianId);
    final cacheKey = 'history_personal_v1_${scope}_${_queryKey(query)}';
    return _load(
      uri: AppConfig.apiUri('tech/history').replace(queryParameters: query),
      cacheKey: cacheKey,
      decode: TechnicianHistoryPage.fromJson,
    );
  }

  Future<CachedHistory<TechnicianHistoryPage>> loadSite({
    required int ownerUserId,
    required int technicianId,
    required int jobId,
    int page = 1,
    int pageSize = 20,
  }) {
    final query = {'page': '$page', 'page_size': '$pageSize'};
    final cacheKey =
        'history_site_v1_${_scope(ownerUserId, technicianId)}_${jobId}_${_queryKey(query)}';
    return _load(
      uri: AppConfig.apiUri(
        'tech/jobs/$jobId/site-history',
      ).replace(queryParameters: query),
      cacheKey: cacheKey,
      decode: TechnicianHistoryPage.fromJson,
    );
  }

  Future<CachedHistory<TechnicianHistoryDetail>> loadDetail({
    required int ownerUserId,
    required int technicianId,
    required int historicalJobId,
    int? currentSiteJobId,
  }) {
    final scope = _scope(ownerUserId, technicianId);
    final endpoint = currentSiteJobId == null
        ? 'tech/history/$historicalJobId'
        : 'tech/jobs/$currentSiteJobId/site-history/$historicalJobId';
    final cacheKey = currentSiteJobId == null
        ? 'history_detail_v1_${scope}_$historicalJobId'
        : 'history_site_detail_v1_${scope}_${currentSiteJobId}_$historicalJobId';
    return _load(
      uri: AppConfig.apiUri(endpoint),
      cacheKey: cacheKey,
      decode: TechnicianHistoryDetail.fromJson,
    );
  }

  Future<CachedHistory<T>> _load<T>({
    required Uri uri,
    required String cacheKey,
    required T Function(Map<String, dynamic>) decode,
  }) async {
    try {
      final response = await _get(uri);
      if (response.statusCode != 200) {
        throw TechnicianHistoryHttpException(
          response.statusCode,
          _errorDetail(response.body),
        );
      }
      final raw = jsonDecode(response.body) as Map<String, dynamic>;
      final now = DateTime.now().toUtc();
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        cacheKey,
        jsonEncode({'updated_at': now.toIso8601String(), 'data': raw}),
      );
      return CachedHistory(
        value: decode(raw),
        fromCache: false,
        lastUpdated: now,
      );
    } catch (error) {
      if (error is TechnicianHistoryHttpException && error.statusCode < 500) {
        rethrow;
      }
      final prefs = await SharedPreferences.getInstance();
      final cached = prefs.getString(cacheKey);
      if (cached == null) rethrow;
      final envelope = jsonDecode(cached) as Map<String, dynamic>;
      final updatedAt = DateTime.parse(envelope['updated_at'] as String);
      return CachedHistory(
        value: decode(envelope['data'] as Map<String, dynamic>),
        fromCache: true,
        lastUpdated: updatedAt,
      );
    }
  }

  Future<http.Response> _get(Uri uri) async {
    final token = await AuthService.getToken();
    if (token == null || token.isEmpty) {
      throw Exception('Session technicien expirée.');
    }
    final requestClient = client ?? http.Client();
    try {
      return await requestClient
          .get(uri, headers: {'Authorization': 'Bearer $token'})
          .timeout(AppConfig.httpTimeout);
    } finally {
      if (client == null) requestClient.close();
    }
  }

  String _scope(int ownerUserId, int technicianId) {
    return 'u${ownerUserId}_t$technicianId';
  }

  String _queryKey(Map<String, String> query) {
    final sorted = query.entries.toList()
      ..sort((left, right) => left.key.compareTo(right.key));
    return base64Url.encode(
      utf8.encode(
        sorted.map((entry) => '${entry.key}=${entry.value}').join('&'),
      ),
    );
  }

  String _errorDetail(String body) {
    try {
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      return decoded['detail']?.toString() ?? 'Historique indisponible.';
    } catch (_) {
      return 'Historique indisponible.';
    }
  }
}
