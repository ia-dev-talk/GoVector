import 'package:flutter/material.dart';
import 'dart:async';

import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import '../../services/location_service.dart';
import '../../services/offline_service.dart';
import '../../widgets/barcode_scanner_widget.dart';
import 'client_signature_screen.dart';
import 'free_document_action_screen.dart';
import 'free_measurement_action_screen.dart';
import 'free_photo_action_screen.dart';

Future<void> showMobileActionSheet({
  required BuildContext context,
  required Job job,
  required int technicianId,
  required Future<void> Function() onDataChanged,
}) async {
  final pageContext = context;

  void showMessage(String message) {
    if (!pageContext.mounted) return;
    ScaffoldMessenger.of(
      pageContext,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> openScreen(Widget screen) async {
    await Navigator.of(
      pageContext,
    ).push(MaterialPageRoute<void>(builder: (_) => screen));

    await onDataChanged();
  }

  Future<void> recordGps({
    required String action,
    required String successMessage,
  }) async {
    final position = await LocationService.getCurrentPosition();
    if (position == null) {
      showMessage('Position GPS indisponible.');
      return;
    }
    await OfflineService.addPendingAction(
      action: action,
      data: {
        'job_id': job.id,
        'latitude': position.latitude,
        'longitude': position.longitude,
        'accuracy': position.accuracy,
      },
    );
    unawaited(OfflineService.syncPendingActions());
    await onDataChanged();
    showMessage(successMessage);
  }

  Future<void> callClient() async {
    final phone = job.customerPhone?.trim();

    if (phone == null || phone.isEmpty) {
      if (!pageContext.mounted) {
        return;
      }

      ScaffoldMessenger.of(pageContext).showSnackBar(
        const SnackBar(content: Text('Téléphone client non renseigné.')),
      );
      return;
    }

    final uri = Uri(scheme: 'tel', path: phone);

    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
      await OfflineService.addPendingAction(
        action: 'client_call',
        data: {'job_id': job.id, 'outcome': 'Appel lancé'},
      );
      unawaited(OfflineService.syncPendingActions());
      await onDataChanged();
    }
  }

  Future<void> captureVideo() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: pageContext,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.videocam_outlined),
              title: const Text('Caméra'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.video_library_outlined),
              title: const Text('Galerie'),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;
    final video = await ImagePicker().pickVideo(
      source: source,
      maxDuration: const Duration(minutes: 3),
    );

    if (video == null) {
      return;
    }

    await OfflineService.addPendingMedia(
      jobId: job.id,
      sourcePath: video.path,
      kind: 'video',
      eventType: 'intervention_video',
      mimeType: video.mimeType ?? 'video/mp4',
      metadata: {'captured_at': DateTime.now().toUtc().toIso8601String()},
    );
    unawaited(OfflineService.syncPendingActions());
    await onDataChanged();
    showMessage('Vidéo enregistrée pour synchronisation.');
  }

  Future<void> promptTextAction({
    required String title,
    required String action,
    required String hint,
  }) async {
    final controller = TextEditingController();
    final value = await showDialog<String>(
      context: pageContext,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          minLines: 3,
          maxLines: 6,
          decoration: InputDecoration(hintText: hint),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () {
              final text = controller.text.trim();

              if (text.isNotEmpty) {
                Navigator.pop(dialogContext, text);
              }
            },
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );
    controller.dispose();

    if (value == null) {
      return;
    }

    await OfflineService.addPendingAction(
      action: action,
      data: {
        'job_id': job.id,
        'value': value,
        'created_at': DateTime.now().toIso8601String(),
      },
    );
    unawaited(OfflineService.syncPendingActions());
    await onDataChanged();
    showMessage('$title enregistré.');
  }

  Future<void> promptNetworkReference() async {
    final controller = TextEditingController();
    var referenceType = 'pto';
    final result = await showDialog<Map<String, String>>(
      context: pageContext,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Référence réseau observée'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Choisissez ce que vous relevez. La valeur préparée par le bureau reste conservée en cas de différence.',
              ),
              const SizedBox(height: BlueVectorSpacing.sm),
              DropdownButtonFormField<String>(
                initialValue: referenceType,
                decoration: const InputDecoration(labelText: 'Type de repère'),
                items: const [
                  DropdownMenuItem(value: 'pto', child: Text('PTO')),
                  DropdownMenuItem(value: 'pbo', child: Text('PBO')),
                  DropdownMenuItem(value: 'pm', child: Text('PM / SRO')),
                ],
                onChanged: (value) {
                  if (value != null) {
                    setDialogState(() => referenceType = value);
                  }
                },
              ),
              const SizedBox(height: BlueVectorSpacing.sm),
              TextField(
                controller: controller,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Référence lue sur place',
                  hintText: 'Ex. PTO-CASA-001234',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Annuler'),
            ),
            FilledButton(
              onPressed: () {
                final value = controller.text.trim();
                if (value.isNotEmpty) {
                  Navigator.pop(dialogContext, {
                    'reference_type': referenceType,
                    'value': value,
                  });
                }
              },
              child: const Text('Enregistrer'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    if (result == null) return;
    await OfflineService.addPendingAction(
      action: 'network_reference',
      data: {
        'job_id': job.id,
        ...result,
        'created_at': DateTime.now().toIso8601String(),
      },
    );
    unawaited(OfflineService.syncPendingActions());
    await onDataChanged();
    showMessage('${result['reference_type']?.toUpperCase()} enregistré.');
  }

  Future<void> scanEquipment() async {
    final result = await Navigator.of(pageContext).push<EquipmentScanResult>(
      MaterialPageRoute<EquipmentScanResult>(
        builder: (_) => const BarcodeScannerWidget(),
      ),
    );

    if (result == null) {
      return;
    }

    await OfflineService.addPendingAction(
      action: 'equipment_scan',
      data: {
        'job_id': job.id,
        'code': result.code,
        'category': result.category.name,
        'label': result.label,
      },
    );
    unawaited(OfflineService.syncPendingActions());
    await onDataChanged();
    showMessage('Équipement ${result.code} ajouté.');
  }

  await showModalBottomSheet<void>(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    builder: (sheetContext) {
      final actions = <_MobileAction>[
        _MobileAction(
          category: _ActionCategory.documenter,
          label: 'Photo',
          icon: Icons.photo_camera_outlined,
          color: BlueVectorColors.primaryBright,
          onTap: () => openScreen(FreePhotoActionScreen(job: job)),
        ),
        _MobileAction(
          category: _ActionCategory.documenter,
          label: 'Vidéo',
          icon: Icons.videocam_outlined,
          color: BlueVectorColors.violet,
          onTap: captureVideo,
        ),
        _MobileAction(
          category: _ActionCategory.relever,
          label: 'Mesure / test',
          icon: Icons.speed_outlined,
          color: BlueVectorColors.success,
          onTap: () => openScreen(FreeMeasurementActionScreen(job: job)),
        ),
        _MobileAction(
          category: _ActionCategory.relever,
          label: 'OTDR',
          icon: Icons.monitor_heart_outlined,
          color: BlueVectorColors.warning,
          onTap: () => openScreen(
            FreeMeasurementActionScreen(job: job, initialType: 'otdr'),
          ),
        ),
        _MobileAction(
          category: _ActionCategory.compteRendu,
          label: 'Commentaire',
          icon: Icons.chat_bubble_outline_rounded,
          color: BlueVectorColors.warning,
          onTap: () => promptTextAction(
            title: 'Commentaire',
            action: 'intervention_comment',
            hint: 'Ajouter une observation terrain…',
          ),
        ),
        _MobileAction(
          category: _ActionCategory.compteRendu,
          label: 'Installation / travaux',
          icon: Icons.construction_outlined,
          color: BlueVectorColors.cyan,
          onTap: () => promptTextAction(
            title: 'Installation / travaux',
            action: 'installation_work',
            hint: 'Type de travail ou note terrain…',
          ),
        ),
        _MobileAction(
          category: _ActionCategory.relever,
          label: 'PBO / PM / PTO',
          icon: Icons.inventory_2_outlined,
          color: BlueVectorColors.violet,
          onTap: promptNetworkReference,
        ),
        _MobileAction(
          category: _ActionCategory.compteRendu,
          label: 'Incident / anomalie',
          icon: Icons.warning_amber_rounded,
          color: BlueVectorColors.danger,
          onTap: () => promptTextAction(
            title: 'Incident / anomalie',
            action: 'incident_report',
            hint: 'Décrire l’incident ou l’anomalie…',
          ),
        ),
        _MobileAction(
          category: _ActionCategory.relever,
          label: 'Matériel utilisé',
          icon: Icons.inventory_2_outlined,
          color: BlueVectorColors.primaryBright,
          onTap: () => promptTextAction(
            title: 'Matériel utilisé',
            action: 'material_used',
            hint: 'Article, quantité et référence…',
          ),
        ),
        _MobileAction(
          category: _ActionCategory.documenter,
          label: 'Signature client',
          icon: Icons.draw_outlined,
          color: BlueVectorColors.success,
          onTap: () => openScreen(
            ClientSignatureScreen(
              jobId: job.id,
              customerName: job.customerName,
            ),
          ),
        ),
        _MobileAction(
          category: _ActionCategory.documenter,
          label: 'Document',
          icon: Icons.description_outlined,
          color: BlueVectorColors.violet,
          onTap: () => openScreen(FreeDocumentActionScreen(job: job)),
        ),
        _MobileAction(
          category: _ActionCategory.relever,
          label: 'Position exacte du site',
          icon: Icons.location_on_outlined,
          color: BlueVectorColors.warning,
          onTap: () => recordGps(
            action: 'site_location',
            successMessage: 'Position terrain du site enregistrée.',
          ),
        ),
        _MobileAction(
          category: _ActionCategory.relever,
          label: 'Entrée câble',
          icon: Icons.login_rounded,
          color: BlueVectorColors.cyan,
          onTap: () => recordGps(
            action: 'cable_entry',
            successMessage: 'Entrée de câble enregistrée.',
          ),
        ),
        _MobileAction(
          category: _ActionCategory.relever,
          label: 'Sortie câble',
          icon: Icons.logout_rounded,
          color: BlueVectorColors.cyan,
          onTap: () => recordGps(
            action: 'cable_exit',
            successMessage: 'Sortie de câble enregistrée.',
          ),
        ),
        _MobileAction(
          category: _ActionCategory.compteRendu,
          label: 'Appel client',
          icon: Icons.call_outlined,
          color: BlueVectorColors.success,
          onTap: callClient,
        ),
        _MobileAction(
          category: _ActionCategory.relever,
          label: 'Scan QR / code-barres',
          icon: Icons.qr_code_scanner_rounded,
          color: BlueVectorColors.cyan,
          onTap: scanEquipment,
        ),
        _MobileAction(
          category: _ActionCategory.compteRendu,
          label: 'Autre action',
          icon: Icons.more_horiz_rounded,
          color: BlueVectorColors.textSecondary,
          onTap: () => promptTextAction(
            title: 'Autre action',
            action: 'custom_intervention_action',
            hint: 'Décrire l’action effectuée…',
          ),
        ),
      ];

      return DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.88,
        minChildSize: 0.55,
        maxChildSize: 0.96,
        builder: (context, scrollController) => ListView(
          controller: scrollController,
          padding: EdgeInsets.fromLTRB(
            BlueVectorSpacing.md,
            BlueVectorSpacing.xs,
            BlueVectorSpacing.md,
            BlueVectorSpacing.lg + MediaQuery.viewInsetsOf(sheetContext).bottom,
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
                      const SizedBox(height: BlueVectorSpacing.xxs),
                      Text(
                        job.jobNumber.isEmpty
                            ? 'Intervention #${job.id}'
                            : job.jobNumber,
                        style: const TextStyle(
                          color: BlueVectorColors.textSecondary,
                          fontSize: 11,
                        ),
                      ),
                      if (job.customerName.trim().isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          job.customerName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: BlueVectorColors.textMuted,
                            fontSize: 11,
                          ),
                        ),
                      ],
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
            for (final category in _ActionCategory.values) ...[
              _ActionSectionHeader(category: category),
              const SizedBox(height: BlueVectorSpacing.xs),
              Builder(
                builder: (context) {
                  final categoryActions = actions
                      .where((action) => action.category == category)
                      .toList();
                  return GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: categoryActions.length,
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          crossAxisSpacing: BlueVectorSpacing.xs,
                          mainAxisSpacing: BlueVectorSpacing.xs,
                          childAspectRatio: 1.72,
                        ),
                    itemBuilder: (context, index) {
                      final action = categoryActions[index];
                      return _ActionTile(
                        action: action,
                        onPressed: () async {
                          Navigator.pop(sheetContext);
                          await action.onTap();
                        },
                      );
                    },
                  );
                },
              ),
              const SizedBox(height: BlueVectorSpacing.lg),
            ],
          ],
        ),
      );
    },
  );
}

Future<void> _showJobInformation(BuildContext context, Job job) {
  final values = [
    ('Type', job.jobType),
    ('Opérateur', job.operator),
    ('Client', job.customerName),
    ('Téléphone', job.customerPhone),
    ('Adresse', job.serviceAddress),
    ('NRO', job.nro),
    ('SRO', job.sro),
    ('PBO', job.pbo),
    ('PTO', job.pto),
  ];

  return showModalBottomSheet<void>(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    builder: (sheetContext) {
      return DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.72,
        minChildSize: 0.45,
        maxChildSize: 0.92,
        builder: (context, controller) {
          return ListView(
            controller: controller,
            padding: const EdgeInsets.fromLTRB(
              BlueVectorSpacing.md,
              BlueVectorSpacing.xs,
              BlueVectorSpacing.md,
              BlueVectorSpacing.xl,
            ),
            children: [
              Text(
                'Informations intervention',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: BlueVectorSpacing.xs),
              Text(
                job.jobNumber.isEmpty
                    ? 'Intervention #${job.id}'
                    : job.jobNumber,
                style: const TextStyle(color: BlueVectorColors.textSecondary),
              ),
              const SizedBox(height: BlueVectorSpacing.lg),
              for (final value in values)
                Container(
                  padding: const EdgeInsets.symmetric(
                    vertical: BlueVectorSpacing.sm,
                  ),
                  decoration: const BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: BlueVectorColors.border),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: 92,
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
          );
        },
      );
    },
  );
}

class _MobileAction {
  const _MobileAction({
    required this.category,
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  final _ActionCategory category;
  final String label;
  final IconData icon;
  final Color color;
  final Future<void> Function() onTap;
}

enum _ActionCategory { documenter, relever, compteRendu }

extension on _ActionCategory {
  String get label => switch (this) {
    _ActionCategory.documenter => 'DOCUMENTER',
    _ActionCategory.relever => 'RELEVER SUR LE TERRAIN',
    _ActionCategory.compteRendu => 'RENDRE COMPTE',
  };

  IconData get icon => switch (this) {
    _ActionCategory.documenter => Icons.attach_file_rounded,
    _ActionCategory.relever => Icons.location_searching_rounded,
    _ActionCategory.compteRendu => Icons.notes_rounded,
  };
}

class _ActionSectionHeader extends StatelessWidget {
  const _ActionSectionHeader({required this.category});

  final _ActionCategory category;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(category.icon, size: 15, color: BlueVectorColors.primaryBright),
        const SizedBox(width: BlueVectorSpacing.xs),
        Text(
          category.label,
          style: const TextStyle(
            color: BlueVectorColors.textSecondary,
            fontSize: 9,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.05,
          ),
        ),
      ],
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.action, required this.onPressed});

  final _MobileAction action;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: BlueVectorColors.surfaceRaised,
      borderRadius: BorderRadius.circular(BlueVectorRadius.small),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(BlueVectorRadius.small),
        child: Container(
          padding: const EdgeInsets.all(BlueVectorSpacing.sm),
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
                  color: action.color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(BlueVectorRadius.small),
                ),
                child: Icon(action.icon, color: action.color, size: 21),
              ),
              const SizedBox(width: BlueVectorSpacing.sm),
              Expanded(
                child: Text(
                  action.label,
                  style: const TextStyle(
                    color: BlueVectorColors.textPrimary,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    height: 1.15,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
