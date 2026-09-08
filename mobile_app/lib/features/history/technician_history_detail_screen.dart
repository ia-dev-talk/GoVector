import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../services/offline_service.dart';
import '../interventions/mobile_field_context_card.dart';
import 'technician_history_models.dart';
import 'technician_history_repository.dart';

class TechnicianHistoryDetailScreen extends StatefulWidget {
  const TechnicianHistoryDetailScreen({
    super.key,
    required this.ownerUserId,
    required this.technicianId,
    required this.historicalJobId,
    required this.initialItem,
    this.currentSiteJobId,
    this.repository = const TechnicianHistoryRepository(),
  });

  final int ownerUserId;
  final int technicianId;
  final int historicalJobId;
  final int? currentSiteJobId;
  final TechnicianHistoryItem initialItem;
  final TechnicianHistoryRepository repository;

  @override
  State<TechnicianHistoryDetailScreen> createState() =>
      _TechnicianHistoryDetailScreenState();
}

class _TechnicianHistoryDetailScreenState
    extends State<TechnicianHistoryDetailScreen> {
  TechnicianHistoryDetail? _detail;
  bool _loading = true;
  bool _fromCache = false;
  DateTime? _lastUpdated;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final result = await widget.repository.loadDetail(
        ownerUserId: widget.ownerUserId,
        technicianId: widget.technicianId,
        historicalJobId: widget.historicalJobId,
        currentSiteJobId: widget.currentSiteJobId,
      );
      if (!mounted) return;
      setState(() {
        _detail = result.value;
        _fromCache = result.fromCache;
        _lastUpdated = result.lastUpdated;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _openComplementMenu() async {
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            const ListTile(
              title: Text('Compléter le dossier'),
              subtitle: Text(
                'Le résultat reste clôturé. Le complément est ajouté au journal.',
              ),
            ),
            ListTile(
              leading: const Icon(Icons.chat_bubble_outline_rounded),
              title: const Text('Message'),
              onTap: () => Navigator.pop(context, 'message'),
            ),
            ListTile(
              leading: const Icon(Icons.add_a_photo_outlined),
              title: const Text('Photo'),
              onTap: () => Navigator.pop(context, 'photo'),
            ),
            ListTile(
              leading: const Icon(Icons.attach_file_rounded),
              title: const Text('Document'),
              onTap: () => Navigator.pop(context, 'document'),
            ),
          ],
        ),
      ),
    );
    switch (action) {
      case 'message':
        await _addTextComplement();
        break;
      case 'photo':
        await _addPhotoComplement();
        break;
      case 'document':
        await _addDocumentComplement();
        break;
    }
  }

  Future<void> _addTextComplement() async {
    final controller = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Ajouter un complément'),
        content: TextField(
          controller: controller,
          autofocus: true,
          minLines: 3,
          maxLines: 6,
          decoration: const InputDecoration(
            hintText: 'Précision, réponse ou information complémentaire…',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () {
              final text = controller.text.trim();
              if (text.isNotEmpty) Navigator.pop(dialogContext, text);
            },
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (value == null) return;
    await OfflineService.addPendingAction(
      action: 'job_communication',
      data: {
        'job_id': widget.historicalJobId,
        'message_type': 'reply',
        'body': value,
      },
    );
    await OfflineService.syncPendingActions();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Complément enregistré.')),
    );
    await _load();
  }

  Future<void> _addPhotoComplement() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Appareil photo'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Galerie'),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;
    final photo = await ImagePicker().pickImage(source: source, imageQuality: 92);
    if (photo == null) return;
    await OfflineService.addPendingMedia(
      jobId: widget.historicalJobId,
      sourcePath: photo.path,
      kind: 'photo',
      eventType: 'job_communication',
      mimeType: photo.mimeType ?? _photoMime(photo.name),
      metadata: {
        'message_type': 'reply',
        'body': 'Photo complémentaire ajoutée après le passage',
        'asset_role': 'attachment',
        'captured_at': DateTime.now().toUtc().toIso8601String(),
      },
    );
    await OfflineService.syncPendingActions();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Photo complémentaire enregistrée.')),
    );
    await _load();
  }

  Future<void> _addDocumentComplement() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'txt', 'doc', 'docx'],
      withData: false,
    );
    final file = result?.files.single;
    if (file?.path == null) return;
    await OfflineService.addPendingMedia(
      jobId: widget.historicalJobId,
      sourcePath: file!.path!,
      kind: 'document',
      eventType: 'job_communication',
      mimeType: _documentMime(file.extension),
      metadata: {
        'message_type': 'reply',
        'body': 'Document complémentaire : ${file.name}',
        'asset_role': 'attachment',
        'name': file.name,
      },
    );
    await OfflineService.syncPendingActions();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Document complémentaire enregistré.')),
    );
    await _load();
  }

  String _photoMime(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
  }

  String _documentMime(String? extension) => switch (extension?.toLowerCase()) {
    'pdf' => 'application/pdf',
    'txt' => 'text/plain',
    'doc' => 'application/msword',
    'docx' =>
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    _ => 'application/octet-stream',
  };

  @override
  Widget build(BuildContext context) {
    final detail = _detail;
    final item = detail?.intervention ?? widget.initialItem;
    return Scaffold(
      appBar: AppBar(title: const Text('Détail de l’intervention')),
      body: ListView(
        padding: const EdgeInsets.all(BlueVectorSpacing.md),
        children: [
          Container(
            padding: const EdgeInsets.all(BlueVectorSpacing.md),
            decoration: BoxDecoration(
              color: BlueVectorColors.surface,
              border: Border.all(color: BlueVectorColors.border),
              borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.client,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: BlueVectorSpacing.xs),
                Text(
                  item.address,
                  style: const TextStyle(color: BlueVectorColors.textSecondary),
                ),
                const SizedBox(height: BlueVectorSpacing.xs),
                Text(
                  '${_formatHistoryDate(item.date)} · ${item.activity}',
                  style: const TextStyle(color: BlueVectorColors.textMuted),
                ),
                if (item.result?.isNotEmpty == true) ...[
                  const SizedBox(height: BlueVectorSpacing.sm),
                  Text(
                    item.result!,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: BlueVectorSpacing.sm),
          Row(
            children: [
              const Icon(
                Icons.lock_outline_rounded,
                size: 16,
                color: BlueVectorColors.textMuted,
              ),
              const SizedBox(width: BlueVectorSpacing.xs),
              const Expanded(
                child: Text(
                  'Résultat clôturé · compléments autorisés',
                  style: TextStyle(
                    color: BlueVectorColors.textMuted,
                    fontSize: 12,
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: _openComplementMenu,
                icon: const Icon(Icons.add_comment_outlined),
                label: const Text('Compléter'),
              ),
            ],
          ),
          if (_fromCache && _lastUpdated != null) ...[
            const SizedBox(height: BlueVectorSpacing.sm),
            Text(
              'Copie locale du ${_formatCacheDate(_lastUpdated!)}',
              style: const TextStyle(
                color: BlueVectorColors.warning,
                fontSize: 11,
              ),
            ),
          ],
          const SizedBox(height: BlueVectorSpacing.lg),
          MobileFieldContextCard(jobId: widget.historicalJobId),
          const SizedBox(height: BlueVectorSpacing.lg),
          if (_loading)
            const Center(child: CircularProgressIndicator())
          else if (_error != null)
            Text(
              _error!,
              style: const TextStyle(color: BlueVectorColors.danger),
            )
          else if (detail != null) ...[
            if (detail.visits.isNotEmpty) ...[
              Text(
                'Passages terrain',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: BlueVectorSpacing.sm),
              for (final visit in detail.visits)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: CircleAvatar(
                    child: Text('${visit.attemptNumber}'),
                  ),
                  title: Text(
                    visit.statusLabel ?? visit.outcome ?? visit.status,
                  ),
                  subtitle: Text(
                    '${visit.technicianName ?? 'Technicien non renseigné'} · '
                    '${_formatVisitPeriod(visit)}',
                  ),
                ),
              const SizedBox(height: BlueVectorSpacing.lg),
            ],
            _DataSection(title: 'Données terrain', values: detail.fieldData),
            if (detail.failures.isNotEmpty)
              _DataSection(title: 'Échecs', values: detail.failures.first),
            if (detail.postponements.isNotEmpty)
              _DataSection(
                title: 'Reports',
                values: detail.postponements.first,
              ),
            if (detail.materials.isNotEmpty) ...[
              Text(
                'Matériel consommé',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: BlueVectorSpacing.sm),
              for (var index = 0; index < detail.materials.length; index++)
                _DataSection(
                  title: _materialTitle(detail.materials[index], index),
                  values: detail.materials[index],
                ),
            ],
            const SizedBox(height: BlueVectorSpacing.lg),
            Text(
              'Journal métier',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: BlueVectorSpacing.sm),
            if (detail.activityLog.isEmpty)
              const Text(
                'Aucune entrée de journal disponible.',
                style: TextStyle(color: BlueVectorColors.textSecondary),
              )
            else
              for (final entry in detail.activityLog)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.check_circle_outline_rounded),
                  title: Text(entry.description ?? entry.action),
                  subtitle: Text(
                    entry.createdAt == null
                        ? 'Date non renseignée'
                        : DateFormat(
                            'dd/MM/yyyy · HH:mm',
                            'fr_FR',
                          ).format(entry.createdAt!.toLocal()),
                  ),
                ),
          ],
        ],
      ),
    );
  }
}

String _materialTitle(Map<String, dynamic> material, int index) {
  final label = material['label']?.toString().trim();
  final reference = material['reference']?.toString().trim();
  if (label != null && label.isNotEmpty) {
    if (reference != null && reference.isNotEmpty) return '$label · $reference';
    return label;
  }
  if (reference != null && reference.isNotEmpty) return reference;
  return 'Matériel ${index + 1}';
}

String _formatHistoryDate(DateTime? value) {
  if (value == null) return 'Date non renseignée';
  return DateFormat('dd/MM/yyyy à HH:mm', 'fr_FR').format(value.toLocal());
}

String _formatVisitDate(DateTime? value) {
  if (value == null) return 'date non renseignée';
  return DateFormat('dd/MM/yyyy · HH:mm', 'fr_FR').format(value.toLocal());
}

String _formatVisitPeriod(TechnicianVisitHistory visit) {
  final start = _formatVisitDate(visit.assignedAt);
  if (visit.endedAt == null) return '$start · en cours';
  return '$start → ${_formatVisitDate(visit.endedAt)}';
}

String _formatCacheDate(DateTime value) {
  return DateFormat('dd/MM à HH:mm', 'fr_FR').format(value.toLocal());
}

class _DataSection extends StatelessWidget {
  const _DataSection({required this.title, required this.values});

  final String title;
  final Map<String, dynamic> values;

  @override
  Widget build(BuildContext context) {
    final entries = values.entries
        .where((entry) => entry.value != null && '${entry.value}'.isNotEmpty)
        .toList();
    if (entries.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: BlueVectorSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: BlueVectorSpacing.sm),
          for (final entry in entries)
            Padding(
              padding: const EdgeInsets.only(bottom: BlueVectorSpacing.xs),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      entry.key.replaceAll('_', ' '),
                      style: const TextStyle(color: BlueVectorColors.textMuted),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      '${entry.value}',
                      textAlign: TextAlign.end,
                      style: const TextStyle(
                        color: BlueVectorColors.textPrimary,
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
