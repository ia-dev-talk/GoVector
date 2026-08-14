import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import '../../services/offline_service.dart';

class FreePhotoActionScreen extends StatefulWidget {
  const FreePhotoActionScreen({super.key, required this.job});

  final Job job;

  @override
  State<FreePhotoActionScreen> createState() => _FreePhotoActionScreenState();
}

class _FreePhotoActionScreenState extends State<FreePhotoActionScreen> {
  static const _labels = <(String?, String)>[
    (null, 'Libre'),
    ('before', 'Avant'),
    ('after', 'Après'),
    ('pbo', 'PBO'),
    ('pto', 'PTO'),
    ('ont', 'ONT'),
    ('router', 'Routeur'),
    ('incident', 'Incident'),
    ('other', 'Autre'),
  ];

  final _comment = TextEditingController();
  XFile? _photo;
  String? _label;
  bool _saving = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _pick(ImageSource source) async {
    final photo = await ImagePicker().pickImage(
      source: source,
      imageQuality: 92,
    );
    if (photo != null && mounted) {
      setState(() => _photo = photo);
    }
  }

  Future<void> _chooseSource() async {
    final source = await showModalBottomSheet<ImageSource>(
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
                  'Ajouter une preuve photo',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                subtitle: Text('Prenez une photo sur site ou utilisez la galerie.'),
              ),
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
      ),
    );
    if (source != null) await _pick(source);
  }

  Future<void> _save() async {
    final photo = _photo;
    if (photo == null || _saving) return;
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() => _saving = true);
    try {
      await OfflineService.addPendingMedia(
        jobId: widget.job.id,
        sourcePath: photo.path,
        kind: 'photo',
        eventType: 'intervention_photo',
        mimeType: photo.mimeType ?? _mimeFromName(photo.name),
        metadata: {
          if (_label != null) 'label': _label,
          if (_comment.text.trim().isNotEmpty) 'comment': _comment.text.trim(),
          'captured_at': DateTime.now().toUtc().toIso8601String(),
          'evidence_role': 'field_photo',
        },
      );
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
    final photo = _photo;
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Scaffold(
      appBar: AppBar(title: const Text('Photo terrain')),
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
                  Container(
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
                        const Text(
                          'PHOTO',
                          style: TextStyle(
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
                      borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
                      child: InkWell(
                        onTap: _saving ? null : _chooseSource,
                        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            if (photo == null)
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
                                    'Ajouter une photo',
                                    style: TextStyle(fontWeight: FontWeight.w800),
                                  ),
                                  SizedBox(height: 4),
                                  Text(
                                    'Caméra ou galerie',
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
                                  File(photo.path),
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => const Center(
                                    child: Icon(Icons.image_rounded, size: 48),
                                  ),
                                ),
                              ),
                            if (photo != null)
                              Positioned(
                                right: BlueVectorSpacing.sm,
                                bottom: BlueVectorSpacing.sm,
                                child: FilledButton.tonalIcon(
                                  onPressed: _saving ? null : _chooseSource,
                                  icon: const Icon(Icons.swap_horiz_rounded),
                                  label: const Text('Changer'),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.md),
                  const Text(
                    'Qualifier la photo',
                    style: TextStyle(
                      color: BlueVectorColors.textPrimary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.xs),
                  const Text(
                    'Le type aide le bureau à retrouver immédiatement la bonne preuve.',
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
                    onSubmitted: (_) => FocusManager.instance.primaryFocus?.unfocus(),
                    decoration: const InputDecoration(
                      labelText: 'Commentaire (facultatif)',
                      hintText: 'Ex. boîtier fissuré, passage câble validé…',
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
                          'La photo est conservée localement puis synchronisée dès que possible.',
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
                  onPressed: photo != null && !_saving ? _save : null,
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check_rounded),
                  label: Text(
                    _saving ? 'Enregistrement…' : 'Enregistrer la photo',
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
