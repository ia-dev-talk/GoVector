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

  Future<void> _openAction(PilotFieldDefinition field) async {
    final action = field.action;
    final actionParts = action?.split(':') ?? const <String>[];
    final actionType = actionParts.isEmpty ? null : actionParts.first;
    if (actionType == 'cable_entry' || actionType == 'cable_exit') {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => CableEndpointScreen(
            jobId: widget.job.id,
            actionType: actionType!,
            segmentSlot: actionParts.length > 1 ? actionParts[1] : 'primary',
          ),
        ),
      );
      if (mounted) setState(() => _values[field.key] = true);
      return;
    }
    if (action == 'client_signature') {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ClientSignatureScreen(
            jobId: widget.job.id,
            customerName: widget.job.customerName,
          ),
        ),
      );
      if (mounted) setState(() => _values[field.key] = true);
      return;
    }
    if (action == 'site_location') {
      final position = await LocationService.getCurrentPosition();
      if (position == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Position GPS indisponible. La saisie reste possible.',
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
        },
      );
      unawaited(OfflineService.syncPendingActions());
      if (mounted) setState(() => _values[field.key] = true);
    }
  }

  Future<void> _openPhoto(PilotFieldDefinition field) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => FreePhotoActionScreen(
          job: widget.job,
          initialLabel: field.photoLabel,
        ),
      ),
    );
    if (mounted) setState(() => _values[field.key] = true);
  }

  Widget _field(PilotFieldDefinition field) {
    if (!_visible(field)) return const SizedBox.shrink();
    switch (field.kind) {
      case PilotFieldKind.yesNo:
        return DropdownButtonFormField<bool>(
          initialValue: _values[field.key] as bool?,
          decoration: InputDecoration(labelText: field.label),
          items: const [
            DropdownMenuItem(value: true, child: Text('Oui')),
            DropdownMenuItem(value: false, child: Text('Non')),
          ],
          onChanged: (value) => setState(() => _values[field.key] = value),
        );
      case PilotFieldKind.number:
        return TextFormField(
          initialValue: _values[field.key]?.toString(),
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            labelText: field.label,
            helperText: field.helper,
          ),
          onChanged: (value) =>
              _values[field.key] = double.tryParse(value.replaceAll(',', '.')),
        );
      case PilotFieldKind.text:
        return TextFormField(
          initialValue: _values[field.key]?.toString(),
          minLines:
              field.key.contains('comment') || field.key.contains('observation')
              ? 3
              : 1,
          maxLines:
              field.key.contains('comment') || field.key.contains('observation')
              ? 5
              : 1,
          decoration: InputDecoration(
            labelText: field.label,
            helperText: field.helper,
          ),
          onChanged: (value) => _values[field.key] = value.trim(),
        );
      case PilotFieldKind.photo:
        return OutlinedButton.icon(
          onPressed: () => _openPhoto(field),
          icon: Icon(
            _values[field.key] == true
                ? Icons.check_circle
                : Icons.photo_camera_outlined,
          ),
          label: Text(field.label),
        );
      case PilotFieldKind.action:
        return OutlinedButton.icon(
          onPressed: () => _openAction(field),
          icon: Icon(
            field.action == 'site_location'
                ? Icons.location_on_outlined
                : Icons.arrow_forward_rounded,
          ),
          label: Text(field.label),
        );
    }
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      await OfflineService.addPendingAction(
        action: 'installation_work',
        data: {
          'job_id': widget.job.id,
          'work_type': widget.schema.id,
          'value': widget.schema.label,
          'form_schema': 'govector.pilot.v1',
          'fields': Map<String, dynamic>.from(_values),
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
