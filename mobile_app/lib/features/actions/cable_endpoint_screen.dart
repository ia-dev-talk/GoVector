import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../services/intervention_service.dart';
import '../../services/location_service.dart';
import '../../services/offline_service.dart';
import '../../services/technician_stock_service.dart';
import 'cable_segment_measurement.dart';

class CableEndpointScreen extends StatefulWidget {
  const CableEndpointScreen({
    super.key,
    required this.jobId,
    required this.actionType,
    this.segmentSlot = 'primary',
  }) : assert(actionType == 'cable_entry' || actionType == 'cable_exit');

  final int jobId;
  final String actionType;
  final String segmentSlot;

  bool get isEntry => actionType == 'cable_entry';

  @override
  State<CableEndpointScreen> createState() => _CableEndpointScreenState();
}

class _CableEndpointScreenState extends State<CableEndpointScreen> {
  static const _fallbackModes = <Map<String, String>>[
    {'code': 'CONDUITE_PEHD', 'label': 'Pose câble FO en conduite / sous PEHD'},
    {'code': 'FACADE_IMMEUBLE', 'label': 'Pose câble FO en façade ou immeuble'},
    {'code': 'AERIEN', 'label': 'Pose câble FO en aérien'},
  ];

  static const _segmentKeyPrefix = 'govector_cable_segment';
  static const _segmentStartKeyPrefix = 'govector_cable_segment_start';
  static const _uuid = Uuid();

  final _meterController = TextEditingController();
  List<Map<String, dynamic>> _cables = const [];
  List<Map<String, String>> _installationModes = _fallbackModes;
  int? _selectedCableId;
  String? _selectedModeCode;
  double? _activeStartMeter;
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
        const {
          'm',
          'metre',
          'mètre',
          'metres',
          'mètres',
          'meter',
          'meters',
        }.contains(unit);
  }

  int _itemId(Map<String, dynamic> item) =>
      int.tryParse(item['item_id']?.toString() ?? '') ?? 0;

  int _available(Map<String, dynamic> item) =>
      int.tryParse(item['available_quantity']?.toString() ?? '') ?? 0;

  bool _stockKnown(Map<String, dynamic> item) {
    final raw = item['stock_known'];
    if (raw is bool) return raw;
    return _available(item) > 0;
  }

  String _segmentPreferenceKey(int cableItemId) =>
      '$_segmentKeyPrefix:${widget.jobId}:${widget.segmentSlot}:$cableItemId';

  String _segmentStartPreferenceKey(int cableItemId) =>
      '$_segmentStartKeyPrefix:${widget.jobId}:${widget.segmentSlot}:$cableItemId';

  Future<void> _loadActiveStart(int cableItemId) async {
    if (widget.isEntry) return;
    final prefs = await SharedPreferences.getInstance();
    final start = prefs.getDouble(_segmentStartPreferenceKey(cableItemId));
    if (!mounted || _selectedCableId != cableItemId) return;
    setState(() => _activeStartMeter = start);
  }

  Future<void> _selectCable(int? cableItemId) async {
    setState(() {
      _selectedCableId = cableItemId;
      _activeStartMeter = null;
    });
    if (cableItemId != null) await _loadActiveStart(cableItemId);
  }

  Future<String> _resolveSegmentId(int cableItemId) async {
    final prefs = await SharedPreferences.getInstance();
    final key = _segmentPreferenceKey(cableItemId);
    if (widget.isEntry) {
      // Starting a new entry means starting a new logical segment. A later exit
      // automatically reuses this id; a repeated exit is therefore a correction
      // of the same segment rather than an accidental second consumption.
      final segmentId = _uuid.v4();
      await prefs.setString(key, segmentId);
      return segmentId;
    }

    final active = prefs.getString(key)?.trim();
    if (active == null || active.isEmpty) {
      throw StateError(
        'Enregistrez d’abord le départ de ce câble avant son arrivée.',
      );
    }
    return active;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // Do not hide a governed cable just because prior technician allocation
      // is missing from GoVector. Field truth can legitimately start at zero.
      final catalogue = await TechnicianStockService.getCableCatalogue();
      final cables = catalogue.where(_isCableItem).toList(growable: false);

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
              .map(
                (item) => {
                  'code': item['code']?.toString().trim() ?? '',
                  'label': item['label']?.toString().trim() ?? '',
                },
              )
              .where(
                (item) => item['code']!.isNotEmpty && item['label']!.isNotEmpty,
              )
              .toList(growable: false);
          if (configured.isNotEmpty) modes = configured;
        }
      } catch (_) {
        // Offline/older servers use the field-confirmed fallback.
      }

      if (!mounted) return;
      final selectedCableId =
          _selectedCableId ??
          (cables.length == 1 ? _itemId(cables.first) : null);
      setState(() {
        _cables = cables;
        _installationModes = modes;
        _selectedCableId = selectedCableId;
        if (_selectedModeCode == null && modes.length == 1) {
          _selectedModeCode = modes.first['code'];
        }
      });
      if (selectedCableId != null) await _loadActiveStart(selectedCableId);
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
      setState(
        () => _error = 'Le repère métrique doit être un nombre positif.',
      );
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final cableItemId = _itemId(cable);
      final segmentId = await _resolveSegmentId(cableItemId);

      // Helpful evidence, never a blocker. Photo evidence captures its own GPS.
      final position = await LocationService.getCurrentPosition();
      final data = <String, dynamic>{
        'job_id': widget.jobId,
        'cable_segment_id': segmentId,
        'segment_slot': widget.segmentSlot,
        if (position != null) ...{
          'latitude': position.latitude,
          'longitude': position.longitude,
          'accuracy': position.accuracy,
          'gps_observed_at': DateTime.now().toUtc().toIso8601String(),
        },
        'cable_item_id': cableItemId,
        'cable_reference': cable['reference'],
        'cable_type_code': cable['reference'],
        'cable_type_label': cable['label'],
        'cable_stock_available_at_capture': _available(cable),
        'cable_stock_known_at_capture': _stockKnown(cable),
        'installation_mode_code': mode['code'],
        'installation_mode_label': mode['label'],
        'created_at': DateTime.now().toUtc().toIso8601String(),
      };
      if (meterMark != null) data['meter_mark_m'] = meterMark;

      final queued = await OfflineService.addPendingAction(
        action: widget.actionType,
        data: data,
      );
      if (widget.isEntry) {
        final prefs = await SharedPreferences.getInstance();
        final startKey = _segmentStartPreferenceKey(cableItemId);
        if (meterMark == null) {
          await prefs.remove(startKey);
        } else {
          await prefs.setDouble(startKey, meterMark);
        }
      }
      await OfflineService.syncPendingActions();
      final persisted = await OfflineService.getAction(queued.eventId);
      final status = persisted?.status.name ?? 'retryable';
      if (status == 'conflict' || status == 'rejected') {
        throw Exception(
          persisted?.lastError ?? 'Relevé câble refusé par GoVector',
        );
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
    final immediateLength = widget.isEntry
        ? null
        : cableSegmentLength(
            startMeter: _activeStartMeter,
            endMeterInput: _meterController.text,
          );
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
                      borderRadius: BorderRadius.circular(
                        BlueVectorRadius.medium,
                      ),
                    ),
                    child: Text(
                      widget.isEntry
                          ? 'Sélectionnez le câble et son mode de pose avant d’enregistrer le départ.'
                          : 'Sélectionnez le même câble : GoVector reprend automatiquement son dernier départ et calcule le métrage utilisé.',
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
                          color: BlueVectorColors.danger.withValues(
                            alpha: 0.35,
                          ),
                        ),
                        borderRadius: BorderRadius.circular(
                          BlueVectorRadius.small,
                        ),
                      ),
                      child: const Text(
                        'Aucun type de câble n’est configuré dans GoVector.',
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
                      items: _cables
                          .map((item) {
                            final id = _itemId(item);
                            final label =
                                item['label']?.toString() ?? 'Câble #$id';
                            final reference =
                                item['reference']?.toString() ?? '';
                            final available = _available(item);
                            final unit = item['unit']?.toString() ?? '';
                            final stock = _stockKnown(item)
                                ? '$available $unit disponibles'
                                : 'stock connu 0 $unit';
                            return DropdownMenuItem<int>(
                              value: id,
                              child: Text(
                                '$label${reference.isEmpty ? '' : ' · $reference'} · $stock',
                                overflow: TextOverflow.ellipsis,
                              ),
                            );
                          })
                          .toList(growable: false),
                      onChanged: _saving ? null : _selectCable,
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
                    onChanged: (_) => setState(() {}),
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: InputDecoration(
                      labelText: widget.isEntry
                          ? 'Repère métrique au départ (m)'
                          : 'Repère métrique à l’arrivée (m)',
                      hintText: 'Ex. 125,5',
                      prefixIcon: const Icon(Icons.straighten_rounded),
                    ),
                  ),
                  if (!widget.isEntry && _activeStartMeter != null) ...[
                    const SizedBox(height: BlueVectorSpacing.xs),
                    Container(
                      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
                      decoration: BoxDecoration(
                        color: BlueVectorColors.surface,
                        border: Border.all(color: BlueVectorColors.border),
                        borderRadius: BorderRadius.circular(
                          BlueVectorRadius.small,
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.calculate_outlined,
                            color: BlueVectorColors.cyan,
                          ),
                          const SizedBox(width: BlueVectorSpacing.xs),
                          Expanded(
                            child: Text(
                              immediateLength == null
                                  ? 'Départ ${formatCableMeter(_activeStartMeter!)} m · saisissez l’arrivée pour calculer la longueur.'
                                  : 'Longueur calculée : ${formatCableMeter(immediateLength)} m = |arrivée − départ|',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: BlueVectorSpacing.xs),
                  const Text(
                    'Le GPS du relevé est ajouté automatiquement s’il est disponible. Il ne bloque pas la saisie. Les photos prises dans GoVector portent leur propre GPS.',
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
                        : const Icon(Icons.save_rounded),
                    label: Text(_saving ? 'Enregistrement…' : 'Enregistrer'),
                  ),
                  const SizedBox(height: BlueVectorSpacing.sm),
                  OutlinedButton.icon(
                    onPressed: _saving ? null : _load,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Actualiser les câbles'),
                  ),
                ],
              ),
      ),
    );
  }
}
