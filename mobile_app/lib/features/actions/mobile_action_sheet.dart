import 'dart:async';

import 'package:flutter/material.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import '../../services/offline_service.dart';
import 'cable_endpoint_screen.dart';
import 'free_measurement_action_screen.dart';
import 'free_photo_action_screen.dart';
import 'intervention_photos_screen.dart';
import 'material_used_screen.dart';
import 'pilot_dynamic_form_screen.dart';

/// Delivery action sheet for the GoVector FTTH pilot.
///
/// The historical mobile exposed every generic BlueVector capability here,
/// which made simple field work look like a toolbox. The pilot intentionally
/// keeps only the actions a technician needs repeatedly. Specific PCO/PTO/
/// splitter evidence belongs inside the relevant dynamic business form.
Future<void> showMobileActionSheet({
  required BuildContext context,
  required Job job,
  required int technicianId,
  required Future<void> Function() onDataChanged,
}) async {
  final pageContext = context;

  void showMessage(String message) {
    if (!pageContext.mounted) return;
    ScaffoldMessenger.of(pageContext).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  Future<void> openScreen(Widget screen) async {
    await Navigator.of(pageContext).push(
      MaterialPageRoute<void>(builder: (_) => screen),
    );
    await onDataChanged();
  }

  Future<void> promptTextAction({
    required String title,
    required String action,
    required String hint,
  }) async {
    final controller = TextEditingController();
    final value = await showModalBottomSheet<String>(
      context: pageContext,
      useSafeArea: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) {
        final keyboardInset = MediaQuery.viewInsetsOf(sheetContext).bottom;
        return AnimatedPadding(
          duration: const Duration(milliseconds: 180),
          padding: EdgeInsets.only(bottom: keyboardInset),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
              BlueVectorSpacing.md,
              BlueVectorSpacing.sm,
              BlueVectorSpacing.md,
              BlueVectorSpacing.lg,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(title, style: Theme.of(sheetContext).textTheme.titleLarge),
                const SizedBox(height: BlueVectorSpacing.sm),
                TextField(
                  controller: controller,
                  autofocus: true,
                  minLines: 3,
                  maxLines: 6,
                  textInputAction: TextInputAction.newline,
                  decoration: InputDecoration(hintText: hint),
                ),
                const SizedBox(height: BlueVectorSpacing.md),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.pop(sheetContext),
                        child: const Text('Annuler'),
                      ),
                    ),
                    const SizedBox(width: BlueVectorSpacing.xs),
                    Expanded(
                      flex: 2,
                      child: FilledButton(
                        onPressed: () {
                          final text = controller.text.trim();
                          if (text.isNotEmpty) Navigator.pop(sheetContext, text);
                        },
                        child: const Text('Enregistrer'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
    controller.dispose();
    if (value == null || value.trim().isEmpty) return;

    await OfflineService.addPendingAction(
      action: action,
      data: {
        'job_id': job.id,
        'value': value.trim(),
        'created_at': DateTime.now().toUtc().toIso8601String(),
      },
    );
    unawaited(OfflineService.syncPendingActions());
    await onDataChanged();
    showMessage('$title enregistré.');
  }

  bool hasPilotBusinessForm() {
    final type = job.jobType
        .trim()
        .toUpperCase()
        .replaceAll(RegExp(r'[\s_-]+'), ' ');
    final isFtthRealisable = type.contains('FTTH') &&
        (type.contains('RÉALISABLE') || type.contains('REALISABLE'));
    return type == 'PB' ||
        type == 'PM' ||
        type == 'PTO' ||
        isFtthRealisable ||
        type.contains('RACCORDEMENT') ||
        type.contains('SORTIE DE PCO') ||
        type == 'TUBAGE';
  }

  final actions = <_PilotAction>[
    _PilotAction(
      section: 'Documenter',
      label: 'Photo',
      subtitle: 'Libre, avant, pendant ou après',
      icon: Icons.photo_camera_outlined,
      color: BlueVectorColors.primaryBright,
      onTap: () => openScreen(FreePhotoActionScreen(job: job)),
    ),
    _PilotAction(
      section: 'Documenter',
      label: 'Voir les photos',
      subtitle: 'Galerie de cette intervention',
      icon: Icons.photo_library_outlined,
      color: BlueVectorColors.primaryBright,
      onTap: () => openScreen(InterventionPhotosScreen(job: job)),
    ),
    _PilotAction(
      section: 'Relever sur le terrain',
      label: 'Mesure / test',
      icon: Icons.speed_outlined,
      color: BlueVectorColors.success,
      onTap: () => openScreen(FreeMeasurementActionScreen(job: job)),
    ),
    _PilotAction(
      section: 'Relever sur le terrain',
      label: 'Entrée câble',
      subtitle: 'FO16, FO64 ou FO96',
      icon: Icons.login_rounded,
      color: BlueVectorColors.cyan,
      onTap: () => openScreen(
        CableEndpointScreen(jobId: job.id, actionType: 'cable_entry'),
      ),
    ),
    _PilotAction(
      section: 'Relever sur le terrain',
      label: 'Sortie câble',
      subtitle: 'Longueur calculée depuis les repères',
      icon: Icons.logout_rounded,
      color: BlueVectorColors.cyan,
      onTap: () => openScreen(
        CableEndpointScreen(jobId: job.id, actionType: 'cable_exit'),
      ),
    ),
    _PilotAction(
      section: 'Relever sur le terrain',
      label: 'Matériel utilisé',
      icon: Icons.inventory_2_outlined,
      color: BlueVectorColors.violet,
      onTap: () => openScreen(MaterialUsedScreen(jobId: job.id)),
    ),
    _PilotAction(
      section: 'Rendre compte',
      label: 'Commentaire',
      icon: Icons.chat_bubble_outline_rounded,
      color: BlueVectorColors.warning,
      onTap: () => promptTextAction(
        title: 'Commentaire',
        action: 'intervention_comment',
        hint: 'Observation à transmettre au bureau…',
      ),
    ),
    _PilotAction(
      section: 'Rendre compte',
      label: 'Incident / anomalie',
      icon: Icons.warning_amber_rounded,
      color: BlueVectorColors.danger,
      onTap: () => promptTextAction(
        title: 'Incident / anomalie',
        action: 'incident_report',
        hint: 'Décrire le problème constaté…',
      ),
    ),
    if (hasPilotBusinessForm())
      _PilotAction(
        section: 'Formulaire métier',
        label: pilotFormSchemaForJobType(job.jobType).label,
        subtitle: 'Champs et preuves propres à cette intervention',
        icon: Icons.assignment_outlined,
        color: BlueVectorColors.primaryBright,
        onTap: () => openScreen(
          PilotDynamicFormScreen(
            job: job,
            schema: pilotFormSchemaForJobType(job.jobType),
          ),
        ),
      ),
  ];

  await showModalBottomSheet<void>(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheetContext) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.72,
      minChildSize: 0.48,
      maxChildSize: 0.90,
      builder: (context, scrollController) {
        final sections = <String>[];
        for (final action in actions) {
          if (!sections.contains(action.section)) sections.add(action.section);
        }
        return ListView(
          controller: scrollController,
          padding: const EdgeInsets.fromLTRB(
            BlueVectorSpacing.md,
            0,
            BlueVectorSpacing.md,
            BlueVectorSpacing.lg,
          ),
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Ajouter une action',
                        style: Theme.of(sheetContext).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        job.jobNumber.isEmpty
                            ? 'Intervention #${job.id}'
                            : job.jobNumber,
                        style: const TextStyle(
                          color: BlueVectorColors.textSecondary,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Fermer',
                  onPressed: () => Navigator.pop(sheetContext),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
            const SizedBox(height: BlueVectorSpacing.sm),
            for (final section in sections) ...[
              Padding(
                padding: const EdgeInsets.only(
                  top: BlueVectorSpacing.sm,
                  bottom: BlueVectorSpacing.xs,
                ),
                child: Text(
                  section.toUpperCase(),
                  style: const TextStyle(
                    color: BlueVectorColors.textMuted,
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.1,
                  ),
                ),
              ),
              for (final action in actions.where((item) => item.section == section))
                Padding(
                  padding: const EdgeInsets.only(bottom: BlueVectorSpacing.xs),
                  child: _ActionTile(action: action),
                ),
            ],
          ],
        );
      },
    ),
  );
}

class _PilotAction {
  const _PilotAction({
    required this.section,
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
    this.subtitle,
  });

  final String section;
  final String label;
  final String? subtitle;
  final IconData icon;
  final Color color;
  final Future<void> Function() onTap;
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.action});

  final _PilotAction action;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: BlueVectorColors.surface,
      borderRadius: BorderRadius.circular(BlueVectorRadius.small),
      child: InkWell(
        borderRadius: BorderRadius.circular(BlueVectorRadius.small),
        onTap: () async {
          Navigator.pop(context);
          await action.onTap();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: BlueVectorSpacing.sm,
            vertical: 12,
          ),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(BlueVectorRadius.small),
            border: Border.all(color: BlueVectorColors.border),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: action.color.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(BlueVectorRadius.small),
                ),
                child: Icon(action.icon, color: action.color, size: 21),
              ),
              const SizedBox(width: BlueVectorSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      action.label,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: BlueVectorColors.textPrimary,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (action.subtitle?.isNotEmpty == true) ...[
                      const SizedBox(height: 2),
                      Text(
                        action.subtitle!,
                        maxLines: 2,
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
              const Icon(
                Icons.chevron_right_rounded,
                color: BlueVectorColors.textMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
