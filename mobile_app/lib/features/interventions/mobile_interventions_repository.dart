import 'dart:async';

import '../../models/job.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';
import '../../services/offline_service.dart';
import 'technician_job_status.dart';

class MobileInterventionsSnapshot {
  const MobileInterventionsSnapshot({
    required this.jobs,
    required this.isOnline,
    required this.pendingActions,
    required this.attentionActions,
    required this.lastSync,
    this.message,
  });

  final List<Job> jobs;
  final bool isOnline;
  final int pendingActions;
  final int attentionActions;
  final DateTime? lastSync;
  final String? message;
}

class MobileInterventionsRepository {
  const MobileInterventionsRepository();

  Future<MobileInterventionsSnapshot> load({required int technicianId}) async {
    final ownerUserId = await AuthService.getUserId();
    if (ownerUserId == null || ownerUserId <= 0 || technicianId <= 0) {
      return const MobileInterventionsSnapshot(
        jobs: [],
        isOnline: false,
        pendingActions: 0,
        attentionActions: 0,
        lastSync: null,
        message: 'Session technicien absente.',
      );
    }

    // Start local reads immediately. They are cheap and can complete while the
    // single authoritative jobs request is in flight.
    final cachedFuture = _cachedForTechnician(ownerUserId, technicianId);
    final summaryFuture = OfflineService.getOutboxSummary();
    final lastSyncFuture = OfflineService.getLastSync();

    try {
      // Do not preflight /health here: it added a full network round-trip before
      // every refresh. /jobs/my is itself the connectivity check and already
      // has a short timeout with a local-cache fallback.
      final jobs = await ApiService.getMyJobs();

      // Persist the fresh list without delaying first paint.
      unawaited(
        OfflineService.cacheJobs(
          jobs,
          ownerUserId: ownerUserId,
          technicianId: technicianId,
        ),
      );

      final summary = await summaryFuture;
      final lastSync = await lastSyncFuture;
      return MobileInterventionsSnapshot(
        jobs: _sorted(jobs),
        isOnline: true,
        pendingActions: summary.toSynchronize,
        attentionActions: summary.toReview,
        lastSync: lastSync,
      );
    } catch (_) {
      final cached = await cachedFuture;
      final summary = await summaryFuture;
      final lastSync = await lastSyncFuture;
      return MobileInterventionsSnapshot(
        jobs: cached,
        isOnline: false,
        pendingActions: summary.toSynchronize,
        attentionActions: summary.toReview,
        lastSync: lastSync,
        message: 'Serveur indisponible. Données locales affichées.',
      );
    }
  }

  Future<List<Job>> _cachedForTechnician(
    int ownerUserId,
    int technicianId,
  ) async {
    final cached = await OfflineService.getCachedJobs(
      ownerUserId: ownerUserId,
      technicianId: technicianId,
    );

    final filtered = cached
        .where((job) => job.assignedTechId == technicianId)
        .toList();

    return _sorted(filtered);
  }

  List<Job> _sorted(List<Job> jobs) {
    final copy = List<Job>.from(jobs);

    copy.sort((a, b) {
      final aDone = TechnicianJobStatus.isTechnicianTerminalStatus(a.status);
      final bDone = TechnicianJobStatus.isTechnicianTerminalStatus(b.status);

      if (aDone != bDone) {
        return aDone ? 1 : -1;
      }

      final aDate = DateTime.tryParse(a.scheduledDate ?? '');
      final bDate = DateTime.tryParse(b.scheduledDate ?? '');

      if (aDate == null && bDate == null) {
        return a.jobNumber.compareTo(b.jobNumber);
      }

      if (aDate == null) {
        return 1;
      }

      if (bDate == null) {
        return -1;
      }

      return aDate.compareTo(bDate);
    });

    return copy;
  }
}
