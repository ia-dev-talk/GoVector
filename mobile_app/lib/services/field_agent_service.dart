import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/config.dart';
import '../models/job.dart';
import 'auth_service.dart';

class FieldAgentJobContext {
  const FieldAgentJobContext({
    required this.job,
    required this.technicianId,
    required this.technicianName,
    this.employeeId,
    this.teamId,
  });

  final Job job;
  final int technicianId;
  final String technicianName;
  final String? employeeId;
  final int? teamId;

  factory FieldAgentJobContext.fromJson(Map<String, dynamic> json) {
    final rawJob = json['job'];
    final rawTech = json['assigned_technician'];
    if (rawJob is! Map || rawTech is! Map) {
      throw const FormatException('Dossier Agent invalide');
    }
    final tech = Map<String, dynamic>.from(rawTech);
    final technicianId = int.tryParse('${tech['id'] ?? ''}');
    if (technicianId == null || technicianId <= 0) {
      throw const FormatException('Technicien affecté invalide');
    }
    return FieldAgentJobContext(
      job: Job.fromJson(Map<String, dynamic>.from(rawJob)),
      technicianId: technicianId,
      technicianName: tech['name']?.toString().trim().isNotEmpty == true
          ? tech['name'].toString().trim()
          : 'Technicien #$technicianId',
      employeeId: tech['employee_id']?.toString(),
      teamId: int.tryParse('${tech['team_id'] ?? ''}'),
    );
  }
}

class FieldAgentService {
  static Future<Map<String, String>> _headers() async {
    final token = await AuthService.getToken();
    if (token == null) throw StateError('Session Agent expirée');
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  static String _detail(http.Response response) {
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map) {
        return decoded['detail']?.toString() ??
            decoded['message']?.toString() ??
            'Erreur GoVector';
      }
    } catch (_) {}
    return 'Erreur GoVector (${response.statusCode})';
  }

  static Future<List<FieldAgentJobContext>> getMyTeamJobs({
    http.Client? client,
  }) async {
    final requestClient = client ?? http.Client();
    try {
      final response = await requestClient
          .get(
            AppConfig.apiUri('orienteur-agent/me/jobs'),
            headers: await _headers(),
          )
          .timeout(AppConfig.httpTimeout);
      if (response.statusCode != 200) throw Exception(_detail(response));
      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('Réponse Agent invalide');
      }
      final jobs = decoded['jobs'];
      if (jobs is! List) return const [];
      return jobs
          .whereType<Map>()
          .map((row) => FieldAgentJobContext.fromJson(Map<String, dynamic>.from(row)))
          .toList(growable: false);
    } finally {
      if (client == null) requestClient.close();
    }
  }

  static Future<Map<String, dynamic>> getFieldRecord(int jobId) async {
    final response = await http
        .get(
          AppConfig.apiUri('orienteur-agent/me/jobs/$jobId/field-record'),
          headers: await _headers(),
        )
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode != 200) throw Exception(_detail(response));
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Dossier terrain invalide');
    }
    return decoded;
  }

  static Future<Map<String, dynamic>> getStockContext(int jobId) async {
    final response = await http
        .get(
          AppConfig.apiUri('orienteur-agent/me/jobs/$jobId/stock-context'),
          headers: await _headers(),
        )
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode != 200) throw Exception(_detail(response));
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Contexte stock invalide');
    }
    return decoded;
  }

  static Future<void> returnForCorrection({
    required int jobId,
    required String reason,
  }) async {
    final normalized = reason.trim();
    if (normalized.isEmpty) throw ArgumentError('Le motif est obligatoire');
    final response = await http
        .post(
          AppConfig.apiUri('orienteur-agent/me/jobs/$jobId/return'),
          headers: await _headers(),
          body: jsonEncode({'reason': normalized}),
        )
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode != 200) throw Exception(_detail(response));
  }

  static Future<void> validateAndClose(int jobId) async {
    final response = await http
        .post(
          AppConfig.apiUri('orienteur-agent/me/jobs/$jobId/validate'),
          headers: await _headers(),
        )
        .timeout(AppConfig.httpTimeout);
    if (response.statusCode != 200) throw Exception(_detail(response));
  }
}
