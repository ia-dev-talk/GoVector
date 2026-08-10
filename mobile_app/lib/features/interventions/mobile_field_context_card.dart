import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../services/intervention_service.dart';

class MobileFieldContextCard extends StatefulWidget {
  const MobileFieldContextCard({super.key, required this.jobId});

  final int jobId;

  @override
  State<MobileFieldContextCard> createState() => _MobileFieldContextCardState();
}

class _MobileFieldContextCardState extends State<MobileFieldContextCard> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = InterventionService.getFieldRecord(jobId: widget.jobId);
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
        final observations = data['site_observations'] is List
            ? (data['site_observations'] as List)
                  .whereType<Map>()
                  .map((item) => Map<String, dynamic>.from(item))
                  .toList()
            : <Map<String, dynamic>>[];
        final reference = data['field_reference_location'] is Map
            ? Map<String, dynamic>.from(data['field_reference_location'] as Map)
            : null;
        final textValues = [
          ...officeNotes.map((item) => item['text']),
          instructions['special_instructions'],
          instructions['coordinator_comments'],
          instructions['notes'],
        ].where((value) => value?.toString().trim().isNotEmpty == true).toList();
        if (textValues.isEmpty &&
            attachments.isEmpty &&
            observations.isEmpty &&
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
                  Icon(Icons.info_outline, color: BlueVectorColors.primaryBright),
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
              if (reference != null) ...[
                const SizedBox(height: BlueVectorSpacing.sm),
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
                (item) => item['type'] == 'cable_entry' || item['type'] == 'cable_exit',
              ))
                Padding(
                  padding: const EdgeInsets.only(top: BlueVectorSpacing.xs),
                  child: Text(
                    '${observation['type'] == 'cable_entry' ? 'Entrée' : 'Sortie'} câble · '
                    '${observation['latitude']}, ${observation['longitude']}',
                    style: const TextStyle(color: BlueVectorColors.textSecondary),
                  ),
                ),
              for (final item in attachments)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  leading: Icon(
                    item['kind'] == 'photo' ? Icons.photo_outlined : Icons.description_outlined,
                    color: BlueVectorColors.primaryBright,
                  ),
                  title: Text(
                    item['title']?.toString().trim().isNotEmpty == true
                        ? item['title'].toString()
                        : item['filename']?.toString() ?? 'Pièce jointe',
                  ),
                  subtitle: item['comment']?.toString().trim().isNotEmpty == true
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
