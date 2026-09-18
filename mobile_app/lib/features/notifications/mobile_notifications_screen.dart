import 'package:flutter/material.dart';

import '../../design_system/bluevector_brand.dart';
import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import '../interventions/mobile_job_presenter.dart';

class MobileNotificationsScreen extends StatelessWidget {
  const MobileNotificationsScreen({
    super.key,
    required this.jobs,
    required this.isOnline,
    required this.pendingActions,
    required this.attentionActions,
    this.syncing = false,
    required this.onOpenJob,
    required this.onSync,
  });

  final List<Job> jobs;
  final bool isOnline;
  final int pendingActions;
  final int attentionActions;
  final bool syncing;
  final ValueChanged<Job> onOpenJob;
  final Future<void> Function() onSync;

  @override
  Widget build(BuildContext context) {
    final urgentJobs = jobs
        .where(
          (job) =>
              MobileJobPresenter.isUrgent(job) &&
              !MobileJobPresenter.isTerminal(job),
        )
        .toList();

    final alerts = <Widget>[
      if (!isOnline)
        const _SystemAlert(
          icon: Icons.cloud_off_outlined,
          color: BlueVectorColors.warning,
          title: 'Mode hors ligne',
          detail:
              'Les données locales restent disponibles. Les actions seront envoyées au retour du réseau.',
        ),
      if (pendingActions > 0)
        _SystemAlert(
          icon: Icons.cloud_upload_outlined,
          color: BlueVectorColors.cyan,
          title:
              '$pendingActions action${pendingActions > 1 ? 's' : ''} à synchroniser',
          detail: isOnline
              ? 'Conservée localement jusqu’à confirmation du serveur.'
              : 'Conservée localement. Envoi au retour du réseau.',
          actionLabel: isOnline
              ? (syncing ? 'Synchronisation…' : 'Synchroniser')
              : null,
          onAction: isOnline && !syncing ? onSync : null,
        ),
      if (attentionActions > 0)
        _SystemAlert(
          icon: Icons.error_outline_rounded,
          color: BlueVectorColors.danger,
          title:
              '$attentionActions action${attentionActions > 1 ? 's' : ''} à vérifier',
          detail: 'Refus ou conflit conservé localement, sans disparition.',
        ),
      for (final job in urgentJobs)
        _JobAlert(job: job, onOpen: () => onOpenJob(job)),
    ];

    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(
              BlueVectorSpacing.md,
              BlueVectorSpacing.sm,
              BlueVectorSpacing.md,
              0,
            ),
            child: Row(
              children: [BlueVectorBrand(compact: true, showSubtitle: false)],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              BlueVectorSpacing.md,
              BlueVectorSpacing.xl,
              BlueVectorSpacing.md,
              BlueVectorSpacing.sm,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Alertes terrain',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                ),
                _CountBadge(
                  count:
                      pendingActions +
                      attentionActions +
                      urgentJobs.length +
                      (isOnline ? 0 : 1),
                ),
              ],
            ),
          ),
          Expanded(
            child: alerts.isEmpty
                ? const _NoAlerts()
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(
                      BlueVectorSpacing.md,
                      BlueVectorSpacing.sm,
                      BlueVectorSpacing.md,
                      120,
                    ),
                    itemCount: alerts.length,
                    separatorBuilder: (_, _) =>
                        const SizedBox(height: BlueVectorSpacing.sm),
                    itemBuilder: (_, index) => alerts[index],
                  ),
          ),
        ],
      ),
    );
  }
}

class _SystemAlert extends StatelessWidget {
  const _SystemAlert({
    required this.icon,
    required this.color,
    required this.title,
    required this.detail,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String detail;
  final String? actionLabel;
  final Future<void> Function()? onAction;

  @override
  Widget build(BuildContext context) {
    return _AlertCard(
      icon: icon,
      color: color,
      title: title,
      detail: detail,
      trailing: actionLabel == null
          ? null
          : TextButton(
              onPressed: onAction == null
                  ? null
                  : () async {
                      await onAction!();
                    },
              child: Text(actionLabel!),
            ),
    );
  }
}

class _JobAlert extends StatelessWidget {
  const _JobAlert({required this.job, required this.onOpen});

  final Job job;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return _AlertCard(
      icon: Icons.priority_high_rounded,
      color: BlueVectorColors.danger,
      title: 'Intervention urgente',
      detail:
          '${MobileJobPresenter.reference(job)} · ${job.customerName.isEmpty ? 'Client non renseigné' : job.customerName}',
      trailing: IconButton(
        tooltip: 'Ouvrir',
        onPressed: onOpen,
        icon: const Icon(Icons.chevron_right_rounded),
      ),
    );
  }
}

class _AlertCard extends StatelessWidget {
  const _AlertCard({
    required this.icon,
    required this.color,
    required this.title,
    required this.detail,
    this.trailing,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String detail;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.md),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(BlueVectorRadius.small),
            ),
            child: Icon(icon, color: color),
          ),
          const SizedBox(width: BlueVectorSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: BlueVectorColors.textPrimary,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: BlueVectorSpacing.xxs),
                Text(
                  detail,
                  style: const TextStyle(
                    color: BlueVectorColors.textSecondary,
                    fontSize: 12,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

class _CountBadge extends StatelessWidget {
  const _CountBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 34),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: count > 0
            ? BlueVectorColors.danger.withValues(alpha: 0.12)
            : BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.pill),
        border: Border.all(
          color: count > 0
              ? BlueVectorColors.danger.withValues(alpha: 0.35)
              : BlueVectorColors.border,
        ),
      ),
      child: Text(
        '$count',
        textAlign: TextAlign.center,
        style: TextStyle(
          color: count > 0
              ? BlueVectorColors.danger
              : BlueVectorColors.textMuted,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _NoAlerts extends StatelessWidget {
  const _NoAlerts();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(BlueVectorSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: BlueVectorColors.success.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(BlueVectorRadius.large),
                border: Border.all(
                  color: BlueVectorColors.success.withValues(alpha: 0.25),
                ),
              ),
              child: const Icon(
                Icons.notifications_none_rounded,
                color: BlueVectorColors.success,
                size: 34,
              ),
            ),
            const SizedBox(height: BlueVectorSpacing.lg),
            Text(
              'Aucune alerte à traiter',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: BlueVectorSpacing.xs),
            const Text(
              'La file terrain est calme.',
              style: TextStyle(color: BlueVectorColors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}
