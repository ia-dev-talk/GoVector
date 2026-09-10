import 'package:flutter/material.dart';
import 'dart:async';

import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import '../../services/location_service.dart';
import '../../services/intervention_service.dart';
import '../../services/offline_service.dart';
import '../../widgets/barcode_scanner_widget.dart';
import 'cable_endpoint_screen.dart';
import 'client_signature_screen.dart';
import 'free_document_action_screen.dart';
import 'free_measurement_action_screen.dart';
import 'free_photo_action_screen.dart';
import 'material_used_screen.dart';
import 'mobile_sketch_screen.dart';
import 'pilot_dynamic_form_screen.dart';

Future<void> showMobileActionSheet({
  required BuildContext context,
  required Job job,
  required int technicianId,
  required Future<void> Function() onDataChanged,
}) async {
  final pageContext = context;
  Map<String, Map<String, dynamic>> configuredActions = {};
  try {
    final catalog = await InterventionService.getBusinessCatalog();
    final values = catalog['values'];
    final actions = values is Map<String, dynamic>
        ? values['field_actions']
        : null;
    if (actions is List) {
      configuredActions = {
        for (final item in actions.whereType<Map>())
          if (item['code'] != null)
            item['code'].toString(): Map<String, dynamic>.from(item),
      };
    }
  } catch (_) {
    // Offline and older servers retain the complete safe local action set.
  }

  bool enabled(String code) => configuredActions[code]?['active'] != false;
  String label(String code, String fallback) {
    final configured = configuredActions[code]?['label']?.toString().trim();
    return configured == null || configured.isEmpty ? fallback : configured;
  }

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

  Future<void> createSketch() async {
    final outputPath = await Navigator.of(pageContext).push<String>(
      MaterialPageRoute<String>(builder: (_) => const MobileSketchScreen()),
    );

    if (outputPath == null || outputPath.trim().isEmpty) {
      return;
    }

    await OfflineService.addPendingMedia(
      jobId: job.id,
      sourcePath: outputPath,
      kind: 'sketch',
      eventType: 'intervention_sketch',
      mimeType: 'image/png',
      metadata: {
        'created_at': DateTime.now().toUtc().toIso8601String(),
        'evidence_role': 'field_sketch',
        'canvas': 'blank_grid',
      },
    );
    unawaited(OfflineService.syncPendingActions());
    await onDataChanged();
    showMessage('Croquis enregistré pour synchronisation.');
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
    final value = await showModalBottomSheet<String>(
      context: pageContext,
      useSafeArea: true,
      isScrollControlled: true,
      builder: (sheetContext) {
        final keyboardInset = MediaQuery.viewInsetsOf(sheetContext).bottom;
        return AnimatedPadding(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
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
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: Theme.of(sheetContext).textTheme.titleLarge,
                      ),
                    ),
                    IconButton(
                      tooltip: 'Fermer',
                      onPressed: () => Navigator.pop(sheetContext),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
                ),
                const SizedBox(height: BlueVectorSpacing.xs),
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
                          if (text.isNotEmpty) {
                            Navigator.pop(sheetContext, text);
                          }
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
    final result = await showModalBottomSheet<Map<String, String>>(
      context: pageContext,
      useSafeArea: true,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          final keyboardInset = MediaQuery.viewInsetsOf(context).bottom;
          return AnimatedPadding(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
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
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Référence réseau observée',
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                            const SizedBox(height: BlueVectorSpacing.xxs),
                            const Text(
                              'La valeur préparée par le bureau reste conservée si le terrain diffère.',
                              style: TextStyle(
                                color: BlueVectorColors.textSecondary,
                                fontSize: 11,
                                height: 1.35,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: 'Fermer',
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                  const SizedBox(height: BlueVectorSpacing.md),
                  DropdownButtonFormField<String>(
                    initialValue: referenceType,
                    decoration: const InputDecoration(
                      labelText: 'Type de repère',
                    ),
                    items: const [
                      DropdownMenuItem(value: 'pto', child: Text('PTO')),
                      DropdownMenuItem(value: 'pbo', child: Text('PBO')),
                      DropdownMenuItem(value: 'pm', child: Text('PM / SRO')),
                    ],
                    onChanged: (value) {
                      if (value != null) {
                        setSheetState(() => referenceType = value);
                      }
                    },
                  ),
                  const SizedBox(height: BlueVectorSpacing.sm),
                  TextField(
                    controller: controller,
                    autofocus: true,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) {
                      final value = controller.text.trim();
                      if (value.isNotEmpty) {
                        Navigator.pop(context, {
                          'reference_type': referenceType,
                          'value': value,
                        });
                      }
                    },
                    decoration: const InputDecoration(
                      labelText: 'Référence lue sur place',
                      hintText: 'Ex. PTO-CASA-001234',
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.md),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('Annuler'),
                        ),
                      ),
                      const SizedBox(width: BlueVectorSpacing.xs),
                      Expanded(
                        flex: 2,
                        child: FilledButton(
                          onPressed: () {
                            final value = controller.text.trim();
                            if (value.isNotEmpty) {
                              Navigator.pop(context, {
                                'reference_type': referenceType,
                                'value': value,
                              });
                            }
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
          code: 'intervention_photo',
          category: _ActionCategory.documenter,
          label: label('intervention_photo', 'Photo'),
          icon: Icons.photo_camera_outlined,
          color: BlueVectorColors.primaryBright,
          onTap: () => openScreen(FreePhotoActionScreen(job: job)),
        ),
        _MobileAction(
          code: 'intervention_sketch',
          category: _ActionCategory.documenter,
          label: label('intervention_sketch', 'Croquis terrain'),
          icon: Icons.draw_outlined,
          color: BlueVectorColors.cyan,
          onTap: createSketch,
        ),
        _MobileAction(
          code: 'intervention_video',
          category: _ActionCategory.documenter,
          label: label('intervention_video', 'Vidéo'),
          icon: Icons.videocam_outlined,
          color: BlueVectorColors.violet,
          onTap: captureVideo,
        ),
        _MobileAction(
          code: 'field_measurement',
          category: _ActionCategory.relever,
          label: label('field_measurement', 'Mesure / test'),
          icon: Icons.speed_outlined,
          color: BlueVectorColors.success,
          onTap: () => openScreen(FreeMeasurementActionScreen(job: job)),
        ),
        _MobileAction(
          code: 'otdr_measurement',
          category: _ActionCategory.relever,
          label: label('otdr_measurement', 'OTDR'),
          icon: Icons.monitor_heart_outlined,
          color: BlueVectorColors.warning,
          onTap: () => openScreen(
            FreeMeasurementActionScreen(job: job, initialType: 'otdr'),
          ),
        ),
        _MobileAction(
          code: 'intervention_comment',
          category: _ActionCategory.compteRendu,
          label: label('intervention_comment', 'Commentaire'),
          icon: Icons.chat_bubble_outline_rounded,
          color: BlueVectorColors.warning,
          onTap: () => promptTextAction(
            title: 'Commentaire',
            action: 'intervention_comment',
            hint: 'Ajouter une observation terrain…',
          ),
        ),
        _MobileAction(
          code: 'installation_work',
          category: _ActionCategory.compteRendu,
          label: {'TUBAGE', 'RACCORDEMENT'}.contains(job.jobType.toUpperCase())
              ? pilotFormSchemaForJobType(job.jobType).label
              : label('installation_work', 'Installation / travaux'),
          icon: Icons.construction_outlined,
          color: BlueVectorColors.cyan,
          onTap: {'TUBAGE', 'RACCORDEMENT'}.contains(job.jobType.toUpperCase())
              ? () => openScreen(
                  PilotDynamicFormScreen(
                    job: job,
                    schema: pilotFormSchemaForJobType(job.jobType),
                  ),
                )
              : () => promptTextAction(
                  title: 'Installation / travaux',
                  action: 'installation_work',
                  hint: 'Type de travail ou note terrain…',
                ),
        ),
        _MobileAction(
          code: 'network_reference',
          category: _ActionCategory.relever,
          label: label('network_reference', 'PBO / PM / PTO'),
          icon: Icons.inventory_2_outlined,
          color: BlueVectorColors.violet,
          onTap: promptNetworkReference,
        ),
        _MobileAction(
          code: 'incident_report',
          category: _ActionCategory.compteRendu,
          label: label('incident_report', 'Incident / anomalie'),
          icon: Icons.warning_amber_rounded,
          color: BlueVectorColors.danger,
          onTap: () => promptTextAction(
            title: 'Incident / anomalie',
            action: 'incident_report',
            hint: 'Décrire l’incident ou l’anomalie…',
          ),
        ),
        _MobileAction(
          code: 'material_used',
          category: _ActionCategory.relever,
          label: label('material_used', 'Matériel utilisé'),
          icon: Icons.inventory_2_outlined,
          color: BlueVectorColors.primaryBright,
          onTap: () => openScreen(MaterialUsedScreen(jobId: job.id)),
        ),
        _MobileAction(
          code: 'client_signature',
          category: _ActionCategory.documenter,
          label: label('client_signature', 'Signature client'),
          icon: Icons.border_color_outlined,
          color: BlueVectorColors.success,
          onTap: () => openScreen(
            ClientSignatureScreen(
              jobId: job.id,
              customerName: job.customerName,
            ),
          ),
        ),
        _MobileAction(
          code: 'intervention_document',
          category: _ActionCategory.documenter,
          label: label('intervention_document', 'Document'),
          icon: Icons.description_outlined,
          color: BlueVectorColors.violet,
          onTap: () => openScreen(FreeDocumentActionScreen(job: job)),
        ),
        _MobileAction(
          code: 'site_location',
          category: _ActionCategory.relever,
          label: label('site_location', 'Position exacte du site'),
          icon: Icons.location_on_outlined,
          color: BlueVectorColors.warning,
          onTap: () => recordGps(
            action: 'site_location',
            successMessage: 'Position terrain du site enregistrée.',
          ),
        ),
        _MobileAction(
          code: 'cable_entry',
          category: _ActionCategory.relever,
          label: label('cable_entry', 'Entrée câble'),
          icon: Icons.login_rounded,
          color: BlueVectorColors.cyan,
          onTap: () => openScreen(
            CableEndpointScreen(jobId: job.id, actionType: 'cable_entry'),
          ),
        ),
        _MobileAction(
          code: 'cable_exit',
          category: _ActionCategory.relever,
          label: label('cable_exit', 'Sortie câble'),
          icon: Icons.logout_rounded,
          color: BlueVectorColors.cyan,
          onTap: () => openScreen(
            CableEndpointScreen(jobId: job.id, actionType: 'cable_exit'),
          ),
        ),
        _MobileAction(
          code: 'client_call',
          category: _ActionCategory.compteRendu,
          label: label('client_call', 'Appel client'),
          icon: Icons.call_outlined,
          color: BlueVectorColors.success,
          onTap: callClient,
        ),
        _MobileAction(
          code: 'equipment_scan',
          category: _ActionCategory.relever,
          label: label('equipment_scan', 'Scan QR / code-barres'),
          icon: Icons.qr_code_scanner_rounded,
          color: BlueVectorColors.cyan,
          onTap: scanEquipment,
        ),
        _MobileAction(
          code: 'custom_intervention_action',
          category: _ActionCategory.compteRendu,
          label: label('custom_intervention_action', 'Autre action'),
          icon: Icons.more_horiz_rounded,
          color: BlueVectorColors.textSecondary,
          onTap: () => promptTextAction(
            title: 'Autre action',
            action: 'custom_intervention_action',
            hint: 'Décrire l’action effectuée…',
          ),
        ),
      ].where((action) => enabled(action.code)).toList();

      return DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.82,
        minChildSize: 0.48,
        maxChildSize: 0.94,
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
                          childAspectRatio: 2.15,
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
              const SizedBox(height: BlueVectorSpacing.md),
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
    required this.code,
    required this.category,
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  final String code;
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
        Icon(category.icon, size: 14, color: BlueVectorColors.primaryBright),
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
          padding: const EdgeInsets.all(BlueVectorSpacing.xs),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(BlueVectorRadius.small),
            border: Border.all(color: BlueVectorColors.border),
          ),
          child: Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: action.color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(BlueVectorRadius.small),
                ),
                child: Icon(action.icon, color: action.color, size: 19),
              ),
              const SizedBox(width: BlueVectorSpacing.xs),
              Expanded(
                child: Text(
                  action.label,
                  style: const TextStyle(
                    color: BlueVectorColors.textPrimary,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    height: 1.12,
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
