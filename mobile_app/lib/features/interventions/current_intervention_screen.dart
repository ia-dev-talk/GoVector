import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../design_system/bluevector_brand.dart';
import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import '../../services/location_service.dart';
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
    required this.workflowActionCode,
    required this.workflowActionLabel,
    required this.workflowBusy,
    required this.onCallClient,
    required this.onNavigate,
    required this.onOpenSiteHistory,
    required this.onFailure,
    required this.onPostpone,
    this.gpsStatusListenable,
    this.onRequestGpsPermission,
    this.onOpenGpsSettings,
    this.onOpenGpsAppSettings,
  });

  final Job? job;
  final bool isOnline;
  final int pendingActions;
  final VoidCallback onOpenActions;
  final VoidCallback onAdvanceWorkflow;
  final String? workflowActionCode;
  final String? workflowActionLabel;
  final bool workflowBusy;
  final VoidCallback onCallClient;
  final VoidCallback onNavigate;
  final VoidCallback onOpenSiteHistory;
  final VoidCallback onFailure;
  final VoidCallback onPostpone;
  final ValueListenable<GpsStatusSnapshot>? gpsStatusListenable;
  final Future<void> Function()? onRequestGpsPermission;
  final Future<void> Function()? onOpenGpsSettings;
  final Future<void> Function()? onOpenGpsAppSettings;

  @override
  Widget build(BuildContext context) {
    final intervention = job;

    if (intervention == null) {
      return const SafeArea(child: _NoCurrentIntervention());
    }

    final statusColor = MobileJobPresenter.statusColor(intervention);
    final effectiveGpsStatus =
        gpsStatusListenable ?? LocationService.statusListenable;

    final effectiveRequestGpsPermission =
        onRequestGpsPermission ??
        () async {
          final granted = await LocationService.requestPermission();
          if (granted) {
            await LocationService.getCurrentPosition();
          }
        };

    final effectiveOpenGpsSettings =
        onOpenGpsSettings ??
        () async {
          await LocationService.openLocationSettings();
        };

    final effectiveOpenGpsAppSettings =
        onOpenGpsAppSettings ??
        () async {
          await LocationService.openAppSettings();
        };

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
                BlueVectorSpacing.md,
                BlueVectorSpacing.md,
                BlueVectorSpacing.lg,
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
                const SizedBox(height: BlueVectorSpacing.md),
                _ClientCard(
                  job: intervention,
                  onOpenSiteHistory: onOpenSiteHistory,
                ),
                const SizedBox(height: BlueVectorSpacing.xs),
                _OperationalIndicators(
                  job: intervention,
                  isOnline: isOnline,
                  pendingActions: pendingActions,
                  gpsStatusListenable: effectiveGpsStatus,
                ),
                const SizedBox(height: BlueVectorSpacing.xs),
                _GpsRecoveryCard(
                  gpsStatusListenable: effectiveGpsStatus,
                  onRequestPermission: effectiveRequestGpsPermission,
                  onOpenLocationSettings: effectiveOpenGpsSettings,
                  onOpenAppSettings: effectiveOpenGpsAppSettings,
                ),
                _GpsLastPositionCard(gpsStatusListenable: effectiveGpsStatus),
                MobileFieldContextCard(jobId: intervention.id),
                const SizedBox(height: BlueVectorSpacing.md),
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
                if (_NetworkDataCard.hasData(intervention)) ...[
                  const SizedBox(height: BlueVectorSpacing.md),
                  _NetworkDataCard(job: intervention),
                ],
              ],
            ),
          ),
          _ActionBar(
            onOpenActions: onOpenActions,
            onAdvanceWorkflow: onAdvanceWorkflow,
            workflowActionCode: workflowActionCode,
            workflowActionLabel: workflowActionLabel,
            workflowBusy: workflowBusy,
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
    final customerName = job.customerName.isEmpty
        ? 'Client non renseigné'
        : job.customerName;
    final phone = job.customerPhone?.trim();
    final address = job.serviceAddress.isEmpty
        ? 'Adresse non renseignée'
        : job.serviceAddress;

    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
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
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: BlueVectorColors.primarySoft,
                  borderRadius: BorderRadius.circular(BlueVectorRadius.small),
                ),
                child: const Icon(
                  Icons.person_outline_rounded,
                  color: BlueVectorColors.primaryBright,
                  size: 19,
                ),
              ),
              const SizedBox(width: BlueVectorSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      customerName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: BlueVectorColors.textPrimary,
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (phone?.isNotEmpty == true) ...[
                      const SizedBox(height: 1),
                      Text(
                        phone!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: BlueVectorColors.textSecondary,
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              TextButton.icon(
                onPressed: onOpenSiteHistory,
                icon: const Icon(Icons.history_rounded, size: 16),
                label: const Text('Historique'),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  visualDensity: VisualDensity.compact,
                  textStyle: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: BlueVectorSpacing.xs),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.location_on_outlined,
                color: BlueVectorColors.textMuted,
                size: 16,
              ),
              const SizedBox(width: BlueVectorSpacing.xs),
              Expanded(
                child: Text(
                  address,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: BlueVectorColors.textSecondary,
                    fontSize: 11,
                    height: 1.3,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _GpsRecoveryCard extends StatelessWidget {
  const _GpsRecoveryCard({
    required this.gpsStatusListenable,
    required this.onRequestPermission,
    required this.onOpenLocationSettings,
    required this.onOpenAppSettings,
  });

  final ValueListenable<GpsStatusSnapshot> gpsStatusListenable;
  final Future<void> Function() onRequestPermission;
  final Future<void> Function() onOpenLocationSettings;
  final Future<void> Function() onOpenAppSettings;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<GpsStatusSnapshot>(
      valueListenable: gpsStatusListenable,
      builder: (context, gpsStatus, _) {
        final String message;
        final String actionLabel;
        final Future<void> Function() action;

        switch (gpsStatus.availability) {
          case GpsAvailability.permissionDenied:
            message = 'Autorisation GPS nécessaire';
            actionLabel = 'Autoriser';
            action = onRequestPermission;
          case GpsAvailability.serviceDisabled:
            message = 'GPS du téléphone désactivé';
            actionLabel = 'Réglages GPS';
            action = onOpenLocationSettings;
          case GpsAvailability.permissionDeniedForever:
            message = 'Autorisation GPS bloquée';
            actionLabel = 'Réglages app';
            action = onOpenAppSettings;
          case GpsAvailability.error:
            message = 'Position GPS indisponible';
            actionLabel = 'Réessayer';
            action = onRequestPermission;
          case GpsAvailability.unknown:
          case GpsAvailability.ready:
            return const SizedBox.shrink();
        }

        return Padding(
          padding: const EdgeInsets.only(bottom: BlueVectorSpacing.xs),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(
              horizontal: BlueVectorSpacing.sm,
              vertical: BlueVectorSpacing.xs,
            ),
            decoration: BoxDecoration(
              color: BlueVectorColors.surfaceSoft,
              borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
              border: Border.all(color: BlueVectorColors.border),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.location_disabled_outlined,
                  color: BlueVectorColors.warning,
                  size: 18,
                ),
                const SizedBox(width: BlueVectorSpacing.xs),
                Expanded(
                  child: Text(
                    message,
                    style: const TextStyle(
                      color: BlueVectorColors.textPrimary,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () async {
                    await action();
                  },
                  child: Text(actionLabel),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _GpsLastPositionCard extends StatelessWidget {
  const _GpsLastPositionCard({required this.gpsStatusListenable});

  final ValueListenable<GpsStatusSnapshot> gpsStatusListenable;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<GpsStatusSnapshot>(
      valueListenable: gpsStatusListenable,
      builder: (context, gpsStatus, _) {
        if (!gpsStatus.hasPosition) {
          return const SizedBox.shrink();
        }

        final latitude = gpsStatus.latitude!;
        final longitude = gpsStatus.longitude!;
        final accuracy = gpsStatus.accuracy;
        final positionAt = gpsStatus.positionAt?.toLocal();

        final timeLabel = positionAt == null
            ? 'heure inconnue'
            : '${positionAt.hour.toString().padLeft(2, '0')}:'
                  '${positionAt.minute.toString().padLeft(2, '0')}';

        final accuracyLabel = accuracy == null
            ? null
            : '±${accuracy.round()} m';

        final details = <String>[
          '${latitude.toStringAsFixed(5)}, ${longitude.toStringAsFixed(5)}',
          ?accuracyLabel,
          timeLabel,
        ].join(' · ');

        return Padding(
          padding: const EdgeInsets.only(bottom: BlueVectorSpacing.xs),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(
              horizontal: BlueVectorSpacing.sm,
              vertical: BlueVectorSpacing.xs,
            ),
            decoration: BoxDecoration(
              color: BlueVectorColors.surfaceSoft,
              borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
              border: Border.all(color: BlueVectorColors.border),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.my_location_rounded,
                  size: 18,
                  color: BlueVectorColors.primary,
                ),
                const SizedBox(width: BlueVectorSpacing.xs),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Dernière position',
                        style: Theme.of(context).textTheme.labelMedium
                            ?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: BlueVectorColors.textPrimary,
                            ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        details,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: BlueVectorColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _OperationalIndicators extends StatelessWidget {
  const _OperationalIndicators({
    required this.job,
    required this.isOnline,
    required this.pendingActions,
    required this.gpsStatusListenable,
  });

  final Job job;
  final bool isOnline;
  final int pendingActions;
  final ValueListenable<GpsStatusSnapshot> gpsStatusListenable;

  @override
  Widget build(BuildContext context) {
    String gpsValue(GpsStatusSnapshot status) {
      switch (status.availability) {
        case GpsAvailability.ready:
          if (status.accuracy != null) {
            return '±${status.accuracy!.round()} m';
          }
          return status.isLiveTracking ? 'Recherche…' : 'Prêt';
        case GpsAvailability.serviceDisabled:
          return 'Désactivé';
        case GpsAvailability.permissionDenied:
          return 'Refusée';
        case GpsAvailability.permissionDeniedForever:
          return 'Bloqué';
        case GpsAvailability.error:
          return 'Erreur';
        case GpsAvailability.unknown:
          return 'À vérifier';
      }
    }

    Color gpsColor(GpsStatusSnapshot status) {
      switch (status.availability) {
        case GpsAvailability.ready:
          return BlueVectorColors.success;
        case GpsAvailability.permissionDeniedForever:
        case GpsAvailability.error:
          return BlueVectorColors.danger;
        case GpsAvailability.unknown:
        case GpsAvailability.serviceDisabled:
        case GpsAvailability.permissionDenied:
          return BlueVectorColors.warning;
      }
    }

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
        const SizedBox(width: BlueVectorSpacing.xxs),
        Expanded(
          child: ValueListenableBuilder<GpsStatusSnapshot>(
            valueListenable: gpsStatusListenable,
            builder: (context, gpsStatus, _) => _Indicator(
              icon: gpsStatus.availability == GpsAvailability.ready
                  ? Icons.gps_fixed_rounded
                  : Icons.gps_off_rounded,
              label: 'GPS',
              value: gpsValue(gpsStatus),
              color: gpsColor(gpsStatus),
            ),
          ),
        ),
        const SizedBox(width: BlueVectorSpacing.xxs),
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
      constraints: const BoxConstraints(minHeight: 54),
      padding: const EdgeInsets.symmetric(
        horizontal: BlueVectorSpacing.xs,
        vertical: BlueVectorSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.small),
        border: Border.all(color: BlueVectorColors.border),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: BlueVectorSpacing.xs),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: BlueVectorColors.textMuted,
                    fontSize: 8,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  value,
                  style: const TextStyle(
                    color: BlueVectorColors.textPrimary,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
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

  static bool hasData(Job job) =>
      [job.operator, job.pto].any((value) => value?.trim().isNotEmpty == true);

  @override
  Widget build(BuildContext context) {
    final values = [
      ('Opérateur', job.operator),
      ('PTO', job.pto),
    ].where((value) => value.$2?.trim().isNotEmpty == true).toList();

    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
        border: Border.all(color: BlueVectorColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(
                Icons.hub_outlined,
                color: BlueVectorColors.primaryBright,
                size: 16,
              ),
              SizedBox(width: BlueVectorSpacing.xs),
              Text(
                'Informations utiles',
                style: TextStyle(
                  color: BlueVectorColors.textPrimary,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: BlueVectorSpacing.xs),
          LayoutBuilder(
            builder: (context, constraints) {
              final itemWidth =
                  (constraints.maxWidth - BlueVectorSpacing.xs) / 2;

              return Wrap(
                spacing: BlueVectorSpacing.xs,
                runSpacing: BlueVectorSpacing.xs,
                children: [
                  for (final value in values)
                    SizedBox(
                      width: itemWidth,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: BlueVectorSpacing.xs,
                          vertical: BlueVectorSpacing.xs,
                        ),
                        decoration: BoxDecoration(
                          color: BlueVectorColors.surfaceSoft,
                          borderRadius: BorderRadius.circular(
                            BlueVectorRadius.small,
                          ),
                          border: Border.all(color: BlueVectorColors.border),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              value.$1,
                              style: const TextStyle(
                                color: BlueVectorColors.textMuted,
                                fontSize: 8,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              value.$2!.trim(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: BlueVectorColors.textPrimary,
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              );
            },
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
    required this.workflowActionCode,
    required this.workflowActionLabel,
    required this.workflowBusy,
  });

  final VoidCallback onOpenActions;
  final VoidCallback onAdvanceWorkflow;
  final String? workflowActionCode;
  final String? workflowActionLabel;
  final bool workflowBusy;

  IconData get _workflowIcon => switch (workflowActionCode) {
    'accept_and_start' => Icons.play_arrow_rounded,
    'arrive' => Icons.location_on_rounded,
    'start_work' => Icons.construction_rounded,
    'close_field_visit' => Icons.task_alt_rounded,
    _ => Icons.arrow_forward_rounded,
  };

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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (workflowActionLabel != null) ...[
            const Row(
              children: [
                Icon(
                  Icons.route_rounded,
                  color: BlueVectorColors.primaryBright,
                  size: 16,
                ),
                SizedBox(width: BlueVectorSpacing.xs),
                Text(
                  'PROCHAINE ÉTAPE',
                  style: TextStyle(
                    color: BlueVectorColors.textSecondary,
                    fontSize: 9,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.1,
                  ),
                ),
              ],
            ),
            const SizedBox(height: BlueVectorSpacing.xs),
            FilledButton.icon(
              onPressed: workflowBusy ? null : onAdvanceWorkflow,
              icon: workflowBusy
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Icon(_workflowIcon),
              label: Text(
                workflowBusy ? 'Mise à jour en cours…' : workflowActionLabel!,
              ),
            ),
            const SizedBox(height: BlueVectorSpacing.xs),
          ],
          if (workflowActionLabel == null)
            OutlinedButton.icon(
              onPressed: workflowBusy ? null : onOpenActions,
              icon: const Icon(Icons.add_circle_outline_rounded),
              label: const Text('Ajouter une trace terrain'),
            ),
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
