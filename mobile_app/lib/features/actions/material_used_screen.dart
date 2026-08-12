import 'package:flutter/material.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../services/offline_service.dart';
import '../../services/technician_stock_service.dart';

class MaterialUsedScreen extends StatefulWidget {
  const MaterialUsedScreen({
    super.key,
    required this.jobId,
  });

  final int jobId;

  @override
  State<MaterialUsedScreen> createState() => _MaterialUsedScreenState();
}

class _MaterialUsedScreenState extends State<MaterialUsedScreen> {
  final _searchController = TextEditingController();
  final Map<int, int> _quantities = {};
  List<Map<String, dynamic>> _stock = const [];
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

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await TechnicianStockService.getCustody();
      if (!mounted) return;
      setState(() {
        _stock = rows.where((item) => _available(item) > 0).toList();
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _visibleStock {
    if (_query.isEmpty) return _stock;
    return _stock.where((item) {
      final haystack = [
        item['label'],
        item['reference'],
        item['equipment_type'],
        item['operator'],
        item['model'],
      ].whereType<Object>().join(' ').toLowerCase();
      return haystack.contains(_query);
    }).toList(growable: false);
  }

  int get _selectedLines => _quantities.values.where((value) => value > 0).length;
  int get _selectedUnits => _quantities.values.fold(0, (sum, value) => sum + value);

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
      final selected = _stock.where((item) => (_quantities[_itemId(item)] ?? 0) > 0).toList();
      final items = selected.map((item) {
        final id = _itemId(item);
        return <String, dynamic>{
          'item_id': id,
          'quantity': _quantities[id],
          'reference': item['reference'],
          'label': item['label'],
          'operator': item['operator'],
          'equipment_type': item['equipment_type'],
        };
      }).toList(growable: false);
      final summary = selected.map((item) {
        final id = _itemId(item);
        return '${_quantities[id]}× ${item['label'] ?? item['reference'] ?? 'Article $id'}';
      }).join(' · ');

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
        throw Exception(persisted?.lastError ?? 'Consommation refusée par BlueVector');
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
            tooltip: 'Actualiser le stock',
            onPressed: _loading || _saving ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                BlueVectorSpacing.md,
                BlueVectorSpacing.sm,
                BlueVectorSpacing.md,
                BlueVectorSpacing.xs,
              ),
              child: Column(
                children: [
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(BlueVectorSpacing.sm),
                    decoration: BoxDecoration(
                      color: BlueVectorColors.primarySoft,
                      border: Border.all(color: BlueVectorColors.border),
                      borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
                    ),
                    child: const Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.inventory_2_outlined, color: BlueVectorColors.cyan),
                        SizedBox(width: BlueVectorSpacing.sm),
                        Expanded(
                          child: Text(
                            'Choisissez uniquement ce qui a réellement été posé ou consommé. Le stock de votre garde sera décrémenté à la synchronisation.',
                            style: TextStyle(
                              color: BlueVectorColors.textSecondary,
                              fontSize: 12,
                              height: 1.45,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: BlueVectorSpacing.sm),
                  TextField(
                    controller: _searchController,
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.search_rounded),
                      hintText: 'Routeur, câble, ONT, référence…',
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: BlueVectorSpacing.sm),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
                      decoration: BoxDecoration(
                        color: BlueVectorColors.danger.withValues(alpha: 0.08),
                        border: Border.all(
                          color: BlueVectorColors.danger.withValues(alpha: 0.35),
                        ),
                        borderRadius: BorderRadius.circular(BlueVectorRadius.small),
                      ),
                      child: Text(
                        _error!,
                        style: const TextStyle(color: BlueVectorColors.danger),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Expanded(child: _buildList()),
            _buildFooter(),
          ],
        ),
      ),
    );
  }

  Widget _buildList() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_stock.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(BlueVectorSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.inventory_2_outlined,
                size: 48,
                color: BlueVectorColors.textMuted,
              ),
              const SizedBox(height: BlueVectorSpacing.sm),
              const Text(
                'Aucun matériel disponible dans votre garde.',
                textAlign: TextAlign.center,
                style: TextStyle(color: BlueVectorColors.textSecondary),
              ),
              const SizedBox(height: BlueVectorSpacing.sm),
              OutlinedButton.icon(
                onPressed: _load,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Actualiser'),
              ),
            ],
          ),
        ),
      );
    }
    final items = _visibleStock;
    if (items.isEmpty) {
      return const Center(
        child: Text(
          'Aucun article ne correspond à la recherche.',
          style: TextStyle(color: BlueVectorColors.textMuted),
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(
        BlueVectorSpacing.md,
        BlueVectorSpacing.sm,
        BlueVectorSpacing.md,
        BlueVectorSpacing.xl,
      ),
      itemCount: items.length,
      separatorBuilder: (_, __) => const SizedBox(height: BlueVectorSpacing.xs),
      itemBuilder: (context, index) {
        final item = items[index];
        final id = _itemId(item);
        final available = _available(item);
        final quantity = _quantities[id] ?? 0;
        return Container(
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
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: BlueVectorColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(BlueVectorRadius.small),
                ),
                child: const Icon(Icons.router_outlined, color: BlueVectorColors.cyan),
              ),
              const SizedBox(width: BlueVectorSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item['label']?.toString() ?? 'Article #$id',
                      style: const TextStyle(
                        color: BlueVectorColors.textPrimary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      [
                        item['reference'],
                        item['operator'],
                        item['equipment_type'],
                      ].where((value) => value != null && value.toString().isNotEmpty).join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: BlueVectorColors.textMuted,
                        fontSize: 11,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      '$available disponible${available > 1 ? 's' : ''}',
                      style: const TextStyle(
                        color: BlueVectorColors.success,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: BlueVectorSpacing.xs),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    tooltip: 'Retirer une unité',
                    onPressed: quantity > 0 ? () => _change(item, -1) : null,
                    icon: const Icon(Icons.remove_circle_outline),
                  ),
                  SizedBox(
                    width: 28,
                    child: Text(
                      '$quantity',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: BlueVectorColors.textPrimary,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Ajouter une unité',
                    onPressed: quantity < available ? () => _change(item, 1) : null,
                    icon: const Icon(Icons.add_circle_outline),
                  ),
                ],
              ),
            ],
          ),
        );
      },
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
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '$_selectedUnits unité${_selectedUnits > 1 ? 's' : ''}',
                  style: const TextStyle(
                    color: BlueVectorColors.textPrimary,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  '$_selectedLines référence${_selectedLines > 1 ? 's' : ''} sélectionnée${_selectedLines > 1 ? 's' : ''}',
                  style: const TextStyle(
                    color: BlueVectorColors.textMuted,
                    fontSize: 11,
                  ),
                ),
              ],
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
            label: Text(_saving ? 'Synchronisation…' : 'Valider l’utilisation'),
          ),
        ],
      ),
    );
  }
}
