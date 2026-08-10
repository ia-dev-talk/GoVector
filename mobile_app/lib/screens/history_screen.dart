import 'dart:io';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:image_picker/image_picker.dart';

import '../models/job.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/offline_service.dart';
import '../services/intervention_service.dart';
import '../widgets/modern_loader.dart';
import '../widgets/photo_button.dart';
import '../config/config.dart';
import 'intervention_screen.dart';

class HistoryScreen extends StatefulWidget {
  final int technicianId;

  const HistoryScreen({super.key, required this.technicianId});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> with AutomaticKeepAliveClientMixin {
  List<Job> _allJobs = [];
  List<Job> _filteredJobs = [];
  bool _loading = true;
  bool _isOffline = false;
  DateTime? _lastSync;
  String _searchQuery = '';
  String _statusFilter = 'TOUS';
  String _typeFilter = 'TOUS';
  String _operatorFilter = 'TOUS';
  String _periodFilter = 'TOUT';
  String _sortBy = 'date_desc';
  bool _showFilters = false;
  int _page = 0;
  static const int _pageSize = 20;
  bool _hasMore = true;
  final _searchController = TextEditingController();
  final Set<int> _favorites = {};

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _loadHistory();
    _loadFavorites();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadFavorites() async {
    // Les favoris sont stockés localement
  }

  Future<void> _loadHistory() async {
    setState(() => _loading = true);
    _isOffline = !(await OfflineService.isOnline());

    if (_isOffline) {
      final cachedJobs = await OfflineService.getCachedJobs();
      final techJobs = cachedJobs.where((j) => j.assignedTechId == widget.technicianId).toList();
      _lastSync = await OfflineService.getLastSync();
      if (mounted) setState(() { _allJobs = techJobs; _loading = false; _applyFilters(); });
      return;
    }

    try {
      final allJobs = await ApiService.getJobs();
      final techJobs = allJobs.where((j) => j.assignedTechId == widget.technicianId).toList();
      await OfflineService.cacheJobs(allJobs);
      if (mounted) setState(() { _allJobs = techJobs; _loading = false; _applyFilters(); });
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _applyFilters() {
    var items = List<Job>.from(_allJobs);
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    // Période
    if (_periodFilter != 'TOUT') {
      DateTime start;
      switch (_periodFilter) {
        case 'AUJOURDHUI': start = today; break;
        case 'HIER': start = today.subtract(const Duration(days: 1)); break;
        case 'SEMAINE': start = today.subtract(Duration(days: today.weekday - 1)); break;
        case 'MOIS': start = DateTime(today.year, today.month, 1); break;
        default: start = today.subtract(const Duration(days: 365 * 10));
      }
      DateTime end = _periodFilter == 'AUJOURDHUI' ? today.add(const Duration(days: 1))
          : _periodFilter == 'HIER' ? today
          : _periodFilter == 'SEMAINE' ? start.add(const Duration(days: 7))
          : _periodFilter == 'MOIS' ? DateTime(today.year, today.month + 1, 1)
          : today.add(const Duration(days: 365 * 10));
      items = items.where((j) {
        final d = j.scheduledDate != null ? DateTime.tryParse(j.scheduledDate!) : null;
        return d != null && d.isAfter(start) && d.isBefore(end);
      }).toList();
    }

    // Recherche
    if (_searchQuery.isNotEmpty) {
      final q = _searchQuery.toLowerCase();
      items = items.where((j) =>
        j.customerName.toLowerCase().contains(q) ||
        j.jobNumber.toLowerCase().contains(q) ||
        j.serviceAddress.toLowerCase().contains(q) ||
        (j.customerPhone?.toLowerCase().contains(q) == true) ||
        (j.nro?.toLowerCase().contains(q) == true) ||
        (j.pbo?.toLowerCase().contains(q) == true) ||
        (j.pto?.toLowerCase().contains(q) == true) ||
        (j.ontSerial?.toLowerCase().contains(q) == true) ||
        (j.macAddress?.toLowerCase().contains(q) == true)
      ).toList();
    }

    // Statut
    if (_statusFilter != 'TOUS') {
      items = items.where((j) => j.status.toLowerCase() == _statusFilter.toLowerCase()).toList();
    }

    // Type
    if (_typeFilter != 'TOUS') {
      items = items.where((j) => j.jobType.toLowerCase().contains(_typeFilter.toLowerCase())).toList();
    }

    // Opérateur
    if (_operatorFilter != 'TOUS') {
      items = items.where((j) => (j.operator ?? '').toLowerCase().contains(_operatorFilter.toLowerCase())).toList();
    }

    // Tri
    switch (_sortBy) {
      case 'date_asc': items.sort((a, b) => (a.scheduledDate ?? '').compareTo(b.scheduledDate ?? '')); break;
      case 'date_desc': items.sort((b, a) => (a.scheduledDate ?? '').compareTo(b.scheduledDate ?? '')); break;
      case 'client': items.sort((a, b) => a.customerName.compareTo(b.customerName)); break;
    }

    _page = 0;
    _hasMore = items.length > _pageSize;
    setState(() => _filteredJobs = items);
  }

  void _loadMore() {
    if (!_hasMore) return;
    setState(() {
      _page++;
      _hasMore = (_page + 1) * _pageSize < _filteredJobs.length;
    });
  }

  int get _displayCount => ((_page + 1) * _pageSize < _filteredJobs.length) ? (_page + 1) * _pageSize : _filteredJobs.length;

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'completed': return Colors.green;
      case 'failed': return Colors.red;
      case 'cancelled': return Colors.grey;
      case 'client_absent': return Colors.orange;
      case 'in_progress': return Colors.blue;
      case 'en_route': return Colors.amber;
      default: return Colors.grey;
    }
  }

  IconData _statusIcon(String status) {
    switch (status.toLowerCase()) {
      case 'completed': return Icons.check_circle;
      case 'failed': return Icons.error;
      case 'cancelled': return Icons.cancel;
      case 'client_absent': return Icons.person_off;
      case 'in_progress': return Icons.build_circle;
      case 'en_route': return Icons.directions_car;
      default: return Icons.help;
    }
  }

  String _statusLabel(String status) {
    switch (status.toLowerCase()) {
      case 'completed': return 'Terminée';
      case 'failed': return 'Échec';
      case 'cancelled': return 'Annulée';
      case 'client_absent': return 'Client absent';
      case 'in_progress': return 'En cours';
      case 'en_route': return 'En route';
      default: return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final total = _filteredJobs.length;
    final completed = _filteredJobs.where((j) => j.status.toLowerCase() == 'completed').length;
    final failed = _filteredJobs.where((j) => j.status.toLowerCase() == 'failed').length;
    final cancelled = _filteredJobs.where((j) => j.status.toLowerCase() == 'cancelled').length;
    final installations = _filteredJobs.where((j) => j.jobType.toLowerCase().contains('installation')).length;
    final sav = _filteredJobs.where((j) => j.jobType.toLowerCase().contains('sav') || j.jobType.toLowerCase().contains('depannage')).length;
    final successRate = total > 0 ? (completed / total * 100).toStringAsFixed(0) : '0';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Historique FTTH'),
        actions: [
          IconButton(
            icon: Icon(_showFilters ? Icons.filter_list_off : Icons.filter_list),
            onPressed: () => setState(() => _showFilters = !_showFilters),
          ),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadHistory),
        ],
      ),
      body: _loading
          ? const ModernLoader(message: 'Chargement de l\'historique...')
          : Column(
              children: [
                if (_isOffline)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 16),
                    color: Colors.orange.shade700,
                    child: Row(
                      children: [
                        const Icon(Icons.wifi_off, color: Colors.white, size: 16),
                        const SizedBox(width: 8),
                        Expanded(child: Text('Mode hors ligne', style: const TextStyle(color: Colors.white, fontSize: 12))),
                        if (_lastSync != null) Text(DateFormat('HH:mm').format(_lastSync!), style: const TextStyle(color: Colors.white70, fontSize: 11)),
                      ],
                    ),
                  ),

                // KPIs
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Row(
                    children: [
                      _kpiItem('Total', total.toString(), Icons.assignment, Colors.blue),
                      const SizedBox(width: 6),
                      _kpiItem('Terminées', completed.toString(), Icons.check_circle, Colors.green),
                      const SizedBox(width: 6),
                      _kpiItem('Installation', installations.toString(), Icons.cable, Colors.indigo),
                      const SizedBox(width: 6),
                      _kpiItem('SAV', sav.toString(), Icons.build, Colors.orange),
                      const SizedBox(width: 6),
                      _kpiItem('Échecs', failed.toString(), Icons.error, Colors.red),
                      const SizedBox(width: 6),
                      _kpiItem('Annulées', cancelled.toString(), Icons.cancel, Colors.grey),
                      const SizedBox(width: 6),
                      _kpiItem('Réussite', '$successRate%', Icons.verified, Colors.teal),
                    ],
                  ),
                ),

                // Filtres
                if (_showFilters) _buildFilters(),

                // Recherche
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  child: TextField(
                    controller: _searchController,
                    onChanged: (v) { _searchQuery = v; _applyFilters(); },
                    decoration: InputDecoration(
                      hintText: 'Client, téléphone, adresse, PBO, ONT, SN...',
                      prefixIcon: const Icon(Icons.search, size: 20),
                      suffixIcon: _searchController.text.isNotEmpty
                          ? IconButton(icon: const Icon(Icons.clear, size: 18), onPressed: () { _searchController.clear(); _searchQuery = ''; _applyFilters(); })
                          : null,
                      filled: true,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      contentPadding: const EdgeInsets.symmetric(vertical: 10),
                    ),
                  ),
                ),

                // Compteur
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  child: Row(
                    children: [
                      Text('$_displayCount / $total interventions', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                      const Spacer(),
                      DropdownButton<String>(
                        value: _sortBy,
                        underline: const SizedBox(),
                        isDense: true,
                        style: const TextStyle(fontSize: 12, color: Colors.grey),
                        items: const [
                          DropdownMenuItem(value: 'date_desc', child: Text('Plus récent')),
                          DropdownMenuItem(value: 'date_asc', child: Text('Plus ancien')),
                          DropdownMenuItem(value: 'client', child: Text('Client A-Z')),
                        ],
                        onChanged: (v) { setState(() { _sortBy = v!; _applyFilters(); }); },
                      ),
                    ],
                  ),
                ),

                // Liste
                Expanded(
                  child: _filteredJobs.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.history, size: 64, color: Theme.of(context).colorScheme.outline),
                              const SizedBox(height: 12),
                              Text('Aucune intervention trouvée', style: Theme.of(context).textTheme.bodyMedium),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _loadHistory,
                          child: ListView.builder(
                            padding: const EdgeInsets.all(8),
                            itemCount: _displayCount < _filteredJobs.length ? _displayCount + 1 : _filteredJobs.length,
                            itemBuilder: (context, index) {
                              if (index >= _filteredJobs.length) return const SizedBox.shrink();
                              if (index == _displayCount && _hasMore) {
                                _loadMore();
                                return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
                              }
                              final job = _filteredJobs[index];
                              return _buildHistoryCard(job);
                            },
                          ),
                        ),
                ),
              ],
            ),
    );
  }

  Widget _kpiItem(String label, String value, IconData icon, Color color) {
    return GestureDetector(
      onTap: () {
        if (label == 'Échecs') setState(() { _statusFilter = 'failed'; _applyFilters(); });
        else if (label == 'Terminées') setState(() { _statusFilter = 'completed'; _applyFilters(); });
        else if (label == 'Installation') setState(() { _typeFilter = 'INSTALLATION'; _applyFilters(); });
        else if (label == 'SAV') setState(() { _typeFilter = 'SAV'; _applyFilters(); });
        else setState(() { _statusFilter = 'TOUS'; _typeFilter = 'TOUS'; _applyFilters(); });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(height: 2),
            Text(value, style: TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 16)),
            Text(label, style: TextStyle(fontSize: 9, color: color)),
          ],
        ),
      ),
    );
  }

  Widget _buildFilters() {
    return Container(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Période
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                const Text('Période:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                const SizedBox(width: 6),
                ...['TOUT', 'AUJOURDHUI', 'HIER', 'SEMAINE', 'MOIS'].map((p) => Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: ChoiceChip(
                    label: Text(p == 'TOUT' ? 'Tout' : p[0] + p.substring(1).toLowerCase(), style: const TextStyle(fontSize: 10)),
                    selected: _periodFilter == p,
                    onSelected: (_) { setState(() { _periodFilter = p; _applyFilters(); }); },
                    visualDensity: VisualDensity.compact,
                  ),
                )),
              ],
            ),
          ),
          const SizedBox(height: 6),
          // Statut
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                const Text('Statut:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                const SizedBox(width: 6),
                ...['TOUS', 'completed', 'failed', 'cancelled', 'client_absent'].map((s) => Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: ChoiceChip(
                    label: Text(s == 'TOUS' ? 'Tous' : _statusLabel(s), style: const TextStyle(fontSize: 10)),
                    selected: _statusFilter == s,
                    onSelected: (_) { setState(() { _statusFilter = s; _applyFilters(); }); },
                    visualDensity: VisualDensity.compact,
                  ),
                )),
              ],
            ),
          ),
          const SizedBox(height: 6),
          // Opérateur
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                const Text('Opérateur:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                const SizedBox(width: 6),
                ...['TOUS', 'ORANGE', 'IAM', 'INWI'].map((o) => Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: ChoiceChip(
                    label: Text(o, style: const TextStyle(fontSize: 10)),
                    selected: _operatorFilter == o,
                    onSelected: (_) { setState(() { _operatorFilter = o; _applyFilters(); }); },
                    visualDensity: VisualDensity.compact,
                  ),
                )),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryCard(Job job) {
    final color = _statusColor(job.status);
    final isFavorite = _favorites.contains(job.id);
    final hasFtth = job.nro != null || job.pbo != null || job.pto != null || job.ontSerial != null;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _showJobDetail(job),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 36, height: 36,
                    decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(10)),
                    child: Icon(_statusIcon(job.status), color: color, size: 18),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(job.customerName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                        Text('#${job.jobNumber} • ${job.jobType}', style: TextStyle(fontSize: 11, color: Colors.grey[600])),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(8)),
                    child: Text(_statusLabel(job.status), style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w600)),
                  ),
                  const SizedBox(width: 4),
                  IconButton(
                    icon: Icon(isFavorite ? Icons.star : Icons.star_border, size: 20, color: isFavorite ? Colors.amber : Colors.grey),
                    onPressed: () { setState(() { if (isFavorite) _favorites.remove(job.id); else _favorites.add(job.id); }); },
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Icon(Icons.location_on, size: 14, color: Colors.grey[500]),
                  const SizedBox(width: 4),
                  Expanded(child: Text(job.serviceAddress, style: TextStyle(fontSize: 12, color: Colors.grey[700]), maxLines: 1, overflow: TextOverflow.ellipsis)),
                ],
              ),
              if (job.scheduledDate != null) ...[
                const SizedBox(height: 2),
                Row(
                  children: [
                    Icon(Icons.calendar_today, size: 14, color: Colors.grey[500]),
                    const SizedBox(width: 4),
                    Text(job.scheduledDate!, style: TextStyle(fontSize: 11, color: Colors.grey[600])),
                    if (job.operator != null) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(color: Colors.indigo.shade50, borderRadius: BorderRadius.circular(6)),
                        child: Text(job.operator!, style: TextStyle(fontSize: 9, color: Colors.indigo[700], fontWeight: FontWeight.w600)),
                      ),
                    ],
                  ],
                ),
              ],
              if (hasFtth) ...[
                const SizedBox(height: 4),
                Wrap(
                  spacing: 4,
                  runSpacing: 2,
                  children: [
                    if (job.nro != null) _ftthBadge('NRO', job.nro!),
                    if (job.pbo != null) _ftthBadge('PBO', job.pbo!),
                    if (job.pto != null) _ftthBadge('PTO', job.pto!),
                    if (job.ontSerial != null) _ftthBadge('ONT', job.ontSerial!.length > 10 ? '${job.ontSerial!.substring(0, 10)}...' : job.ontSerial!),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _ftthBadge(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(6)),
      child: Text('$label: $value', style: TextStyle(fontSize: 9, color: Colors.grey[700])),
    );
  }

  void _showJobDetail(Job job) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _JobDetailScreen(job: job, technicianId: widget.technicianId),
      ),
    );
  }
}

/// Écran de détail d'une intervention dans l'historique
class _JobDetailScreen extends StatefulWidget {
  final Job job;
  final int technicianId;

  const _JobDetailScreen({required this.job, required this.technicianId});

  @override
  State<_JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends State<_JobDetailScreen> {
  List<Map<String, dynamic>> _activityLog = [];
  bool _loadingLog = true;

  @override
  void initState() {
    super.initState();
    _loadActivity();
  }

  Future<void> _loadActivity() async {
    try {
      final log = await InterventionService.getActivityLog(jobId: widget.job.id);
      if (mounted) setState(() { _activityLog = log; _loadingLog = false; });
    } catch (_) {
      if (mounted) setState(() => _loadingLog = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final job = widget.job;
    final color = _statusColor(job.status);
    final hasFtth = job.nro != null || job.sro != null || job.pbo != null || job.pto != null || job.splitter != null || job.ontSerial != null;

    return Scaffold(
      appBar: AppBar(
        title: Text('#${job.jobNumber} - ${job.customerName}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.open_in_new),
            tooltip: 'Ouvrir dans Intervention',
            onPressed: () {
              Navigator.push(context, MaterialPageRoute(
                builder: (_) => InterventionScreen(technicianId: widget.technicianId, intervention: job.toJson()),
              ));
            },
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
                    width: 64, height: 64,
                    decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(16)),
                    child: Icon(_statusIcon(job.status), color: color, size: 32),
                  ),
                  const SizedBox(height: 8),
                  Text(job.customerName, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                  Text('#${job.jobNumber} • ${job.jobType}', style: TextStyle(color: Colors.grey[600], fontSize: 13)),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(12)),
                    child: Text(_statusLabel(job.status), style: TextStyle(color: color, fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Client
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Client', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 8),
                  _detailRow('Nom', job.customerName),
                  if (job.customerPhone != null) _detailRow('Téléphone', job.customerPhone!),
                  _detailRow('Adresse', job.serviceAddress),
                  if (job.operator != null) _detailRow('Opérateur', job.operator!),
                  if (job.scheduledDate != null) _detailRow('Date', job.scheduledDate!),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Informations FTTH
          if (hasFtth)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Réseau FTTH', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    const SizedBox(height: 8),
                    if (job.nro != null) _detailRow('NRO', job.nro!),
                    if (job.sro != null) _detailRow('SRO', job.sro!),
                    if (job.pbo != null) _detailRow('PBO', job.pbo!),
                    if (job.pto != null) _detailRow('PTO', job.pto!),
                    if (job.splitter != null) _detailRow('Splitter', job.splitter!),
                    if (job.splitterPort != null) _detailRow('Port', job.splitterPort.toString()),
                    if (job.ontSerial != null) _detailRow('ONT', job.ontSerial!),
                    if (job.macAddress != null) _detailRow('MAC', job.macAddress!),
                    if (job.opticalPowerDbm != null) _detailRow('Puiss. optique', '${job.opticalPowerDbm} dBm'),
                    if (job.cableLengthM != null) _detailRow('Câble', '${job.cableLengthM} m'),
                  ],
                ),
              ),
            ),
          if (hasFtth) const SizedBox(height: 12),

          // Commentaires
          if (job.coordinatorComments != null && job.coordinatorComments!.isNotEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Commentaires', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    const SizedBox(height: 8),
                    Text(job.coordinatorComments!, style: TextStyle(color: Colors.grey[700], fontSize: 13)),
                  ],
                ),
              ),
            ),
          if (job.coordinatorComments != null && job.coordinatorComments!.isNotEmpty)
            const SizedBox(height: 12),

          // Timeline d'activité
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Chronologie', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 12),
                  if (_loadingLog)
                    const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator(strokeWidth: 2)))
                  else if (_activityLog.isEmpty)
                    Text('Aucune activité enregistrée', style: TextStyle(color: Colors.grey[500], fontSize: 13))
                  else
                    ..._activityLog.map((entry) => _buildTimelineEntry(entry)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTimelineEntry(Map<String, dynamic> entry) {
    final action = entry['action']?.toString() ?? '';
    final description = entry['description']?.toString() ?? '';
    final createdAt = entry['created_at']?.toString() ?? '';
    final time = createdAt.isNotEmpty ? DateFormat('HH:mm').format(DateTime.tryParse(createdAt) ?? DateTime.now()) : '';

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 10, height: 10, margin: const EdgeInsets.only(top: 4),
            decoration: BoxDecoration(color: Theme.of(context).colorScheme.primary, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(action.replaceAll('_', ' '), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                if (description.isNotEmpty) Text(description, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                if (time.isNotEmpty) Text(time, style: TextStyle(fontSize: 11, color: Colors.grey[500])),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'completed': return Colors.green;
      case 'failed': return Colors.red;
      case 'cancelled': return Colors.grey;
      case 'client_absent': return Colors.orange;
      case 'in_progress': return Colors.blue;
      case 'en_route': return Colors.amber;
      default: return Colors.grey;
    }
  }

  IconData _statusIcon(String status) {
    switch (status.toLowerCase()) {
      case 'completed': return Icons.check_circle;
      case 'failed': return Icons.error;
      case 'cancelled': return Icons.cancel;
      case 'client_absent': return Icons.person_off;
      case 'in_progress': return Icons.build_circle;
      case 'en_route': return Icons.directions_car;
      default: return Icons.help;
    }
  }

  String _statusLabel(String status) {
    switch (status.toLowerCase()) {
      case 'completed': return 'Terminée';
      case 'failed': return 'Échec';
      case 'cancelled': return 'Annulée';
      case 'client_absent': return 'Client absent';
      case 'in_progress': return 'En cours';
      case 'en_route': return 'En route';
      default: return status;
    }
  }

  Widget _detailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 100, child: Text(label, style: TextStyle(color: Colors.grey[600], fontSize: 13))),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 13))),
        ],
      ),
    );
  }
}