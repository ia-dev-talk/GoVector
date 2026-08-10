import 'dart:async';

import 'package:flutter/material.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import '../../services/offline_service.dart';

class FreeMeasurementActionScreen extends StatefulWidget {
  const FreeMeasurementActionScreen({
    super.key,
    required this.job,
    this.initialType,
  });

  final Job job;
  final String? initialType;

  @override
  State<FreeMeasurementActionScreen> createState() =>
      _FreeMeasurementActionScreenState();
}

class _FreeMeasurementActionScreenState
    extends State<FreeMeasurementActionScreen> {
  final _value = TextEditingController();
  final _unit = TextEditingController();
  final _comment = TextEditingController();
  late String _type = widget.initialType ?? 'optical_power';
  bool _saving = false;

  @override
  void dispose() {
    _value.dispose();
    _unit.dispose();
    _comment.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_value.text.trim().isEmpty || _saving) {
      if (_value.text.trim().isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Renseignez une valeur exploitable.')),
        );
      }
      return;
    }
    setState(() => _saving = true);
    await OfflineService.addPendingAction(
      action: _type == 'otdr' ? 'otdr_measurement' : 'field_measurement',
      data: {
        'job_id': widget.job.id,
        'measurement_type': _type,
        'value': _value.text.trim(),
        if (_unit.text.trim().isNotEmpty) 'unit': _unit.text.trim(),
        if (_comment.text.trim().isNotEmpty) 'comment': _comment.text.trim(),
      },
    );
    unawaited(OfflineService.syncPendingActions());
    if (mounted) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mesure / test')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BlueVectorSpacing.md),
          children: [
            Text(
              '${widget.job.jobNumber} · ${widget.job.customerName}',
              style: const TextStyle(color: BlueVectorColors.textSecondary),
            ),
            const SizedBox(height: BlueVectorSpacing.lg),
            DropdownButtonFormField<String>(
              initialValue: _type,
              decoration: const InputDecoration(labelText: 'Type'),
              items: const [
                DropdownMenuItem(
                  value: 'optical_power',
                  child: Text('Puissance optique'),
                ),
                DropdownMenuItem(value: 'speed', child: Text('Débit')),
                DropdownMenuItem(value: 'ping', child: Text('Ping')),
                DropdownMenuItem(value: 'otdr', child: Text('OTDR')),
                DropdownMenuItem(value: 'other', child: Text('Autre')),
              ],
              onChanged: (value) {
                if (value != null) setState(() => _type = value);
              },
            ),
            const SizedBox(height: BlueVectorSpacing.sm),
            TextField(
              controller: _value,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Valeur'),
            ),
            const SizedBox(height: BlueVectorSpacing.sm),
            TextField(
              controller: _unit,
              decoration: const InputDecoration(
                labelText: 'Unité (facultatif)',
              ),
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
              onPressed: _saving ? null : _save,
              icon: const Icon(Icons.save_outlined),
              label: Text(_saving ? 'Enregistrement…' : 'Enregistrer'),
            ),
            const SizedBox(height: BlueVectorSpacing.sm),
            const Text(
              'Aucune autre mesure n’est imposée.',
              textAlign: TextAlign.center,
              style: TextStyle(color: BlueVectorColors.textMuted, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}
