import 'package:flutter/material.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../services/intervention_service.dart';
import '../../services/offline_service.dart';
import '../../services/technician_stock_service.dart';

class MaterialUsedScreen extends StatefulWidget {
  const MaterialUsedScreen({super.key, required this.jobId});

  final int jobId;

  @override
  State<MaterialUsedScreen> createState() => _MaterialUsedScreenState();
}

class _MaterialUsedScreenState extends State<MaterialUsedScreen> {
  static const _pilotCableCodes = {'FO16', 'FO64', 'FO96'};

  final _searchController = TextEditingController();
  final Map<int, int> _quantities = {};
  List<Map<String, dynamic>> _stock = const [];
  List<_MeasuredCable> _measuredCables = const [];
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _load();
    _searchController.addListener(() {
      final next = _searchController.text.trim().toLowerCase();
      if (next != _query && mounted) setState(() => _query = next);
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  int _available(Map<String, dynamic> item) =>
      int.tryParse(item['available_quantity']?.toString() ?? '') ?? 0;

  int _itemId(Map<String, dynamic> item) =>
      int.tryParse(item['item_id']?.toString() ?? '') ?? 0;

  String _normalizedCableCode(Map<String, dynamic> item) {
    final raw = [item['reference'], item['code'], item['label']]
        .whereType<Object>()
        .join(' ')
        .toUpperCase()
        .replaceAll(RegExp(r'[^A-Z0-9]'), '');
    for (final code in _pilotCableCodes) {
      if (raw.contains(code)) return code;
    }
    return '';
  }

  bool _isPilotCable(Map<String, dynamic> item) =>
      _pilotCableCodes.contains(_normalizedCableCode(item));

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final results = await Future.wait<dynamic>([
        TechnicianStockService.getCustody(),
        InterventionService.getFieldRecord(jobId: widget.jobId),
      ]);
      final custody = (results[0] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
      final record = Map<String, dynamic>.from(results[1] as Map);
      if (!mounted) return;
      setState(() {
        // Cable is not manually declared here: entry + exit are the source of
        // truth. Hiding governed cable rows prevents accidental double counting.
        _stock = custody
            .where((item) => _available(item) > 0 && !_isPilotCable(item))
            .toList(growable: false);
        _measuredCables = _extractMeasuredCables(record);
      });
    } catch (error) {
      // Keep ordinary material usable even if the intervention record is
      // temporarily unavailable.
      try {
        final custody = await TechnicianStockService.getCustody();
        if (!mounted) return;
        setState(() {
          _stock = custody
              .where((item) => _available(item) > 0 && !_isPilotCable(item))
              .toList(growable: false);
          _error =
              'Le relevé câble n’a pas pu être actualisé. Les autres matériels restent disponibles.';
        });
      } catch (_) {
        if (!mounted) return;
        setState(
          () => _error = error.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<_MeasuredCable> _extractMeasuredCables(Map<String, dynamic> record) {
    final raw = record['field_actions'];
    if (raw is! List) return const [];

    final bySegment = <String, _MeasuredCable>{};
    var legacyIndex = 0;
    // field-record is newest first, so first completed value wins per segment.
    for (final item in raw.whereType<Map>()) {
      if (item['type']?.toString() != 'cable_exit') continue;
      final payloadRaw = item['payload'];
      if (payloadRaw is! Map) continue;
      final payload = Map<String, dynamic>.from(payloadRaw);
      final length = double.tryParse(
        payload['computed_length_m']?.toString() ?? '',
      );
      if (length == null || !length.isFinite || length < 0) continue;
      final reference =
          (payload['cable_type_code'] ??
                  payload['cable_reference'] ??
                  'Câble FO')
              .toString()
              .trim();
      final segment = (payload['cable_segment_id'] ?? payload['segment_id'])
          ?.toString()
          .trim();
      final key = segment != null && segment.isNotEmpty
          ? segment
          : 'legacy-${legacyIndex++}-$reference-${length.toStringAsFixed(2)}';
      bySegment.putIfAbsent(
        key,
        () => _MeasuredCable(
          reference: reference.isEmpty ? 'Câble FO' : reference,
          lengthM: length,
          poseLabel: payload['installation_mode_label']?.toString().trim(),
          needsReconciliation: payload['stock_reconciliation_required'] == true,
        ),
      );
    }
    return bySegment.values.toList(growable: false);
  }

  List<Map<String, dynamic>> get _visibleStock {
    if (_query.isEmpty) return _stock;
    return _stock
        .where((item) {
          final haystack = [
            item['label'],
            item['reference'],
            item['equipment_type'],
            item['operator'],
            item['model'],
          ].whereType<Object>().join(' ').toLowerCase();
          return haystack.contains(_query);
        })
        .toList(growable: false);
  }

  int get _selectedLines =>
      _quantities.values.where((value) => value > 0).length;
  int get _selectedUnits =>
      _quantities.values.fold(0, (sum, value) => sum + value);

  void _change(Map<String, dynamic> item, int delta) {
    final id = _itemId(item);
    if (id <= 0) return;
    final available = _available(item);
    final current = _quantities[id] ?? 0;
    final next = (current + delta).clamp(0, available);
    setState(() {
      if (next == 0) {
        _quantities.remove(id);
      } else {
        _quantities[id] = next;
      }
    });
  }

  Future<void> _save() async {
    if (_saving || _selectedLines == 0) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final selected = _stock
          .where((item) => (_quantities[_itemId(item)] ?? 0) > 0)
          .toList();
      final items = selected
          .map((item) {
            final id = _itemId(item);
            return <String, dynamic>{
              'item_id': id,
              'quantity': _quantities[id],
              'reference': item['reference'],
              'label': item['label'],
              'operator': item['operator'],
              'equipment_type': item['equipment_type'],
            };
          })
          .toList(growable: false);
      final summary = selected
          .map((item) {
            final id = _itemId(item);
            return '${_quantities[id]}× ${item['label'] ?? item['reference'] ?? 'Article $id'}';
          })
          .join(' · ');

      final queued = await OfflineService.addPendingAction(
        action: 'material_used',
        data: {
          'job_id': widget.jobId,
          'items': items,
          'value': summary,
          'created_at': DateTime.now().toUtc().toIso8601String(),
        },
      );
      await OfflineService.syncPendingActions();
      final persisted = await OfflineService.getAction(queued.eventId);
      final status = persisted?.status.name ?? 'retryable';
      if (status == 'conflict' || status == 'rejected') {
        throw Exception(
          persisted?.lastError ?? 'Consommation refusée par GoVector',
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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Matériel utilisé'),
        actions: [
          IconButton(
            tooltip: 'Actualiser',
            onPressed: _loading || _saving ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.all(BlueVectorSpacing.md),
                        children: [
                          _InfoCard(
                            icon: Icons.cable_rounded,
                            text:
                                'Le câble est calculé automatiquement depuis Entrée câble + Sortie câble. Déclarez ici uniquement les autres matériels réellement posés ou consommés.',
                          ),
                          if (_measuredCables.isNotEmpty) ...[
                            const SizedBox(height: BlueVectorSpacing.md),
                            Text(
                              'Câble mesuré automatiquement',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: BlueVectorSpacing.sm),
                            for (final cable in _measuredCables)
                              _MeasuredCableCard(cable: cable),
                          ],
                          if (_error != null) ...[
                            const SizedBox(height: BlueVectorSpacing.sm),
                            Text(
                              _error!,
                              style: const TextStyle(
                                color: BlueVectorColors.warning,
                              ),
                            ),
                          ],
                          const SizedBox(height: BlueVectorSpacing.lg),
                          Text(
                            'Autres matériels',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: BlueVectorSpacing.sm),
                          TextField(
                            controller: _searchController,
                            decoration: InputDecoration(
                              prefixIcon: const Icon(Icons.search_rounded),
                              hintText: 'Routeur, ONT, référence…',
                              suffixIcon: _query.isEmpty
                                  ? null
                                  : IconButton(
                                      tooltip: 'Effacer la recherche',
                                      onPressed: _searchController.clear,
                                      icon: const Icon(Icons.close_rounded),
                                    ),
                            ),
                          ),
                          const SizedBox(height: BlueVectorSpacing.sm),
                          if (_stock.isEmpty)
                            const Padding(
                              padding: EdgeInsets.symmetric(
                                vertical: BlueVectorSpacing.xl,
                              ),
                              child: Text(
                                'Aucun autre matériel disponible dans votre garde.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: BlueVectorColors.textSecondary,
                                ),
                              ),
                            )
                          else if (_visibleStock.isEmpty)
                            const Padding(
                              padding: EdgeInsets.symmetric(
                                vertical: BlueVectorSpacing.xl,
                              ),
                              child: Text(
                                'Aucun article ne correspond à la recherche.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: BlueVectorColors.textMuted,
                                ),
                              ),
                            )
                          else
                            for (final item in _visibleStock)
                              _materialRow(item),
                        ],
                      ),
                    ),
            ),
            _buildFooter(),
          ],
        ),
      ),
    );
  }

  Widget _materialRow(Map<String, dynamic> item) {
    final id = _itemId(item);
    final available = _available(item);
    final quantity = _quantities[id] ?? 0;
    return Container(
      margin: const EdgeInsets.only(bottom: BlueVectorSpacing.xs),
      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
      decoration: BoxDecoration(
        color: quantity > 0
            ? BlueVectorColors.primarySoft
            : BlueVectorColors.surface,
        border: Border.all(
          color: quantity > 0
              ? BlueVectorColors.primaryBright
              : BlueVectorColors.border,
        ),
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
      ),
      child: Row(
        children: [
          const Icon(Icons.inventory_2_outlined, color: BlueVectorColors.cyan),
          const SizedBox(width: BlueVectorSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item['label']?.toString() ??
                      item['reference']?.toString() ??
                      'Article #$id',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                Text(
                  '${item['reference'] ?? ''} · $available disponible${available > 1 ? 's' : ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: BlueVectorColors.textMuted,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Retirer',
            onPressed: quantity > 0 ? () => _change(item, -1) : null,
            icon: const Icon(Icons.remove_circle_outline),
          ),
          SizedBox(
            width: 24,
            child: Text('$quantity', textAlign: TextAlign.center),
          ),
          IconButton(
            tooltip: 'Ajouter',
            onPressed: quantity < available ? () => _change(item, 1) : null,
            icon: const Icon(Icons.add_circle_outline),
          ),
        ],
      ),
    );
  }

  Widget _buildFooter() {
    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.md),
      decoration: const BoxDecoration(
        color: BlueVectorColors.surface,
        border: Border(top: BorderSide(color: BlueVectorColors.border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              _selectedLines == 0
                  ? 'Sélectionnez uniquement le matériel réellement posé ou consommé.'
                  : '$_selectedUnits unité${_selectedUnits > 1 ? 's' : ''} · $_selectedLines référence${_selectedLines > 1 ? 's' : ''}',
              style: const TextStyle(color: BlueVectorColors.textSecondary),
            ),
          ),
          FilledButton.icon(
            onPressed: _selectedLines == 0 || _saving ? null : _save,
            icon: _saving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.check_rounded),
            label: Text(
              _saving ? 'Enregistrement…' : 'Enregistrer le matériel',
            ),
          ),
        ],
      ),
    );
  }
}

class _MeasuredCable {
  const _MeasuredCable({
    required this.reference,
    required this.lengthM,
    required this.poseLabel,
    required this.needsReconciliation,
  });

  final String reference;
  final double lengthM;
  final String? poseLabel;
  final bool needsReconciliation;
}

class _MeasuredCableCard extends StatelessWidget {
  const _MeasuredCableCard({required this.cable});

  final _MeasuredCable cable;

  String _length(double value) {
    if (value == value.roundToDouble()) return '${value.round()} m';
    return '${value.toStringAsFixed(1)} m';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: BlueVectorSpacing.xs),
      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        border: Border.all(color: BlueVectorColors.border),
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.straighten_rounded, color: BlueVectorColors.cyan),
          const SizedBox(width: BlueVectorSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${cable.reference} · ${_length(cable.lengthM)}',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                if (cable.poseLabel?.isNotEmpty == true)
                  Text(
                    cable.poseLabel!,
                    style: const TextStyle(
                      color: BlueVectorColors.textSecondary,
                      fontSize: 11,
                    ),
                  ),
                Text(
                  cable.needsReconciliation
                      ? 'Stock non renseigné · consommation à régulariser'
                      : 'Consommation prise en compte à la validation',
                  style: TextStyle(
                    color: cable.needsReconciliation
                        ? BlueVectorColors.warning
                        : BlueVectorColors.success,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
      decoration: BoxDecoration(
        color: BlueVectorColors.primarySoft,
        border: Border.all(color: BlueVectorColors.border),
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: BlueVectorColors.cyan),
          const SizedBox(width: BlueVectorSpacing.sm),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                color: BlueVectorColors.textSecondary,
                fontSize: 12,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
