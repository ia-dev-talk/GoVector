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
    final file = _file;
    final reference = widget.job.jobNumber.trim().isEmpty
        ? 'Intervention #${widget.job.id}'
        : widget.job.jobNumber.trim();
    final customer = widget.job.customerName.trim();

    return Scaffold(
      resizeToAvoidBottomInset: true,
      appBar: AppBar(title: const Text('Ajouter un document')),
      body: SafeArea(
        bottom: false,
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(
            BlueVectorSpacing.md,
            BlueVectorSpacing.md,
            BlueVectorSpacing.md,
            BlueVectorSpacing.xl,
          ),
          children: [
            Container(
              padding: const EdgeInsets.all(BlueVectorSpacing.md),
              decoration: BoxDecoration(
                color: BlueVectorColors.surface,
                borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
                border: Border.all(color: BlueVectorColors.border),
              ),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: BlueVectorColors.violet.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(BlueVectorRadius.small),
                    ),
                    child: const Icon(
                      Icons.description_outlined,
                      color: BlueVectorColors.violet,
                    ),
                  ),
                  const SizedBox(width: BlueVectorSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          reference,
                          style: const TextStyle(
                            color: BlueVectorColors.textPrimary,
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        if (customer.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            customer,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: BlueVectorColors.textSecondary,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: BlueVectorSpacing.lg),
            Text(
              'PIÈCE À JOINDRE',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: BlueVectorColors.textSecondary,
                fontWeight: FontWeight.w900,
                letterSpacing: 1,
              ),
            ),
            const SizedBox(height: BlueVectorSpacing.xs),
            OutlinedButton.icon(
              onPressed: _saving ? null : _pick,
              icon: Icon(
                file == null
                    ? Icons.attach_file_rounded
                    : Icons.check_circle_outline_rounded,
              ),
              label: Text(file?.name ?? 'Choisir un PDF ou document'),
            ),
            if (file != null) ...[
              const SizedBox(height: BlueVectorSpacing.xs),
              Text(
                '${file.extension?.toUpperCase() ?? 'FICHIER'} · ${_formatBytes(file.size)}',
                style: const TextStyle(
                  color: BlueVectorColors.textMuted,
                  fontSize: 10,
                ),
              ),
            ],
            const SizedBox(height: BlueVectorSpacing.lg),
            TextField(
              controller: _comment,
              minLines: 3,
              maxLines: 6,
              textInputAction: TextInputAction.newline,
              scrollPadding: const EdgeInsets.only(bottom: 120),
              decoration: const InputDecoration(
                labelText: 'Commentaire (facultatif)',
                hintText: 'Contexte utile pour le bureau ou le contrôle…',
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: BlueVectorSpacing.md),
            const Text(
              'Le document est conservé localement si le réseau est indisponible, puis synchronisé avec l’intervention.',
              style: TextStyle(
                color: BlueVectorColors.textMuted,
                fontSize: 10,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(
          BlueVectorSpacing.md,
          BlueVectorSpacing.xs,
          BlueVectorSpacing.md,
          BlueVectorSpacing.md,
        ),
        child: FilledButton.icon(
          onPressed: file?.path != null && !_saving ? _save : null,
          icon: const Icon(Icons.save_outlined),
          label: Text(_saving ? 'Enregistrement…' : 'Enregistrer le document'),
        ),
      ),
    );
  }

  String _formatBytes(int bytes) {
    if (bytes >= 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} Mo';
    }
    if (bytes >= 1024) {
      return '${(bytes / 1024).toStringAsFixed(0)} Ko';
    }
    return '$bytes o';
  }
}
