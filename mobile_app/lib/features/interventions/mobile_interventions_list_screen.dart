import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../design_system/bluevector_brand.dart';
import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import 'mobile_job_presenter.dart';

class MobileInterventionsListScreen extends StatefulWidget {
  const MobileInterventionsListScreen({
    super.key,
    required this.jobs,
    required this.loading,
    required this.isOnline,
    required this.lastSync,
    required this.technicianName,
    required this.onRefresh,
    required this.onSelect,
  });

  final List<Job> jobs;
  final bool loading;
  final bool isOnline;
  final DateTime? lastSync;
  final String technicianName;
  final Future<void> Function() onRefresh;
  final ValueChanged<Job> onSelect;

  @override
  State<MobileInterventionsListScreen> createState() =>
      _MobileInterventionsListScreenState();
}

class _MobileInterventionsListScreenState
    extends State<MobileInterventionsListScreen> {
  int _tabIndex = 0;
  String _query = '';

  List<Job> get _visibleJobs {
    Iterable<Job> items = widget.jobs;

    switch (_tabIndex) {
      case 0:
        items = items.where(
          (job) =>
              !MobileJobPresenter.isTerminal(job) &&
              (MobileJobPresenter.isToday(job) ||
                  MobileJobPresenter.scheduledAt(job) == null),
        );
        break;
      case 1:
        items = items.where(MobileJobPresenter.isUpcoming);
        break;
      case 2:
        items = items.where(MobileJobPresenter.isTerminal);
        break;
    }

    final query = _query.trim().toLowerCase();

    if (query.isNotEmpty) {
      items = items.where((job) {
        return job.customerName.toLowerCase().contains(query) ||
            job.jobNumber.toLowerCase().contains(query) ||
            job.serviceAddress.toLowerCase().contains(query) ||
            (job.pbo ?? '').toLowerCase().contains(query);
      });
    }

    return items.toList();
  }

  @override
  Widget build(BuildContext context) {
    final tabs = [
      (
        'Aujourd’hui',
        widget.jobs
            .where(
              (job) =>
                  !MobileJobPresenter.isTerminal(job) &&
                  (MobileJobPresenter.isToday(job) ||
                      MobileJobPresenter.scheduledAt(job) == null),
            )
            .length,
      ),
      ('À venir', widget.jobs.where(MobileJobPresenter.isUpcoming).length),
      ('Clôturées', widget.jobs.where(MobileJobPresenter.isTerminal).length),
    ];

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
            child: LayoutBuilder(
              builder: (context, constraints) {
                if (constraints.maxWidth < 460) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const BlueVectorBrand(compact: true, showSubtitle: false),
                      const SizedBox(height: BlueVectorSpacing.xs),
                      _ConnectionBadge(
                        isOnline: widget.isOnline,
                        lastSync: widget.lastSync,
                      ),
                    ],
                  );
                }

                return Row(
                  children: [
                    const BlueVectorBrand(compact: true, showSubtitle: false),
                    const Spacer(),
                    _ConnectionBadge(
                      isOnline: widget.isOnline,
                      lastSync: widget.lastSync,
                    ),
                  ],
                );
              },
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Mes interventions',
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: BlueVectorSpacing.xxs),
                      Text(
                        widget.technicianName.trim().isEmpty
                            ? 'Planning terrain'
                            : 'Bonjour ${widget.technicianName}',
                        style: const TextStyle(
                          color: BlueVectorColors.textSecondary,
                          fontSize: 12,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                IconButton.filledTonal(
                  tooltip: 'Actualiser',
                  onPressed: widget.loading ? null : widget.onRefresh,
                  icon: widget.loading
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.sync_rounded),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: BlueVectorSpacing.md,
            ),
            child: TextField(
              onChanged: (value) {
                setState(() {
                  _query = value;
                });
              },
              decoration: const InputDecoration(
                hintText: 'Intervention, client, adresse…',
                prefixIcon: Icon(Icons.search_rounded),
                isDense: true,
              ),
            ),
          ),
          const SizedBox(height: BlueVectorSpacing.sm),
          SizedBox(
            height: 43,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(
                horizontal: BlueVectorSpacing.md,
              ),
              scrollDirection: Axis.horizontal,
              itemCount: tabs.length,
              separatorBuilder: (_, _) =>
                  const SizedBox(width: BlueVectorSpacing.xs),
              itemBuilder: (context, index) {
                final tab = tabs[index];
                final selected = _tabIndex == index;

                return ChoiceChip(
                  selected: selected,
                  onSelected: (_) {
                    setState(() {
                      _tabIndex = index;
                    });
                  },
                  label: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(tab.$1),
                      const SizedBox(width: BlueVectorSpacing.xs),
                      _CountBadge(value: tab.$2, selected: selected),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: BlueVectorSpacing.sm),
          Expanded(
            child: widget.loading && widget.jobs.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: widget.onRefresh,
                    child: _visibleJobs.isEmpty
                        ? ListView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            children: const [
                              SizedBox(height: 120),
                              _EmptyPlanning(),
                            ],
                          )
                        : ListView.separated(
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.fromLTRB(
                              BlueVectorSpacing.md,
                              0,
                              BlueVectorSpacing.md,
                              112,
                            ),
                            itemCount: _visibleJobs.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(height: BlueVectorSpacing.sm),
                            itemBuilder: (context, index) {
                              final job = _visibleJobs[index];

                              return _JobCard(
                                job: job,
                                onTap: () => widget.onSelect(job),
                              );
                            },
                          ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _JobCard extends StatelessWidget {
  const _JobCard({required this.job, required this.onTap});

  final Job job;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final statusColor = MobileJobPresenter.statusColor(job);

    return Material(
      color: BlueVectorColors.surface,
      borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
        child: Container(
          padding: const EdgeInsets.all(BlueVectorSpacing.md),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
            border: Border.all(color: BlueVectorColors.border),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.12),
                blurRadius: 18,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 58,
                padding: const EdgeInsets.symmetric(
                  vertical: BlueVectorSpacing.sm,
                ),
                decoration: BoxDecoration(
                  color: BlueVectorColors.backgroundDeep,
                  borderRadius: BorderRadius.circular(BlueVectorRadius.small),
                  border: Border.all(
                    color: statusColor.withValues(alpha: 0.32),
                  ),
                ),
                child: Column(
                  children: [
                    Text(
                      MobileJobPresenter.timeLabel(job),
                      style: TextStyle(
                        color: statusColor,
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: BlueVectorSpacing.xxs),
                    Text(
                      MobileJobPresenter.dayLabel(job),
                      style: const TextStyle(
                        color: BlueVectorColors.textMuted,
                        fontSize: 9,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: BlueVectorSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          MobileJobPresenter.typeIcon(job),
                          color: statusColor,
                          size: 17,
                        ),
                        const SizedBox(width: BlueVectorSpacing.xs),
                        Expanded(
                          child: Text(
                            MobileJobPresenter.title(job),
                            style: const TextStyle(
                              color: BlueVectorColors.textPrimary,
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        _StatusPill(job: job),
                      ],
                    ),
                    const SizedBox(height: BlueVectorSpacing.xxs),
                    Text(
                      MobileJobPresenter.reference(job),
                      style: const TextStyle(
                        color: BlueVectorColors.textSecondary,
                        fontSize: 11,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: BlueVectorSpacing.sm),
                    Text(
                      job.customerName.isEmpty
                          ? 'Client non renseigné'
                          : job.customerName,
                      style: const TextStyle(
                        color: BlueVectorColors.textPrimary,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: BlueVectorSpacing.xxs),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.location_on_outlined,
                          color: BlueVectorColors.textMuted,
                          size: 14,
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            job.serviceAddress.isEmpty
                                ? 'Adresse non renseignée'
                                : job.serviceAddress,
                            style: const TextStyle(
                              color: BlueVectorColors.textSecondary,
                              fontSize: 11,
                              height: 1.3,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    if (job.operator != null) ...[
                      const SizedBox(height: BlueVectorSpacing.sm),
                      Wrap(
                        spacing: BlueVectorSpacing.xs,
                        runSpacing: BlueVectorSpacing.xs,
                        children: [
                          if (job.operator != null)
                            _MetaChip(
                              icon: Icons.cell_tower_rounded,
                              label: job.operator!,
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: BlueVectorSpacing.xs),
              const Padding(
                padding: EdgeInsets.only(top: 52),
                child: Icon(
                  Icons.chevron_right_rounded,
                  color: BlueVectorColors.textMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.job});

  final Job job;

  @override
  Widget build(BuildContext context) {
    final color = MobileJobPresenter.statusColor(job);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.13),
        borderRadius: BorderRadius.circular(BlueVectorRadius.pill),
        border: Border.all(color: color.withValues(alpha: 0.34)),
      ),
      child: Text(
        MobileJobPresenter.statusLabel(job),
        style: TextStyle(
          color: color,
          fontSize: 9,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: MediaQuery.sizeOf(context).width * 0.58,
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        decoration: BoxDecoration(
          color: BlueVectorColors.surfaceSoft,
          borderRadius: BorderRadius.circular(BlueVectorRadius.pill),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: BlueVectorColors.textSecondary, size: 12),
            const SizedBox(width: 4),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: BlueVectorColors.textSecondary,
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ConnectionBadge extends StatelessWidget {
  const _ConnectionBadge({required this.isOnline, required this.lastSync});

  final bool isOnline;
  final DateTime? lastSync;

  @override
  Widget build(BuildContext context) {
    final color = isOnline
        ? BlueVectorColors.success
        : BlueVectorColors.warning;

    final syncLabel = lastSync == null
        ? null
        : DateFormat('HH:mm', 'fr_FR').format(lastSync!);

    final connectionLabel = isOnline
        ? 'En ligne'
        : syncLabel == null
        ? 'Hors ligne'
        : 'Hors ligne · dernière sync $syncLabel';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(BlueVectorRadius.pill),
        border: Border.all(color: color.withValues(alpha: 0.28)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: BlueVectorSpacing.xs),
          Text(
            connectionLabel,
            style: TextStyle(
              color: color,
              fontSize: 10,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _CountBadge extends StatelessWidget {
  const _CountBadge({required this.value, required this.selected});

  final int value;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 20),
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: selected
            ? BlueVectorColors.primary
            : BlueVectorColors.surfaceSoft,
        borderRadius: BorderRadius.circular(BlueVectorRadius.pill),
      ),
      child: Text(
        '$value',
        style: TextStyle(
          color: selected ? Colors.white : BlueVectorColors.textSecondary,
          fontSize: 9,
          fontWeight: FontWeight.w800,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }
}

class _EmptyPlanning extends StatelessWidget {
  const _EmptyPlanning();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(BlueVectorSpacing.xl),
        child: Column(
          children: [
            Icon(
              Icons.event_available_outlined,
              color: BlueVectorColors.textMuted,
              size: 44,
            ),
            SizedBox(height: BlueVectorSpacing.md),
            Text(
              'Aucune intervention dans cette vue',
              style: TextStyle(
                color: BlueVectorColors.textPrimary,
                fontWeight: FontWeight.w800,
              ),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: BlueVectorSpacing.xs),
            Text(
              'Actualise le planning ou change d’onglet.',
              style: TextStyle(color: BlueVectorColors.textMuted, fontSize: 12),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
