import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../services/intervention_service.dart';
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
  Map<String, dynamic>? _fieldRecord;
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
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final result = await widget.repository.loadDetail(
        ownerUserId: widget.ownerUserId,
        technicianId: widget.technicianId,
        historicalJobId: widget.historicalJobId,
        currentSiteJobId: widget.currentSiteJobId,
      );

      Map<String, dynamic>? fieldRecord;
      try {
        fieldRecord = await InterventionService.getFieldRecord(
          jobId: widget.historicalJobId,
        );
      } catch (_) {
        // The historical endpoint remains the fallback source when the richer
        // dossier is temporarily unavailable/offline.
      }

      if (!mounted) return;
      setState(() {
        _detail = result.value;
        _fieldRecord = fieldRecord;
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
    final photo = await ImagePicker().pickImage(
      source: source,
      imageQuality: 76,
      maxWidth: 1920,
    );
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

  List<Map<String, dynamic>> _fieldActions(TechnicianHistoryDetail detail) {
    final rich = _fieldRecord?['field_actions'];
    if (rich is List) {
      return rich
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
    }
    final fallback = detail.fieldData['actions'];
    if (fallback is! List) return const [];
    return fallback
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }

  List<Map<String, dynamic>> _media(TechnicianHistoryDetail detail) {
    final result = <Map<String, dynamic>>[];
    final seen = <String>{};

    final rich = _fieldRecord?['technician_media'];
    if (rich is List) {
      for (final raw in rich.whereType<Map>()) {
        final item = Map<String, dynamic>.from(raw);
        final id = item['media_id']?.toString() ?? '';
        if (id.isNotEmpty) seen.add(id);
        item['_origin'] = 'terrain';
        result.add(item);
      }
    }

    for (final raw in detail.mediaReferences) {
      final item = Map<String, dynamic>.from(raw);
      final id = item['media_id']?.toString() ?? '';
      if (id.isNotEmpty && seen.contains(id)) continue;
      if (id.isNotEmpty) seen.add(id);
      item['_origin'] = 'terrain';
      item['kind'] ??= item['type'];
      result.add(item);
    }

    final office = _fieldRecord?['office_attachments'];
    if (office is List) {
      for (final raw in office.whereType<Map>()) {
        final item = Map<String, dynamic>.from(raw);
        item['_origin'] = 'bureau';
        result.add(item);
      }
    }
    return result;
  }

  Map<String, dynamic> _readableFieldData(TechnicianHistoryDetail detail) {
    const hidden = {'actions', 'site_observations'};
    return {
      for (final entry in detail.fieldData.entries)
        if (!hidden.contains(entry.key) &&
            entry.value != null &&
            '${entry.value}'.trim().isNotEmpty)
          entry.key: entry.value,
    };
  }

  Future<void> _openImage(Map<String, dynamic> item) async {
    try {
      final response = await _download(item);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (_) => Dialog.fullscreen(
          backgroundColor: Colors.black,
          child: SafeArea(
            child: Stack(
              children: [
                Positioned.fill(
                  child: InteractiveViewer(
                    minScale: 0.8,
                    maxScale: 5,
                    child: Center(
                      child: Image.memory(response.bodyBytes, fit: BoxFit.contain),
                    ),
                  ),
                ),
                Positioned(
                  left: 12,
                  top: 12,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      _mediaLabel(item),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
                Positioned(
                  right: 8,
                  top: 8,
                  child: IconButton.filled(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Photo indisponible : $error')),
      );
    }
  }

  Future<dynamic> _download(Map<String, dynamic> item) {
    final origin = item['_origin']?.toString();
    if (origin == 'bureau') {
      final id = (item['attachment_id'] ?? item['id'])?.toString();
      if (id == null || id.isEmpty) {
        throw Exception('Référence de pièce jointe manquante');
      }
      return InterventionService.downloadOfficeAttachment(
        jobId: widget.historicalJobId,
        attachmentId: id,
      );
    }
    final id = item['media_id']?.toString();
    if (id == null || id.isEmpty) {
      throw Exception('Ce média ancien ne possède pas de fichier téléchargeable');
    }
    return InterventionService.downloadTechnicianMedia(
      jobId: widget.historicalJobId,
      mediaId: id,
    );
  }

  Future<void> _saveDocument(Map<String, dynamic> item) async {
    try {
      final response = await _download(item);
      final fileName = _mediaFilename(item);
      await FilePicker.platform.saveFile(
        dialogTitle: 'Enregistrer le document',
        fileName: fileName,
        bytes: response.bodyBytes,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Document enregistré.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Document indisponible : $error')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = _detail;
    final item = detail?.intervention ?? widget.initialItem;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Historique de l’intervention'),
        actions: [
          IconButton(
            tooltip: 'Actualiser',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(BlueVectorSpacing.md),
          children: [
            _HistoryHeader(item: item),
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
                    'Résultat clôturé · dossier consultable',
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
            if (_fromCache && _lastUpdated != null)
              Text(
                'Copie locale du ${_formatCacheDate(_lastUpdated!)}',
                style: const TextStyle(
                  color: BlueVectorColors.warning,
                  fontSize: 11,
                ),
              ),
            const SizedBox(height: BlueVectorSpacing.md),
            MobileFieldContextCard(jobId: widget.historicalJobId),
            const SizedBox(height: BlueVectorSpacing.lg),
            if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(BlueVectorSpacing.xl),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (_error != null)
              _MessageCard(message: _error!, danger: true)
            else if (detail != null) ...[
              if (detail.visits.isNotEmpty)
                _VisitsSection(visits: detail.visits),
              _ReadableDataSection(
                title: 'Données terrain',
                values: _readableFieldData(detail),
              ),
              if (_fieldActions(detail).isNotEmpty)
                _FieldActionsSection(actions: _fieldActions(detail)),
              if (_media(detail).isNotEmpty)
                _EvidenceSection(
                  items: _media(detail),
                  onOpenImage: _openImage,
                  onSaveDocument: _saveDocument,
                ),
              if (detail.materials.isNotEmpty)
                _MaterialsSection(materials: detail.materials),
              if (detail.failures.isNotEmpty)
                _ReadableDataSection(
                  title: 'Échec terrain',
                  values: detail.failures.first,
                ),
              if (detail.postponements.isNotEmpty)
                _ReadableDataSection(
                  title: 'Report',
                  values: detail.postponements.first,
                ),
              _JournalSection(entries: detail.activityLog),
            ],
          ],
        ),
      ),
    );
  }
}

class _HistoryHeader extends StatelessWidget {
  const _HistoryHeader({required this.item});

  final TechnicianHistoryItem item;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.md),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        border: Border.all(color: BlueVectorColors.border),
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(item.client, style: Theme.of(context).textTheme.titleLarge),
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
            Text(item.result!, style: const TextStyle(fontWeight: FontWeight.w700)),
          ],
        ],
      ),
    );
  }
}

class _VisitsSection extends StatelessWidget {
  const _VisitsSection({required this.visits});

  final List<TechnicianVisitHistory> visits;

  @override
  Widget build(BuildContext context) {
    return _Section(
      title: 'Passages terrain',
      children: [
        for (final visit in visits)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: CircleAvatar(child: Text('${visit.attemptNumber}')),
            title: Text(visit.statusLabel ?? visit.outcome ?? visit.status),
            subtitle: Text(
              '${visit.technicianName ?? 'Technicien non renseigné'} · ${_formatVisitPeriod(visit)}',
            ),
          ),
      ],
    );
  }
}

class _ReadableDataSection extends StatelessWidget {
  const _ReadableDataSection({required this.title, required this.values});

  final String title;
  final Map<String, dynamic> values;

  @override
  Widget build(BuildContext context) {
    final entries = values.entries
        .where((entry) => _isReadableScalar(entry.value))
        .toList(growable: false);
    if (entries.isEmpty) return const SizedBox.shrink();
    return _Section(
      title: title,
      children: [
        for (final entry in entries)
          Padding(
            padding: const EdgeInsets.only(bottom: BlueVectorSpacing.sm),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    _fieldLabel(entry.key),
                    style: const TextStyle(color: BlueVectorColors.textMuted),
                  ),
                ),
                const SizedBox(width: BlueVectorSpacing.sm),
                Expanded(
                  child: Text(
                    _fieldValue(entry.key, entry.value),
                    textAlign: TextAlign.end,
                    style: const TextStyle(color: BlueVectorColors.textPrimary),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _FieldActionsSection extends StatelessWidget {
  const _FieldActionsSection({required this.actions});

  final List<Map<String, dynamic>> actions;

  @override
  Widget build(BuildContext context) {
    return _Section(
      title: 'Travaux terrain',
      children: [
        for (final action in actions)
          _ActionCard(action: action),
      ],
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({required this.action});

  final Map<String, dynamic> action;

  @override
  Widget build(BuildContext context) {
    final type = action['type']?.toString() ?? '';
    final payload = action['payload'] is Map
        ? Map<String, dynamic>.from(action['payload'] as Map)
        : <String, dynamic>{};
    final summary = _actionSummary(type, payload);
    final date = _parseDate(action['occurred_at']);
    return Container(
      margin: const EdgeInsets.only(bottom: BlueVectorSpacing.xs),
      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        border: Border.all(color: BlueVectorColors.border),
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(_actionIcon(type), color: BlueVectorColors.cyan, size: 20),
          const SizedBox(width: BlueVectorSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _actionLabel(type),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                if (summary.isNotEmpty)
                  Text(
                    summary,
                    style: const TextStyle(
                      color: BlueVectorColors.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                if (date != null)
                  Text(
                    DateFormat('dd/MM/yyyy · HH:mm', 'fr_FR').format(date.toLocal()),
                    style: const TextStyle(
                      color: BlueVectorColors.textMuted,
                      fontSize: 10,
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

class _EvidenceSection extends StatelessWidget {
  const _EvidenceSection({
    required this.items,
    required this.onOpenImage,
    required this.onSaveDocument,
  });

  final List<Map<String, dynamic>> items;
  final Future<void> Function(Map<String, dynamic>) onOpenImage;
  final Future<void> Function(Map<String, dynamic>) onSaveDocument;

  @override
  Widget build(BuildContext context) {
    return _Section(
      title: 'Photos et documents',
      children: [
        for (final item in items)
          _EvidenceCard(
            item: item,
            onOpenImage: onOpenImage,
            onSaveDocument: onSaveDocument,
          ),
      ],
    );
  }
}

class _EvidenceCard extends StatelessWidget {
  const _EvidenceCard({
    required this.item,
    required this.onOpenImage,
    required this.onSaveDocument,
  });

  final Map<String, dynamic> item;
  final Future<void> Function(Map<String, dynamic>) onOpenImage;
  final Future<void> Function(Map<String, dynamic>) onSaveDocument;

  @override
  Widget build(BuildContext context) {
    final mime = item['mime_type']?.toString().toLowerCase() ?? '';
    final kind = (item['kind'] ?? item['type'])?.toString().toLowerCase() ?? '';
    final image = mime.startsWith('image/') || kind == 'photo' || kind == 'signature';
    final downloadable = (item['media_id']?.toString().isNotEmpty ?? false) ||
        (item['attachment_id']?.toString().isNotEmpty ?? false);
    final createdAt = _parseDate(item['created_at']);
    final origin = item['_origin'] == 'bureau' ? 'Bureau' : 'Terrain';

    return Container(
      margin: const EdgeInsets.only(bottom: BlueVectorSpacing.xs),
      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        border: Border.all(color: BlueVectorColors.border),
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
      ),
      child: Row(
        children: [
          Icon(
            image ? Icons.photo_outlined : Icons.description_outlined,
            color: image ? BlueVectorColors.cyan : BlueVectorColors.violet,
          ),
          const SizedBox(width: BlueVectorSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _mediaLabel(item),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                Text(
                  [
                    origin,
                    if (createdAt != null)
                      DateFormat('dd/MM · HH:mm', 'fr_FR').format(createdAt.toLocal()),
                    if (item['size_bytes'] != null) _formatBytes(item['size_bytes']),
                  ].where((value) => value.isNotEmpty).join(' · '),
                  style: const TextStyle(
                    color: BlueVectorColors.textMuted,
                    fontSize: 10,
                  ),
                ),
              ],
            ),
          ),
          if (downloadable)
            IconButton(
              tooltip: image ? 'Ouvrir la photo' : 'Enregistrer le document',
              onPressed: () => image ? onOpenImage(item) : onSaveDocument(item),
              icon: Icon(image ? Icons.open_in_full_rounded : Icons.download_rounded),
            ),
        ],
      ),
    );
  }
}

class _MaterialsSection extends StatelessWidget {
  const _MaterialsSection({required this.materials});

  final List<Map<String, dynamic>> materials;

  @override
  Widget build(BuildContext context) {
    return _Section(
      title: 'Matériel consommé',
      children: [
        for (var index = 0; index < materials.length; index++)
          Container(
            margin: const EdgeInsets.only(bottom: BlueVectorSpacing.xs),
            padding: const EdgeInsets.all(BlueVectorSpacing.sm),
            decoration: BoxDecoration(
              color: BlueVectorColors.surface,
              border: Border.all(color: BlueVectorColors.border),
              borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
            ),
            child: Row(
              children: [
                const Icon(Icons.inventory_2_outlined, color: BlueVectorColors.violet),
                const SizedBox(width: BlueVectorSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _materialTitle(materials[index], index),
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      Text(
                        _materialSummary(materials[index]),
                        style: const TextStyle(
                          color: BlueVectorColors.textSecondary,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _JournalSection extends StatelessWidget {
  const _JournalSection({required this.entries});

  final List<TechnicianHistoryActivity> entries;

  @override
  Widget build(BuildContext context) {
    return _Section(
      title: 'Journal métier',
      children: entries.isEmpty
          ? const [
              Text(
                'Aucune entrée de journal disponible.',
                style: TextStyle(color: BlueVectorColors.textSecondary),
              ),
            ]
          : [
              for (final entry in entries)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.check_circle_outline_rounded),
                  title: Text(entry.description ?? _actionLabel(entry.action)),
                  subtitle: Text(
                    entry.createdAt == null
                        ? 'Date non renseignée'
                        : DateFormat('dd/MM/yyyy · HH:mm', 'fr_FR')
                            .format(entry.createdAt!.toLocal()),
                  ),
                ),
            ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    if (children.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: BlueVectorSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: BlueVectorSpacing.sm),
          ...children,
        ],
      ),
    );
  }
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({required this.message, this.danger = false});

  final String message;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.md),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        border: Border.all(
          color: danger ? BlueVectorColors.danger : BlueVectorColors.border,
        ),
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
      ),
      child: Text(
        message,
        style: TextStyle(
          color: danger ? BlueVectorColors.danger : BlueVectorColors.textSecondary,
        ),
      ),
    );
  }
}

bool _isReadableScalar(dynamic value) =>
    value is String || value is num || value is bool || value is DateTime;

String _fieldLabel(String key) => const {
      'gps_latitude': 'Latitude GPS',
      'gps_longitude': 'Longitude GPS',
      'optical_power_dbm': 'Puissance optique',
      'cable_length_m': 'Longueur câble',
      'ont_serial': 'N° série ONT',
      'router_serial': 'N° série routeur',
      'mac_address': 'Adresse MAC',
      'wifi_box_serial': 'N° série box Wi-Fi',
      'nro': 'NRO',
      'sro': 'SRO',
      'pbo': 'PBO',
      'pto': 'PTO',
      'notes': 'Notes',
      'coordinator_comments': 'Commentaire bureau',
      'reason': 'Motif',
      'comment': 'Commentaire',
      'requested_date': 'Date demandée',
      'status': 'Statut',
      'created_at': 'Créé le',
    }[key] ??
    key.replaceAll('_', ' ');

String _fieldValue(String key, dynamic value) {
  if (value is DateTime) {
    return DateFormat('dd/MM/yyyy · HH:mm', 'fr_FR').format(value.toLocal());
  }
  final parsed = value is String ? DateTime.tryParse(value) : null;
  if (parsed != null && (key.endsWith('_at') || key.contains('date'))) {
    return DateFormat('dd/MM/yyyy · HH:mm', 'fr_FR').format(parsed.toLocal());
  }
  if (key == 'cable_length_m') return '${_niceNumber(value)} m';
  if (key == 'optical_power_dbm') return '${_niceNumber(value)} dBm';
  if (value is bool) return value ? 'Oui' : 'Non';
  return '$value';
}

String _niceNumber(dynamic value) {
  final number = double.tryParse(value?.toString() ?? '');
  if (number == null) return '$value';
  if (number == number.roundToDouble()) return '${number.round()}';
  return number.toStringAsFixed(1);
}

String _actionLabel(String type) => const {
      'cable_entry': 'Entrée câble',
      'cable_exit': 'Sortie câble',
      'measurement': 'Mesure / test',
      'free_measurement': 'Mesure / test',
      'material_used': 'Matériel utilisé',
      'intervention_comment': 'Commentaire',
      'comment': 'Commentaire',
      'incident_report': 'Incident / anomalie',
      'site_location': 'Position du site',
      'gps_position': 'Position GPS',
      'complete_job': 'Travail terminé',
      'custom_action': 'Action terrain',
    }[type] ??
    type.replaceAll('_', ' ');

IconData _actionIcon(String type) {
  if (type == 'cable_entry') return Icons.login_rounded;
  if (type == 'cable_exit') return Icons.logout_rounded;
  if (type.contains('measure')) return Icons.speed_outlined;
  if (type.contains('incident')) return Icons.warning_amber_rounded;
  if (type.contains('comment')) return Icons.chat_bubble_outline_rounded;
  if (type.contains('material')) return Icons.inventory_2_outlined;
  if (type.contains('location') || type.contains('gps')) return Icons.location_on_outlined;
  return Icons.task_alt_rounded;
}

String _actionSummary(String type, Map<String, dynamic> payload) {
  if (type == 'cable_entry' || type == 'cable_exit') {
    final parts = <String>[
      if ((payload['cable_reference'] ?? payload['cable_type_code']) != null)
        '${payload['cable_reference'] ?? payload['cable_type_code']}',
      if (payload['meter_mark_m'] != null)
        'repère ${_niceNumber(payload['meter_mark_m'])} m',
      if (payload['computed_length_m'] != null)
        'longueur ${_niceNumber(payload['computed_length_m'])} m',
      if (payload['installation_mode_label'] != null)
        '${payload['installation_mode_label']}',
      if (payload['stock_reconciliation_required'] == true) 'stock à régulariser',
    ];
    return parts.join(' · ');
  }
  final value = payload['value'] ?? payload['comment'] ?? payload['note'];
  if (value != null && value.toString().trim().isNotEmpty) {
    return value.toString().trim();
  }
  final measurement = payload['measurement_value'] ?? payload['result'];
  if (measurement != null) return '$measurement';
  return '';
}

String _mediaLabel(Map<String, dynamic> item) {
  final metadata = item['metadata'];
  final label = metadata is Map ? metadata['label']?.toString().trim() : null;
  const labels = <String, String>{
    'libre': 'Photo libre',
    'before': 'Photo avant',
    'during': 'Photo pendant',
    'after': 'Photo après',
    'cable_departure': 'Câble · départ',
    'cable_arrival': 'Câble · arrivée',
    'splitter_before': 'Splitter avant',
    'splitter_after': 'Splitter après',
    'joint_before': 'Joint avant',
    'joint_after': 'Joint après',
    'pco_progress': 'PCO en cours',
    'pco_after': 'PCO après',
    'pto': 'PTO',
    'ont_signal': 'ONT + signal',
    'technician_signature': 'Signature technicien',
  };
  if (label != null && label.isNotEmpty) return labels[label] ?? label;
  final title = item['title']?.toString().trim();
  if (title != null && title.isNotEmpty) return title;
  final filename = item['filename']?.toString().trim();
  if (filename != null && filename.isNotEmpty) return filename;
  final kind = (item['kind'] ?? item['type'])?.toString().toLowerCase();
  if (kind == 'photo' || kind == 'photo_before' || kind == 'photo_after') {
    return 'Photo terrain';
  }
  if (kind == 'plan') return 'Plan';
  if (kind == 'instruction') return 'Instruction';
  return 'Document terrain';
}

String _mediaFilename(Map<String, dynamic> item) {
  final filename = item['filename']?.toString().trim();
  if (filename != null && filename.isNotEmpty) return filename;
  final mime = item['mime_type']?.toString().toLowerCase() ?? '';
  final extension = mime == 'application/pdf'
      ? '.pdf'
      : mime.contains('wordprocessingml')
          ? '.docx'
          : mime == 'application/msword'
              ? '.doc'
              : mime == 'text/plain'
                  ? '.txt'
                  : '';
  return 'govector-document$extension';
}

String _formatBytes(dynamic raw) {
  final bytes = int.tryParse(raw?.toString() ?? '');
  if (bytes == null || bytes < 0) return '';
  if (bytes < 1024) return '$bytes o';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} Ko';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} Mo';
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

String _materialSummary(Map<String, dynamic> material) {
  final parts = <String>[];
  if (material['quantity'] != null) parts.add('Quantité : ${material['quantity']}');
  if (material['serial_number'] != null && '${material['serial_number']}'.isNotEmpty) {
    parts.add('S/N ${material['serial_number']}');
  }
  if (material['mac_address'] != null && '${material['mac_address']}'.isNotEmpty) {
    parts.add('MAC ${material['mac_address']}');
  }
  return parts.isEmpty ? 'Consommation enregistrée' : parts.join(' · ');
}

DateTime? _parseDate(dynamic raw) {
  if (raw is DateTime) return raw;
  if (raw == null) return null;
  return DateTime.tryParse(raw.toString());
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
