import 'dart:async';
import 'dart:convert';
import 'dart:io';

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
  static final TechnicianMediaService _mediaService = TechnicianMediaService(
    attachmentStore: _attachmentStore,
    outboxStore: _outboxStore,
    endpoint: AppConfig.apiUri('tech/media'),
    tokenProvider: AuthService.getToken,
  );
  static const TechnicianLegacyOutboxMigrator _legacyMigrator =
      TechnicianLegacyOutboxMigrator();
  static final TechnicianSyncService _syncService = TechnicianSyncService(
    store: _outboxStore,
    endpoint: AppConfig.apiUri('tech/sync'),
    tokenProvider: AuthService.getToken,
    onlineProbe: isOnline,
    onAcknowledgedBatch: _recordLastSync,
  );

  // ── GESTION DU CACHE LOCAL ──

  /// Sauvegarder les jobs en cache local
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

  /// Récupérer les jobs depuis le cache local
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
    } catch (e) {
      return [];
    }
  }

  /// Vérifier la connectivité réseau
  static Future<bool> isOnline() async {
    try {
      final result = await InternetAddress.lookup(
        "google.com",
      ).timeout(const Duration(seconds: 3));
      return result.isNotEmpty && result[0].rawAddress.isNotEmpty;
    } on SocketException catch (_) {
      return false;
    } on TimeoutException catch (_) {
      return false;
    }
  }

  // ── OUTBOX TECHNICIEN V2 ──

  static Future<TechnicianOutboxEvent> addPendingAction({
    required String action,
    required Map<String, dynamic> data,
    TechnicianOutboxStatus status = TechnicianOutboxStatus.pending,
    String? eventId,
  }) async {
    final owner = await _currentOwner();
    if (owner == null) {
      throw StateError('Session technicien absente');
    }
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
    if (owner == null) {
      return [];
    }
    await _migrateLegacy(owner);
    final events = await _outboxStore.nonAcknowledgedForOwner(owner);
    return events.map((event) => event.toLegacyCompatibleMap()).toList();
  }

  static Future<int> getPendingCount() async {
    final owner = await _currentOwner();
    if (owner == null) {
      return 0;
    }
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
    if (owner == null) throw StateError('Session technicien absente');
    return _mediaService.queueFile(
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
    if (owner == null) {
      return null;
    }
    return _outboxStore.eventForOwner(owner, eventId);
  }

  static Future<SyncResult> syncPendingActions() async {
    final owner = await _currentOwner();
    if (owner == null) {
      return const TechnicianSyncRunResult(
        synced: 0,
        failed: 0,
        total: 0,
        error: 'Session technicien absente',
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
    final media = await _mediaService.sync(owner);
    final events = await _syncService.sync(owner);
    return TechnicianSyncRunResult(
      synced: media.synced + events.synced,
      failed: media.failed + events.failed,
      total: media.synced + media.failed + events.total,
      offline: events.offline,
      error: events.error,
    );
  }

  static Future<TechnicianOutboxOwner?> _currentOwner() async {
    final userId = await AuthService.getUserId();
    final technicianId = await AuthService.getTechnicianId();
    if (userId == null ||
        userId <= 0 ||
        technicianId == null ||
        technicianId <= 0) {
      return null;
    }
    return TechnicianOutboxOwner(userId: userId, technicianId: technicianId);
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
    final techId = technicianId ?? await AuthService.getTechnicianId();
    if (userId == null || userId <= 0 || techId == null || techId <= 0) {
      return null;
    }
    return TechnicianOutboxOwner(userId: userId, technicianId: techId);
  }

  static Future<void> _migrateLegacy(TechnicianOutboxOwner owner) async {
    final preferences = await SharedPreferences.getInstance();
    final legacy = preferences.getStringList(
      TechnicianLegacyOutboxMigrator.legacyPendingActionsKey,
    );
    if (legacy == null || legacy.isEmpty) {
      return;
    }

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

  /// Récupérer la date de dernière synchronisation
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
