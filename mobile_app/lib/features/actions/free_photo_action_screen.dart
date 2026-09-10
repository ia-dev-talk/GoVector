import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import '../../services/location_service.dart';
import '../../services/offline_service.dart';

class FreePhotoActionScreen extends StatefulWidget {
  const FreePhotoActionScreen({
    super.key,
    required this.job,
    this.initialLabel,
  });

  final Job job;
  final String? initialLabel;

  @override
  State<FreePhotoActionScreen> createState() => _FreePhotoActionScreenState();
}

class _PendingPhoto {
  const _PendingPhoto({
    required this.file,
    required this.source,
    required this.selectedAt,
    this.latitude,
    this.longitude,
    this.accuracy,
    this.gpsObservedAt,
  });

  final XFile file;
  final String source;
  final DateTime selectedAt;
  final double? latitude;
  final double? longitude;
  final double? accuracy;
  final DateTime? gpsObservedAt;

  bool get hasGps => latitude != null && longitude != null;
}

class _FreePhotoActionScreenState extends State<FreePhotoActionScreen> {
  static const _labels = <(String?, String)>[
    (null, 'Libre'),
    ('before', 'Avant'),
    ('during', 'Pendant'),
    ('after', 'Après'),
    ('cable', 'Câble'),
    ('cable_departure', 'Câble — départ'),
    ('cable_arrival', 'Câble — arrivée'),
    ('splitter', 'Splitter'),
    ('pto', 'PTO'),
    ('ont', 'ONT'),
    ('router', 'Routeur'),
    ('incident', 'Incident'),
    ('joint_before', 'JOINT AVANT'),
    ('joint_after', 'JOINT APRÈS'),
    ('splitter_before', 'SPLITTER AVANT'),
    ('splitter_after', 'SPLITTER APRÈS'),
    ('pco_progress', 'PCO EN COURS'),
    ('pco_after', 'PCO APRÈS'),
    ('pco_label', 'Étiquetage PCO'),
    ('ont_signal', 'ONT + Signal'),
    ('technician_signature', 'Signature technicien'),
    ('other', 'Autre'),
  ];

  final _comment = TextEditingController();
  final _picker = ImagePicker();
  List<_PendingPhoto> _photos = const [];
  String? _label;
  bool _saving = false;
  bool _capturing = false;

  @override
  void initState() {
    super.initState();
    _label = widget.initialLabel;
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _takePhoto() async {
    if (_capturing || _saving) return;
    setState(() => _capturing = true);
    try {
      final photo = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 92,
      );
      if (photo == null) return;

      // The device is at the photo location. Capture GPS automatically and as
      // close as possible to camera return; GPS failure never invents a point.
      final position = await LocationService.getCurrentPosition();
      final selectedAt = DateTime.now().toUtc();
      final pending = _PendingPhoto(
        file: photo,
        source: 'camera',
        selectedAt: selectedAt,
        latitude: position?.latitude,
        longitude: position?.longitude,
        accuracy: position?.accuracy,
        gpsObservedAt: position?.timestamp.toUtc(),
      );
      if (!mounted) return;
      setState(() => _photos = [..._photos, pending]);
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  Future<void> _pickGalleryBatch() async {
    if (_capturing || _saving) return;
    setState(() => _capturing = true);
    try {
      final files = await _picker.pickMultiImage(imageQuality: 92);
      if (files.isEmpty || !mounted) return;
      final importedAt = DateTime.now().toUtc();
      final additions = [
        for (final file in files)
          _PendingPhoto(file: file, source: 'gallery', selectedAt: importedAt),
      ];
      setState(() => _photos = [..._photos, ...additions]);
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  Future<void> _chooseSource() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.only(bottom: BlueVectorSpacing.sm),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const ListTile(
                title: Text(
                  'Ajouter des preuves',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                subtitle: Text(
                  'La caméra ajoute automatiquement le GPS. La galerie permet un envoi multiple.',
                ),
              ),
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined),
                title: const Text('Prendre une photo'),
                subtitle: const Text('GPS + heure ajoutés automatiquement'),
                onTap: () => Navigator.pop(context, 'camera'),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined),
                title: const Text('Choisir plusieurs photos'),
                subtitle: const Text('Envoi groupé depuis la galerie'),
                onTap: () => Navigator.pop(context, 'gallery'),
              ),
            ],
          ),
        ),
      ),
    );
    if (choice == 'camera') {
      await _takePhoto();
    } else if (choice == 'gallery') {
      await _pickGalleryBatch();
    }
  }

  void _removePhoto(int index) {
    if (_saving) return;
    setState(() {
      final next = [..._photos]..removeAt(index);
      _photos = next;
    });
  }

  Future<void> _save() async {
    if (_photos.isEmpty || _saving) return;
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() => _saving = true);
    try {
      final batchId = 'photo-${DateTime.now().toUtc().microsecondsSinceEpoch}';
      final comment = _comment.text.trim();
      for (var index = 0; index < _photos.length; index++) {
        final photo = _photos[index];
        final metadata = <String, dynamic>{
          if (_label != null) 'label': _label,
          if (comment.isNotEmpty) 'comment': comment,
          'evidence_role': 'field_photo',
          'source': photo.source,
          'batch_id': batchId,
          'batch_index': index + 1,
          'batch_size': _photos.length,
          if (photo.source == 'camera') ...{
            'captured_at': photo.selectedAt.toIso8601String(),
            'gps_status': photo.hasGps ? 'captured' : 'unavailable',
            if (photo.hasGps) ...{
              'latitude': photo.latitude,
              'longitude': photo.longitude,
              if (photo.accuracy != null) 'accuracy': photo.accuracy,
              'gps_observed_at': (photo.gpsObservedAt ?? photo.selectedAt)
                  .toIso8601String(),
            },
          } else ...{
            'imported_at': photo.selectedAt.toIso8601String(),
            'gps_status': 'not_asserted_from_gallery',
          },
        };
        await OfflineService.addPendingMedia(
          jobId: widget.job.id,
          sourcePath: photo.file.path,
          kind: 'photo',
          eventType: 'intervention_photo',
          mimeType: photo.file.mimeType ?? _mimeFromName(photo.file.name),
          metadata: metadata,
        );
      }
      // One sync attempt for the whole batch. If 4G is unavailable, every
      // file remains durably queued and will retry later.
      unawaited(OfflineService.syncPendingActions());
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$error'.replaceFirst('Bad state: ', ''))),
        );
        setState(() => _saving = false);
      }
    }
  }

  String _mimeFromName(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final first = _photos.isEmpty ? null : _photos.first;

    return Scaffold(
      appBar: AppBar(title: const Text('Photos terrain')),
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Expanded(
              child: ListView(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(
                  BlueVectorSpacing.md,
                  BlueVectorSpacing.sm,
                  BlueVectorSpacing.md,
                  BlueVectorSpacing.lg,
                ),
                children: [
                  Container(
                    padding: const EdgeInsets.all(BlueVectorSpacing.sm),
                    decoration: BoxDecoration(
                      color: BlueVectorColors.surface,
                      borderRadius: BorderRadius.circular(
                        BlueVectorRadius.small,
                      ),
                      border: Border.all(color: BlueVectorColors.border),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: BlueVectorColors.primarySoft,
                            borderRadius: BorderRadius.circular(
                              BlueVectorRadius.small,
                            ),
                          ),
                          child: const Icon(
                            Icons.photo_camera_outlined,
                            color: BlueVectorColors.primaryBright,
                          ),
                        ),
                        const SizedBox(width: BlueVectorSpacing.sm),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.job.jobNumber,
                                style: const TextStyle(
                                  color: BlueVectorColors.textPrimary,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                widget.job.customerName.isEmpty
                                    ? 'Client non renseigné'
                                    : widget.job.customerName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: BlueVectorColors.textSecondary,
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Text(
                          _photos.isEmpty
                              ? 'PHOTO'
                              : '${_photos.length} PHOTO${_photos.length > 1 ? 'S' : ''}',
                          style: const TextStyle(
                            color: BlueVectorColors.primaryBright,
                            fontSize: 9,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.1,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.md),
                  AspectRatio(
                    aspectRatio: 4 / 3,
                    child: Material(
                      color: BlueVectorColors.surface,
                      borderRadius: BorderRadius.circular(
                        BlueVectorRadius.medium,
                      ),
                      child: InkWell(
                        onTap: _saving || _capturing ? null : _chooseSource,
                        borderRadius: BorderRadius.circular(
                          BlueVectorRadius.medium,
                        ),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            if (first == null)
                              const Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.add_a_photo_outlined,
                                    size: 42,
                                    color: BlueVectorColors.primaryBright,
                                  ),
                                  SizedBox(height: BlueVectorSpacing.sm),
                                  Text(
                                    'Ajouter une ou plusieurs photos',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                  SizedBox(height: 4),
                                  Text(
                                    'Caméra géolocalisée ou galerie multiple',
                                    style: TextStyle(
                                      color: BlueVectorColors.textSecondary,
                                      fontSize: 11,
                                    ),
                                  ),
                                ],
                              )
                            else
                              ClipRRect(
                                borderRadius: BorderRadius.circular(
                                  BlueVectorRadius.medium,
                                ),
                                child: Image.file(
                                  File(first.file.path),
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => const Center(
                                    child: Icon(Icons.image_rounded, size: 48),
                                  ),
                                ),
                              ),
                            if (first != null)
                              Positioned(
                                left: BlueVectorSpacing.sm,
                                bottom: BlueVectorSpacing.sm,
                                child: DecoratedBox(
                                  decoration: BoxDecoration(
                                    color: Colors.black.withValues(alpha: 0.62),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 6,
                                    ),
                                    child: Text(
                                      first.source == 'camera'
                                          ? (first.hasGps
                                                ? 'GPS enregistré'
                                                : 'GPS indisponible')
                                          : 'Galerie',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            if (first != null)
                              Positioned(
                                right: BlueVectorSpacing.sm,
                                bottom: BlueVectorSpacing.sm,
                                child: FilledButton.tonalIcon(
                                  onPressed: _saving || _capturing
                                      ? null
                                      : _chooseSource,
                                  icon: const Icon(
                                    Icons.add_photo_alternate_outlined,
                                  ),
                                  label: const Text('Ajouter'),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (_photos.length > 1) ...[
                    const SizedBox(height: BlueVectorSpacing.sm),
                    SizedBox(
                      height: 78,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: _photos.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(width: BlueVectorSpacing.xs),
                        itemBuilder: (context, index) {
                          final photo = _photos[index];
                          return Stack(
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(
                                  BlueVectorRadius.small,
                                ),
                                child: Image.file(
                                  File(photo.file.path),
                                  width: 78,
                                  height: 78,
                                  fit: BoxFit.cover,
                                ),
                              ),
                              Positioned(
                                right: 2,
                                top: 2,
                                child: InkWell(
                                  onTap: _saving
                                      ? null
                                      : () => _removePhoto(index),
                                  child: Container(
                                    decoration: const BoxDecoration(
                                      color: Colors.black54,
                                      shape: BoxShape.circle,
                                    ),
                                    padding: const EdgeInsets.all(3),
                                    child: const Icon(
                                      Icons.close,
                                      size: 14,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          );
                        },
                      ),
                    ),
                  ],
                  const SizedBox(height: BlueVectorSpacing.md),
                  const Text(
                    'Type de preuve (facultatif)',
                    style: TextStyle(
                      color: BlueVectorColors.textPrimary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.xs),
                  const Text(
                    'Laissez « Libre » pour envoyer simplement un lot de photos. Le même type s’applique au lot.',
                    style: TextStyle(
                      color: BlueVectorColors.textSecondary,
                      fontSize: 11,
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.sm),
                  Wrap(
                    spacing: BlueVectorSpacing.xs,
                    runSpacing: BlueVectorSpacing.xs,
                    children: [
                      for (final option in _labels)
                        ChoiceChip(
                          label: Text(option.$2),
                          selected: _label == option.$1,
                          onSelected: _saving
                              ? null
                              : (_) => setState(() => _label = option.$1),
                        ),
                    ],
                  ),
                  const SizedBox(height: BlueVectorSpacing.md),
                  TextField(
                    controller: _comment,
                    minLines: 2,
                    maxLines: 4,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) =>
                        FocusManager.instance.primaryFocus?.unfocus(),
                    decoration: const InputDecoration(
                      labelText: 'Commentaire (facultatif)',
                      hintText: 'Ex. passage câble validé, splitter posé…',
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.sm),
                  const Row(
                    children: [
                      Icon(
                        Icons.cloud_sync_outlined,
                        size: 16,
                        color: BlueVectorColors.textMuted,
                      ),
                      SizedBox(width: BlueVectorSpacing.xs),
                      Expanded(
                        child: Text(
                          'Les photos sont conservées localement puis synchronisées. Les photos caméra enregistrent le GPS automatiquement quand il est disponible.',
                          style: TextStyle(
                            color: BlueVectorColors.textMuted,
                            fontSize: 10,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            AnimatedPadding(
              duration: const Duration(milliseconds: 160),
              padding: EdgeInsets.fromLTRB(
                BlueVectorSpacing.md,
                BlueVectorSpacing.sm,
                BlueVectorSpacing.md,
                bottomInset > 0 ? BlueVectorSpacing.sm : BlueVectorSpacing.md,
              ),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _photos.isNotEmpty && !_saving ? _save : null,
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check_rounded),
                  label: Text(
                    _saving
                        ? 'Enregistrement…'
                        : _photos.length <= 1
                        ? 'Enregistrer la photo'
                        : 'Envoyer ${_photos.length} photos',
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
