import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import '../../services/intervention_service.dart';

class InterventionPhotosScreen extends StatefulWidget {
  const InterventionPhotosScreen({super.key, required this.job});

  final Job job;

  @override
  State<InterventionPhotosScreen> createState() => _InterventionPhotosScreenState();
}

class _InterventionPhotosScreenState extends State<InterventionPhotosScreen> {
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final record = await InterventionService.getFieldRecord(jobId: widget.job.id);
    final raw = record['technician_media'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .where((item) {
          final kind = item['kind']?.toString().toLowerCase() ?? '';
          final mime = item['mime_type']?.toString().toLowerCase() ?? '';
          return kind == 'photo' || mime.startsWith('image/');
        })
        .toList(growable: false);
  }

  void _refresh() {
    setState(() => _future = _load());
  }

  String _label(Map<String, dynamic> item) {
    final metadata = item['metadata'];
    final value = metadata is Map ? metadata['label']?.toString().trim() : null;
    const labels = <String, String>{
      'before': 'Avant',
      'during': 'Pendant',
      'after': 'Après',
      'cable_departure': 'Départ câble',
      'cable_arrival': 'Arrivée câble',
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
    if (value == null || value.isEmpty) return 'Photo terrain';
    return labels[value] ?? value;
  }

  String _dateLabel(Map<String, dynamic> item) {
    final raw = item['created_at']?.toString();
    final parsed = raw == null ? null : DateTime.tryParse(raw)?.toLocal();
    if (parsed == null) return '';
    String two(int value) => value.toString().padLeft(2, '0');
    return '${two(parsed.day)}/${two(parsed.month)} ${two(parsed.hour)}:${two(parsed.minute)}';
  }

  Future<Uint8List> _bytes(String mediaId) async {
    final response = await InterventionService.downloadTechnicianMedia(
      jobId: widget.job.id,
      mediaId: mediaId,
    );
    return response.bodyBytes;
  }

  Future<void> _open(Map<String, dynamic> item) async {
    final mediaId = item['media_id']?.toString();
    if (mediaId == null || mediaId.isEmpty) return;
    try {
      final bytes = await _bytes(mediaId);
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
                      child: Image.memory(bytes, fit: BoxFit.contain),
                    ),
                  ),
                ),
                Positioned(
                  left: 12,
                  top: 12,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      child: Text(
                        _label(item),
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Photos de l’intervention'),
        actions: [
          IconButton(
            tooltip: 'Actualiser',
            onPressed: _refresh,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _EmptyState(
              icon: Icons.cloud_off_outlined,
              title: 'Galerie indisponible',
              subtitle: 'Réessayez après synchronisation.',
              onRetry: _refresh,
            );
          }
          final items = snapshot.data ?? const [];
          if (items.isEmpty) {
            return _EmptyState(
              icon: Icons.photo_library_outlined,
              title: 'Aucune photo synchronisée',
              subtitle: 'Les nouvelles photos apparaissent ici après synchronisation.',
              onRetry: _refresh,
            );
          }
          return GridView.builder(
            padding: const EdgeInsets.all(BlueVectorSpacing.md),
            itemCount: items.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: BlueVectorSpacing.sm,
              mainAxisSpacing: BlueVectorSpacing.sm,
              childAspectRatio: 0.92,
            ),
            itemBuilder: (context, index) {
              final item = items[index];
              final mediaId = item['media_id']?.toString() ?? '';
              return Material(
                color: BlueVectorColors.surface,
                borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: mediaId.isEmpty ? null : () => _open(item),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: mediaId.isEmpty
                            ? const Center(child: Icon(Icons.broken_image_outlined))
                            : FutureBuilder<Uint8List>(
                                future: _bytes(mediaId),
                                builder: (context, image) {
                                  if (image.hasData) {
                                    return SizedBox.expand(
                                      child: Image.memory(image.data!, fit: BoxFit.cover),
                                    );
                                  }
                                  return const Center(child: CircularProgressIndicator(strokeWidth: 2));
                                },
                              ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(BlueVectorSpacing.sm),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _label(item),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w800),
                            ),
                            if (_dateLabel(item).isNotEmpty)
                              Text(
                                _dateLabel(item),
                                style: const TextStyle(
                                  color: BlueVectorColors.textSecondary,
                                  fontSize: 10,
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
        },
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onRetry,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(BlueVectorSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 46, color: BlueVectorColors.textMuted),
            const SizedBox(height: BlueVectorSpacing.sm),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: const TextStyle(color: BlueVectorColors.textSecondary),
            ),
            const SizedBox(height: BlueVectorSpacing.md),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Actualiser'),
            ),
          ],
        ),
      ),
    );
  }
}
