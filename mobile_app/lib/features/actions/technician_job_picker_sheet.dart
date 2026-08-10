import 'package:flutter/material.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import '../interventions/mobile_job_presenter.dart';

Future<Job?> showTechnicianJobPickerSheet({
  required BuildContext context,
  required List<Job> jobs,
  int? currentJobId,
}) {
  final eligible = jobs.where(MobileJobPresenter.isActive).toList()
    ..sort((a, b) {
      if (a.id == currentJobId) return -1;
      if (b.id == currentJobId) return 1;
      return MobileJobPresenter.timeLabel(
        a,
      ).compareTo(MobileJobPresenter.timeLabel(b));
    });
  return showModalBottomSheet<Job>(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    builder: (context) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.68,
      minChildSize: 0.42,
      maxChildSize: 0.9,
      builder: (context, controller) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(BlueVectorSpacing.md),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Pour quelle intervention ?',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
          ),
          Expanded(
            child: eligible.isEmpty
                ? const Center(
                    child: Text(
                      'Aucune intervention active disponible.',
                      style: TextStyle(color: BlueVectorColors.textMuted),
                    ),
                  )
                : ListView.separated(
                    controller: controller,
                    padding: const EdgeInsets.fromLTRB(
                      BlueVectorSpacing.md,
                      0,
                      BlueVectorSpacing.md,
                      BlueVectorSpacing.lg,
                    ),
                    itemCount: eligible.length,
                    separatorBuilder: (_, __) =>
                        const SizedBox(height: BlueVectorSpacing.sm),
                    itemBuilder: (context, index) {
                      final job = eligible[index];
                      final current = job.id == currentJobId;
                      return Material(
                        color: BlueVectorColors.surface,
                        borderRadius: BorderRadius.circular(
                          BlueVectorRadius.medium,
                        ),
                        child: ListTile(
                          onTap: () => Navigator.pop(context, job),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(
                              BlueVectorRadius.medium,
                            ),
                            side: BorderSide(
                              color: current
                                  ? BlueVectorColors.primaryBright
                                  : BlueVectorColors.border,
                            ),
                          ),
                          leading: Icon(
                            MobileJobPresenter.typeIcon(job),
                            color: MobileJobPresenter.statusColor(job),
                          ),
                          title: Text(
                            MobileJobPresenter.title(job),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(
                            '${job.customerName}\n${job.serviceAddress}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          isThreeLine: true,
                          trailing: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(MobileJobPresenter.reference(job)),
                              Text(
                                current
                                    ? 'En cours'
                                    : MobileJobPresenter.statusLabel(job),
                                style: TextStyle(
                                  color: MobileJobPresenter.statusColor(job),
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    ),
  );
}
