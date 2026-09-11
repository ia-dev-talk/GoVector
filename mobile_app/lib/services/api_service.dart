import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/config.dart';
import '../models/job.dart';
import '../models/incident.dart';
import '../models/equipment.dart';
import 'auth_service.dart';

class ApiService {
  // Reuse the connection for the hot technician jobs path. Reopening a client
  // for every refresh wastes time on mobile networks and local Wi-Fi alike.
  static final http.Client _jobsClient = http.Client();

  /// Helper pour ajouter le header Authorization Bearer
  static Future<Map<String, String>> _authHeaders({
    Map<String, String>? extra,
  }) async {
    final token = await AuthService.getToken();
    final headers = <String, String>{"Content-Type": "application/json"};
    if (token != null && token.isNotEmpty) {
      headers["Authorization"] = "Bearer $token";
    }
    if (extra != null) {
      headers.addAll(extra);
    }
    return headers;
  }

  /// Récupérer le statut du technicien depuis le backend
  /// Appelle GET /api/v1/technicians/moi
  static Future<String?> getTechnicianStatus() async {
    final headers = await _authHeaders();
    final response = await http
        .get(AppConfig.apiUri('technicians/me'), headers: headers)
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      return data['status'] as String?;
    }
    return null;
  }

  /// Récupérer le stock depuis /api/v1/stock (EquipmentInventory)
  /// Retourne directement les Map JSON car le StockScreen utilise des Map
  static Future<List<Map<String, dynamic>>> getStock() async {
    final headers = await _authHeaders();
    final response = await http
        .get(AppConfig.apiUri('stock'), headers: headers)
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode == 200) {
      final List<dynamic> data = jsonDecode(response.body);
      final result = <Map<String, dynamic>>[];
      for (final item in data) {
        item as Map<String, dynamic>;
        result.add(Map<String, dynamic>.from(item));
      }
      return result;
    }
    throw Exception("Erreur chargement stock: ${response.statusCode}");
  }

  /// Récupérer les alertes de stock
  static Future<List<dynamic>> getStockAlerts() async {
    final headers = await _authHeaders();
    final response = await http
        .get(AppConfig.apiUri('stock/alerts'), headers: headers)
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode == 200) {
      return jsonDecode(response.body) as List<dynamic>;
    }
    return [];
  }

  static Future<void> completeIntervention({
    required int jobId,
    required String comment,
    required double latitude,
    required double longitude,

    required String ontSerial,
    required String routerSerial,
    required String macAddress,

    required String nro,
    required String sro,
    required String pbo,
    required String splitter,
    required String splitterPort,
    required String pto,
    required String opticalPowerDbm,
    required String cableLengthM,

    File? beforePhoto,
    File? afterPhoto,
  }) async {
    final token = await AuthService.getToken();
    final request = http.MultipartRequest(
      "POST",
      AppConfig.apiUri('jobs/$jobId/complete'),
    );

    // Ajout du token JWT
    if (token != null && token.isNotEmpty) {
      request.headers["Authorization"] = "Bearer $token";
    }

    request.fields["comment"] = comment;
    request.fields["latitude"] = latitude.toString();
    request.fields["longitude"] = longitude.toString();

    request.fields["ont_serial"] = ontSerial;
    request.fields["router_serial"] = routerSerial;
    request.fields["mac_address"] = macAddress;

    request.fields["nro"] = nro;
    request.fields["sro"] = sro;
    request.fields["pbo"] = pbo;
    request.fields["splitter"] = splitter;
    request.fields["splitter_port"] = splitterPort;
    request.fields["pto"] = pto;
    request.fields["optical_power_dbm"] = opticalPowerDbm;
    request.fields["cable_length_m"] = cableLengthM;

    request.fields["gps_latitude"] = latitude.toString();
    request.fields["gps_longitude"] = longitude.toString();

    if (beforePhoto != null) {
      request.files.add(
        await http.MultipartFile.fromPath("before_photo", beforePhoto.path),
      );
    }

    if (afterPhoto != null) {
      request.files.add(
        await http.MultipartFile.fromPath("after_photo", afterPhoto.path),
      );
    }

    final response = await request.send().timeout(AppConfig.httpTimeout);

    final body = await response.stream.bytesToString().timeout(
      AppConfig.httpTimeout,
    );

    if (response.statusCode >= 400) {
      throw Exception(body);
    }
  }

  static Future<List<Job>> getJobs() async {
    final headers = await _authHeaders();
    final response = await http
        .get(AppConfig.apiUri('jobs/'), headers: headers)
        .timeout(AppConfig.httpTimeout);

    if (response.statusCode == 200) {
      final List data = jsonDecode(response.body);

      return data.map((e) => Job.fromJson(e)).toList();
    }

    // Si 401, le token a expiré
    if (response.statusCode == 401) {
      throw Exception('Token expiré');
    }

    return [];
  }

  /// Récupérer les jobs assignés au technicien connecté.
  ///
  /// This endpoint is the authoritative technician scope. Do not follow an
  /// empty successful response with the heavier /jobs/ collection: an empty
  /// assignment list is valid, and the old fallback doubled network and DB
  /// work precisely when the technician had nothing assigned.
  static Future<List<Job>> getMyJobs() async {
    final headers = await _authHeaders();
    final response = await _jobsClient
        .get(AppConfig.apiUri('jobs/my'), headers: headers)
        .timeout(const Duration(seconds: 8));
    if (response.statusCode == 200) {
      final List<dynamic> data = jsonDecode(response.body);
      return data.map((e) => Job.fromJson(e as Map<String, dynamic>)).toList();
    }
    if (response.statusCode == 401) {
      throw Exception('Token expiré');
    }
    throw Exception('Erreur chargement interventions: ${response.statusCode}');
  }

  static Future<void> completeJob(int id) async {
    final headers = await _authHeaders();
    await http
        .post(AppConfig.apiUri('jobs/$id/complete'), headers: headers)
        .timeout(AppConfig.httpTimeout);
  }

  static Future<void> updateLocation(int jobId) async {
    final headers = await _authHeaders();
    await http
        .patch(
          AppConfig.apiUri('interventions/$jobId/location'),
          headers: headers,
        )
        .timeout(AppConfig.httpTimeout);
  }

  static Future<void> saveComment(int jobId) async {
    final headers = await _authHeaders();
    await http
        .patch(
          AppConfig.apiUri('interventions/$jobId/comment'),
          headers: headers,
        )
        .timeout(AppConfig.httpTimeout);
  }

  static Future<void> updateJob({
    required int jobId,
    required Map<String, dynamic> data,
  }) async {
    final headers = await _authHeaders();
    await http
        .patch(
          AppConfig.apiUri('jobs/$jobId'),
          headers: headers,
          body: jsonEncode(data),
        )
        .timeout(AppConfig.httpTimeout);
  }

  static Future<List<Incident>> getIncidents({
    String? status,
    String? severity,
  }) async {
    final headers = await _authHeaders();
    final queryParams = <String, String>{};
    if (status != null) queryParams['status'] = status;
    if (severity != null) queryParams['severity'] = severity;

    final uri = AppConfig.apiUri(
      'incidents/',
    ).replace(queryParameters: queryParams.isEmpty ? null : queryParams);
    final response = await http
        .get(uri, headers: headers)
        .timeout(AppConfig.httpTimeout);

    if (response.statusCode == 200) {
      final List data = jsonDecode(response.body);
      return data.map((e) => Incident.fromJson(e)).toList();
    }
    return [];
  }

  static Future<Map<String, dynamic>> escalateIncident(int id) async {
    final headers = await _authHeaders();
    final response = await http
        .post(AppConfig.apiUri('incidents/$id/escalate'), headers: headers)
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    throw Exception("Erreur escalade incident: ${response.statusCode}");
  }

  static Future<Map<String, dynamic>> updateIncident(
    int id,
    Map<String, dynamic> data,
  ) async {
    final headers = await _authHeaders();
    final response = await http
        .patch(
          AppConfig.apiUri('incidents/$id'),
          headers: headers,
          body: jsonEncode(data),
        )
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    throw Exception("Erreur mise à jour incident: ${response.statusCode}");
  }

  static Future<Map<String, dynamic>> createIncident(
    Map<String, dynamic> data,
  ) async {
    final headers = await _authHeaders();
    final response = await http
        .post(
          AppConfig.apiUri('incidents/'),
          headers: headers,
          body: jsonEncode(data),
        )
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode == 200 || response.statusCode == 201) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    throw Exception("Erreur création incident: ${response.statusCode}");
  }
}
