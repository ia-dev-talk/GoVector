import 'package:flutter/material.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../services/technician_stock_service.dart';

class TechnicianStockScreen extends StatefulWidget {
  const TechnicianStockScreen({
    super.key,
    required this.technicianId,
  });

  final int technicianId;

  @override
  State<TechnicianStockScreen> createState() => _TechnicianStockScreenState();
}

class _TechnicianStockScreenState extends State<TechnicianStockScreen> {
  List<Map<String, dynamic>> _materials = const [];
  List<Map<String, dynamic>> _serialized = const [];
  bool _loading = true;
  String? _materialError;
  String? _serializedError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _materialError = null;
        _serializedError = null;
      });
    }

    List<Map<String, dynamic>> materials = const [];
    List<Map<String, dynamic>> serialized = const [];
    String? materialError;
    String? serializedError;

    try {
      materials = await TechnicianStockService.getCustody();
    } catch (error) {
      materialError = _cleanError(error);
    }

    try {
      serialized = await TechnicianStockService.getSerializedCustody();
    } catch (error) {
      serializedError = _cleanError(error);
    }

    if (!mounted) return;
    setState(() {
      _materials = materials;
      _serialized = serialized;
      _materialError = materialError;
      _serializedError = serializedError;
      _loading = false;
    });
  }

  String _cleanError(Object error) {
    return '$error'.replaceFirst('Exception: ', '').trim();
  }

  int _intValue(dynamic value) {
    if (value is int) return value;
    return int.tryParse('$value') ?? 0;
  }

  String _text(dynamic value, {String fallback = '—'}) {
    final text = value?.toString().trim() ?? '';
    return text.isEmpty ? fallback : text;
  }

  @override
  Widget build(BuildContext context) {
    final availableUnits = _materials.fold<int>(
      0,
      (sum, item) => sum + _intValue(item['available_quantity']),
    );

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mon stock terrain'),
        actions: [
          IconButton(
            tooltip: 'Actualiser',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            BlueVectorSpacing.md,
            BlueVectorSpacing.md,
            BlueVectorSpacing.md,
            40,
          ),
          children: [
            Text(
              'Garde technicien #${widget.technicianId}',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: BlueVectorSpacing.xs),
            const Text(
              'Vue terrain du matériel actuellement attribué au technicien. Les équipements sérialisés sont limités à la garde vérifiée côté serveur.',
              style: TextStyle(
                color: BlueVectorColors.textSecondary,
                height: 1.35,
              ),
            ),
            const SizedBox(height: BlueVectorSpacing.lg),
            Row(
              children: [
                Expanded(
                  child: _SummaryCard(
                    label: 'Articles',
                    value: '${_materials.length}',
                    icon: Icons.inventory_2_outlined,
                  ),
                ),
                const SizedBox(width: BlueVectorSpacing.sm),
                Expanded(
                  child: _SummaryCard(
                    label: 'Unités dispo',
                    value: '$availableUnits',
                    icon: Icons.inventory_outlined,
                  ),
                ),
                const SizedBox(width: BlueVectorSpacing.sm),
                Expanded(
                  child: _SummaryCard(
                    label: 'Sérialisés',
                    value: '${_serialized.length}',
                    icon: Icons.qr_code_2_rounded,
                  ),
                ),
              ],
            ),
            const SizedBox(height: BlueVectorSpacing.lg),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 36),
                child: Center(child: CircularProgressIndicator()),
              )
            else ...[
              _SectionTitle(
                title: 'Équipements sérialisés',
                count: _serialized.length,
              ),
              if (_serializedError != null)
                _ErrorCard(message: _serializedError!)
              else if (_serialized.isEmpty)
                const _EmptyCard(
                  message: 'Aucun équipement sérialisé dans la garde actuelle.',
                )
              else
                ..._serialized.map(_serializedCard),
              const SizedBox(height: BlueVectorSpacing.lg),
              _SectionTitle(
                title: 'Consommables et matériel',
                count: _materials.length,
              ),
              if (_materialError != null)
                _ErrorCard(message: _materialError!)
              else if (_materials.isEmpty)
                const _EmptyCard(
                  message: 'Aucun article disponible dans le dépôt technicien.',
                )
              else
                ..._materials.map(_materialCard),
            ],
          ],
        ),
      ),
    );
  }

  Widget _serializedCard(Map<String, dynamic> item) {
    final type = _text(item['equipment_type'], fallback: 'Équipement');
    final model = _text(item['model'], fallback: '');
    final status = _text(item['status']);
    final serial = _text(item['serial_number']);
    final mac = _text(item['mac_address']);
    final warehouse = _text(item['custody_warehouse_code']);
    final assignedJobId = item['assigned_job_id'];

    return _StockCard(
      icon: Icons.qr_code_scanner_rounded,
      title: model.isEmpty ? type : '$type · $model',
      subtitle: 'SN $serial',
      rows: [
        _StockRow('MAC', mac),
        _StockRow('Statut', status),
        _StockRow('Dépôt', warehouse),
        if (assignedJobId != null)
          _StockRow('Intervention', '#$assignedJobId'),
        if (item['operator'] != null)
          _StockRow('Opérateur', _text(item['operator'])),
      ],
    );
  }

  Widget _materialCard(Map<String, dynamic> item) {
    final label = _text(item['label'], fallback: 'Article');
    final reference = _text(item['reference']);
    final available = _intValue(item['available_quantity']);
    final quantity = _intValue(item['quantity']);
    final reserved = _intValue(item['reserved_quantity']);
    final unit = _text(item['unit'], fallback: 'u');

    return _StockCard(
      icon: Icons.inventory_2_outlined,
      title: label,
      subtitle: reference,
      rows: [
        _StockRow('Disponible', '$available $unit'),
        _StockRow('Physique', '$quantity $unit'),
        _StockRow('Réservé', '$reserved $unit'),
        if (item['equipment_type'] != null)
          _StockRow('Type', _text(item['equipment_type'])),
        if (item['operator'] != null)
          _StockRow('Opérateur', _text(item['operator'])),
        if (item['warehouse_name'] != null)
          _StockRow('Dépôt', _text(item['warehouse_name'])),
      ],
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
        border: Border.all(color: BlueVectorColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: BlueVectorColors.primaryBright, size: 20),
          const SizedBox(height: BlueVectorSpacing.xs),
          Text(
            value,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: BlueVectorColors.textMuted,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, required this.count});

  final String title;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: BlueVectorSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: BlueVectorColors.surface,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: BlueVectorColors.border),
            ),
            child: Text(
              '$count',
              style: const TextStyle(
                color: BlueVectorColors.textSecondary,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StockRow {
  const _StockRow(this.label, this.value);

  final String label;
  final String value;
}

class _StockCard extends StatelessWidget {
  const _StockCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.rows,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final List<_StockRow> rows;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: BlueVectorSpacing.sm),
      padding: const EdgeInsets.all(BlueVectorSpacing.md),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
        border: Border.all(color: BlueVectorColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: BlueVectorColors.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(BlueVectorRadius.small),
                ),
                child: Icon(icon, color: BlueVectorColors.primaryBright),
              ),
              const SizedBox(width: BlueVectorSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: BlueVectorColors.textPrimary,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    SelectableText(
                      subtitle,
                      style: const TextStyle(
                        color: BlueVectorColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: BlueVectorSpacing.sm),
          ...rows.map(
            (row) => Padding(
              padding: const EdgeInsets.only(top: 5),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 92,
                    child: Text(
                      row.label,
                      style: const TextStyle(
                        color: BlueVectorColors.textMuted,
                        fontSize: 11,
                      ),
                    ),
                  ),
                  Expanded(
                    child: SelectableText(
                      row.value,
                      style: const TextStyle(
                        color: BlueVectorColors.textPrimary,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.md),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
        border: Border.all(color: BlueVectorColors.border),
      ),
      child: Text(
        message,
        style: const TextStyle(color: BlueVectorColors.textSecondary),
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.md),
      decoration: BoxDecoration(
        color: BlueVectorColors.warning.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
        border: Border.all(
          color: BlueVectorColors.warning.withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.warning_amber_rounded,
            color: BlueVectorColors.warning,
          ),
          const SizedBox(width: BlueVectorSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: BlueVectorColors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}
