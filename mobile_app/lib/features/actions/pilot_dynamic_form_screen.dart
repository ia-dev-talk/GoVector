import 'dart:async';

import 'package:flutter/material.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import '../../services/location_service.dart';
import '../../services/offline_service.dart';
import 'cable_endpoint_screen.dart';
import 'client_signature_screen.dart';
import 'free_photo_action_screen.dart';
import 'pilot_form_schema.dart';

export 'pilot_form_schema.dart' show pilotFormSchemaForJobType;

class PilotDynamicFormScreen extends StatefulWidget {
  const PilotDynamicFormScreen({
    super.key,
    required this.job,
    required this.schema,
  });

  final Job job;
  final PilotFormSchema schema;

  @override
  State<PilotDynamicFormScreen> createState() => _PilotDynamicFormScreenState();
}

class _PilotDynamicFormScreenState extends State<PilotDynamicFormScreen> {
  final Map<String, dynamic> _values = {};
  bool _saving = false;

  bool _visible(PilotFieldDefinition field) {
    final condition = field.condition;
    return condition == null || _values[condition.field] == condition.equals;
  }

  String _label(PilotFieldDefinition field) =>
      field.isRequired ? '* ${field.label}' : field.label;

  Future<void> _openAction(PilotFieldDefinition field) async {
    final action = field.action;
    final actionParts = action?.split(':') ?? const <String>[];
    final actionType = actionParts.isEmpty ? null : actionParts.first;

    if (actionType == 'cable_entry' || actionType == 'cable_exit') {
      final saved = await Navigator.of(context).push<bool>(
        MaterialPageRoute<bool>(
          builder: (_) => CableEndpointScreen(
            jobId: widget.job.id,
            actionType: actionType!,
            segmentSlot: actionParts.length > 1 ? actionParts[1] : 'primary',
          ),
        ),
      );
      if (mounted && saved == true) {
        setState(() => _values[field.key] = true);
      }
      return;
    }

    if (action == 'client_signature') {
      final saved = await Navigator.of(context).push<bool>(
        MaterialPageRoute<bool>(
          builder: (_) => ClientSignatureScreen(
            jobId: widget.job.id,
            customerName: widget.job.customerName,
          ),
        ),
      );
      if (mounted && saved == true) {
        setState(() => _values[field.key] = true);
      }
      return;
    }

    if (action == 'site_location') {
      final position = await LocationService.getCurrentPosition();
      if (position == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                field.isRequired
                    ? 'Position GPS indisponible. Réessayez avant de valider le compte rendu.'
                    : 'Position GPS indisponible. La saisie reste possible.',
              ),
            ),
          );
        }
        return;
      }
      await OfflineService.addPendingAction(
        action: 'site_location',
        data: {
          'job_id': widget.job.id,
          'latitude': position.latitude,
          'longitude': position.longitude,
          'accuracy': position.accuracy,
          'observed_at': DateTime.now().toUtc().toIso8601String(),
        },
      );
      unawaited(OfflineService.syncPendingActions());
      if (mounted) setState(() => _values[field.key] = true);
    }
  }

  Future<void> _openPhoto(PilotFieldDefinition field) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => FreePhotoActionScreen(
          job: widget.job,
          initialLabel: field.photoLabel,
        ),
      ),
    );
    if (mounted && saved == true) {
      setState(() => _values[field.key] = true);
    }
  }

  Widget _field(PilotFieldDefinition field) {
    if (!_visible(field)) return const SizedBox.shrink();

    switch (field.kind) {
      case PilotFieldKind.yesNo:
        final realisedChoice = field.key == 'completed';
        return DropdownButtonFormField<bool>(
          initialValue: _values[field.key] as bool?,
          decoration: InputDecoration(
            labelText: _label(field),
            helperText: field.helper,
          ),
          items: [
            DropdownMenuItem(
              value: true,
              child: Text(realisedChoice ? 'Intervention réalisée' : 'Oui'),
            ),
            DropdownMenuItem(
              value: false,
              child: Text(realisedChoice ? 'Intervention en échec' : 'Non'),
            ),
          ],
          onChanged: (value) => setState(() => _values[field.key] = value),
        );

      case PilotFieldKind.number:
        return TextFormField(
          initialValue: _values[field.key]?.toString(),
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            labelText: _label(field),
            helperText: field.helper,
          ),
          onChanged: (value) =>
              _values[field.key] = double.tryParse(value.replaceAll(',', '.')),
        );

      case PilotFieldKind.text:
        final multiline = field.multiline ||
            field.key.contains('comment') ||
            field.key.contains('observation');
        return TextFormField(
          initialValue: _values[field.key]?.toString(),
          minLines: multiline ? 3 : 1,
          maxLines: multiline ? 5 : 1,
          decoration: InputDecoration(
            labelText: _label(field),
            helperText: field.helper,
          ),
          onChanged: (value) => _values[field.key] = value.trim(),
        );

      case PilotFieldKind.photo:
        final captured = _values[field.key] == true;
        return OutlinedButton.icon(
          onPressed: () => _openPhoto(field),
          icon: Icon(
            captured ? Icons.check_circle : Icons.photo_camera_outlined,
            color: captured ? BlueVectorColors.success : null,
          ),
          label: Text(captured ? '${_label(field)} · ajoutée' : _label(field)),
        );

      case PilotFieldKind.action:
        final captured = _values[field.key] == true;
        return OutlinedButton.icon(
          onPressed: () => _openAction(field),
          icon: Icon(
            captured
                ? Icons.check_circle
                : field.action == 'site_location'
                    ? Icons.location_on_outlined
                    : Icons.arrow_forward_rounded,
            color: captured ? BlueVectorColors.success : null,
          ),
          label: Text(captured ? '${_label(field)} · enregistré' : _label(field)),
        );
    }
  }

  List<PilotFieldDefinition> _visibleRequiredFields() => widget.schema.sections
      .expand((section) => section.fields)
      .where((field) => field.isRequired && _visible(field))
      .toList(growable: false);

  bool _hasValue(PilotFieldDefinition field) {
    final value = _values[field.key];
    switch (field.kind) {
      case PilotFieldKind.text:
        return value is String && value.trim().isNotEmpty;
      case PilotFieldKind.number:
        return value is num;
      case PilotFieldKind.yesNo:
        return value is bool;
      case PilotFieldKind.photo:
      case PilotFieldKind.action:
        return value == true;
    }
  }

  Map<String, dynamic> _visibleValues() {
    final result = <String, dynamic>{};
    for (final field in widget.schema.sections.expand((section) => section.fields)) {
      if (!_visible(field)) continue;
      if (!_values.containsKey(field.key)) continue;
      result[field.key] = _values[field.key];
    }
    return result;
  }

  Future<void> _save() async {
    if (_saving) return;

    final missing = _visibleRequiredFields()
        .where((field) => !_hasValue(field))
        .toList(growable: false);
    if (missing.isNotEmpty) {
      final first = missing.first;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            missing.length == 1
                ? 'Champ obligatoire manquant : ${first.label}.'
                : '${missing.length} éléments obligatoires manquent. Commencez par : ${first.label}.',
          ),
        ),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      await OfflineService.addPendingAction(
        action: 'installation_work',
        data: {
          'job_id': widget.job.id,
          'work_type': widget.schema.id,
          'value': widget.schema.label,
          'form_schema': 'govector.praxedo.v1',
          'fields': _visibleValues(),
          'submitted_at': DateTime.now().toUtc().toIso8601String(),
        },
      );
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.schema.label)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BlueVectorSpacing.md),
          children: [
            Container(
              padding: const EdgeInsets.all(BlueVectorSpacing.sm),
              decoration: BoxDecoration(
                color: BlueVectorColors.primarySoft,
                border: Border.all(color: BlueVectorColors.border),
                borderRadius: BorderRadius.circular(BlueVectorRadius.small),
              ),
              child: const Text(
                '* Champ ou preuve obligatoire selon la configuration GoVector.',
                style: TextStyle(
                  color: BlueVectorColors.textSecondary,
                  fontSize: 11,
                ),
              ),
            ),
            const SizedBox(height: BlueVectorSpacing.sm),
            for (final section in widget.schema.sections) ...[
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(BlueVectorSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        section.title,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: BlueVectorSpacing.sm),
                      for (final field in section.fields) ...[
                        _field(field),
                        if (_visible(field))
                          const SizedBox(height: BlueVectorSpacing.sm),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: BlueVectorSpacing.sm),
            ],
            FilledButton.icon(
              onPressed: _saving ? null : _save,
              icon: _saving
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(
                _saving ? 'Enregistrement…' : 'Enregistrer le compte rendu',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
