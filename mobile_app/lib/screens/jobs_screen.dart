import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../models/job.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/offline_service.dart';
import '../services/location_service.dart';
import '../services/intervention_service.dart';
import '../widgets/job_card.dart';
import '../widgets/modern_loader.dart';
import '../widgets/barcode_scanner_widget.dart';
import '../config/config.dart';
import 'accueil_screen.dart';
import 'login_screen.dart';
import 'stock_screen.dart';
import 'status_screen.dart';
import 'history_screen.dart';
import 'intervention_screen.dart';

class JobsScreen extends StatefulWidget {
  final int technicianId;

  const JobsScreen({super.key, required this.technicianId});

  @override
  State<JobsScreen> createState() => _JobsScreenState();
}

class _JobsScreenState extends State<JobsScreen> {
  List<Job> jobs = [];
  List<Job> filteredJobs = [];
  final searchController = TextEditingController();
  bool loading = true;
  bool _isOffline = false;
  DateTime? _lastSync;
  String? _syncError;
  String _techName = '';

  // Filtres
  String _statusFilter = 'TOUS';
  String _typeFilter = 'TOUS';
  bool _urgentOnly = false;
  bool _showSearch = false;
  bool _showFilters = false;

  // Tri
  String _sortBy = 'distance'; // distance, priorite, date, type

  @override
  void initState() {
    super.initState();
    _loadTechnicianName();
    loadJobs();
  }

  @override
  void dispose() {
    searchController.dispose();
    super.dispose();
  }

  Future<void> _loadTechnicianName() async {
    final name = await AuthService.getTechnicianName();
    if (mounted) setState(() => _techName = name ?? 'Technicien');
  }

  Future<void> loadJobs() async {
    setState(() { loading = true; _syncError = null; });
    _isOffline = !(await OfflineService.isOnline());

    if (_isOffline) {
      final cachedJobs = await OfflineService.getCachedJobs();
      final techJobs = cachedJobs.where((j) => j.assignedTechId == widget.technicianId).toList();
      _lastSync = await OfflineService.getLastSync();
      if (mounted) setState(() { jobs = techJobs; filteredJobs = techJobs; loading = false; });
      return;
    }

    try {
      final allJobs = await ApiService.getJobs();
      final techJobs = allJobs.where((j) => j.assignedTechId == widget.technicianId).toList();
      await OfflineService.cacheJobs(allJobs);
      final syncResult = await OfflineService.syncPendingActions();
      if (syncResult.error != null && mounted) {
        setState(() => _syncError = syncResult.error);
      } else if (syncResult.synced > 0 && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('${syncResult.synced} action(s) synchronisée(s)'),
          backgroundColor: Colors.green,
        ));
      }
      if (mounted) setState(() { jobs = techJobs; _applyFilters(); loading = false; _isOffline = false; });
    } catch (e) {
      if (mounted) setState(() => loading = false);
    }
  }

  void _applyFilters() {
    var items = List<Job>.from(jobs);
    final query = searchController.text.toLowerCase();
    if (query.isNotEmpty) {
      items = items.where((j) =>
        j.customerName.toLowerCase().contains(query) ||
        j.jobNumber.toLowerCase().contains(query) ||
        j.serviceAddress.toLowerCase().contains(query) ||
        j.customerPhone?.toLowerCase().contains(query) == true ||
        j.operator?.toLowerCase().contains(query) == true
      ).toList();
    }
    if (_statusFilter != 'TOUS') {
      items = items.where((j) => j.status.toLowerCase() == _statusFilter.toLowerCase()).toList();
    }
    if (_typeFilter != 'TOUS') {
      items = items.where((j) => j.jobType.toUpperCase().contains(_typeFilter.toUpperCase())).toList();
    }
    if (_urgentOnly) {
      items = items.where((j) =>
        j.validationStatus?.toUpperCase() == 'URGENT' ||
        j.jobType.toUpperCase() == 'URGENCE'
      ).toList();
    }

    // Tri intelligent
    items.sort((a, b) {
      switch (_sortBy) {
        case 'priorite':
          final aUrgent = a.validationStatus?.toUpperCase() == 'URGENT' || a.jobType.toUpperCase() == 'URGENCE';
          final bUrgent = b.validationStatus?.toUpperCase() == 'URGENT' || b.jobType.toUpperCase() == 'URGENCE';
          if (aUrgent && !bUrgent) return -1;
          if (!aUrgent && bUrgent) return 1;
          return a.status.compareTo(b.status);
        case 'date':
          return (a.scheduledDate ?? '').compareTo(b.scheduledDate ?? '');
        case 'type':
          return a.jobType.compareTo(b.jobType);
        default: // distance - les plus proches d'abord
          if (a.latitude != 0 && b.latitude != 0) {
            return a.latitude.compareTo(b.latitude); // simplification
          }
          return a.status.compareTo(b.status);
      }
    });

    setState(() => filteredJobs = items);
  }

  void searchJobs(String value) => _applyFilters();

  void _navigateToAccueil() {
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => AccueilScreen(technicianId: widget.technicianId)),
      (route) => false,
    );
  }

  Color _typeColor(String type) {
    switch (type.toUpperCase()) {
      case 'INSTALLATION': return const Color(0xFF3B82F6);
      case 'DEPANNAGE': case 'DÉPANNAGE': return const Color(0xFFF59E0B);
      case 'SAV': return const Color(0xFFEF4444);
      case 'MIGRATION': return const Color(0xFF8B5CF6);
      case 'MAINTENANCE': return const Color(0xFF14B8A6);
      case 'AUDIT': return const Color(0xFF6366F1);
      default: return Colors.grey;
    }
  }

  IconData _typeIcon(String type) {
    switch (type.toUpperCase()) {
      case 'INSTALLATION': return Icons.add_circle_outline_rounded;
      case 'DEPANNAGE': case 'DÉPANNAGE': return Icons.build_rounded;
      case 'SAV': return Icons.support_agent_rounded;
      case 'MIGRATION': return Icons.swap_horiz_rounded;
      case 'MAINTENANCE': return Icons.engineering_rounded;
      case 'AUDIT': return Icons.visibility_rounded;
      default: return Icons.assignment_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    final completed = jobs.where((j) => j.status.toLowerCase() == 'completed').length;
    final inProgress = jobs.where((j) => j.status.toLowerCase() == 'in_progress').length;
    final enRoute = jobs.where((j) => j.status.toLowerCase() == 'en_route').length;
    final pending = jobs.length - completed;
    final urgent = jobs.where((j) => j.validationStatus?.toUpperCase() == 'URGENT' || j.jobType.toUpperCase() == 'URGENCE').length;

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text('Mes interventions'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: _navigateToAccueil,
        ),
        actions: [
          IconButton(
            icon: Icon(_showSearch ? Icons.close_rounded : Icons.search_rounded),
            tooltip: 'Rechercher',
            onPressed: () => setState(() { _showSearch = !_showSearch; if (!_showSearch) { searchController.clear(); _applyFilters(); } }),
          ),
          IconButton(
            icon: const Icon(Icons.history_rounded),
            tooltip: 'Historique',
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HistoryScreen(technicianId: widget.technicianId))),
          ),
          IconButton(
            icon: const Icon(Icons.inventory_2_rounded),
            tooltip: 'Stock',
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => StockScreen(technicianId: widget.technicianId))),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: loadJobs,
        child: const Icon(Icons.refresh_rounded),
      ),
      body: loading
          ? const ModernLoader(message: 'Chargement des interventions...')
          : Column(
              children: [
                // Bannière offline
                if (_isOffline)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
                    color: Colors.orange.shade700,
                    child: Row(
                      children: [
                        const Icon(Icons.wifi_off_rounded, color: Colors.white, size: 18),
                        const SizedBox(width: 8),
                        Expanded(child: Text('Mode hors ligne', style: const TextStyle(color: Colors.white, fontSize: 13))),
                        if (_lastSync != null) Text(DateFormat('HH:mm').format(_lastSync!), style: const TextStyle(color: Colors.white70, fontSize: 11)),
                      ],
                    ),
                  ),
                if (_syncError != null)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 16),
                    color: Colors.red.shade100,
                    child: Text('Erreur sync: $_syncError', style: TextStyle(fontSize: 12, color: Colors.red.shade800)),
                  ),

                // Barre de recherche
                if (_showSearch)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                    child: TextField(
                      controller: searchController,
                      onChanged: searchJobs,
                      autofocus: true,
                      decoration: InputDecoration(
                        hintText: 'Client, adresse, téléphone, opérateur...',
                        prefixIcon: const Icon(Icons.search_rounded),
                        suffixIcon: searchController.text.isNotEmpty
                            ? IconButton(icon: const Icon(Icons.clear_rounded, size: 18), onPressed: () { searchController.clear(); _applyFilters(); })
                            : null,
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),

                Expanded(
                  child: RefreshIndicator(
                    onRefresh: loadJobs,
                    child: ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        // HEADER compact
                        _buildCompactHeader(completed, inProgress, enRoute, pending, urgent),
                        const SizedBox(height: 12),

                        // Filtres
                        _buildFilterBar(),
                        const SizedBox(height: 12),

                        // Tri
                        _buildSortBar(),
                        const SizedBox(height: 12),

                        // Compteur résultats
                        Padding(
                          padding: const EdgeInsets.only(left: 4, bottom: 8),
                          child: Text(
                            '${filteredJobs.length} intervention(s)',
                            style: TextStyle(color: Colors.grey[600], fontSize: 12),
                          ),
                        ),

                        // Liste
                        if (filteredJobs.isEmpty)
                          _buildEmptyState()
                        else
                          ...filteredJobs.map((job) => JobCard(
                            job: job,
                            onTap: () {
                              Navigator.push(context, MaterialPageRoute(
                                builder: (_) => InterventionScreen(
                                  technicianId: widget.technicianId,
                                  intervention: job.toJson(),
                                ),
                              )).then((_) => loadJobs());
                            },
                            onStartJob: (job.status == 'assigned' || job.status == 'pending')
                                ? () async {
                                    final confirm = await showDialog<bool>(
                                      context: context,
                                      builder: (ctx) => AlertDialog(
                                        title: const Text('Démarrer'),
                                        content: Text('Démarrer l\'intervention chez ${job.customerName} ?'),
                                        actions: [
                                          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
                                          TextButton(onPressed: () => Navigator.pop(ctx, true), style: TextButton.styleFrom(foregroundColor: Colors.green), child: const Text('Démarrer')),
                                        ],
                                      ),
                                    );
                                    if (confirm != true) return;
                                    try {
                                      final position = await LocationService.getCurrentPosition();
                                      await InterventionService.startJob(
                                        jobId: job.id,
                                        latitude: position?.latitude,
                                        longitude: position?.longitude,
                                        comment: 'Démarrage depuis le mobile',
                                      );
                                      if (mounted) {
                                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Intervention démarrée'), backgroundColor: Colors.green));
                                        loadJobs();
                                      }
                                    } catch (e) {
                                      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur: $e'), backgroundColor: Colors.red));
                                    }
                                  }
                                : null,
                          )),

                        const SizedBox(height: 80),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildCompactHeader(int completed, int inProgress, int enRoute, int pending, int urgent) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          // Avatar
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: const Color(0xFF003366).withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Center(
              child: Text(
                _techName.isNotEmpty ? _techName.split(' ').map((n) => n[0]).take(2).join().toUpperCase() : '?',
                style: const TextStyle(color: Color(0xFF003366), fontSize: 14, fontWeight: FontWeight.bold),
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Stats compactes
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _miniStat('Total', jobs.length.toString(), const Color(0xFF3B82F6)),
                  const SizedBox(width: 12),
                  _miniStat('En cours', inProgress.toString(), const Color(0xFFF59E0B)),
                  const SizedBox(width: 12),
                  _miniStat('Terminés', completed.toString(), const Color(0xFF10B981)),
                  const SizedBox(width: 12),
                  if (urgent > 0)
                    _miniStat('Urgent', urgent.toString(), const Color(0xFFEF4444)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _miniStat(String label, String value, Color color) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8, height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(value, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: color)),
        const SizedBox(width: 2),
        Text(label, style: TextStyle(fontSize: 10, color: Colors.grey[600])),
      ],
    );
  }

  Widget _buildFilterBar() {
    return Column(
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              // Filtre urgences
              _filterChip(
                label: '🔴 Urgent',
                selected: _urgentOnly,
                color: const Color(0xFFEF4444),
                onTap: () { setState(() { _urgentOnly = !_urgentOnly; _applyFilters(); }); },
              ),
              const SizedBox(width: 6),
              // Filtre statut
              _filterChip(
                label: 'Assignées',
                selected: _statusFilter == 'assigned',
                color: const Color(0xFF3B82F6),
                onTap: () { setState(() { _statusFilter = _statusFilter == 'assigned' ? 'TOUS' : 'assigned'; _applyFilters(); }); },
              ),
              const SizedBox(width: 6),
              _filterChip(
                label: 'En route',
                selected: _statusFilter == 'en_route',
                color: const Color(0xFFF59E0B),
                onTap: () { setState(() { _statusFilter = _statusFilter == 'en_route' ? 'TOUS' : 'en_route'; _applyFilters(); }); },
              ),
              const SizedBox(width: 6),
              _filterChip(
                label: 'En cours',
                selected: _statusFilter == 'in_progress',
                color: const Color(0xFF8B5CF6),
                onTap: () { setState(() { _statusFilter = _statusFilter == 'in_progress' ? 'TOUS' : 'in_progress'; _applyFilters(); }); },
              ),
              const SizedBox(width: 6),
              _filterChip(
                label: 'Terminées',
                selected: _statusFilter == 'completed',
                color: const Color(0xFF10B981),
                onTap: () { setState(() { _statusFilter = _statusFilter == 'completed' ? 'TOUS' : 'completed'; _applyFilters(); }); },
              ),
              const SizedBox(width: 6),
              _filterChip(
                label: 'Filtres +',
                selected: _showFilters,
                color: Colors.grey,
                onTap: () => setState(() => _showFilters = !_showFilters),
              ),
            ],
          ),
        ),
        if (_showFilters) ...[
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                const Text('Type:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                const SizedBox(width: 6),
                ...[
                  'INSTALLATION', 'DEPANNAGE', 'SAV', 'MIGRATION', 'MAINTENANCE', 'AUDIT'
                ].map((t) => Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: ChoiceChip(
                    label: Text(t == _typeFilter ? t : t, style: const TextStyle(fontSize: 10)),
                    selected: _typeFilter == t,
                    onSelected: (_) { setState(() { _typeFilter = _typeFilter == t ? 'TOUS' : t; _applyFilters(); }); },
                    visualDensity: VisualDensity.compact,
                    selectedColor: _typeColor(t).withOpacity(0.2),
                  ),
                )),
                ChoiceChip(
                  label: const Text('Tout', style: TextStyle(fontSize: 10)),
                  selected: _typeFilter == 'TOUS',
                  onSelected: (_) { setState(() { _typeFilter = 'TOUS'; _applyFilters(); }); },
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _filterChip({
    required String label,
    required bool selected,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? color.withOpacity(0.15) : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? color : Colors.grey.shade200,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
            color: selected ? color : Colors.grey[700],
          ),
        ),
      ),
    );
  }

  Widget _buildSortBar() {
    final sorts = ['distance', 'priorite', 'date', 'type'];
    final labels = {'distance': '📍 Proximité', 'priorite': '⚠️ Priorité', 'date': '📅 Date', 'type': '📋 Type'};

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          const Text('Trier:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.grey)),
          const SizedBox(width: 6),
          ...sorts.map((s) => Padding(
            padding: const EdgeInsets.only(right: 4),
            child: ChoiceChip(
              label: Text(labels[s] ?? s, style: const TextStyle(fontSize: 10)),
              selected: _sortBy == s,
              onSelected: (_) { setState(() { _sortBy = s; _applyFilters(); }); },
              visualDensity: VisualDensity.compact,
              selectedColor: const Color(0xFF003366).withOpacity(0.1),
            ),
          )),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Container(
      margin: const EdgeInsets.only(top: 40),
      padding: const EdgeInsets.all(32),
      child: Column(
        children: [
          Icon(Icons.search_off_rounded, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 16),
          Text(
            'Aucune intervention trouvée',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.grey[700]),
          ),
          const SizedBox(height: 8),
          Text(
            'Essayez de modifier vos filtres ou de\nrafraîchir la liste',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: Colors.grey[500]),
          ),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: () { _statusFilter = 'TOUS'; _typeFilter = 'TOUS'; _urgentOnly = false; _applyFilters(); },
            icon: const Icon(Icons.filter_alt_off_rounded, size: 18),
            label: const Text('Réinitialiser les filtres'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF003366),
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}