/// Service d'intervention pour le mobile.
/// Encapsule les appels API vers les nouvelles routes Sprint 2.
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../services/auth_service.dart';
import '../config/config.dart';
import 'offline_service.dart';
import '../features/interventions/workflow_capabilities.dart';

class InterventionService {
  /// Récupérer le token JWT
  static Future<String?> _getToken() async {
    return await AuthService.getToken();
  }

  static Map<String, String> _headers(String token) => {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $token',
  };

  /// POST /{job_id}/status — Transition de statut avec logging
  static Future<Map<String, dynamic>> updateStatus({
    required int jobId,
    required String newStatus,
    double? latitude,
    double? longitude,
    double? accuracy,
    String? comment,
  }) async {
    final token = await _getToken();
    if (token == null) throw Exception('Token manquant');

    final response = await http
        .post(
          AppConfig.apiUri('tech/jobs/$jobId/status'),
          headers: _headers(token),
          body: jsonEncode({
            'new_status': newStatus,
            if (latitude != null) 'latitude': latitude,
            if (longitude != null) 'longitude': longitude,
            if (accuracy != null) 'accuracy': accuracy,
            if (comment != null) 'comment': comment,
          }),
        )
        .timeout(AppConfig.httpTimeout);

    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    final detail = _extractDetail(response.body);
    throw Exception(detail);
  }

  /// POST /{job_id}/start — commande atomique d'acceptation/démarrage.
  static Future<Map<String, dynamic>> startJob({
    required int jobId,
    double? latitude,
    double? longitude,
    double? accuracy,
    String? comment,
    http.Client? client,
  }) async {
    final token = await _getToken();
    if (token == null) throw Exception('Token manquant');
    final requestClient = client ?? http.Client();

    try {
      final response = await requestClient
          .post(
            AppConfig.apiUri('tech/jobs/$jobId/start'),
            headers: _headers(token),
            body: jsonEncode({
              'new_status': 'en_route',
              if (latitude != null) 'latitude': latitude,
              if (longitude != null) 'longitude': longitude,
              if (accuracy != null) 'accuracy': accuracy,
              if (comment != null) 'comment': comment,
            }),
          )
          .timeout(AppConfig.httpTimeout);

      if (response.statusCode == 200) {
        return jsonDecode(response.body) as Map<String, dynamic>;
      }
      final detail = _extractDetail(response.body);
      throw Exception(detail);
    } finally {
      if (client == null) {
        requestClient.close();
      }
    }
  }

  /// POST /{job_id}/failure — Déclaration d'échec
  static Future<Map<String, dynamic>> declareFailure({
    required int jobId,
    required String reason,
    String? comment,
    double? latitude,
    double? longitude,
    double? accuracy,
  }) async {
    final token = await _getToken();
    if (token == null) throw Exception('Token manquant');

    final response = await http
        .post(
          AppConfig.apiUri('tech/jobs/$jobId/failure'),
          headers: _headers(token),
          body: jsonEncode({
            'reason': reason,
            if (comment != null) 'comment': comment,
            if (latitude != null) 'latitude': latitude,
            if (longitude != null) 'longitude': longitude,
            if (accuracy != null) 'accuracy': accuracy,
          }),
        )
        .timeout(AppConfig.httpTimeout);

    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    final detail = _extractDetail(response.body);
    throw Exception(detail);
  }

  /// POST /{job_id}/postpone — Demande de report
  static Future<Map<String, dynamic>> postponeJob({
    required int jobId,
    required String reason,
    String? comment,
    String? requestedDate,
  }) async {
    final token = await _getToken();
    if (token == null) throw Exception('Token manquant');

    final response = await http
        .post(
          AppConfig.apiUri('tech/jobs/$jobId/postpone'),
          headers: _headers(token),
          body: jsonEncode({
            'reason': reason,
            if (comment != null) 'comment': comment,
            if (requestedDate != null) 'requested_date': requestedDate,
          }),
        )
        .timeout(AppConfig.httpTimeout);

    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    final detail = _extractDetail(response.body);
    throw Exception(detail);
  }

  /// GET /{job_id}/activity-log — Récupérer le journal d'activité
  static Future<List<Map<String, dynamic>>> getActivityLog({
    required int jobId,
  }) async {
    final token = await _getToken();
    if (token == null) throw Exception('Token manquant');

    final response = await http
        .get(
          AppConfig.apiUri('tech/jobs/$jobId/activity-log'),
          headers: _headers(token),
        )
        .timeout(AppConfig.httpTimeout);

    if (response.statusCode == 200) {
      final List<dynamic> data = jsonDecode(response.body);
      return data.cast<Map<String, dynamic>>();
    }
    final detail = _extractDetail(response.body);
    throw Exception(detail);
  }

  /// GET /{job_id}/completion-requirements — Politique effective de clôture.
  static Future<Map<String, dynamic>> getCompletionRequirements({
    required int jobId,
  }) async {
    final token = await _getToken();
    if (token == null) throw Exception('Token manquant');

    final response = await http
        .get(
          AppConfig.apiUri('tech/jobs/$jobId/completion-requirements'),
          headers: _headers(token),
        )
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    throw Exception(_extractDetail(response.body));
  }

  /// Dossier partagé bureau/terrain : instructions, plans et repères GPS.
  static Future<Map<String, dynamic>> getFieldRecord({required int jobId}) async {
    final token = await _getToken();
    if (token == null) throw Exception('Token manquant');
    final response = await http
        .get(
          AppConfig.apiUri('job-actions/$jobId/field-record'),
          headers: _headers(token),
        )
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    throw Exception(_extractDetail(response.body));
  }

  /// Governed presentation shared by office and field clients.
  static Future<Map<String, dynamic>> getBusinessCatalog() async {
    final token = await _getToken();
    if (token == null) throw Exception('Token manquant');
    final response = await http
        .get(
          AppConfig.apiUri('settings/catalog'),
          headers: _headers(token),
        )
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    throw Exception(_extractDetail(response.body));
  }

  static Future<http.Response> downloadOfficeAttachment({
    required int jobId,
    required String attachmentId,
  }) async {
    final token = await _getToken();
    if (token == null) throw Exception('Token manquant');
    final response = await http
        .get(
          AppConfig.apiUri(
            'job-actions/$jobId/attachments/$attachmentId/download',
          ),
          headers: {'Authorization': 'Bearer $token'},
        )
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode != 200) {
      throw Exception(_extractDetail(response.body));
    }
    return response;
  }

  static Future<http.Response> downloadTechnicianMedia({
    required int jobId,
    required String mediaId,
  }) async {
    final token = await _getToken();
    if (token == null) throw Exception('Token manquant');
    final response = await http
        .get(
          AppConfig.apiUri('job-actions/$jobId/media/$mediaId/download'),
          headers: {'Authorization': 'Bearer $token'},
        )
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode != 200) {
      throw Exception(_extractDetail(response.body));
    }
    return response;
  }

  static Future<JobWorkflowCapabilities> getWorkflowCapabilities({
    required int jobId,
  }) async {
    final token = await _getToken();
    if (token == null) throw Exception('Token manquant');

    final response = await http
        .get(
          AppConfig.apiUri('workflow/jobs/$jobId/capabilities'),
          headers: _headers(token),
        )
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode == 200) {
      return JobWorkflowCapabilities.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>,
      );
    }
    throw Exception(_extractDetail(response.body));
  }

  /// PATCH /{job_id}/field-data — Sauvegarde progressive des données terrain
  static Future<Map<String, dynamic>> saveFieldData({
    required int jobId,
    required Map<String, dynamic> fieldData,
  }) async {
    final token = await _getToken();
    if (token == null) throw Exception('Token manquant');

    final response = await http
        .patch(
          AppConfig.apiUri('tech/jobs/$jobId/field-data'),
          headers: _headers(token),
          body: jsonEncode(fieldData),
        )
        .timeout(AppConfig.httpTimeout);

    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    final detail = _extractDetail(response.body);
    throw Exception(detail);
  }

  /// Enqueue d'abord la clôture, puis tente le batch technicien immédiatement.
  static Future<Map<String, dynamic>> terminateJob({
    required int jobId,
    required Map<String, dynamic> payload,
  }) async {
    final queued = await OfflineService.addPendingAction(
      action: 'complete_job',
      data: {'job_id': jobId, ...payload},
    );
    await OfflineService.syncPendingActions();
    final persisted = await OfflineService.getAction(queued.eventId);
    final status = persisted?.status.name ?? 'retryable';
    if (status == 'conflict' || status == 'rejected') {
      throw Exception(persisted?.lastError ?? 'Clôture refusée');
    }
    return {
      'event_id': queued.eventId,
      'status': status,
      'queued': status != 'acknowledged',
    };
  }

  /// GET /{job_id}/stock — Récupérer le matériel / stock associé au job
  static Future<List<Map<String, dynamic>>> getJobStock({
    required int jobId,
  }) async {
    final token = await _getToken();
    if (token == null) throw Exception('Token manquant');

    final response = await http
        .get(
          AppConfig.apiUri('tech/jobs/$jobId/stock'),
          headers: _headers(token),
        )
        .timeout(AppConfig.httpTimeout);

    if (response.statusCode == 200) {
      final List<dynamic> data = jsonDecode(response.body);
      return data.cast<Map<String, dynamic>>();
    }
    final detail = _extractDetail(response.body);
    throw Exception(detail);
  }

  /// POST /{job_id}/stock/consume — Déclarer l'utilisation d'équipements/matériel
  static Future<Map<String, dynamic>> consumeJobStock({
    required int jobId,
    required List<Map<String, dynamic>> items,
  }) async {
    final token = await _getToken();
    if (token == null) throw Exception('Token manquant');

    final response = await http
        .post(
          AppConfig.apiUri('tech/jobs/$jobId/stock/consume'),
          headers: _headers(token),
          body: jsonEncode({'items': items}),
        )
        .timeout(AppConfig.httpTimeout);

    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    final detail = _extractDetail(response.body);
    throw Exception(detail);
  }

  /// Extraire le message d'erreur détaillé depuis la réponse
  static String _extractDetail(String body) {
    try {
      final data = jsonDecode(body);
      if (data is Map<String, dynamic>) {
        return data['message']?.toString() ??
            data['detail']?.toString() ??
            'Erreur inconnue';
      }
      return 'Erreur de communication avec le serveur';
    } catch (_) {
      return 'Erreur de communication avec le serveur';
    }
  }
}
