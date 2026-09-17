import 'dart:async';

import 'package:flutter/material.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import '../../services/auth_service.dart';
import '../../services/field_agent_service.dart';
import '../../services/location_service.dart';
import '../../services/offline_service.dart';
import '../actions/free_photo_action_screen.dart';
import '../gps/mobile_gps_screen.dart';
import '../interventions/mobile_job_presenter.dart';

class FieldAgentShell extends StatefulWidget {
  const FieldAgentShell({super.key, required this.onLogout});

  final Future<void> Function() onLogout;

  @override
  State<FieldAgentShell> createState() => _FieldAgentShellState();
}

class _FieldAgentShellState extends State<FieldAgentShell> {
  List<FieldAgentJobContext> _jobs = const [];
  bool _loading = true;
  bool _syncing = false;
  bool _online = false;
  int _pending = 0;
  String _agentName = '';
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  int _priority(FieldAgentJobContext context) {
    final status = context.job.status.trim().toLowerCase();
    final validation = (context.job.validationStatus ?? '')
        .trim()
        .toUpperCase();
    if (status == 'en_attente_validation' &&
        validation != 'FIELD_AGENT_VERIFIED') {
      return 0;
    }
    if (status == 'in_progress' ||
        status == 'work_in_progress' ||
        status == 'on_site') {
      return 1;
    }
    if (status == 'en_route' || status == 'assigned') return 2;
    return 3;
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final name = await AuthService.getFieldAgentName();
      final online = await OfflineService.isOnline();
      List<FieldAgentJobContext> jobs = const [];
      if (online) {
        jobs = await FieldAgentService.getMyTeamJobs();
        jobs = [...jobs]
          ..sort((a, b) {
            final byPriority = _priority(a).compareTo(_priority(b));
            if (byPriority != 0) return byPriority;
            final aDate = MobileJobPresenter.scheduledAt(a.job);
            final bDate = MobileJobPresenter.scheduledAt(b.job);
            if (aDate == null && bDate == null) {
              return a.job.id.compareTo(b.job.id);
            }
            if (aDate == null) return 1;
            if (bDate == null) return -1;
            return aDate.compareTo(bDate);
          });
      }
      final pending = await OfflineService.getPendingCount();
      if (!mounted) return;
      setState(() {
        _agentName = name ?? 'Agent terrain';
        _online = online;
        _jobs = jobs;
        _pending = pending;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '$error'.replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _sync() async {
    if (_syncing) return;
    setState(() => _syncing = true);
    try {
      final result = await OfflineService.syncPendingActions();
      if (!mounted) return;
      final message = result.offline
          ? 'Hors ligne : les preuves restent sur l’appareil.'
          : result.failed > 0
          ? '${result.failed} élément(s) restent à synchroniser.'
          : 'Synchronisation terminée.';
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
      await _load();
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  Future<void> _open(FieldAgentJobContext context) async {
    await Navigator.of(this.context).push(
      MaterialPageRoute<void>(
        builder: (_) => FieldAgentJobScreen(context: context),
      ),
    );
    await _load();
  }

  Future<void> _openGps() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => MobileGpsScreen(
          roleLabel: 'Agent terrain',
          jobs: _jobs.map((row) => row.job).toList(growable: false),
          technicianNamesByJobId: {
            for (final row in _jobs) row.job.id: row.technicianName,
          },
          onOpenJob: _openJobFromMap,
        ),
      ),
    );
  }

  void _openJobFromMap(Job job) {
    for (final row in _jobs) {
      if (row.job.id == job.id) {
        unawaited(_open(row));
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final reviewCount = _jobs
        .where(
          (row) =>
              row.job.status.trim().toLowerCase() == 'en_attente_validation' &&
              (row.job.validationStatus ?? '').trim().toUpperCase() !=
                  'FIELD_AGENT_VERIFIED',
        )
        .length;
    return Scaffold(
      appBar: AppBar(
        title: const Text('GoVector · Agent terrain'),
        actions: [
          IconButton(
            tooltip: 'Carte',
            onPressed: _openGps,
            icon: const Icon(Icons.map_outlined),
          ),
          IconButton(
            tooltip: 'Synchroniser',
            onPressed: _syncing ? null : _sync,
            icon: _syncing
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync_rounded),
          ),
          PopupMenuButton<String>(
            onSelected: (value) async {
              if (value == 'logout') await widget.onLogout();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'logout', child: Text('Se déconnecter')),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(BlueVectorSpacing.md),
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _agentName,
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _online ? 'Connecté à GoVector' : 'Mode hors ligne',
                        style: TextStyle(
                          color: _online
                              ? BlueVectorColors.success
                              : BlueVectorColors.warning,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                if (_pending > 0)
                  Chip(
                    avatar: const Icon(Icons.cloud_upload_outlined, size: 18),
                    label: Text('$_pending à sync'),
                  ),
              ],
            ),
            const SizedBox(height: BlueVectorSpacing.md),
            Row(
              children: [
                Expanded(
                  child: _MetricCard(
                    label: 'À contrôler',
                    value: '$reviewCount',
                    icon: Icons.fact_check_outlined,
                  ),
                ),
                const SizedBox(width: BlueVectorSpacing.sm),
                Expanded(
                  child: _MetricCard(
                    label: 'Équipe active',
                    value: '${_jobs.length}',
                    icon: Icons.groups_2_outlined,
                  ),
                ),
              ],
            ),
            const SizedBox(height: BlueVectorSpacing.md),
            if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (_error != null)
              _InfoCard(
                icon: Icons.warning_amber_rounded,
                title: 'Impossible de charger l’équipe',
                body: _error!,
              )
            else if (!_online)
              const _InfoCard(
                icon: Icons.cloud_off_rounded,
                title: 'Hors ligne',
                body:
                    'Les preuves déjà mises en file restent conservées. Reconnectez la 4G puis synchronisez.',
              )
            else if (_jobs.isEmpty)
              const _InfoCard(
                icon: Icons.task_alt_rounded,
                title: 'Aucune intervention active',
                body:
                    'Les interventions des techniciens de votre équipe apparaîtront ici.',
              )
            else ...[
              Text(
                'Interventions de mon équipe',
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: BlueVectorSpacing.sm),
              for (final row in _jobs) ...[
                _AgentJobCard(context: row, onTap: () => _open(row)),
                const SizedBox(height: BlueVectorSpacing.sm),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class FieldAgentJobScreen extends StatefulWidget {
  const FieldAgentJobScreen({super.key, required this.context});

  final FieldAgentJobContext context;

  @override
  State<FieldAgentJobScreen> createState() => _FieldAgentJobScreenState();
}

class _FieldAgentJobScreenState extends State<FieldAgentJobScreen> {
  Map<String, dynamic>? _record;
  Map<String, dynamic>? _stock;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  Job get job => widget.context.job;
  bool get awaiting =>
      job.status.trim().toLowerCase() == 'en_attente_validation' &&
      (job.validationStatus ?? '').trim().toUpperCase() !=
          'FIELD_AGENT_VERIFIED';

  @override
  void initState() {
    super.initState();
    _loadContext();
  }

  int _listCount(Map<String, dynamic>? root, List<String> keys) {
    if (root == null) return 0;
    for (final key in keys) {
      final value = root[key];
      if (value is List) return value.length;
      if (value is Map) return value.length;
    }
    return 0;
  }

  Future<void> _loadContext() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final values = await Future.wait([
        FieldAgentService.getFieldRecord(job.id),
        FieldAgentService.getStockContext(job.id),
      ]);
      if (!mounted) return;
      setState(() {
        _record = values[0];
        _stock = values[1];
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '$error'.replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _addPhotos() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => FreePhotoActionScreen(job: job)),
    );
    await OfflineService.syncPendingActions();
    await _loadContext();
  }

  Future<void> _addGps() async {
    final position = await LocationService.getCurrentPosition();
    if (position == null) {
      _message('GPS indisponible. Cette preuve reste facultative.');
      return;
    }
    await OfflineService.addPendingAction(
      action: 'gps_position',
      data: {
        'job_id': job.id,
        'latitude': position.latitude,
        'longitude': position.longitude,
        'accuracy': position.accuracy,
        'created_at': DateTime.now().toUtc().toIso8601String(),
      },
    );
    unawaited(OfflineService.syncPendingActions());
    _message('Position ajoutée à la file de synchronisation.');
  }

  Future<void> _addReport() async {
    final controller = TextEditingController();
    final text = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Rapport / commentaire'),
        content: TextField(
          controller: controller,
          autofocus: true,
          minLines: 4,
          maxLines: 8,
          decoration: const InputDecoration(hintText: 'Observation terrain…'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () {
              final value = controller.text.trim();
              if (value.isNotEmpty) Navigator.pop(dialogContext, value);
            },
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (text == null) return;
    await OfflineService.addPendingAction(
      action: 'intervention_comment',
      data: {
        'job_id': job.id,
        'value': text,
        'created_at': DateTime.now().toUtc().toIso8601String(),
      },
    );
    unawaited(OfflineService.syncPendingActions());
    _message('Rapport enregistré.');
  }

  Future<void> _returnJob() async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Retourner au technicien'),
        content: TextField(
          controller: controller,
          autofocus: true,
          minLines: 3,
          maxLines: 6,
          decoration: const InputDecoration(
            labelText: 'Motif obligatoire',
            hintText: 'Expliquez précisément ce qui doit être corrigé…',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () {
              final value = controller.text.trim();
              if (value.isNotEmpty) Navigator.pop(dialogContext, value);
            },
            child: const Text('Retourner'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (reason == null) return;
    await _runDecision(
      () =>
          FieldAgentService.returnForCorrection(jobId: job.id, reason: reason),
    );
  }

  Future<void> _submitToOffice() async {
    if (_record == null || _stock == null) {
      _message('Le dossier de contrôle doit être chargé avant validation.');
      return;
    }
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Transmettre au bureau ?'),
        content: const Text(
          'Le dossier sera signalé à l’Orienteur, qui reste seul responsable de la validation finale.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Transmettre'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    await _runDecision(() => FieldAgentService.submitToOffice(job.id));
  }

  Future<void> _runDecision(Future<void> Function() operation) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await OfflineService.syncPendingActions();
      await operation();
      if (!mounted) return;
      Navigator.pop(context);
    } catch (error) {
      _message('$error'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _message(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    final mediaCount = _listCount(_record, [
      'media',
      'technician_media',
      'photos',
    ]);
    final actionCount = _listCount(_record, [
      'actions',
      'field_actions',
      'events',
    ]);
    final stockCount = _listCount(_stock, [
      'items',
      'stock',
      'custody',
      'materials',
    ]);

    return Scaffold(
      appBar: AppBar(title: Text(MobileJobPresenter.reference(job))),
      body: ListView(
        padding: const EdgeInsets.all(BlueVectorSpacing.md),
        children: [
          Text(
            MobileJobPresenter.title(job),
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: BlueVectorSpacing.xs),
          Wrap(
            spacing: BlueVectorSpacing.xs,
            runSpacing: BlueVectorSpacing.xs,
            children: [
              Chip(
                label: Text(
                  awaiting
                      ? 'À contrôler'
                      : MobileJobPresenter.statusLabel(job),
                ),
              ),
              Chip(label: Text(widget.context.technicianName)),
              if ((job.operator ?? '').trim().isNotEmpty)
                Chip(label: Text(job.operator!)),
            ],
          ),
          const SizedBox(height: BlueVectorSpacing.md),
          _InfoCard(
            icon: Icons.location_on_outlined,
            title: job.customerName.isEmpty ? 'Intervention' : job.customerName,
            body: job.serviceAddress.isEmpty
                ? 'Adresse non renseignée'
                : job.serviceAddress,
          ),
          const SizedBox(height: BlueVectorSpacing.sm),
          if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(),
              ),
            )
          else if (_error != null)
            _InfoCard(
              icon: Icons.warning_amber_rounded,
              title: 'Dossier indisponible',
              body: _error!,
            )
          else ...[
            Row(
              children: [
                Expanded(
                  child: _MetricCard(
                    label: 'Preuves',
                    value: '$mediaCount',
                    icon: Icons.photo_library_outlined,
                  ),
                ),
                const SizedBox(width: BlueVectorSpacing.sm),
                Expanded(
                  child: _MetricCard(
                    label: 'Actions',
                    value: '$actionCount',
                    icon: Icons.timeline_outlined,
                  ),
                ),
                const SizedBox(width: BlueVectorSpacing.sm),
                Expanded(
                  child: _MetricCard(
                    label: 'Stock',
                    value: '$stockCount',
                    icon: Icons.inventory_2_outlined,
                  ),
                ),
              ],
            ),
            const SizedBox(height: BlueVectorSpacing.sm),
            _InfoCard(
              icon: Icons.straighten_rounded,
              title: 'Câble calculé',
              body: job.cableLengthM == null
                  ? 'Aucun métrage calculé'
                  : '${job.cableLengthM} m',
            ),
          ],
          const SizedBox(height: BlueVectorSpacing.md),
          Text(
            'Terrain',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: BlueVectorSpacing.xs),
          Wrap(
            spacing: BlueVectorSpacing.xs,
            runSpacing: BlueVectorSpacing.xs,
            children: [
              OutlinedButton.icon(
                onPressed: _busy ? null : _addPhotos,
                icon: const Icon(Icons.add_a_photo_outlined),
                label: const Text('Photos'),
              ),
              OutlinedButton.icon(
                onPressed: _busy ? null : _addReport,
                icon: const Icon(Icons.description_outlined),
                label: const Text('Rapport'),
              ),
              OutlinedButton.icon(
                onPressed: _busy ? null : _addGps,
                icon: const Icon(Icons.my_location_rounded),
                label: const Text('GPS'),
              ),
              OutlinedButton.icon(
                onPressed: _busy ? null : _loadContext,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Actualiser'),
              ),
            ],
          ),
          if (awaiting) ...[
            const SizedBox(height: BlueVectorSpacing.lg),
            Text(
              'Décision Agent',
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: BlueVectorSpacing.xs),
            OutlinedButton.icon(
              onPressed: _busy ? null : _returnJob,
              icon: const Icon(Icons.undo_rounded),
              label: const Text('Retourner avec motif'),
            ),
            const SizedBox(height: BlueVectorSpacing.xs),
            FilledButton.icon(
              onPressed: _busy || _record == null || _stock == null
                  ? null
                  : _submitToOffice,
              icon: const Icon(Icons.outbox_rounded),
              label: Text(_busy ? 'Traitement…' : 'Transmettre à l’Orienteur'),
            ),
          ],
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}

class _AgentJobCard extends StatelessWidget {
  const _AgentJobCard({required this.context, required this.onTap});

  final FieldAgentJobContext context;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final waiting =
        this.context.job.status.trim().toLowerCase() == 'en_attente_validation';
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(BlueVectorSpacing.sm),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                child: Icon(
                  waiting
                      ? Icons.fact_check_outlined
                      : Icons.engineering_outlined,
                ),
              ),
              const SizedBox(width: BlueVectorSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      MobileJobPresenter.reference(this.context.job),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${this.context.technicianName} · ${waiting ? 'À contrôler' : MobileJobPresenter.statusLabel(this.context.job)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      this.context.job.serviceAddress.isEmpty
                          ? this.context.job.customerName
                          : this.context.job.serviceAddress,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: BlueVectorColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
      decoration: BoxDecoration(
        border: Border.all(color: BlueVectorColors.border),
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
        color: BlueVectorColors.surface,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: BlueVectorColors.primaryBright),
          const SizedBox(height: 6),
          Text(
            value,
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
          ),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 11,
              color: BlueVectorColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        border: Border.all(color: BlueVectorColors.border),
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: BlueVectorColors.primaryBright),
          const SizedBox(width: BlueVectorSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 2),
                Text(
                  body,
                  style: const TextStyle(color: BlueVectorColors.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
