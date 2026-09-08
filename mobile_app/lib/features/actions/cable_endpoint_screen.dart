import 'package:flutter/material.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../services/intervention_service.dart';
import '../../services/location_service.dart';
import '../../services/offline_service.dart';
import '../../services/technician_stock_service.dart';

class CableEndpointScreen extends StatefulWidget {
  const CableEndpointScreen({
    super.key,
    required this.jobId,
    required this.actionType,
  }) : assert(actionType == 'cable_entry' || actionType == 'cable_exit');

  final int jobId;
  final String actionType;

  bool get isEntry => actionType == 'cable_entry';

  @override
  State<CableEndpointScreen> createState() => _CableEndpointScreenState();
}

class _CableEndpointScreenState extends State<CableEndpointScreen> {
  static const _fallbackModes = <Map<String, String>>[
    {'code': 'FACADE', 'label': 'Façade'},
    {'code': 'AERIEN', 'label': 'Aérien'},
    {'code': 'AUTRE', 'label': 'Autre'},
  ];

  final _meterController = TextEditingController();
  List<Map<String, dynamic>> _cables = const [];
  List<Map<String, String>> _installationModes = _fallbackModes;
  int? _selectedCableId;
  String? _selectedModeCode;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _meterController.dispose();
    super.dispose();
  }

  static String _normalized(Object? value) {
    return value?.toString().trim().toLowerCase() ?? '';
  }

  static bool _isCableItem(Map<String, dynamic> item) {
    final type = _normalized(item['equipment_type']);
    final unit = _normalized(item['unit']);
    return type.contains('cabl') ||
        const {'m', 'metre', 'mètre', 'metres', 'mètres', 'meter', 'meters'}
            .contains(unit);
  }

  int _itemId(Map<String, dynamic> item) =>
      int.tryParse(item['item_id']?.toString() ?? '') ?? 0;

  int _available(Map<String, dynamic> item) =>
      int.tryParse(item['available_quantity']?.toString() ?? '') ?? 0;

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final custody = await TechnicianStockService.getCustody();
      final cables = custody
          .where((item) => _available(item) > 0 && _isCableItem(item))
          .toList(growable: false);

      var modes = _fallbackModes;
      try {
        final catalog = await InterventionService.getBusinessCatalog();
        final values = catalog['values'];
        final rawModes = values is Map<String, dynamic>
            ? values['installation_modes']
            : null;
        if (rawModes is List) {
          final configured = rawModes
              .whereType<Map>()
              .where((item) => item['active'] != false)
              .map((item) => {
                    'code': item['code']?.toString().trim() ?? '',
                    'label': item['label']?.toString().trim() ?? '',
                  })
              .where((item) =>
                  item['code']!.isNotEmpty && item['label']!.isNotEmpty)
              .toList(growable: false);
          if (configured.isNotEmpty) modes = configured;
        }
      } catch (_) {
        // Offline/older servers use the conservative field-confirmed fallback.
      }

      if (!mounted) return;
      setState(() {
        _cables = cables;
        _installationModes = modes;
        if (_selectedCableId == null && cables.length == 1) {
          _selectedCableId = _itemId(cables.first);
        }
        if (_selectedModeCode == null && modes.length == 1) {
          _selectedModeCode = modes.first['code'];
        }
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Map<String, dynamic>? get _selectedCable {
    final id = _selectedCableId;
    if (id == null) return null;
    for (final cable in _cables) {
      if (_itemId(cable) == id) return cable;
    }
    return null;
  }

  Map<String, String>? get _selectedMode {
    final code = _selectedModeCode;
    if (code == null) return null;
    for (final mode in _installationModes) {
      if (mode['code'] == code) return mode;
    }
    return null;
  }

  double? _parseMeterMark() {
    final raw = _meterController.text.trim();
    if (raw.isEmpty) return null;
    final parsed = double.tryParse(raw.replaceAll(',', '.'));
    if (parsed == null || parsed < 0) {
      throw const FormatException('Repère métrique invalide');
    }
    return parsed;
  }

  Future<void> _save() async {
    if (_saving) return;
    final cable = _selectedCable;
    final mode = _selectedMode;
    if (cable == null) {
      setState(() => _error = 'Choisissez le type de câble utilisé.');
      return;
    }
    if (mode == null) {
      setState(() => _error = 'Choisissez le mode de pose du câble.');
      return;
    }

    double? meterMark;
    try {
      meterMark = _parseMeterMark();
    } on FormatException {
      setState(() => _error = 'Le repère métrique doit être un nombre positif.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final position = await LocationService.getCurrentPosition();
      if (position == null) {
        throw Exception('Position GPS indisponible.');
      }

      final data = <String, dynamic>{
        'job_id': widget.jobId,
        'latitude': position.latitude,
        'longitude': position.longitude,
        'accuracy': position.accuracy,
        'cable_item_id': _itemId(cable),
        'cable_reference': cable['reference'],
        'cable_type_code': cable['reference'],
        'cable_type_label': cable['label'],
        'installation_mode_code': mode['code'],
        'installation_mode_label': mode['label'],
        'created_at': DateTime.now().toUtc().toIso8601String(),
      };
      if (meterMark != null) data['meter_mark_m'] = meterMark;

      final queued = await OfflineService.addPendingAction(
        action: widget.actionType,
        data: data,
      );
      await OfflineService.syncPendingActions();
      final persisted = await OfflineService.getAction(queued.eventId);
      final status = persisted?.status.name ?? 'retryable';
      if (status == 'conflict' || status == 'rejected') {
        throw Exception(persisted?.lastError ?? 'Relevé câble refusé par BlueVector');
      }
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final endpointLabel = widget.isEntry ? 'Entrée câble' : 'Sortie câble';
    return Scaffold(
      appBar: AppBar(title: Text(endpointLabel)),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(BlueVectorSpacing.md),
                children: [
                  Container(
                    padding: const EdgeInsets.all(BlueVectorSpacing.sm),
                    decoration: BoxDecoration(
                      color: BlueVectorColors.primarySoft,
                      border: Border.all(color: BlueVectorColors.border),
                      borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
                    ),
                    child: Text(
                      widget.isEntry
                          ? 'Sélectionnez le câble et son mode de pose avant d’enregistrer le point d’entrée.'
                          : 'Utilisez le même câble et le même mode de pose que pour l’entrée afin de calculer la longueur correctement.',
                      style: const TextStyle(
                        color: BlueVectorColors.textSecondary,
                        fontSize: 12,
                        height: 1.4,
                      ),
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.md),
                  if (_cables.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
                      decoration: BoxDecoration(
                        color: BlueVectorColors.danger.withValues(alpha: 0.08),
                        border: Border.all(
                          color: BlueVectorColors.danger.withValues(alpha: 0.35),
                        ),
                        borderRadius: BorderRadius.circular(BlueVectorRadius.small),
                      ),
                      child: const Text(
                        'Aucun câble disponible dans votre stock. La garde technicien doit être alimentée avant le relevé.',
                        style: TextStyle(color: BlueVectorColors.danger),
                      ),
                    )
                  else
                    DropdownButtonFormField<int>(
                      initialValue: _selectedCableId,
                      decoration: const InputDecoration(
                        labelText: 'Type de câble *',
                        prefixIcon: Icon(Icons.cable_rounded),
                      ),
                      items: _cables.map((item) {
                        final id = _itemId(item);
                        final label = item['label']?.toString() ?? 'Câble #$id';
                        final reference = item['reference']?.toString() ?? '';
                        final available = _available(item);
                        final unit = item['unit']?.toString() ?? '';
                        return DropdownMenuItem<int>(
                          value: id,
                          child: Text(
                            '$label${reference.isEmpty ? '' : ' · $reference'} · $available $unit',
                            overflow: TextOverflow.ellipsis,
                          ),
                        );
                      }).toList(growable: false),
                      onChanged: _saving
                          ? null
                          : (value) => setState(() => _selectedCableId = value),
                    ),
                  const SizedBox(height: BlueVectorSpacing.sm),
                  DropdownButtonFormField<String>(
                    initialValue: _selectedModeCode,
                    decoration: const InputDecoration(
                      labelText: 'Mode de pose *',
                      prefixIcon: Icon(Icons.route_rounded),
                    ),
                    items: _installationModes
                        .map(
                          (mode) => DropdownMenuItem<String>(
                            value: mode['code'],
                            child: Text(mode['label'] ?? mode['code'] ?? ''),
                          ),
                        )
                        .toList(growable: false),
                    onChanged: _saving
                        ? null
                        : (value) => setState(() => _selectedModeCode = value),
                  ),
                  const SizedBox(height: BlueVectorSpacing.sm),
                  TextField(
                    controller: _meterController,
                    enabled: !_saving,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: InputDecoration(
                      labelText: widget.isEntry
                          ? 'Repère compteur / bobine à l’entrée (m)'
                          : 'Repère compteur / bobine à la sortie (m)',
                      hintText: 'Optionnel, ex. 125,5',
                      prefixIcon: const Icon(Icons.straighten_rounded),
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.xs),
                  const Text(
                    'La position GPS sera capturée au moment de valider. La longueur finale privilégie le delta des repères métriques lorsqu’ils sont renseignés.',
                    style: TextStyle(
                      color: BlueVectorColors.textMuted,
                      fontSize: 11,
                      height: 1.35,
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: BlueVectorSpacing.md),
                    Text(
                      _error!,
                      style: const TextStyle(color: BlueVectorColors.danger),
                    ),
                  ],
                  const SizedBox(height: BlueVectorSpacing.lg),
                  FilledButton.icon(
                    onPressed: _saving || _cables.isEmpty ? null : _save,
                    icon: _saving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.my_location_rounded),
                    label: Text(_saving ? 'Enregistrement…' : 'Capturer et enregistrer'),
                  ),
                  const SizedBox(height: BlueVectorSpacing.sm),
                  OutlinedButton.icon(
                    onPressed: _saving ? null : _load,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Actualiser le stock'),
                  ),
                ],
              ),
      ),
    );
  }
}
