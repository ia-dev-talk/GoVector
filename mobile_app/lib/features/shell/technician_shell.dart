import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/config.dart';
import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import '../../services/auth_service.dart';
import '../../services/intervention_service.dart';
import '../../services/location_service.dart';
import '../../services/offline_service.dart';
import '../actions/mobile_action_sheet.dart';
import '../actions/technician_job_picker_sheet.dart';
import '../history/technician_history_screen.dart';
import '../interventions/current_intervention_screen.dart';
import '../interventions/mobile_interventions_list_screen.dart';
import '../interventions/mobile_interventions_repository.dart';
import '../interventions/mobile_job_presenter.dart';
import '../interventions/workflow_capabilities.dart';
import '../notifications/mobile_notifications_screen.dart';
import '../profile/mobile_profile_screen.dart';

class TechnicianShell extends StatefulWidget {
  const TechnicianShell({
    super.key,
    required this.technicianId,
    required this.onLogout,
  });

  final int technicianId;
  final Future<void> Function() onLogout;

  @override
  State<TechnicianShell> createState() => _TechnicianShellState();
}

class _TechnicianShellState extends State<TechnicianShell> {
  static const _repository = MobileInterventionsRepository();

  MobileInterventionsSnapshot _snapshot = const MobileInterventionsSnapshot(
    jobs: [],
    isOnline: false,
    pendingActions: 0,
    attentionActions: 0,
    lastSync: null,
  );

  bool _loading = true;
  bool _syncing = false;
  bool _workflowBusy = false;
  int _pageIndex = 0;
  int? _selectedJobId;
  String _technicianName = '';
  JobWorkflowCapabilities? _workflowCapabilities;

  Job? get _selectedJob {
    if (_snapshot.jobs.isEmpty) {
      return null;
    }

    if (_selectedJobId != null) {
      for (final job in _snapshot.jobs) {
        if (job.id == _selectedJobId && MobileJobPresenter.isActive(job)) {
          return job;
        }
      }
    }

    for (final job in _snapshot.jobs) {
      if (MobileJobPresenter.isActive(job)) {
        return job;
      }
    }

    return null;
  }

  Job? get _liveTrackingJob {
    final selected = _selectedJob;
    if (selected != null && _requiresLiveTracking(selected)) {
      return selected;
    }

    for (final job in _snapshot.jobs) {
      if (_requiresLiveTracking(job)) {
        return job;
      }
    }

    return null;
  }

  bool _requiresLiveTracking(Job job) {
    final command = TechnicianWorkflowCommandResolver.resolve(
      fallbackStatus: job.status,
    );
    return command != null && command.code != 'accept_and_start';
  }

  @override
  void initState() {
    super.initState();
    _load(initial: true);
  }

  @override
  void dispose() {
    LocationService.stopLiveGps();
    super.dispose();
  }

  Future<void> _load({bool initial = false}) async {
    if (initial && mounted) {
      setState(() {
        _loading = true;
      });
    }

    final name = await AuthService.getTechnicianName();
    final snapshot = await _repository.load(technicianId: widget.technicianId);

    if (!mounted) {
      return;
    }

    setState(() {
      _technicianName = name ?? '';
      _snapshot = snapshot;
      _loading = false;

      final current = _selectedJob;

      if (current != null) {
        _selectedJobId = current.id;
      } else {
        _selectedJobId = null;
      }
      if (_workflowCapabilities?.jobId != _selectedJobId) {
        _workflowCapabilities = null;
      }
    });

    await _loadWorkflowCapabilities();
    _refreshLiveGpsTracking();

    final message = snapshot.message;

    if (message != null && message.isNotEmpty && mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    }
  }

  void _selectJob(Job job) {
    setState(() {
      _selectedJobId = job.id;
      _workflowCapabilities = null;
      _pageIndex = 1;
    });
    _refreshLiveGpsTracking();
    _loadWorkflowCapabilities();
  }

  void _refreshLiveGpsTracking() {
    final liveJob = _liveTrackingJob;
    if (liveJob == null) {
      LocationService.stopLiveGps();
      return;
    }

    LocationService.startLiveGps(
      jobId: liveJob.id,
      intervalSeconds: AppConfig.gpsUpdateIntervalSeconds,
    );
  }

  Future<void> _loadWorkflowCapabilities() async {
    final job = _selectedJob;
    if (job == null || !_snapshot.isOnline) return;
    try {
      final capabilities = await InterventionService.getWorkflowCapabilities(
        jobId: job.id,
      );
      if (!mounted || _selectedJobId != job.id) return;
      setState(() {
        _workflowCapabilities = capabilities;
      });
    } catch (_) {
      // Offline/older-server compatibility is handled by the resolver.
    }
  }

  Future<void> _sync() async {
    if (_syncing) {
      return;
    }
    _syncing = true;
    try {
      final result = await OfflineService.syncPendingActions();

      if (!mounted) {
        return;
      }

      final message = result.offline
          ? 'Mode hors ligne : synchronisation différée.'
          : result.failed > 0
          ? '${result.failed} action(s) non synchronisée(s).'
          : result.synced > 0
          ? '${result.synced} action(s) synchronisée(s).'
          : 'Aucune action en attente.';

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));

      await _load();
    } finally {
      _syncing = false;
    }
  }

  Future<void> _openActions() async {
    final job = _selectedJob;

    if (job == null) {
      _showNoJob();
      return;
    }

    await showMobileActionSheet(
      context: context,
      job: job,
      technicianId: widget.technicianId,
      onDataChanged: _load,
    );
  }

  Future<void> _openGlobalActions() async {
    final job = await showTechnicianJobPickerSheet(
      context: context,
      jobs: _snapshot.jobs,
      currentJobId: _selectedJob?.id,
    );
    if (!mounted || job == null) return;
    await showMobileActionSheet(
      context: context,
      job: job,
      technicianId: widget.technicianId,
      onDataChanged: _load,
    );
  }

  TechnicianWorkflowCommand? _workflowCommand(Job? job) {
    if (job == null) return null;
    return TechnicianWorkflowCommandResolver.resolve(
      fallbackStatus: job.status,
      capabilities: _workflowCapabilities?.jobId == job.id
          ? _workflowCapabilities
          : null,
    );
  }

  Future<void> _advanceWorkflow() async {
    if (_workflowBusy) return;
    final job = _selectedJob;
    if (job == null) {
      _showNoJob();
      return;
    }
    final command = _workflowCommand(job);
    if (command == null) return;
    _workflowBusy = true;
    try {
      final position = await LocationService.getCurrentPosition();
      switch (command.code) {
        case 'accept_and_start':
          await InterventionService.startJob(
            jobId: job.id,
            latitude: position?.latitude,
            longitude: position?.longitude,
            accuracy: position?.accuracy,
          );
          break;
        case 'arrive':
          await InterventionService.updateStatus(
            jobId: job.id,
            newStatus: 'on_site',
            latitude: position?.latitude,
            longitude: position?.longitude,
            accuracy: position?.accuracy,
          );
          break;
        case 'start_work':
          await InterventionService.updateStatus(
            jobId: job.id,
            newStatus: 'in_progress',
            latitude: position?.latitude,
            longitude: position?.longitude,
            accuracy: position?.accuracy,
          );
          break;
        case 'close_field_visit':
          await InterventionService.terminateJob(
            jobId: job.id,
            payload: {
              if (position != null) 'gps_latitude': position.latitude,
              if (position != null) 'gps_longitude': position.longitude,
              if (position != null) 'gps_accuracy': position.accuracy,
            },
          );
          break;
        default:
          return;
      }
      await _load();
    } catch (error) {
      _message('$error'.replaceFirst('Exception: ', ''));
    } finally {
      _workflowBusy = false;
    }
  }

  Future<String?> _promptReason(String title, String hint) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          minLines: 2,
          maxLines: 5,
          decoration: InputDecoration(hintText: hint),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () {
              if (controller.text.trim().isNotEmpty) {
                Navigator.pop(context, controller.text.trim());
              }
            },
            child: const Text('Confirmer'),
          ),
        ],
      ),
    );
    controller.dispose();
    return result;
  }

  Future<void> _declareFailure() async {
    final job = _selectedJob;
    if (job == null) return;
    final reason = await _promptReason(
      'Déclarer un échec',
      'Motif opérationnel…',
    );
    if (reason == null) return;
    try {
      final position = await LocationService.getCurrentPosition();
      await InterventionService.declareFailure(
        jobId: job.id,
        reason: reason,
        latitude: position?.latitude,
        longitude: position?.longitude,
        accuracy: position?.accuracy,
      );
      await _load();
      _message('Intervention enregistrée en échec.');
    } catch (error) {
      _message('$error'.replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _postpone() async {
    final job = _selectedJob;
    if (job == null) return;
    final reason = await _promptReason(
      'Reporter l’intervention',
      'Motif du report…',
    );
    if (reason == null) return;
    try {
      await InterventionService.postponeJob(jobId: job.id, reason: reason);
      await _load();
      _message('Intervention reportée.');
    } catch (error) {
      _message('$error'.replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _callClient() async {
    final phone = _selectedJob?.customerPhone?.trim();

    if (phone == null || phone.isEmpty) {
      _message('Téléphone client non renseigné.');
      return;
    }

    final uri = Uri(scheme: 'tel', path: phone);

    if (!await launchUrl(uri)) {
      _message('Impossible d’ouvrir l’application téléphone.');
    }
  }

  Future<void> _navigate() async {
    final job = _selectedJob;

    if (job == null) {
      _showNoJob();
      return;
    }

    // Navigation always targets the planned service location. gpsLatitude /
    // gpsLongitude are field observations from the technician and must never
    // become a destination implicitly.
    if (job.hasServiceCoordinates) {
      await LocationService.openNavigation(
        latitude: job.latitude,
        longitude: job.longitude,
        label: job.serviceAddress,
      );
      return;
    }

    if (job.serviceAddress.trim().isNotEmpty) {
      await LocationService.openNavigationByAddress(job.serviceAddress);
      return;
    }

    _message('Adresse et coordonnées GPS indisponibles.');
  }

  Future<int?> _ownerUserId() async {
    final userId = await AuthService.getUserId();
    if (userId == null) {
      _message('Session technicien expirée. Reconnectez-vous.');
    }
    return userId;
  }

  Future<void> _openHistory() async {
    final userId = await _ownerUserId();
    if (!mounted || userId == null) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => TechnicianHistoryScreen.personal(
          ownerUserId: userId,
          technicianId: widget.technicianId,
        ),
      ),
    );
  }

  Future<void> _openSiteHistory() async {
    final job = _selectedJob;
    if (job == null) {
      _showNoJob();
      return;
    }
    final userId = await _ownerUserId();
    if (!mounted || userId == null) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => TechnicianHistoryScreen.site(
          ownerUserId: userId,
          technicianId: widget.technicianId,
          currentSiteJobId: job.id,
        ),
      ),
    );
  }

  void _showNoJob() {
    _message('Sélectionne d’abord une intervention.');
  }

  void _message(String message) {
    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final selectedJob = _selectedJob;

    final pages = [
      MobileInterventionsListScreen(
        jobs: _snapshot.jobs,
        loading: _loading,
        isOnline: _snapshot.isOnline,
        lastSync: _snapshot.lastSync,
        technicianName: _technicianName,
        onRefresh: _load,
        onSelect: _selectJob,
      ),
      CurrentInterventionScreen(
        job: selectedJob,
        isOnline: _snapshot.isOnline,
        pendingActions: _snapshot.pendingActions,
        onOpenActions: _openActions,
        onAdvanceWorkflow: _advanceWorkflow,
        workflowActionLabel: _workflowCommand(selectedJob)?.label,
        onCallClient: _callClient,
        onNavigate: _navigate,
        onOpenSiteHistory: _openSiteHistory,
        onFailure: _declareFailure,
        onPostpone: _postpone,
      ),
      MobileNotificationsScreen(
        jobs: _snapshot.jobs,
        isOnline: _snapshot.isOnline,
        pendingActions: _snapshot.pendingActions,
        attentionActions: _snapshot.attentionActions,
        onOpenJob: _selectJob,
        onSync: _sync,
      ),
      MobileProfileScreen(
        technicianId: widget.technicianId,
        technicianName: _technicianName,
        isOnline: _snapshot.isOnline,
        pendingActions: _snapshot.pendingActions,
        lastSync: _snapshot.lastSync,
        onSync: _sync,
        onOpenHistory: _openHistory,
        onLogout: widget.onLogout,
      ),
    ];

    return Scaffold(
      // The current-intervention screen owns a workflow action bar at the
      // bottom of its body. Extending the body below BottomAppBar placed that
      // action bar behind the navigation/FAB, making valid server commands
      // such as `accept_and_start` impossible to see or tap.
      extendBody: false,
      body: IndexedStack(index: _pageIndex, children: pages),
      floatingActionButton: FloatingActionButton(
        heroTag: 'mobile-primary-action',
        tooltip: 'Ajouter une action',
        onPressed: _openGlobalActions,
        backgroundColor: BlueVectorColors.primary,
        foregroundColor: Colors.white,
        shape: const CircleBorder(),
        child: const Icon(Icons.add_rounded, size: 30),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      bottomNavigationBar: _MobileBottomBar(
        selectedIndex: _pageIndex,
        alertCount:
            _snapshot.pendingActions +
            _snapshot.attentionActions +
            _snapshot.jobs
                .where(
                  (job) =>
                      MobileJobPresenter.isUrgent(job) &&
                      !MobileJobPresenter.isTerminal(job),
                )
                .length +
            (_snapshot.isOnline ? 0 : 1),
        onSelected: (index) {
          setState(() {
            _pageIndex = index;
          });
        },
      ),
    );
  }
}

class _MobileBottomBar extends StatelessWidget {
  const _MobileBottomBar({
    required this.selectedIndex,
    required this.alertCount,
    required this.onSelected,
  });

  final int selectedIndex;
  final int alertCount;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    return BottomAppBar(
      height: 76,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      color: BlueVectorColors.backgroundDeep,
      surfaceTintColor: Colors.transparent,
      shape: const CircularNotchedRectangle(),
      notchMargin: 8,
      child: Row(
        children: [
          Expanded(
            child: _Destination(
              index: 0,
              selectedIndex: selectedIndex,
              icon: Icons.work_outline_rounded,
              selectedIcon: Icons.work_rounded,
              label: 'Interventions',
              onSelected: onSelected,
            ),
          ),
          Expanded(
            child: _Destination(
              index: 1,
              selectedIndex: selectedIndex,
              icon: Icons.route_outlined,
              selectedIcon: Icons.route_rounded,
              label: 'En cours',
              onSelected: onSelected,
            ),
          ),
          const SizedBox(width: 62),
          Expanded(
            child: _Destination(
              index: 2,
              selectedIndex: selectedIndex,
              icon: Icons.notifications_none_rounded,
              selectedIcon: Icons.notifications_rounded,
              label: 'Alertes',
              badge: alertCount,
              onSelected: onSelected,
            ),
          ),
          Expanded(
            child: _Destination(
              index: 3,
              selectedIndex: selectedIndex,
              icon: Icons.person_outline_rounded,
              selectedIcon: Icons.person_rounded,
              label: 'Profil',
              onSelected: onSelected,
            ),
          ),
        ],
      ),
    );
  }
}

class _Destination extends StatelessWidget {
  const _Destination({
    required this.index,
    required this.selectedIndex,
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.onSelected,
    this.badge = 0,
  });

  final int index;
  final int selectedIndex;
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final ValueChanged<int> onSelected;
  final int badge;

  @override
  Widget build(BuildContext context) {
    final selected = index == selectedIndex;
    final color = selected
        ? BlueVectorColors.primaryBright
        : BlueVectorColors.textMuted;

    return InkResponse(
      radius: 32,
      onTap: () => onSelected(index),
      child: Semantics(
        button: true,
        selected: selected,
        label: label,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Badge(
              isLabelVisible: badge > 0,
              label: Text(badge > 99 ? '99+' : '$badge'),
              child: Icon(
                selected ? selectedIcon : icon,
                color: color,
                size: 23,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontSize: 9.5,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
