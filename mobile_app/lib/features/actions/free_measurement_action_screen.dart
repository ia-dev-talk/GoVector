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
  static const _units = <String, String>{
    'optical_power': 'dBm',
    'speed': 'Mbps',
    'ping': 'ms',
    'attenuation': 'dB',
    'cable_length': 'm',
    'otdr': 'dB',
  };

  static const _labels = <String, String>{
    'optical_power': 'Puissance optique',
    'speed': 'Débit',
    'ping': 'Ping',
    'attenuation': 'Atténuation',
    'cable_length': 'Longueur câble posée',
    'otdr': 'OTDR',
    'other': 'Autre mesure',
  };

  final _value = TextEditingController();
  final _unit = TextEditingController();
  final _comment = TextEditingController();
  late String _type = widget.initialType ?? 'optical_power';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _unit.text = _units[_type] ?? '';
  }

  @override
  void dispose() {
    _value.dispose();
    _unit.dispose();
    _comment.dispose();
    super.dispose();
  }

  bool get _numericType => _type != 'other' && _type != 'otdr';

  void _changeType(String value) {
    setState(() {
      _type = value;
      final defaultUnit = _units[value];
      if (defaultUnit != null) {
        _unit.text = defaultUnit;
      } else {
        _unit.clear();
      }
    });
  }

  String? _validateValue() {
    final raw = _value.text.trim();
    if (raw.isEmpty) return 'Renseignez une valeur exploitable.';
    if (!_numericType) return null;
    final parsed = double.tryParse(raw.replaceAll(',', '.'));
    if (parsed == null || !parsed.isFinite) {
      return '${_labels[_type] ?? 'La mesure'} doit être numérique.';
    }
    if (_type == 'cable_length' && parsed < 0) {
      return 'La longueur de câble ne peut pas être négative.';
    }
    return null;
  }

  Future<void> _save() async {
    if (_saving) return;
    final validation = _validateValue();
    if (validation != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(validation)));
      return;
    }

    setState(() => _saving = true);
    final rawValue = _value.text.trim();
    final normalizedValue = _numericType
        ? rawValue.replaceAll(',', '.')
        : rawValue;
    await OfflineService.addPendingAction(
      action: _type == 'otdr' ? 'otdr_measurement' : 'field_measurement',
      data: {
        'job_id': widget.job.id,
        'measurement_type': _type,
        'value': normalizedValue,
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
            Container(
              padding: const EdgeInsets.all(BlueVectorSpacing.sm),
              decoration: BoxDecoration(
                color: BlueVectorColors.primarySoft,
                border: Border.all(color: BlueVectorColors.border),
                borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
              ),
              child: Row(
                children: [
                  const Icon(Icons.speed_rounded, color: BlueVectorColors.cyan),
                  const SizedBox(width: BlueVectorSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${widget.job.jobNumber} · ${widget.job.customerName}',
                          style: const TextStyle(
                            color: BlueVectorColors.textPrimary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 3),
                        const Text(
                          'Saisissez le relevé une seule fois. Les mesures canoniques alimentent automatiquement la fiche et les règles de clôture.',
                          style: TextStyle(
                            color: BlueVectorColors.textSecondary,
                            fontSize: 11,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: BlueVectorSpacing.lg),
            DropdownButtonFormField<String>(
              initialValue: _type,
              decoration: const InputDecoration(labelText: 'Type de mesure'),
              items: _labels.entries
                  .map(
                    (entry) => DropdownMenuItem(
                      value: entry.key,
                      child: Text(entry.value),
                    ),
                  )
                  .toList(growable: false),
              onChanged: (value) {
                if (value != null) _changeType(value);
              },
            ),
            const SizedBox(height: BlueVectorSpacing.sm),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  flex: 2,
                  child: TextField(
                    controller: _value,
                    autofocus: true,
                    keyboardType: _numericType
                        ? const TextInputType.numberWithOptions(
                            decimal: true,
                            signed: true,
                          )
                        : TextInputType.text,
                    decoration: InputDecoration(
                      labelText: 'Valeur',
                      hintText: switch (_type) {
                        'optical_power' => '-18.5',
                        'speed' => '500',
                        'ping' => '12',
                        'attenuation' => '0.35',
                        'cable_length' => '42',
                        'otdr' => 'Perte / événement observé',
                        _ => 'Valeur relevée',
                      },
                    ),
                  ),
                ),
                const SizedBox(width: BlueVectorSpacing.sm),
                Expanded(
                  child: TextField(
                    controller: _unit,
                    decoration: const InputDecoration(labelText: 'Unité'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: BlueVectorSpacing.sm),
            TextField(
              controller: _comment,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Commentaire (facultatif)',
                hintText: 'Contexte du relevé, port, observation…',
              ),
            ),
            if (_type == 'cable_length') ...[
              const SizedBox(height: BlueVectorSpacing.sm),
              Container(
                padding: const EdgeInsets.all(BlueVectorSpacing.sm),
                decoration: BoxDecoration(
                  color: BlueVectorColors.surfaceRaised,
                  border: Border.all(color: BlueVectorColors.border),
                  borderRadius: BorderRadius.circular(BlueVectorRadius.small),
                ),
                child: const Text(
                  'Cette valeur représente la longueur réellement déclarée/mesurée. Elle reste distincte de la distance GPS calculée entre l’entrée et la sortie du câble.',
                  style: TextStyle(
                    color: BlueVectorColors.textMuted,
                    fontSize: 11,
                    height: 1.4,
                  ),
                ),
              ),
            ],
            const SizedBox(height: BlueVectorSpacing.lg),
            FilledButton.icon(
              onPressed: _saving ? null : _save,
              icon: const Icon(Icons.save_outlined),
              label: Text(
                _saving ? 'Enregistrement…' : 'Enregistrer le relevé',
              ),
            ),
            const SizedBox(height: BlueVectorSpacing.sm),
            const Text(
              'GoVector enregistre la valeur mesurée sans inventer de seuil de conformité. Les seuils métier éventuels doivent être configurés par l’administrateur.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: BlueVectorColors.textMuted,
                fontSize: 10,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
