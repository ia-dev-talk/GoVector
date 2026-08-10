import 'package:flutter/material.dart';

import '../../design_system/bluevector_brand.dart';
import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import 'mobile_job_journal.dart';
import 'mobile_field_context_card.dart';
import 'mobile_job_presenter.dart';

class CurrentInterventionScreen extends StatelessWidget {
  const CurrentInterventionScreen({
    super.key,
    required this.job,
    required this.isOnline,
    required this.pendingActions,
    required this.onOpenActions,
    required this.onAdvanceWorkflow,
    required this.workflowActionLabel,
    required this.onCallClient,
    required this.onNavigate,
    required this.onOpenSiteHistory,
    required this.onFailure,
    required this.onPostpone,
  });

  final Job? job;
  final bool isOnline;
  final int pendingActions;
  final VoidCallback onOpenActions;
  final VoidCallback onAdvanceWorkflow;
  final String? workflowActionLabel;
  final VoidCallback onCallClient;
  final VoidCallback onNavigate;
  final VoidCallback onOpenSiteHistory;
  final VoidCallback onFailure;
  final VoidCallback onPostpone;

  @override
  Widget build(BuildContext context) {
    final intervention = job;

    if (intervention == null) {
      return const SafeArea(child: _NoCurrentIntervention());
    }

    final statusColor = MobileJobPresenter.statusColor(intervention);

    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              BlueVectorSpacing.md,
              BlueVectorSpacing.sm,
              BlueVectorSpacing.md,
              0,
            ),
            child: Row(
              children: [
                const BlueVectorBrand(compact: true, showSubtitle: false),
                const Spacer(),
                _StatusPill(
                  label: MobileJobPresenter.statusLabel(intervention),
                  color: statusColor,
                ),
                PopupMenuButton<String>(
                  tooltip: 'Autres commandes',
                  onSelected: (value) {
                    if (value == 'failure') onFailure();
                    if (value == 'postpone') onPostpone();
                  },
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'postpone', child: Text('Reporter')),
                    PopupMenuItem(
                      value: 'failure',
                      child: Text('Déclarer un échec'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                BlueVectorSpacing.md,
                BlueVectorSpacing.xl,
                BlueVectorSpacing.md,
                130,
              ),
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            MobileJobPresenter.title(intervention),
                            style: Theme.of(context).textTheme.headlineMedium,
                          ),
                          const SizedBox(height: BlueVectorSpacing.xxs),
                          Text(
                            MobileJobPresenter.reference(intervention),
                            style: const TextStyle(
                              color: BlueVectorColors.textSecondary,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton.filledTonal(
                      tooltip: 'Appeler le client',
                      onPressed:
                          intervention.customerPhone?.trim().isNotEmpty == true
                          ? onCallClient
                          : null,
                      icon: const Icon(Icons.call_outlined),
                    ),
                    const SizedBox(width: BlueVectorSpacing.xs),
                    IconButton.filledTonal(
                      tooltip: 'Navigation',
                      onPressed: onNavigate,
                      icon: const Icon(Icons.navigation_outlined),
                    ),
                  ],
                ),
                const SizedBox(height: BlueVectorSpacing.lg),
                _ClientCard(
                  job: intervention,
                  onOpenSiteHistory: onOpenSiteHistory,
                ),
                const SizedBox(height: BlueVectorSpacing.sm),
                _OperationalIndicators(
                  job: intervention,
                  isOnline: isOnline,
                  pendingActions: pendingActions,
                ),
                const SizedBox(height: BlueVectorSpacing.sm),
                MobileFieldContextCard(jobId: intervention.id),
                const SizedBox(height: BlueVectorSpacing.lg),
                Row(
                  children: [
                    Text(
                      'Journal de l’intervention',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ],
                ),
                const SizedBox(height: BlueVectorSpacing.sm),
                MobileJobJournal(
                  jobId: intervention.id,
                  refreshToken: pendingActions,
                ),
                const SizedBox(height: BlueVectorSpacing.lg),
                _NetworkDataCard(job: intervention),
              ],
            ),
          ),
          _ActionBar(
            onOpenActions: onOpenActions,
            onAdvanceWorkflow: onAdvanceWorkflow,
            workflowActionLabel: workflowActionLabel,
          ),
        ],
      ),
    );
  }
}

class _ClientCard extends StatelessWidget {
  const _ClientCard({required this.job, required this.onOpenSiteHistory});

  final Job job;
  final VoidCallback onOpenSiteHistory;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.md),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
        border: Border.all(color: BlueVectorColors.border),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: BlueVectorColors.primarySoft,
                  borderRadius: BorderRadius.circular(BlueVectorRadius.small),
                ),
                child: const Icon(
                  Icons.person_outline_rounded,
                  color: BlueVectorColors.primaryBright,
                ),
              ),
              const SizedBox(width: BlueVectorSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      job.customerName.isEmpty
                          ? 'Client non renseigné'
                          : job.customerName,
                      style: const TextStyle(
                        color: BlueVectorColors.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      job.customerPhone?.trim().isNotEmpty == true
                          ? job.customerPhone!
                          : 'Téléphone non renseigné',
                      style: const TextStyle(
                        color: BlueVectorColors.textSecondary,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.chevron_right_rounded,
                color: BlueVectorColors.textMuted,
              ),
            ],
          ),
          const SizedBox(height: BlueVectorSpacing.md),
          const Divider(),
          const SizedBox(height: BlueVectorSpacing.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.location_on_outlined,
                color: BlueVectorColors.textMuted,
                size: 18,
              ),
              const SizedBox(width: BlueVectorSpacing.xs),
              Expanded(
                child: Text(
                  job.serviceAddress.isEmpty
                      ? 'Adresse non renseignée'
                      : job.serviceAddress,
                  style: const TextStyle(
                    color: BlueVectorColors.textSecondary,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: BlueVectorSpacing.sm),
          const Divider(),
          Material(
            color: Colors.transparent,
            child: ListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              onTap: onOpenSiteHistory,
              leading: const Icon(
                Icons.history_rounded,
                color: BlueVectorColors.primaryBright,
              ),
              title: const Text('Historique du site'),
              subtitle: const Text('Travaux précédemment réalisés ici'),
              trailing: const Icon(Icons.chevron_right_rounded),
            ),
          ),
        ],
      ),
    );
  }
}

class _OperationalIndicators extends StatelessWidget {
  const _OperationalIndicators({
    required this.job,
    required this.isOnline,
    required this.pendingActions,
  });

  final Job job;
  final bool isOnline;
  final int pendingActions;

  @override
  Widget build(BuildContext context) {
    final hasSiteCoordinates = job.hasServiceCoordinates;
    final hasAddress = job.serviceAddress.trim().isNotEmpty;

    return Row(
      children: [
        Expanded(
          child: _Indicator(
            icon: Icons.timer_outlined,
            label: 'Créneau',
            value: MobileJobPresenter.timeLabel(job),
            color: BlueVectorColors.warning,
          ),
        ),
        const SizedBox(width: BlueVectorSpacing.xs),
        Expanded(
          child: _Indicator(
            icon: Icons.location_searching_rounded,
            label: 'Site',
            value: hasSiteCoordinates
                ? 'Coordonnées'
                : hasAddress
                ? 'Adresse seule'
                : 'À préciser',
            color: hasSiteCoordinates
                ? BlueVectorColors.success
                : BlueVectorColors.warning,
          ),
        ),
        const SizedBox(width: BlueVectorSpacing.xs),
        Expanded(
          child: _Indicator(
            icon: isOnline
                ? Icons.cloud_done_outlined
                : Icons.cloud_off_outlined,
            label: 'Sync',
            value: isOnline
                ? pendingActions == 0
                      ? 'À jour'
                      : '$pendingActions attente'
                : 'Hors ligne',
            color: isOnline && pendingActions == 0
                ? BlueVectorColors.success
                : BlueVectorColors.warning,
          ),
        ),
      ],
    );
  }
}

class _Indicator extends StatelessWidget {
  const _Indicator({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 78),
      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.small),
        border: Border.all(color: BlueVectorColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(height: BlueVectorSpacing.sm),
          Text(
            label,
            style: const TextStyle(
              color: BlueVectorColors.textMuted,
              fontSize: 9,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: const TextStyle(
              color: BlueVectorColors.textPrimary,
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _InterventionTimeline extends StatelessWidget {
  const _InterventionTimeline({required this.job});

  final Job job;

  @override
  Widget build(BuildContext context) {
    final entries = _entries(job);

    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.md),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
        border: Border.all(color: BlueVectorColors.border),
      ),
      child: Column(
        children: [
          for (var index = 0; index < entries.length; index++)
            _TimelineRow(
              entry: entries[index],
              isLast: index == entries.length - 1,
            ),
        ],
      ),
    );
  }

  List<_TimelineEntry> _entries(Job job) {
    final status = MobileJobPresenter.normalizedStatus(job);

    const sequence = [
      'assigned',
      'en_route',
      'arrived',
      'in_progress',
      'tests',
      'validation',
      'completed',
    ];

    const labels = {
      'assigned': 'Intervention affectée',
      'en_route': 'Départ vers le client',
      'arrived': 'Arrivée sur site',
      'in_progress': 'Travaux en cours',
      'tests': 'Tests et mesures',
      'validation': 'Validation terrain',
      'completed': 'Intervention terminée',
    };

    var currentIndex = sequence.indexOf(status);

    if (status == 'en_cours' || status == 'ftth_install') {
      currentIndex = sequence.indexOf('in_progress');
    }

    if (status == 'terminee') {
      currentIndex = sequence.indexOf('completed');
    }

    if (currentIndex < 0) {
      currentIndex = 0;
    }

    return [
      for (var index = 0; index < sequence.length; index++)
        _TimelineEntry(
          label: labels[sequence[index]]!,
          completed: index <= currentIndex,
          current: index == currentIndex && !MobileJobPresenter.isTerminal(job),
        ),
    ];
  }
}

class _TimelineEntry {
  const _TimelineEntry({
    required this.label,
    required this.completed,
    required this.current,
  });

  final String label;
  final bool completed;
  final bool current;
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({required this.entry, required this.isLast});

  final _TimelineEntry entry;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final color = entry.completed
        ? entry.current
              ? BlueVectorColors.primaryBright
              : BlueVectorColors.success
        : BlueVectorColors.textMuted;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 24,
            child: Column(
              children: [
                Container(
                  width: 18,
                  height: 18,
                  decoration: BoxDecoration(
                    color: entry.completed
                        ? color.withValues(alpha: 0.16)
                        : BlueVectorColors.surfaceSoft,
                    shape: BoxShape.circle,
                    border: Border.all(color: color),
                  ),
                  child: Icon(
                    entry.completed
                        ? Icons.check_rounded
                        : Icons.circle_outlined,
                    color: color,
                    size: 11,
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 1,
                      margin: const EdgeInsets.symmetric(vertical: 3),
                      color: entry.completed
                          ? color.withValues(alpha: 0.5)
                          : BlueVectorColors.border,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: BlueVectorSpacing.sm),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(
                bottom: isLast ? 0 : BlueVectorSpacing.md,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      entry.label,
                      style: TextStyle(
                        color: entry.completed
                            ? BlueVectorColors.textPrimary
                            : BlueVectorColors.textMuted,
                        fontSize: 12,
                        fontWeight: entry.current
                            ? FontWeight.w800
                            : FontWeight.w600,
                      ),
                    ),
                  ),
                  if (entry.current)
                    const Text(
                      'Étape actuelle',
                      style: TextStyle(
                        color: BlueVectorColors.primaryBright,
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NetworkDataCard extends StatelessWidget {
  const _NetworkDataCard({required this.job});

  final Job job;

  @override
  Widget build(BuildContext context) {
    final values = [
      ('Opérateur', job.operator),
      ('NRO', job.nro),
      ('SRO', job.sro),
      ('PBO', job.pbo),
      ('PTO', job.pto),
    ];

    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.md),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
        border: Border.all(color: BlueVectorColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Données réseau',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: BlueVectorSpacing.md),
          for (final value in values)
            Padding(
              padding: const EdgeInsets.only(bottom: BlueVectorSpacing.sm),
              child: Row(
                children: [
                  SizedBox(
                    width: 82,
                    child: Text(
                      value.$1,
                      style: const TextStyle(
                        color: BlueVectorColors.textMuted,
                        fontSize: 11,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      value.$2?.trim().isNotEmpty == true ? value.$2! : '—',
                      style: const TextStyle(
                        color: BlueVectorColors.textPrimary,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _ActionBar extends StatelessWidget {
  const _ActionBar({
    required this.onOpenActions,
    required this.onAdvanceWorkflow,
    required this.workflowActionLabel,
  });

  final VoidCallback onOpenActions;
  final VoidCallback onAdvanceWorkflow;
  final String? workflowActionLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(
        BlueVectorSpacing.md,
        BlueVectorSpacing.sm,
        BlueVectorSpacing.md,
        BlueVectorSpacing.md,
      ),
      decoration: const BoxDecoration(
        color: BlueVectorColors.background,
        border: Border(top: BorderSide(color: BlueVectorColors.border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: onOpenActions,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Action'),
            ),
          ),
          if (workflowActionLabel != null) ...[
            const SizedBox(width: BlueVectorSpacing.sm),
            Expanded(
              flex: 2,
              child: FilledButton.icon(
                onPressed: onAdvanceWorkflow,
                icon: const Icon(Icons.arrow_forward_rounded),
                label: Text(workflowActionLabel!),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.13),
        borderRadius: BorderRadius.circular(BlueVectorRadius.pill),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _NoCurrentIntervention extends StatelessWidget {
  const _NoCurrentIntervention();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(BlueVectorSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            BlueVectorBrand(compact: true, showSubtitle: false),
            SizedBox(height: BlueVectorSpacing.xxl),
            Icon(
              Icons.assignment_outlined,
              color: BlueVectorColors.textMuted,
              size: 52,
            ),
            SizedBox(height: BlueVectorSpacing.md),
            Text(
              'Aucune intervention sélectionnée',
              style: TextStyle(
                color: BlueVectorColors.textPrimary,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: BlueVectorSpacing.xs),
            Text(
              'Sélectionne une intervention depuis le planning.',
              style: TextStyle(
                color: BlueVectorColors.textSecondary,
                fontSize: 12,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
