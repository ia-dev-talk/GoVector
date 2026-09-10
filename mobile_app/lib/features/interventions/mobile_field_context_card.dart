import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path/path.dart' as path_util;
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:uuid/uuid.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../services/intervention_service.dart';
import '../../services/offline_service.dart';
import '../actions/mobile_image_annotation_screen.dart';

class MobileFieldContextCard extends StatefulWidget {
  const MobileFieldContextCard({super.key, required this.jobId});

  final int jobId;

  @override
  State<MobileFieldContextCard> createState() => _MobileFieldContextCardState();
}

class _MobileFieldContextCardState extends State<MobileFieldContextCard> {
  late Future<Map<String, dynamic>> _future;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _future = InterventionService.getFieldRecord(jobId: widget.jobId);
    _refreshTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (!mounted) return;
      setState(() {
        _future = InterventionService.getFieldRecord(jobId: widget.jobId);
      });
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant MobileFieldContextCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.jobId != widget.jobId) {
      _future = InterventionService.getFieldRecord(jobId: widget.jobId);
    }
  }

  Future<void> _openReference(Map<String, dynamic> reference) async {
    final latitude = reference['latitude'];
    final longitude = reference['longitude'];
    if (latitude is! num || longitude is! num) return;
    final uri = Uri.parse(
      'https://www.google.com/maps/search/?api=1&query=$latitude,$longitude',
    );
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _previewAttachment(Map<String, dynamic> item) async {
    final attachmentId = item['attachment_id']?.toString();
    if (attachmentId == null) return;
    try {
      final response = await InterventionService.downloadOfficeAttachment(
        jobId: widget.jobId,
        attachmentId: attachmentId,
      );
      final mime = item['mime_type']?.toString().toLowerCase() ?? '';
      if (!mounted) return;
      if (mime.startsWith('image/')) {
        await showDialog<void>(
          context: context,
          builder: (_) => Dialog(
            child: InteractiveViewer(
              child: Image.memory(response.bodyBytes, fit: BoxFit.contain),
            ),
          ),
        );
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Document ${item['filename'] ?? item['title'] ?? ''} disponible dans le dossier. '
            'L’aperçu intégré V1 concerne les images.',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Pièce jointe indisponible : $error')),
      );
    }
  }

  Future<dynamic> _downloadCommunicationAsset(Map<String, dynamic> item) async {
    final assetType = item['asset_type']?.toString();
    final assetId = item['asset_id']?.toString();
    if (assetId == null || assetId.isEmpty) {
      throw StateError('Référence de pièce absente');
    }
    if (assetType == 'technician_media') {
      return InterventionService.downloadTechnicianMedia(
        jobId: widget.jobId,
        mediaId: assetId,
      );
    }
    return InterventionService.downloadOfficeAttachment(
      jobId: widget.jobId,
      attachmentId: assetId,
    );
  }

  Future<void> _previewCommunicationAsset(Map<String, dynamic> item) async {
    try {
      final response = await _downloadCommunicationAsset(item);
      final mime = item['mime_type']?.toString().toLowerCase() ?? '';
      if (!mounted) return;
      if (mime.startsWith('image/')) {
        await showDialog<void>(
          context: context,
          builder: (_) => Dialog(
            child: InteractiveViewer(
              child: Image.memory(response.bodyBytes, fit: BoxFit.contain),
            ),
          ),
        );
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${item['filename'] ?? item['title'] ?? 'Document'} est disponible dans le dossier.',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Pièce jointe indisponible : $error')),
      );
    }
  }

  Future<void> _annotateCommunicationAsset(
    Map<String, dynamic> item, {
    required int parentId,
  }) async {
    try {
      final response = await _downloadCommunicationAsset(item);
      final directory = await getTemporaryDirectory();
      final extension = path_util.extension(item['filename']?.toString() ?? '');
      final source = File(
        path_util.join(
          directory.path,
          'bluevector-source-${const Uuid().v4()}${extension.isEmpty ? '.jpg' : extension}',
        ),
      );
      await source.writeAsBytes(response.bodyBytes, flush: true);
      if (!mounted) return;
      final annotatedPath = await Navigator.of(context).push<String>(
        MaterialPageRoute<String>(
          builder: (_) => MobileImageAnnotationScreen(
            sourcePath: source.path,
            title: item['title']?.toString() ?? 'Annoter la pièce',
          ),
        ),
      );
      if (annotatedPath == null) return;
      await OfflineService.addPendingMedia(
        jobId: widget.jobId,
        sourcePath: annotatedPath,
        kind: 'photo',
        eventType: 'job_communication',
        mimeType: 'image/png',
        metadata: {
          'message_type': 'reply',
          'body': 'Annotation terrain ajoutée',
          'parent_id': parentId,
          'asset_role': 'annotation',
          'annotation_of': {
            'asset_type': item['asset_type'],
            'asset_id': item['asset_id'],
          },
          'captured_at': DateTime.now().toUtc().toIso8601String(),
        },
      );
      await OfflineService.syncPendingActions();
      if (!mounted) return;
      setState(() {
        _future = InterventionService.getFieldRecord(jobId: widget.jobId);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Annotation enregistrée pour le bureau.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Annotation impossible : $error')));
    }
  }

  Future<void> _sendCommunication({
    int? parentId,
    bool acknowledge = false,
  }) async {
    String? body;
    if (!acknowledge) {
      final controller = TextEditingController();
      body = await showDialog<String>(
        context: context,
        useSafeArea: false,
        builder: (dialogContext) {
          final media = MediaQuery.of(dialogContext);
          return AnimatedPadding(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            padding: EdgeInsets.fromLTRB(
              BlueVectorSpacing.md,
              media.padding.top + BlueVectorSpacing.md,
              BlueVectorSpacing.md,
              media.viewInsets.bottom + BlueVectorSpacing.md,
            ),
            child: Dialog(
              insetPadding: EdgeInsets.zero,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(BlueVectorSpacing.md),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Répondre au bureau',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: BlueVectorSpacing.xs),
                      const Text(
                        'La réponse reste disponible hors ligne et sera synchronisée dès que possible.',
                        style: TextStyle(color: BlueVectorColors.textSecondary),
                      ),
                      const SizedBox(height: BlueVectorSpacing.md),
                      TextField(
                        controller: controller,
                        autofocus: true,
                        minLines: 3,
                        maxLines: 6,
                        textInputAction: TextInputAction.newline,
                        decoration: const InputDecoration(
                          labelText: 'Réponse terrain',
                          hintText: 'Votre réponse ou complément…',
                        ),
                      ),
                      const SizedBox(height: BlueVectorSpacing.md),
                      Row(
                        children: [
                          Expanded(
                            child: TextButton(
                              onPressed: () => Navigator.pop(dialogContext),
                              child: const Text('Annuler'),
                            ),
                          ),
                          const SizedBox(width: BlueVectorSpacing.xs),
                          Expanded(
                            child: FilledButton(
                              onPressed: () {
                                final value = controller.text.trim();
                                if (value.isNotEmpty) {
                                  Navigator.pop(dialogContext, value);
                                }
                              },
                              child: const Text('Envoyer'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      );
      controller.dispose();
      if (body == null) return;
    }
    await OfflineService.addPendingAction(
      action: 'job_communication',
      data: {
        'job_id': widget.jobId,
        'message_type': acknowledge ? 'acknowledgement' : 'reply',
        'body': acknowledge ? 'Message pris en compte' : body,
        if (parentId != null) 'parent_id': parentId,
      },
    );
    await OfflineService.syncPendingActions();
    if (!mounted) return;
    setState(() {
      _future = InterventionService.getFieldRecord(jobId: widget.jobId);
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          acknowledge
              ? 'Prise en compte enregistrée.'
              : 'Réponse enregistrée pour synchronisation.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const SizedBox.shrink();
        }
        if (!snapshot.hasData) return const SizedBox.shrink();
        final data = snapshot.data!;
        final instructions = data['instructions'] is Map
            ? Map<String, dynamic>.from(data['instructions'] as Map)
            : <String, dynamic>{};
        final officeNotes = data['office_notes'] is List
            ? (data['office_notes'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item))
                  .toList()
            : <Map<String, dynamic>>[];
        final attachments = data['office_attachments'] is List
            ? (data['office_attachments'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item))
                  .toList()
            : <Map<String, dynamic>>[];
        final communications = data['communications'] is List
            ? (data['communications'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item))
                  .toList()
            : <Map<String, dynamic>>[];
        final observations = data['site_observations'] is List
            ? (data['site_observations'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item))
                  .toList()
            : <Map<String, dynamic>>[];
        final resolvedAttributes = data['site_resolved_attributes'] is List
            ? (data['site_resolved_attributes'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item))
                  .toList()
            : <Map<String, dynamic>>[];
        final attributeObservations =
            data['site_attribute_observations'] is List
            ? (data['site_attribute_observations'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item))
                  .toList()
            : <Map<String, dynamic>>[];
        final reference = data['field_reference_location'] is Map
            ? Map<String, dynamic>.from(data['field_reference_location'] as Map)
            : null;
        final textValues =
            [
                  ...officeNotes.map((item) => item['text']),
                  instructions['special_instructions'],
                  instructions['coordinator_comments'],
                  instructions['notes'],
                ]
                .where((value) => value?.toString().trim().isNotEmpty == true)
                .toList();
        if (textValues.isEmpty &&
            attachments.isEmpty &&
            communications.isEmpty &&
            observations.isEmpty &&
            resolvedAttributes.isEmpty &&
            attributeObservations.isEmpty &&
            reference == null) {
          return const SizedBox.shrink();
        }
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
              const Row(
                children: [
                  Icon(
                    Icons.info_outline,
                    color: BlueVectorColors.primaryBright,
                  ),
                  SizedBox(width: BlueVectorSpacing.xs),
                  Text(
                    'Dossier bureau & repères terrain',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                ],
              ),
              for (final value in textValues) ...[
                const SizedBox(height: BlueVectorSpacing.sm),
                Text(value.toString()),
              ],
              for (final item in communications) ...[
                const SizedBox(height: BlueVectorSpacing.sm),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(BlueVectorSpacing.sm),
                  decoration: BoxDecoration(
                    color:
                        item['requires_action'] == true &&
                            item['status'] == 'open'
                        ? BlueVectorColors.warning.withValues(alpha: 0.1)
                        : BlueVectorColors.background,
                    borderRadius: BorderRadius.circular(BlueVectorRadius.small),
                    border: Border.all(color: BlueVectorColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item['type'] == 'correction_request'
                            ? 'Correction demandée'
                            : item['type'] == 'instruction'
                            ? 'Instruction bureau'
                            : item['type'] == 'reply'
                            ? 'Réponse terrain'
                            : 'Échange opérationnel',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      if (item['body']?.toString().trim().isNotEmpty ==
                          true) ...[
                        const SizedBox(height: BlueVectorSpacing.xs),
                        Text(item['body'].toString()),
                      ],
                      if (item['attachments'] is List)
                        for (final rawAsset in item['attachments'] as List)
                          if (rawAsset is Map)
                            Builder(
                              builder: (context) {
                                final asset = Map<String, dynamic>.from(
                                  rawAsset,
                                );
                                final isImage =
                                    asset['mime_type']?.toString().startsWith(
                                      'image/',
                                    ) ==
                                    true;
                                return Padding(
                                  padding: const EdgeInsets.only(
                                    top: BlueVectorSpacing.xs,
                                  ),
                                  child: Container(
                                    padding: const EdgeInsets.all(
                                      BlueVectorSpacing.xs,
                                    ),
                                    decoration: BoxDecoration(
                                      color: BlueVectorColors.surface,
                                      borderRadius: BorderRadius.circular(
                                        BlueVectorRadius.small,
                                      ),
                                      border: Border.all(
                                        color: BlueVectorColors.border,
                                      ),
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(
                                          isImage
                                              ? Icons.image_outlined
                                              : Icons.description_outlined,
                                          color: BlueVectorColors.primaryBright,
                                        ),
                                        const SizedBox(
                                          width: BlueVectorSpacing.xs,
                                        ),
                                        Expanded(
                                          child: Text(
                                            asset['title']?.toString() ??
                                                asset['filename']?.toString() ??
                                                'Pièce jointe',
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                        IconButton(
                                          tooltip: 'Ouvrir',
                                          onPressed: () =>
                                              _previewCommunicationAsset(asset),
                                          icon: const Icon(
                                            Icons.visibility_outlined,
                                          ),
                                        ),
                                        if (isImage && item['id'] is int)
                                          IconButton(
                                            tooltip: 'Annoter',
                                            onPressed: () =>
                                                _annotateCommunicationAsset(
                                                  asset,
                                                  parentId: item['id'] as int,
                                                ),
                                            icon: const Icon(
                                              Icons.draw_outlined,
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                      if (item['requires_action'] == true &&
                          item['status'] == 'open')
                        Wrap(
                          spacing: BlueVectorSpacing.xs,
                          children: [
                            TextButton(
                              onPressed: () => _sendCommunication(
                                parentId: item['id'] as int?,
                                acknowledge: true,
                              ),
                              child: const Text('Pris en compte'),
                            ),
                            FilledButton.tonal(
                              onPressed: () => _sendCommunication(
                                parentId: item['id'] as int?,
                              ),
                              child: const Text('Répondre'),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
              ],
              if (reference != null) ...[
                const SizedBox(height: BlueVectorSpacing.sm),
                if (reference['origin'] == 'canonical_site')
                  const Padding(
                    padding: EdgeInsets.only(bottom: BlueVectorSpacing.xs),
                    child: Text(
                      'Position de référence validée du site GoVector.',
                      style: TextStyle(color: BlueVectorColors.success),
                    ),
                  ),
                if (reference['origin'] == 'previous_field_visit')
                  const Padding(
                    padding: EdgeInsets.only(bottom: BlueVectorSpacing.xs),
                    child: Text(
                      'Repère confirmé lors d’un précédent passage sur ce site.',
                      style: TextStyle(color: BlueVectorColors.textSecondary),
                    ),
                  ),
                OutlinedButton.icon(
                  onPressed: () => _openReference(reference),
                  icon: const Icon(Icons.location_on_outlined),
                  label: const Text('Ouvrir la position terrain confirmée'),
                ),
              ],
              for (final observation in observations.where(
                (item) => item['resolution_status'] == 'conflict',
              ))
                Padding(
                  padding: const EdgeInsets.only(top: BlueVectorSpacing.xs),
                  child: Text(
                    'Repère GPS contradictoire conservé pour vérification bureau · '
                    '${observation['latitude']}, ${observation['longitude']}',
                    style: const TextStyle(color: BlueVectorColors.warning),
                  ),
                ),
              for (final observation in observations.where(
                (item) =>
                    item['type'] == 'cable_entry' ||
                    item['type'] == 'cable_exit',
              ))
                Padding(
                  padding: const EdgeInsets.only(top: BlueVectorSpacing.xs),
                  child: Text(
                    '${observation['type'] == 'cable_entry' ? 'Entrée' : 'Sortie'} câble · '
                    '${observation['latitude']}, ${observation['longitude']}',
                    style: const TextStyle(
                      color: BlueVectorColors.textSecondary,
                    ),
                  ),
                ),
              if (resolvedAttributes.isNotEmpty) ...[
                const SizedBox(height: BlueVectorSpacing.sm),
                const Text(
                  'Référentiel validé du site',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                for (final item in resolvedAttributes)
                  Padding(
                    padding: const EdgeInsets.only(top: BlueVectorSpacing.xs),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.verified_outlined,
                          size: 18,
                          color: BlueVectorColors.success,
                        ),
                        const SizedBox(width: BlueVectorSpacing.xs),
                        Expanded(
                          child: Text(
                            '${item['label'] ?? item['key']} · ${item['value']}',
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
              for (final item in attributeObservations.where(
                (value) =>
                    value['resolution_status'] == 'conflict' ||
                    value['resolution_status'] == 'unreviewed',
              ))
                Padding(
                  padding: const EdgeInsets.only(top: BlueVectorSpacing.xs),
                  child: Text(
                    '${item['label'] ?? item['key']} relevé · ${item['value']} · '
                    '${item['resolution_status'] == 'conflict' ? 'différent du dossier préparé' : 'en attente de vérification bureau'}',
                    style: const TextStyle(color: BlueVectorColors.warning),
                  ),
                ),
              for (final item in attachments)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  leading: Icon(
                    item['kind'] == 'photo'
                        ? Icons.photo_outlined
                        : Icons.description_outlined,
                    color: BlueVectorColors.primaryBright,
                  ),
                  title: Text(
                    item['title']?.toString().trim().isNotEmpty == true
                        ? item['title'].toString()
                        : item['filename']?.toString() ?? 'Pièce jointe',
                  ),
                  subtitle:
                      item['comment']?.toString().trim().isNotEmpty == true
                      ? Text(item['comment'].toString())
                      : null,
                  trailing: const Icon(Icons.visibility_outlined),
                  onTap: () => _previewAttachment(item),
                ),
            ],
          ),
        );
      },
    );
  }
}
