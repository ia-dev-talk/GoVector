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
    {'code': 'SP', 'label': 'SP — Sous PEHD / conduite / souterrain'},
    {'code': 'TR', 'label': 'TR — Travée / Tronçon / aérien'},
    {'code': 'FSD', 'label': 'FSD — Façade / Sous-Dalle / immeuble'},
  ];
  static const _segmentKeyPrefix = 'govector_cable_segment';
  static const _segmentStartKeyPrefix = 'govector_cable_segment_start';
  static const _uuid = Uuid();

  final _meterController = TextEditingController();
  final _justificationController = TextEditingController();
  List<Map<String, dynamic>> _cables = const [];
  List<Map<String, String>> _installationModes = _fallbackModes;
  String? _selectedCableCode;
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
    _justificationController.dispose();
    super.dispose();
  }

  String _cableCode(Map<String, dynamic> item) {
    final raw = (item['code'] ?? item['reference'] ?? item['label'] ?? '')
        .toString()
        .trim()
        .toUpperCase()
        .replaceAll(RegExp(r'[^A-Z0-9]'), '');
    return raw;
  }

  String _cableType(Map<String, dynamic> item) =>
      (item['cable_type'] ?? item['cable_type_code'] ?? '')
          .toString()
          .trim()
          .toUpperCase();

  int _available(Map<String, dynamic> item) =>
      int.tryParse(item['available_quantity']?.toString() ?? '') ?? 0;

  bool _stockKnown(Map<String, dynamic> item) {
    final raw = item['stock_known'];
    if (raw is bool) return raw;
    return _available(item) > 0;
  }

  String _segmentPreferenceKey(String cableCode) =>
      '$_segmentKeyPrefix:${widget.jobId}:${widget.segmentSlot}:$cableCode';

  String _segmentStartPreferenceKey(String cableCode) =>
      '$_segmentStartKeyPrefix:${widget.jobId}:${widget.segmentSlot}:$cableCode';

  Future<void> _loadActiveStart(String cableCode) async {
    if (widget.isEntry) return;
    final prefs = await SharedPreferences.getInstance();
    final start = prefs.getDouble(_segmentStartPreferenceKey(cableCode));
    if (!mounted || _selectedCableCode != cableCode) return;
    setState(() => _activeStartMeter = start);
  }

  Future<void> _selectCable(String? code) async {
    setState(() {
      _selectedCableCode = code;
      _activeStartMeter = null;
    });
    if (code != null && widget.isEntry) {
      final cable = _selectedCable;
      final current = cable?['current_mark_m'];
      if (current != null) _meterController.text = current.toString();
    }
    if (code != null) await _loadActiveStart(code);
  }

  Future<String> _resolveSegmentId(String cableCode) async {
    final prefs = await SharedPreferences.getInstance();
    final key = _segmentPreferenceKey(cableCode);
    if (widget.isEntry) {
      final segmentId = _uuid.v4();
      await prefs.setString(key, segmentId);
      return segmentId;
    }
    final active = prefs.getString(key)?.trim();
    if (active == null || active.isEmpty) {
      throw StateError('Enregistrez d’abord l’entrée de ce câble.');
    }
    return active;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final catalogue = await TechnicianStockService.getCableCatalogue();
      final cables = catalogue
          .where((item) => {'FO16', 'FO64'}.contains(_cableType(item)))
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
              .map(
                (item) => {
                  'code': item['code']?.toString().trim() ?? '',
                  'label': item['label']?.toString().trim() ?? '',
                },
              )
              .where((item) {
                final code = item['code'];
                return code != null &&
                    {'SP', 'TR', 'FSD'}.contains(code) &&
                    (item['label']?.isNotEmpty ?? false);
              })
              .toList(growable: false);
          if (configured.isNotEmpty) modes = configured;
        }
      } catch (_) {
        // Offline/older servers use the field-confirmed fallback.
      }

      if (!mounted) return;
      final selectedCode =
          _selectedCableCode ??
          (cables.length == 1 ? _cableCode(cables.first) : null);
      setState(() {
        _cables = cables;
        _installationModes = modes;
        _selectedCableCode = selectedCode;
        if (_selectedModeCode == null && modes.length == 1) {
          _selectedModeCode = modes.first['code'];
        }
      });
      if (selectedCode != null && widget.isEntry) {
        final selected = cables.where(
          (item) => _cableCode(item) == selectedCode,
        );
        if (selected.isNotEmpty && selected.first['current_mark_m'] != null) {
          _meterController.text = selected.first['current_mark_m'].toString();
        }
      }
      if (selectedCode != null) await _loadActiveStart(selectedCode);
    } catch (error) {
      // The cached assigned drums are returned by the service when available.
      // With no cache, block capture rather than inventing a physical CODE.
      if (!mounted) return;
      setState(() {
        _cables = const [];
        _error =
            'Aucune bobine affectée disponible. Connectez-vous puis demandez une affectation Web.';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Map<String, dynamic>? get _selectedCable {
    final code = _selectedCableCode;
    if (code == null) return null;
    for (final cable in _cables) {
      if (_cableCode(cable) == code) return cable;
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
    if (parsed == null || !parsed.isFinite || parsed < 0) {
      throw const FormatException('Repère métrique invalide');
    }
    return parsed;
  }

  Future<void> _save() async {
    if (_saving) return;
    final cable = _selectedCable;
    final mode = _selectedMode;
    if (cable == null) {
      setState(() => _error = 'Choisissez un CODE bobine affecté.');
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
    if (!widget.isEntry &&
        _activeStartMeter != null &&
        meterMark != null &&
        meterMark >= _activeStartMeter!) {
      setState(
        () => _error =
            'L’arrivée doit être inférieure au départ : le compteur doit décroître.',
      );
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final cableCode = _cableCode(cable);
      final segmentId = await _resolveSegmentId(cableCode);
      final position = await LocationService.getCurrentPosition();
      final stockKnown = _stockKnown(cable);
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
        if (cable['drum_id'] != null) 'cable_drum_id': cable['drum_id'],
        'cable_code': cableCode,
        'cable_reference': cableCode,
        'cable_type_code': _cableType(cable),
        'cable_type_label': _cableType(cable),
        'cable_stock_available_at_capture': _available(cable),
        'cable_stock_known_at_capture': stockKnown,
        'stock_reconciliation_required': !stockKnown,
        'installation_mode_code': mode['code'],
        'installation_mode_label': mode['label'],
        'created_at': DateTime.now().toUtc().toIso8601String(),
      };
      final justification = _justificationController.text.trim();
      if (justification.isNotEmpty) {
        data['continuity_justification'] = justification;
      }
      if (meterMark != null) data['meter_mark_m'] = meterMark;

      final queued = await OfflineService.addPendingAction(
        action: widget.actionType,
        data: data,
      );
      if (widget.isEntry) {
        final prefs = await SharedPreferences.getInstance();
        final startKey = _segmentStartPreferenceKey(cableCode);
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
      setState(
        () => _error = error
            .toString()
            .replaceFirst('Exception: ', '')
            .replaceFirst('Bad state: ', ''),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _chooseCable() async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      builder: (context) => _ChoiceSheet(
        title: 'Type de câble',
        options: [
          for (final cable in _cables)
            _ChoiceOption(
              value: _cableCode(cable),
              title: '${_cableCode(cable)} · ${_cableType(cable)}',
              subtitle:
                  'Repère courant : ${cable['current_mark_m'] ?? _available(cable)} m',
            ),
        ],
        selected: _selectedCableCode,
      ),
    );
    if (selected != null) await _selectCable(selected);
  }

  Future<void> _chooseMode() async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      builder: (context) => _ChoiceSheet(
        title: 'Mode de pose',
        options: [
          for (final mode in _installationModes)
            _ChoiceOption(value: mode['code']!, title: mode['label']!),
        ],
        selected: _selectedModeCode,
      ),
    );
    if (selected != null) setState(() => _selectedModeCode = selected);
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
    final cable = _selectedCable;
    final selectedMode = _selectedMode;

    return Scaffold(
      appBar: AppBar(title: Text(endpointLabel)),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
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
                          ? 'Choisissez le CODE de la bobine affectée et son mode de pose. Le départ proposé est son dernier repère connu.'
                          : 'Choisissez le même câble. GoVector reprend le départ et calcule la longueur avec les repères métriques.',
                      style: const TextStyle(
                        color: BlueVectorColors.textSecondary,
                        fontSize: 12,
                        height: 1.4,
                      ),
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.md),
                  _SelectorField(
                    label: 'Type de câble *',
                    icon: Icons.cable_rounded,
                    value: _selectedCableCode ?? 'Sélectionner un CODE bobine',
                    subtitle: cable == null
                        ? null
                        : '${_cableType(cable)} · repère courant ${cable['current_mark_m'] ?? _available(cable)} m',
                    onTap: _saving ? null : _chooseCable,
                  ),
                  const SizedBox(height: BlueVectorSpacing.sm),
                  _SelectorField(
                    label: 'Mode de pose *',
                    icon: Icons.route_rounded,
                    value:
                        selectedMode?['label'] ??
                        'Sélectionner le mode de pose',
                    onTap: _saving ? null : _chooseMode,
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
                  const SizedBox(height: BlueVectorSpacing.sm),
                  TextField(
                    controller: _justificationController,
                    enabled: !_saving,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'Justification d’écart (si nécessaire)',
                      hintText:
                          'Obligatoire uniquement si le départ diffère du dernier repère',
                      prefixIcon: Icon(Icons.report_outlined),
                    ),
                  ),
                  if (!widget.isEntry && _activeStartMeter != null) ...[
                    const SizedBox(height: BlueVectorSpacing.sm),
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
                          const SizedBox(width: BlueVectorSpacing.sm),
                          Expanded(
                            child: Text(
                              immediateLength == null
                                  ? 'Départ ${formatCableMeter(_activeStartMeter!)} m — saisissez l’arrivée pour calculer la longueur.'
                                  : 'Longueur calculée : ${formatCableMeter(immediateLength)} m',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: BlueVectorSpacing.sm),
                  const Text(
                    'Le GPS est ajouté s’il est réellement disponible. Il ne bloque pas la saisie.',
                    style: TextStyle(
                      color: BlueVectorColors.textMuted,
                      fontSize: 11,
                      height: 1.35,
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: BlueVectorSpacing.sm),
                    Container(
                      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
                      decoration: BoxDecoration(
                        color: BlueVectorColors.warning.withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(
                          BlueVectorRadius.small,
                        ),
                        border: Border.all(
                          color: BlueVectorColors.warning.withValues(
                            alpha: 0.3,
                          ),
                        ),
                      ),
                      child: Text(
                        _error!,
                        style: const TextStyle(
                          color: BlueVectorColors.textPrimary,
                          fontSize: 11,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: BlueVectorSpacing.lg),
                  FilledButton.icon(
                    onPressed: _saving ? null : _save,
                    icon: _saving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.save_outlined),
                    label: Text(
                      _saving
                          ? 'Enregistrement…'
                          : widget.isEntry
                          ? 'Enregistrer l’entrée'
                          : 'Enregistrer la sortie',
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.sm),
                  OutlinedButton.icon(
                    onPressed: _saving ? null : _load,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Actualiser le catalogue'),
                  ),
                ],
              ),
      ),
    );
  }
}

class _SelectorField extends StatelessWidget {
  const _SelectorField({
    required this.label,
    required this.icon,
    required this.value,
    required this.onTap,
    this.subtitle,
  });

  final String label;
  final IconData icon;
  final String value;
  final String? subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: Icon(icon),
          suffixIcon: const Icon(Icons.expand_more_rounded),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              value,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: BlueVectorColors.textPrimary,
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
            if (subtitle?.isNotEmpty == true) ...[
              const SizedBox(height: 2),
              Text(
                subtitle!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: BlueVectorColors.textSecondary,
                  fontSize: 10,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ChoiceOption {
  const _ChoiceOption({
    required this.value,
    required this.title,
    this.subtitle,
  });

  final String value;
  final String title;
  final String? subtitle;
}

class _ChoiceSheet extends StatelessWidget {
  const _ChoiceSheet({
    required this.title,
    required this.options,
    required this.selected,
  });

  final String title;
  final List<_ChoiceOption> options;
  final String? selected;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.only(bottom: BlueVectorSpacing.sm),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                BlueVectorSpacing.md,
                0,
                BlueVectorSpacing.md,
                BlueVectorSpacing.xs,
              ),
              child: Text(title, style: Theme.of(context).textTheme.titleLarge),
            ),
            for (final option in options)
              ListTile(
                leading: Icon(
                  selected == option.value
                      ? Icons.radio_button_checked
                      : Icons.radio_button_off,
                  color: selected == option.value
                      ? BlueVectorColors.primaryBright
                      : BlueVectorColors.textMuted,
                ),
                title: Text(
                  option.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: option.subtitle == null
                    ? null
                    : Text(
                        option.subtitle!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                onTap: () => Navigator.pop(context, option.value),
              ),
          ],
        ),
      ),
    );
  }
}
