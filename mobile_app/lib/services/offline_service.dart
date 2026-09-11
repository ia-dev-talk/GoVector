import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/config.dart';
import '../features/sync/technician_outbox_event.dart';
import '../features/sync/technician_attachment.dart';
import '../models/job.dart';
import 'auth_service.dart';
import 'technician_legacy_outbox_migrator.dart';
import 'technician_attachment_store.dart';
import 'technician_media_service.dart';
import 'technician_outbox_store.dart';
import 'technician_sync_service.dart';

typedef SyncResult = TechnicianSyncRunResult;

class OfflineService {
  static const String _jobsCacheKeyPrefix = "offline_jobs_cache";
  static const String _lastSyncKeyPrefix = "offline_last_sync";
  static final TechnicianOutboxStore _outboxStore = TechnicianOutboxStore();
  static final TechnicianAttachmentStore _attachmentStore =
      TechnicianAttachmentStore();
  static const TechnicianLegacyOutboxMigrator _legacyMigrator =
      TechnicianLegacyOutboxMigrator();

  static TechnicianMediaService _mediaServiceForRole(String? role) {
    final endpoint = role == MobileFieldRole.fieldAgent
        ? AppConfig.apiUri('orienteur-agent/media')
        : AppConfig.apiUri('tech/media');
    return TechnicianMediaService(
      attachmentStore: _attachmentStore,
      outboxStore: _outboxStore,
      endpoint: endpoint,
      tokenProvider: AuthService.getToken,
    );
  }

  static TechnicianSyncService _syncServiceForRole(String? role) {
    final endpoint = role == MobileFieldRole.fieldAgent
        ? AppConfig.apiUri('orienteur-agent/sync')
        : AppConfig.apiUri('tech/sync');
    return TechnicianSyncService(
      store: _outboxStore,
      endpoint: endpoint,
      tokenProvider: AuthService.getToken,
      // syncPendingActions already probes the real GoVector backend once before
      // media upload. A second /health round-trip here only delayed every sync.
      onlineProbe: () async => true,
      onAcknowledgedBatch: _recordLastSync,
    );
  }

  // ── GESTION DU CACHE LOCAL ──

  static Future<void> cacheJobs(
    List<Job> jobs, {
    int? ownerUserId,
    int? technicianId,
  }) async {
    try {
      final owner = await _cacheOwner(ownerUserId, technicianId);
      if (owner == null) return;
      final prefs = await SharedPreferences.getInstance();
      final jsonList = jobs.map((j) => j.toJson()).toList();
      await prefs.setString(_jobsCacheKey(owner), jsonEncode(jsonList));
    } catch (_) {
      // A cache write failure must not interrupt the live jobs response.
    }
  }

  static Future<List<Job>> getCachedJobs({
    int? ownerUserId,
    int? technicianId,
  }) async {
    try {
      final owner = await _cacheOwner(ownerUserId, technicianId);
      if (owner == null) return [];
      final prefs = await SharedPreferences.getInstance();
      final json = prefs.getString(_jobsCacheKey(owner));
      if (json == null || json.isEmpty) return [];
      final List data = jsonDecode(json);
      return data.map((e) => Job.fromJson(e)).toList();
    } catch (_) {
      return [];
    }
  }

  /// Verify that the actual GoVector backend is reachable. Generic Internet
  /// access is insufficient for the field pilot. Keep this probe short: it is
  /// only a routing hint, never a reason to freeze the field UI.
  static Future<bool> isOnline({http.Client? client}) async {
    final requestClient = client ?? http.Client();
    try {
      final response = await requestClient
          .get(AppConfig.healthUri)
          .timeout(const Duration(seconds: 3));
      return response.statusCode == 200;
    } on TimeoutException {
      return false;
    } on http.ClientException {
      return false;
    } catch (_) {
      return false;
    } finally {
      if (client == null) requestClient.close();
    }
  }

  // ── OUTBOX TERRAIN V2 (TECHNICIEN + AGENT) ──

  static Future<TechnicianOutboxEvent> addPendingAction({
    required String action,
    required Map<String, dynamic> data,
    TechnicianOutboxStatus status = TechnicianOutboxStatus.pending,
    String? eventId,
  }) async {
    final owner = await _currentOwner();
    if (owner == null) throw StateError('Session terrain absente');
    await _migrateLegacy(owner);

    final rawJobId = data['job_id'];
    final jobId = rawJobId is int ? rawJobId : int.tryParse('$rawJobId');
    if (jobId == null || jobId <= 0) {
      throw ArgumentError.value(rawJobId, 'data.job_id', 'Job invalide');
    }
    final payload = Map<String, dynamic>.from(data)..remove('job_id');
    return _outboxStore.enqueue(
      owner: owner,
      jobId: jobId,
      type: action,
      payload: payload,
      status: status,
      eventId: eventId,
    );
  }

  static Future<List<Map<String, dynamic>>> getPendingActions() async {
    final owner = await _currentOwner();
    if (owner == null) return [];
    await _migrateLegacy(owner);
    final events = await _outboxStore.nonAcknowledgedForOwner(owner);
    return events.map((event) => event.toLegacyCompatibleMap()).toList();
  }

  static Future<int> getPendingCount() async {
    final owner = await _currentOwner();
    if (owner == null) return 0;
    await _migrateLegacy(owner);
    return _outboxStore.nonAcknowledgedCount(owner);
  }

  static Future<TechnicianAttachment> addPendingMedia({
    required int jobId,
    required String sourcePath,
    required String kind,
    required String eventType,
    required String mimeType,
    Map<String, dynamic> metadata = const {},
  }) async {
    final owner = await _currentOwner();
    if (owner == null) throw StateError('Session terrain absente');
    final role = await AuthService.getRole();
    return _mediaServiceForRole(role).queueFile(
      owner: owner,
      jobId: jobId,
      sourcePath: sourcePath,
      kind: kind,
      eventType: eventType,
      mimeType: mimeType,
      metadata: metadata,
    );
  }

  static Future<TechnicianOutboxSummary> getOutboxSummary() async {
    final owner = await _currentOwner();
    if (owner == null) {
      return const TechnicianOutboxSummary(toSynchronize: 0, toReview: 0);
    }
    await _migrateLegacy(owner);
    return _outboxStore.summaryForOwner(owner);
  }

  static Future<List<TechnicianOutboxEvent>> getPendingEventsForJob(
    int jobId,
  ) async {
    final owner = await _currentOwner();
    if (owner == null) return [];
    await _migrateLegacy(owner);
    return _outboxStore.nonAcknowledgedForJob(owner, jobId);
  }

  static Future<TechnicianOutboxEvent?> getAction(String eventId) async {
    final owner = await _currentOwner();
    if (owner == null) return null;
    return _outboxStore.eventForOwner(owner, eventId);
  }

  static Future<SyncResult> syncPendingActions() async {
    final owner = await _currentOwner();
    if (owner == null) {
      return const TechnicianSyncRunResult(
        synced: 0,
        failed: 0,
        total: 0,
        error: 'Session terrain absente',
      );
    }
    await _migrateLegacy(owner);
    await _outboxStore.requeueNowSupportedLegacyEvents(owner);
    if (!await isOnline()) {
      return const TechnicianSyncRunResult(
        synced: 0,
        failed: 0,
        total: 0,
        offline: true,
      );
    }
    final role = await AuthService.getRole();
    final media = await _mediaServiceForRole(role).sync(owner);
    final events = await _syncServiceForRole(role).sync(owner);
    return TechnicianSyncRunResult(
      synced: media.synced + events.synced,
      failed: media.failed + events.failed,
      total: media.synced + media.failed + events.total,
      offline: events.offline,
      error: events.error,
    );
  }

  /// The outbox storage model predates Agent mobile support and calls its local
  /// namespace key `technicianId`. For an Agent we intentionally store the
  /// positive orienteur/team id in that local-only slot. It is never sent as
  /// an assigned technician id; server-side Agent sync resolves the real
  /// subject technician from the current team assignment.
  static Future<TechnicianOutboxOwner?> _currentOwner() async {
    final userId = await AuthService.getUserId();
    final role = await AuthService.getRole();
    if (userId == null || userId <= 0 || role == null) return null;
    final scopeId = role == MobileFieldRole.fieldAgent
        ? await AuthService.getOrienteurId()
        : await AuthService.getTechnicianId();
    if (scopeId == null || scopeId <= 0) return null;
    return TechnicianOutboxOwner(userId: userId, technicianId: scopeId);
  }

  static String _jobsCacheKey(TechnicianOutboxOwner owner) =>
      '$_jobsCacheKeyPrefix:${owner.userId}:${owner.technicianId}';

  static String _lastSyncKey(TechnicianOutboxOwner owner) =>
      '$_lastSyncKeyPrefix:${owner.userId}:${owner.technicianId}';

  static Future<TechnicianOutboxOwner?> _cacheOwner(
    int? ownerUserId,
    int? technicianId,
  ) async {
    final userId = ownerUserId ?? await AuthService.getUserId();
    var scopeId = technicianId;
    if (scopeId == null) {
      final role = await AuthService.getRole();
      scopeId = role == MobileFieldRole.fieldAgent
          ? await AuthService.getOrienteurId()
          : await AuthService.getTechnicianId();
    }
    if (userId == null || userId <= 0 || scopeId == null || scopeId <= 0) {
      return null;
    }
    return TechnicianOutboxOwner(userId: userId, technicianId: scopeId);
  }

  static Future<void> _migrateLegacy(TechnicianOutboxOwner owner) async {
    // Legacy pending actions belong to the technician-only app. Never migrate
    // them into an Agent account after an account switch on the same tablet.
    if (await AuthService.getRole() == MobileFieldRole.fieldAgent) return;
    final preferences = await SharedPreferences.getInstance();
    final legacy = preferences.getStringList(
      TechnicianLegacyOutboxMigrator.legacyPendingActionsKey,
    );
    if (legacy == null || legacy.isEmpty) return;

    final cachedJobs = await getCachedJobs(
      ownerUserId: owner.userId,
      technicianId: owner.technicianId,
    );
    final assignedJobIds = cachedJobs
        .where((job) => job.assignedTechId == owner.technicianId)
        .map((job) => job.id)
        .toSet();
    await _legacyMigrator.migrate(
      preferences: preferences,
      store: _outboxStore,
      owner: owner,
      assignedJobIds: assignedJobIds,
    );
  }

  static Future<void> _recordLastSync() async {
    final owner = await _currentOwner();
    if (owner == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _lastSyncKey(owner),
      DateTime.now().toIso8601String(),
    );
  }

  static Future<DateTime?> getLastSync() async {
    try {
      final owner = await _currentOwner();
      if (owner == null) return null;
      final prefs = await SharedPreferences.getInstance();
      final lastSync = prefs.getString(_lastSyncKey(owner));
      if (lastSync == null) return null;
      return DateTime.parse(lastSync);
    } catch (_) {
      return null;
    }
  }
}
