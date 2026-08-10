import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/offline_service.dart';
import '../widgets/barcode_scanner_widget.dart';
import '../widgets/modern_loader.dart';
import '../widgets/photo_button.dart';
import '../config/config.dart';

/// État d'un équipement
class EquipmentStatus {
  static const String stock = 'STOCK';
  static const String inUse = 'IN_USE';
  static const String installed = 'INSTALLED';
  static const String defective = 'DEFECTIVE';
  static const String toReturn = 'TO_RETURN';
  static const String inRepair = 'IN_REPAIR';
  static const String lost = 'LOST';
  static const String reserved = 'RESERVED';

  static Color color(String? status) {
    switch (status) {
      case stock: return Colors.green;
      case inUse: return Colors.orange;
      case installed: return Colors.blue;
      case defective: return Colors.red;
      case toReturn: return Colors.amber;
      case inRepair: return Colors.purple;
      case lost: return Colors.grey;
      case reserved: return Colors.teal;
      default: return Colors.grey;
    }
  }

  static String label(String? status) {
    switch (status) {
      case stock: return 'Disponible';
      case inUse: return 'En cours';
      case installed: return 'Installé';
      case defective: return 'Défectueux';
      case toReturn: return 'À retourner';
      case inRepair: return 'En réparation';
      case lost: return 'Perdu';
      case reserved: return 'Réservé';
      default: return status ?? 'INCONNU';
    }
  }
}

class StockScreen extends StatefulWidget {
  final int technicianId;

  const StockScreen({
    super.key,
    required this.technicianId,
  });

  @override
  State<StockScreen> createState() => _StockScreenState();
}

class _StockScreenState extends State<StockScreen> {
  List<Map<String, dynamic>> stockItems = [];
  List<Map<String, dynamic>> filteredItems = [];
  List<dynamic> alerts = [];
  bool loading = true;
  bool alertsLoading = true;
  final _searchController = TextEditingController();
  String _selectedCategory = 'TOUS';
  String _selectedStatus = 'TOUS';
  bool _showFilters = false;

  // Statistiques
  int _totalCount = 0;
  int _ontCount = 0;
  int _routerCount = 0;
  int _ptoCount = 0;
  int _cableCount = 0;
  int _defectiveCount = 0;
  int _usedToday = 0;

  @override
  void initState() {
    super.initState();
    loadStock();
    loadAlerts();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> loadStock() async {
    setState(() => loading = true);
    try {
      final data = await ApiService.getStock();
      setState(() {
        stockItems = data.map((e) => Map<String, dynamic>.from(e)).toList();
        _computeStats();
        _applyFilters();
        loading = false;
      });
    } catch (e) {
      setState(() => loading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur chargement stock: $e')),
        );
      }
    }
  }

  Future<void> loadAlerts() async {
    setState(() => alertsLoading = true);
    try {
      final data = await ApiService.getStockAlerts();
      setState(() {
        alerts = data;
        alertsLoading = false;
      });
    } catch (_) {
      setState(() => alertsLoading = false);
    }
  }

  void _computeStats() {
    _totalCount = stockItems.length;
    _ontCount = stockItems.where((i) => (i['equipment_type'] ?? '').toString().contains('ONT')).length;
    _routerCount = stockItems.where((i) => (i['equipment_type'] ?? '').toString().contains('ROUTEUR')).length;
    _ptoCount = stockItems.where((i) => (i['equipment_type'] ?? '').toString().contains('PTO')).length;
    _cableCount = stockItems.where((i) => (i['equipment_type'] ?? '').toString().contains('CABLE')).length;
    _defectiveCount = stockItems.where((i) => i['status'] == EquipmentStatus.defective).length;
    _usedToday = stockItems.where((i) => i['status'] == EquipmentStatus.inUse || i['status'] == EquipmentStatus.installed).length;
  }

  void _applyFilters() {
    var items = List<Map<String, dynamic>>.from(stockItems);

    // Filtre recherche
    final query = _searchController.text.toLowerCase();
    if (query.isNotEmpty) {
      items = items.where((i) {
        return (i['serial_number']?.toString().toLowerCase().contains(query) ?? false) ||
               (i['equipment_type']?.toString().toLowerCase().contains(query) ?? false) ||
               (i['mac_address']?.toString().toLowerCase().contains(query) ?? false) ||
               (i['operator']?.toString().toLowerCase().contains(query) ?? false) ||
               (i['model']?.toString().toLowerCase().contains(query) ?? false);
      }).toList();
    }

    // Filtre catégorie
    if (_selectedCategory != 'TOUS') {
      items = items.where((i) => (i['equipment_type'] ?? '').toString().contains(_selectedCategory)).toList();
    }

    // Filtre statut
    if (_selectedStatus != 'TOUS') {
      items = items.where((i) => i['status'] == _selectedStatus).toList();
    }

    setState(() => filteredItems = items);
  }

  Future<void> _scanEquipment() async {
    final code = await Navigator.push<String>(
      context,
      MaterialPageRoute(
        builder: (_) => BarcodeScannerWidget(onScanned: (value) => value),
      ),
    );
    if (code != null && mounted) {
      setState(() {
        _searchController.text = code;
        _applyFilters();
      });
      // Chercher l'équipement scanné
      final found = stockItems.where((i) =>
        i['serial_number'] == code ||
        i['mac_address'] == code
      ).toList();
      if (found.isNotEmpty && mounted) {
        _showEquipmentDetail(found.first);
      }
    }
  }

  void _showEquipmentDetail(Map<String, dynamic> item) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _EquipmentDetailScreen(item: item, technicianId: widget.technicianId),
      ),
    ).then((_) => loadStock());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Stock Matériel'),
        actions: [
          IconButton(
            icon: const Icon(Icons.qr_code_scanner),
            tooltip: 'Scanner équipement',
            onPressed: _scanEquipment,
          ),
          IconButton(
            icon: Icon(_showFilters ? Icons.filter_list_off : Icons.filter_list),
            tooltip: 'Filtres',
            onPressed: () => setState(() => _showFilters = !_showFilters),
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: loadStock,
          ),
        ],
      ),
      body: loading
          ? const ModernLoader(message: 'Chargement du stock...')
          : Column(
              children: [
                // Alertes stock bas
                if (!alertsLoading && alerts.isNotEmpty)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    color: Theme.of(context).colorScheme.errorContainer,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.warning_amber, size: 18, color: Theme.of(context).colorScheme.error),
                            const SizedBox(width: 8),
                            Text('Alertes stock bas', style: Theme.of(context).textTheme.titleSmall),
                          ],
                        ),
                        const SizedBox(height: 4),
                        ...alerts.map((a) => Text(
                          '${a['equipment_type']} : ${a['current_stock']}/${a['min_stock_threshold']}',
                          style: Theme.of(context).textTheme.bodySmall,
                        )),
                      ],
                    ),
                  ),

                // KPIs
                _buildKpiRow(),

                // Filtres
                if (_showFilters) _buildFilters(),

                // Recherche
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  child: TextField(
                    controller: _searchController,
                    onChanged: (_) => _applyFilters(),
                    decoration: InputDecoration(
                      hintText: 'Rechercher SN, MAC, type...',
                      prefixIcon: const Icon(Icons.search, size: 20),
                      suffixIcon: _searchController.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear, size: 18),
                              onPressed: () {
                                _searchController.clear();
                                _applyFilters();
                              },
                            )
                          : null,
                      filled: true,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      contentPadding: const EdgeInsets.symmetric(vertical: 10),
                    ),
                  ),
                ),

                // Liste
                Expanded(
                  child: filteredItems.isEmpty
                      ? _buildEmptyState()
                      : RefreshIndicator(
                          onRefresh: loadStock,
                          child: ListView.builder(
                            padding: const EdgeInsets.all(8),
                            itemCount: filteredItems.length,
                            itemBuilder: (context, index) {
                              final item = filteredItems[index];
                              return _buildEquipmentCard(item);
                            },
                          ),
                        ),
                ),
              ],
            ),
    );
  }

  Widget _buildKpiRow() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      child: Row(
        children: [
          _kpiItem('Total', _totalCount.toString(), Icons.inventory_2, Colors.blue),
          const SizedBox(width: 8),
          _kpiItem('ONT', _ontCount.toString(), Icons.cable, Colors.indigo),
          const SizedBox(width: 8),
          _kpiItem('Routeurs', _routerCount.toString(), Icons.router, Colors.orange),
          const SizedBox(width: 8),
          _kpiItem('PTO', _ptoCount.toString(), Icons.link, Colors.teal),
          const SizedBox(width: 8),
          _kpiItem('Défectueux', _defectiveCount.toString(), Icons.error, Colors.red),
          const SizedBox(width: 8),
          _kpiItem('Utilisés', _usedToday.toString(), Icons.check_circle, Colors.green),
        ],
      ),
    );
  }

  Widget _kpiItem(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 4),
          Text(value, style: TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 16)),
          Text(label, style: TextStyle(fontSize: 10, color: color)),
        ],
      ),
    );
  }

  Widget _buildFilters() {
    return Container(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('Catégorie', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              const SizedBox(width: 8),
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: ['TOUS', 'ONT', 'ROUTEUR', 'PTO', 'CABLE', 'SPLITTER'].map((cat) {
                      final isSelected = _selectedCategory == cat;
                      return Padding(
                        padding: const EdgeInsets.only(right: 4),
                        child: ChoiceChip(
                          label: Text(cat, style: const TextStyle(fontSize: 11)),
                          selected: isSelected,
                          onSelected: (_) {
                            setState(() {
                              _selectedCategory = cat;
                              _applyFilters();
                            });
                          },
                          visualDensity: VisualDensity.compact,
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Text('Statut', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              const SizedBox(width: 8),
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: ['TOUS', EquipmentStatus.stock, EquipmentStatus.inUse, EquipmentStatus.installed, EquipmentStatus.defective, EquipmentStatus.toReturn].map((st) {
                      final isSelected = _selectedStatus == st;
                      return Padding(
                        padding: const EdgeInsets.only(right: 4),
                        child: ChoiceChip(
                          label: Text(EquipmentStatus.label(st == 'TOUS' ? null : st), style: const TextStyle(fontSize: 11)),
                          selected: isSelected,
                          onSelected: (_) {
                            setState(() {
                              _selectedStatus = st;
                              _applyFilters();
                            });
                          },
                          visualDensity: VisualDensity.compact,
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildEquipmentCard(Map<String, dynamic> item) {
    final status = item['status']?.toString();
    final statusColor = EquipmentStatus.color(status);

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showEquipmentDetail(item),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.qr_code_scanner, color: statusColor),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item['equipment_type'] ?? 'Équipement',
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                    const SizedBox(height: 2),
                    if (item['serial_number'] != null)
                      Text('SN: ${item['serial_number']}', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                    if (item['model'] != null)
                      Text(item['model'], style: TextStyle(fontSize: 12, color: Colors.grey[500])),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: statusColor.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            EquipmentStatus.label(status),
                            style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w600),
                          ),
                        ),
                        if (item['operator'] != null) ...[
                          const SizedBox(width: 6),
                          Text(item['operator'], style: TextStyle(fontSize: 11, color: Colors.grey[500])),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Colors.grey),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.inventory_2_outlined, size: 64, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text(
            _searchController.text.isNotEmpty ? 'Aucun résultat' : 'Aucun équipement',
            style: TextStyle(fontSize: 18, color: Colors.grey[600], fontWeight: FontWeight.w500),
          ),
          const SizedBox(height: 8),
          Text(
            _searchController.text.isNotEmpty ? 'Essayez un autre terme de recherche' : 'Scannez un équipement pour commencer',
            style: TextStyle(color: Colors.grey[500]),
          ),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: _scanEquipment,
            icon: const Icon(Icons.qr_code_scanner),
            label: const Text('Scanner un équipement'),
          ),
        ],
      ),
    );
  }
}

/// Écran de détail d'un équipement
class _EquipmentDetailScreen extends StatefulWidget {
  final Map<String, dynamic> item;
  final int technicianId;

  const _EquipmentDetailScreen({
    required this.item,
    required this.technicianId,
  });

  @override
  State<_EquipmentDetailScreen> createState() => _EquipmentDetailScreenState();
}

class _EquipmentDetailScreenState extends State<_EquipmentDetailScreen> {
  String? _photoPath;
  bool _isLoading = false;

  Future<void> _takePhoto() async {
    final picker = ImagePicker();
    final XFile? photo = await picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
    );
    if (photo != null && mounted) {
      setState(() => _photoPath = photo.path);
    }
  }

  Future<void> _markDefective() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Marquer comme défectueux'),
        content: const Text('Confirmer que cet équipement est défectueux ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), style: TextButton.styleFrom(foregroundColor: Colors.red), child: const Text('Confirmer')),
        ],
      ),
    );
    if (confirm == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Équipement marqué comme défectueux'), backgroundColor: Colors.orange),
      );
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final status = item['status']?.toString();
    final statusColor = EquipmentStatus.color(status);

    return Scaffold(
      appBar: AppBar(
        title: Text(item['equipment_type'] ?? 'Équipement'),
        actions: [
          IconButton(
            icon: const Icon(Icons.camera_alt),
            tooltip: 'Photo',
            onPressed: _takePhoto,
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // En-tête
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(Icons.qr_code_scanner, size: 40, color: statusColor),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    item['equipment_type'] ?? 'Équipement',
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      EquipmentStatus.label(status),
                      style: TextStyle(color: statusColor, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Informations
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Informations', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 12),
                  _detailRow('N° Série', item['serial_number']),
                  _detailRow('MAC', item['mac_address']),
                  _detailRow('Modèle', item['model']),
                  _detailRow('Opérateur', item['operator']),
                  _detailRow('Type', item['equipment_type']),
                  _detailRow('Dépôt', item['warehouse']),
                  _detailRow('Véhicule', item['vehicle']),
                  if (item['assigned_job_id'] != null)
                    _detailRow('Intervention', '#${item['assigned_job_id']}'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Photo
          if (_photoPath != null) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Photo', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.file(File(_photoPath!), height: 200, width: double.infinity, fit: BoxFit.cover),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],

          // Actions
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Actions', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _takePhoto,
                      icon: const Icon(Icons.camera_alt),
                      label: const Text('Prendre une photo'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _markDefective,
                      icon: const Icon(Icons.error_outline, color: Colors.red),
                      label: const Text('Marquer défectueux', style: TextStyle(color: Colors.red)),
                      style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.red)),
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

  Widget _detailRow(String label, String? value) {
    if (value == null || value.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(label, style: TextStyle(color: Colors.grey[600], fontSize: 13)),
          ),
          Expanded(
            child: Text(value, style: const TextStyle(fontSize: 13)),
          ),
        ],
      ),
    );
  }
}