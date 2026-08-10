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
    final internetAvailable = await OfflineService.isOnline();

    if (internetAvailable) {
      try {
        var jobs = await ApiService.getMyJobs();

        if (jobs.isEmpty) {
          final allJobs = await ApiService.getJobs();

          jobs = allJobs
              .where((job) => job.assignedTechId == technicianId)
              .toList();
        }

        await OfflineService.cacheJobs(
          jobs,
          ownerUserId: ownerUserId,
          technicianId: technicianId,
        );
        final lastSync = await OfflineService.getLastSync();

        final summary = await OfflineService.getOutboxSummary();
        return MobileInterventionsSnapshot(
          jobs: _sorted(jobs),
          isOnline: true,
          pendingActions: summary.toSynchronize,
          attentionActions: summary.toReview,
          lastSync: lastSync,
        );
      } catch (_) {
        final cached = await _cachedForTechnician(ownerUserId, technicianId);

        final summary = await OfflineService.getOutboxSummary();
        return MobileInterventionsSnapshot(
          jobs: cached,
          isOnline: false,
          pendingActions: summary.toSynchronize,
          attentionActions: summary.toReview,
          lastSync: await OfflineService.getLastSync(),
          message: 'Serveur indisponible. Données locales affichées.',
        );
      }
    }

    final cached = await _cachedForTechnician(ownerUserId, technicianId);

    final summary = await OfflineService.getOutboxSummary();
    return MobileInterventionsSnapshot(
      jobs: cached,
      isOnline: false,
      pendingActions: summary.toSynchronize,
      attentionActions: summary.toReview,
      lastSync: await OfflineService.getLastSync(),
      message: 'Mode hors ligne. Les actions seront synchronisées plus tard.',
    );
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
