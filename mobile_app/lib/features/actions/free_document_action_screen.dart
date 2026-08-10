import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import '../../services/offline_service.dart';

class FreeDocumentActionScreen extends StatefulWidget {
  const FreeDocumentActionScreen({super.key, required this.job});

  final Job job;

  @override
  State<FreeDocumentActionScreen> createState() =>
      _FreeDocumentActionScreenState();
}

class _FreeDocumentActionScreenState extends State<FreeDocumentActionScreen> {
  final _comment = TextEditingController();
  PlatformFile? _file;
  bool _saving = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'txt', 'doc', 'docx'],
      withData: false,
    );
    if (result != null && mounted) setState(() => _file = result.files.single);
  }

  Future<void> _save() async {
    final selected = _file;
    if (selected?.path == null || _saving) return;
    setState(() => _saving = true);
    await OfflineService.addPendingMedia(
      jobId: widget.job.id,
      sourcePath: selected!.path!,
      kind: 'document',
      eventType: 'intervention_document',
      mimeType: _mime(selected.extension),
      metadata: {
        'name': selected.name,
        if (_comment.text.trim().isNotEmpty) 'comment': _comment.text.trim(),
      },
    );
    unawaited(OfflineService.syncPendingActions());
    if (mounted) Navigator.pop(context, true);
  }

  String _mime(String? extension) => switch (extension?.toLowerCase()) {
    'pdf' => 'application/pdf',
    'txt' => 'text/plain',
    'doc' => 'application/msword',
    'docx' =>
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    _ => 'application/octet-stream',
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ajouter un document')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(BlueVectorSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                '${widget.job.jobNumber} · ${widget.job.customerName}',
                style: const TextStyle(color: BlueVectorColors.textSecondary),
              ),
              const SizedBox(height: BlueVectorSpacing.lg),
              OutlinedButton.icon(
                onPressed: _saving ? null : _pick,
                icon: const Icon(Icons.attach_file_rounded),
                label: Text(_file?.name ?? 'Choisir un fichier'),
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
              const Spacer(),
              FilledButton.icon(
                onPressed: _file?.path != null && !_saving ? _save : null,
                icon: const Icon(Icons.save_outlined),
                label: Text(_saving ? 'Enregistrement…' : 'Enregistrer'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
