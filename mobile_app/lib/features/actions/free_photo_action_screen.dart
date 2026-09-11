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
  // Generic capture stays intentionally small. Specific FTTH evidence such as
  // splitter/PTO/PCO photos is requested by the business form itself.
  static const _genericLabels = <(String?, String)>[
    (null, 'Libre'),
    ('before', 'Avant'),
    ('during', 'Pendant'),
    ('after', 'Après'),
  ];

  static const _contextLabels = <String, String>{
    'cable_departure': 'Photo départ câble',
    'cable_arrival': 'Photo arrivée câble',
    'splitter_before': 'Splitter avant',
    'splitter_after': 'Splitter après',
    'joint_before': 'Joint avant',
    'joint_after': 'Joint après',
    'pco': 'PCO',
    'pco_progress': 'PCO en cours',
    'pco_after': 'PCO après',
    'pto': 'Prise (PTO)',
    'ont_signal': 'ONT + signal',
    'ont_serial': 'N° Série ONT (GPON SN)',
    'technician_signature': 'Signature technicien',
  };

  final _comment = TextEditingController();
  final _picker = ImagePicker();
  List<_PendingPhoto> _photos = const [];
  String? _label;
  bool _saving = false;
  bool _capturing = false;

  bool get _isContextualEvidence {
    final initial = widget.initialLabel?.trim();
    if (initial == null || initial.isEmpty) return false;
    return !_genericLabels.any((item) => item.$1 == initial);
  }

  @override
  void initState() {
    super.initState();
    _label = widget.initialLabel?.trim().isEmpty == true ? null : widget.initialLabel?.trim();
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
        imageQuality: 76,
        maxWidth: 1920,
      );
      if (photo == null) return;
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
      final files = await _picker.pickMultiImage(
        imageQuality: 76,
        maxWidth: 1920,
      );
      if (files.isEmpty || !mounted) return;
      final importedAt = DateTime.now().toUtc();
      setState(() {
        _photos = [
          ..._photos,
          for (final file in files)
            _PendingPhoto(
              file: file,
              source: 'gallery',
              selectedAt: importedAt,
            ),
        ];
      });
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  Future<void> _chooseSource() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text(
                'Ajouter des photos',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              subtitle: Text(
                'La caméra ajoute le GPS uniquement s’il est réellement disponible.',
              ),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Prendre une photo'),
              subtitle: const Text('Heure + GPS réel si disponible'),
              onTap: () => Navigator.pop(context, 'camera'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choisir dans la galerie'),
              subtitle: const Text('Sélection multiple, sans GPS inventé'),
              onTap: () => Navigator.pop(context, 'gallery'),
            ),
          ],
        ),
      ),
    );
    if (choice == 'camera') await _takePhoto();
    if (choice == 'gallery') await _pickGalleryBatch();
  }

  void _removePhoto(int index) {
    if (_saving) return;
    setState(() => _photos = [..._photos]..removeAt(index));
  }

  Future<void> _preview(_PendingPhoto photo) async {
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
                    child: Image.file(File(photo.file.path), fit: BoxFit.contain),
                  ),
                ),
              ),
              Positioned(
                top: 8,
                right: 8,
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
          'evidence_role': _isContextualEvidence ? 'business_form_photo' : 'field_photo',
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
              'gps_observed_at': (photo.gpsObservedAt ?? photo.selectedAt).toIso8601String(),
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
      unawaited(OfflineService.syncPendingActions());
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$error'.replaceFirst('Bad state: ', ''))),
      );
      setState(() => _saving = false);
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
    return Scaffold(
      appBar: AppBar(title: const Text('Photos terrain')),
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Expanded(
              child: ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(
                  BlueVectorSpacing.md,
                  BlueVectorSpacing.sm,
                  BlueVectorSpacing.md,
                  BlueVectorSpacing.lg,
                ),
                children: [
                  _JobContext(job: widget.job),
                  const SizedBox(height: BlueVectorSpacing.md),
                  if (_isContextualEvidence)
                    Container(
                      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
                      decoration: BoxDecoration(
                        color: BlueVectorColors.primarySoft,
                        borderRadius: BorderRadius.circular(BlueVectorRadius.small),
                        border: Border.all(color: BlueVectorColors.border),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.fact_check_outlined,
                            color: BlueVectorColors.primaryBright,
                          ),
                          const SizedBox(width: BlueVectorSpacing.sm),
                          Expanded(
                            child: Text(
                              'Preuve demandée : ${_contextLabels[_label] ?? _label}',
                              style: const TextStyle(fontWeight: FontWeight.w800),
                            ),
                          ),
                        ],
                      ),
                    )
                  else ...[
                    const Text(
                      'Type de photo',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: BlueVectorSpacing.xs),
                    Wrap(
                      spacing: BlueVectorSpacing.xs,
                      runSpacing: BlueVectorSpacing.xs,
                      children: [
                        for (final option in _genericLabels)
                          ChoiceChip(
                            label: Text(option.$2),
                            selected: _label == option.$1,
                            onSelected: _saving
                                ? null
                                : (_) => setState(() => _label = option.$1),
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: BlueVectorSpacing.md),
                  OutlinedButton.icon(
                    onPressed: _saving || _capturing ? null : _chooseSource,
                    icon: _capturing
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.add_a_photo_outlined),
                    label: Text(
                      _photos.isEmpty
                          ? 'Ajouter une ou plusieurs photos'
                          : 'Ajouter une autre photo',
                    ),
                  ),
                  if (_photos.isNotEmpty) ...[
                    const SizedBox(height: BlueVectorSpacing.sm),
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: _photos.length,
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        crossAxisSpacing: 8,
                        mainAxisSpacing: 8,
                      ),
                      itemBuilder: (context, index) {
                        final photo = _photos[index];
                        return Stack(
                          fit: StackFit.expand,
                          children: [
                            InkWell(
                              onTap: () => _preview(photo),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(BlueVectorRadius.small),
                                child: Image.file(
                                  File(photo.file.path),
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => const ColoredBox(
                                    color: BlueVectorColors.surfaceSoft,
                                    child: Icon(Icons.broken_image_outlined),
                                  ),
                                ),
                              ),
                            ),
                            Positioned(
                              right: 3,
                              top: 3,
                              child: InkWell(
                                onTap: _saving ? null : () => _removePhoto(index),
                                child: Container(
                                  padding: const EdgeInsets.all(4),
                                  decoration: const BoxDecoration(
                                    color: Colors.black54,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(Icons.close, size: 14, color: Colors.white),
                                ),
                              ),
                            ),
                            Positioned(
                              left: 3,
                              bottom: 3,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 3),
                                decoration: BoxDecoration(
                                  color: Colors.black54,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  photo.source == 'camera'
                                      ? (photo.hasGps ? 'GPS' : 'Sans GPS')
                                      : 'Galerie',
                                  style: const TextStyle(color: Colors.white, fontSize: 8),
                                ),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ],
                  const SizedBox(height: BlueVectorSpacing.md),
                  TextField(
                    controller: _comment,
                    minLines: 2,
                    maxLines: 4,
                    textInputAction: TextInputAction.done,
                    decoration: const InputDecoration(
                      labelText: 'Commentaire (facultatif)',
                      hintText: 'Observation utile pour le dossier…',
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.sm),
                  const Text(
                    'Les photos restent sur le téléphone jusqu’à leur synchronisation. Une photo prise avec la caméra ne reçoit un GPS que si le téléphone fournit réellement une position.',
                    style: TextStyle(
                      color: BlueVectorColors.textMuted,
                      fontSize: 10,
                      height: 1.35,
                    ),
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
                      : const Icon(Icons.save_outlined),
                  label: Text(
                    _saving
                        ? 'Enregistrement…'
                        : _photos.length <= 1
                        ? 'Enregistrer la photo'
                        : 'Enregistrer ${_photos.length} photos',
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

class _JobContext extends StatelessWidget {
  const _JobContext({required this.job});

  final Job job;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.small),
        border: Border.all(color: BlueVectorColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: BlueVectorColors.primarySoft,
              borderRadius: BorderRadius.circular(BlueVectorRadius.small),
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
                  job.jobNumber.isEmpty ? 'Intervention #${job.id}' : job.jobNumber,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                Text(
                  job.customerName.isEmpty ? 'Client non renseigné' : job.customerName,
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
        ],
      ),
    );
  }
}
