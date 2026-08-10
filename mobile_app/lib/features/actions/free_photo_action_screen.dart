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
    if (photo != null && mounted) setState(() => _photo = photo);
  }

  Future<void> _chooseSource() async {
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
    if (source != null) await _pick(source);
  }

  Future<void> _save() async {
    final photo = _photo;
    if (photo == null || _saving) return;
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
    return Scaffold(
      appBar: AppBar(title: const Text('Ajouter une photo')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BlueVectorSpacing.md),
          children: [
            Text(
              '${widget.job.jobNumber} · ${widget.job.customerName}',
              style: const TextStyle(color: BlueVectorColors.textSecondary),
            ),
            const SizedBox(height: BlueVectorSpacing.lg),
            AspectRatio(
              aspectRatio: 4 / 3,
              child: Material(
                color: BlueVectorColors.surface,
                borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
                child: InkWell(
                  onTap: _saving ? null : _chooseSource,
                  borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
                  child: _photo == null
                      ? const Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.add_a_photo_outlined, size: 46),
                            SizedBox(height: BlueVectorSpacing.sm),
                            Text('Caméra ou galerie'),
                          ],
                        )
                      : ClipRRect(
                          borderRadius: BorderRadius.circular(
                            BlueVectorRadius.medium,
                          ),
                          child: Image.file(
                            File(_photo!.path),
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const Center(
                              child: Icon(Icons.image_rounded, size: 48),
                            ),
                          ),
                        ),
                ),
              ),
            ),
            const SizedBox(height: BlueVectorSpacing.md),
            DropdownButtonFormField<String?>(
              initialValue: _label,
              decoration: const InputDecoration(
                labelText: 'Label (facultatif)',
              ),
              items: const [
                DropdownMenuItem(value: null, child: Text('Sans label')),
                DropdownMenuItem(value: 'before', child: Text('Avant')),
                DropdownMenuItem(value: 'after', child: Text('Après')),
                DropdownMenuItem(value: 'pbo', child: Text('PBO')),
                DropdownMenuItem(value: 'pto', child: Text('PTO')),
                DropdownMenuItem(value: 'ont', child: Text('ONT')),
                DropdownMenuItem(value: 'router', child: Text('Routeur')),
                DropdownMenuItem(value: 'incident', child: Text('Incident')),
                DropdownMenuItem(value: 'other', child: Text('Autre')),
              ],
              onChanged: (value) => setState(() => _label = value),
            ),
            const SizedBox(height: BlueVectorSpacing.sm),
            TextField(
              controller: _comment,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Commentaire (facultatif)',
              ),
            ),
            const SizedBox(height: BlueVectorSpacing.lg),
            FilledButton.icon(
              onPressed: _photo != null && !_saving ? _save : null,
              icon: const Icon(Icons.save_outlined),
              label: Text(_saving ? 'Enregistrement…' : 'Enregistrer'),
            ),
            const SizedBox(height: BlueVectorSpacing.sm),
            const Text(
              'Aucun nombre minimum de photos.',
              textAlign: TextAlign.center,
              style: TextStyle(color: BlueVectorColors.textMuted, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}
