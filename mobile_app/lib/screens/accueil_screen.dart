import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../models/job.dart';
import '../models/workflow_step.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/offline_service.dart';
import '../services/location_service.dart';
import '../widgets/job_card.dart';
import '../widgets/kpi_card.dart';
import '../widgets/modern_loader.dart';
import '../config/config.dart';
import 'jobs_screen.dart';
import 'login_screen.dart';
import 'stock_screen.dart';
import 'status_screen.dart';
import 'history_screen.dart';

class AccueilScreen extends StatefulWidget {
  final int technicianId;

  const AccueilScreen({super.key, required this.technicianId});

  @override
  State<AccueilScreen> createState() => _AccueilScreenState();
}

class _AccueilScreenState extends State<AccueilScreen> with SingleTickerProviderStateMixin {
  List<Job> jobs = [];
  bool loading = true;
  bool _isOffline = false;
  DateTime? _lastSync;
  String _techName = '';
  String _techStatus = 'disponible';
  Timer? _clockTimer;
  Timer? _refreshTimer;
  late AnimationController _pulseAnim;

  // KPIs
  int get _totalJobs => jobs.length;
  int get _completedJobs => jobs.where((j) => j.status.toLowerCase() == 'completed').length;
  int get _inProgressJobs => jobs.where((j) => j.status.toLowerCase() == 'in_progress' || j.status.toLowerCase() == 'en_route').length;
  int get _urgentJobs => jobs.where((j) => j.validationStatus?.toUpperCase() == 'URGENT' || j.jobType.toUpperCase() == 'URGENCE').length;
  int get _lateJobs => jobs.where((j) => j.status.toLowerCase() == 'assigned' && j.scheduledDate != null).length;
  double get _progress => _totalJobs == 0 ? 0 : _completedJobs / _totalJobs;

  @override
  void initState() {
    super.initState();
    _pulseAnim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);
    _loadTechnicianName();
    _loadData();
    _startGpsIfNeeded();
    _clockTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (mounted) setState(() {});
    });
    _refreshTimer = Timer.periodic(const Duration(seconds: 60), (_) {
      if (mounted) _loadData();
    });
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    _refreshTimer?.cancel();
    _pulseAnim.dispose();
    super.dispose();
  }

  Future<void> _startGpsIfNeeded() async {
    final hasPermission = await LocationService.requestPermission();
    if (hasPermission) {
      LocationService.startLiveGps(intervalSeconds: AppConfig.gpsUpdateIntervalSeconds);
    }
  }

  Future<void> _loadTechnicianName() async {
    final name = await AuthService.getTechnicianName();
    if (mounted) setState(() => _techName = name ?? 'Technicien');
  }

  Future<void> _loadData() async {
    setState(() => loading = true);
    _isOffline = !(await OfflineService.isOnline());

    if (_isOffline) {
      final cachedJobs = await OfflineService.getCachedJobs();
      final techJobs = cachedJobs.where((j) => j.assignedTechId == widget.technicianId).toList();
      _lastSync = await OfflineService.getLastSync();
      if (mounted) setState(() { jobs = techJobs; loading = false; });
      return;
    }

    try {
      final allJobs = await ApiService.getJobs();
      final techJobs = allJobs.where((j) => j.assignedTechId == widget.technicianId).toList();
      await OfflineService.cacheJobs(allJobs);
      await OfflineService.syncPendingActions();
      if (mounted) setState(() { jobs = techJobs; loading = false; _isOffline = false; });
    } catch (e) {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _handleLogout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Déconnexion'),
        content: const Text('Voulez-vous vraiment vous déconnecter ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Se déconnecter'),
          ),
        ],
      ),
    );
    if (confirm == true) {
      LocationService.stopLiveGps();
      await AuthService.logout();
      if (!mounted) return;
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (route) => false,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final hour = DateFormat('HH:mm').format(now);
    final date = DateFormat('EEEE d MMMM', 'fr_FR').format(now);

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text('BlueVector'),
        actions: [
          IconButton(
            icon: const Icon(Icons.history_rounded),
            tooltip: 'Historique',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => HistoryScreen(technicianId: widget.technicianId)),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.inventory_2_rounded),
            tooltip: 'Stock',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => StockScreen(technicianId: widget.technicianId)),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            tooltip: 'Déconnexion',
            onPressed: _handleLogout,
          ),
        ],
      ),
      body: loading
          ? const ModernLoader(message: 'Chargement de votre journée...')
          : RefreshIndicator(
              onRefresh: _loadData,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // === BANNIÈRE STATUT ===
                  _buildStatusBanner(hour, date),
                  const SizedBox(height: 16),

                  // === KPIS PRINCIPAUX ===
                  _buildKpiGrid(),
                  const SizedBox(height: 16),

                  // === PROGRESSION DU JOUR ===
                  _buildProgressCard(),
                  const SizedBox(height: 16),

                  // === PROCHAINES INTERVENTIONS ===
                  _buildNextJobsSection(),
                  const SizedBox(height: 16),

                  // === INTERVENTIONS URGENTES ===
                  if (_urgentJobs > 0) ...[
                    _buildUrgentSection(),
                    const SizedBox(height: 16),
                  ],

                  // === MES INTERVENTIONS BOUTON ===
                  _buildMainActions(),

                  const SizedBox(height: 32),
                ],
              ),
            ),
    );
  }

  Widget _buildStatusBanner(String hour, String date) {
    final greeting = _getGreeting();
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF003366), Color(0xFF004D99)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF003366).withOpacity(0.3),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Avatar
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Center(
                  child: Text(
                    _techName.isNotEmpty
                        ? _techName.split(' ').map((n) => n[0]).take(2).join().toUpperCase()
                        : '?',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$greeting,',
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.7),
                        fontSize: 13,
                      ),
                    ),
                    Text(
                      _techName.isNotEmpty ? _techName : 'Technicien',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
              // Statut
              _buildStatusBadge(),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _iconInfo(Icons.access_time_rounded, hour, Colors.white70),
              const SizedBox(width: 16),
              _iconInfo(Icons.calendar_today_rounded, date, Colors.white70),
              const Spacer(),
              if (_isOffline)
                _iconInfo(Icons.wifi_off_rounded, 'Hors ligne', Colors.orangeAccent)
              else
                _iconInfo(Icons.wifi_rounded, 'En ligne', Colors.greenAccent),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBadge() {
    Color statusColor;
    String statusLabel;
    switch (_techStatus) {
      case 'disponible':
        statusColor = Colors.greenAccent;
        statusLabel = 'Disponible';
        break;
      case 'en_intervention':
        statusColor = Colors.orangeAccent;
        statusLabel = 'En intervention';
        break;
      case 'en_route':
        statusColor = Colors.amberAccent;
        statusLabel = 'En route';
        break;
      case 'pause':
        statusColor = Colors.yellowAccent;
        statusLabel = 'En pause';
        break;
      default:
        statusColor = Colors.grey;
        statusLabel = 'Déconnecté';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: statusColor.withOpacity(0.2),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: statusColor.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: statusColor,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            statusLabel,
            style: TextStyle(
              color: statusColor,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _iconInfo(IconData icon, String text, Color color) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 4),
        Text(text, style: TextStyle(color: color, fontSize: 12)),
      ],
    );
  }

  Widget _buildKpiGrid() {
    return Row(
      children: [
        Expanded(child: _kpiCard('Total', '$_totalJobs', Icons.assignment_rounded, const Color(0xFF3B82F6))),
        const SizedBox(width: 8),
        Expanded(child: _kpiCard('En cours', '$_inProgressJobs', Icons.build_rounded, const Color(0xFFF59E0B))),
        const SizedBox(width: 8),
        Expanded(child: _kpiCard('Terminés', '$_completedJobs', Icons.check_circle_rounded, const Color(0xFF10B981))),
      ],
    );
  }

  Widget _kpiCard(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(14),
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
      child: Column(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 22),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: Colors.grey[600],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProgressCard() {
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.trending_up_rounded, size: 20, color: Color(0xFF003366)),
              const SizedBox(width: 8),
              const Text(
                'Progression du jour',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
              ),
              const Spacer(),
              Text(
                '$_completedJobs / $_totalJobs',
                style: TextStyle(color: Colors.grey[600], fontSize: 13),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: _progress,
              minHeight: 10,
              backgroundColor: Colors.grey[200],
              valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF00A86B)),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Text(
                '${(_progress * 100).toStringAsFixed(0)}% terminé',
                style: TextStyle(color: Colors.grey[600], fontSize: 12),
              ),
              const Spacer(),
              if (_urgentJobs > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE53E3E).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.warning_amber_rounded, color: Color(0xFFE53E3E), size: 14),
                      const SizedBox(width: 4),
                      Text(
                        '$_urgentJobs urgence(s)',
                        style: const TextStyle(
                          color: Color(0xFFE53E3E),
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              if (_lateJobs > 0) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFB800).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.access_time_rounded, color: Color(0xFFFFB800), size: 14),
                      const SizedBox(width: 4),
                      Text(
                        '$_lateJobs retard(s)',
                        style: const TextStyle(
                          color: Color(0xFFFFB800),
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildNextJobsSection() {
    final nextJobs = jobs
        .where((j) => j.status.toLowerCase() != 'completed')
        .take(3)
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.list_alt_rounded, size: 20, color: Color(0xFF003366)),
            const SizedBox(width: 8),
            const Text(
              'Prochaines interventions',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
            ),
            const Spacer(),
            TextButton(
              onPressed: _navigateToJobs,
              child: const Text('Voir tout →'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (nextJobs.isEmpty)
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                Icon(Icons.celebration_rounded, size: 48, color: Colors.grey[300]),
                const SizedBox(height: 8),
                Text(
                  'Toutes les interventions sont terminées !',
                  style: TextStyle(color: Colors.grey[600], fontSize: 14),
                ),
              ],
            ),
          )
        else
          ...nextJobs.map((job) => JobCard(
            job: job,
            onTap: _navigateToJobs,
            onStartJob: (job.status.toLowerCase() == 'assigned' || job.status.toLowerCase() == 'pending')
                ? () => _navigateToJobs()
                : null,
          )),
      ],
    );
  }

  Widget _buildUrgentSection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFE53E3E).withOpacity(0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE53E3E).withOpacity(0.2)),
      ),
      child: Row(
        children: [
          AnimatedBuilder(
            animation: _pulseAnim,
            builder: (context, child) {
              return Transform.scale(
                scale: 1 + (_pulseAnim.value * 0.1),
                child: const Icon(Icons.warning_rounded, color: Color(0xFFE53E3E), size: 32),
              );
            },
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Interventions urgentes',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                    color: Color(0xFFE53E3E),
                  ),
                ),
                Text(
                  '$_urgentJobs intervention(s) nécessitent votre attention',
                  style: TextStyle(fontSize: 12, color: Colors.grey[700]),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: _navigateToJobs,
            child: const Text('Voir', style: TextStyle(color: Color(0xFFE53E3E))),
          ),
        ],
      ),
    );
  }

  Widget _buildMainActions() {
    return Row(
      children: [
        Expanded(
          child: _actionCard(
            icon: Icons.assignment_rounded,
            label: 'Mes interventions',
            subtitle: '${_totalJobs - _completedJobs} en attente',
            color: const Color(0xFF003366),
            onTap: _navigateToJobs,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _actionCard(
            icon: Icons.inventory_2_rounded,
            label: 'Mon stock',
            subtitle: 'Gérer le matériel',
            color: const Color(0xFFFF7900),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => StockScreen(technicianId: widget.technicianId)),
            ),
          ),
        ),
      ],
    );
  }

  Widget _actionCard({
    required IconData icon,
    required String label,
    required String subtitle,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.04),
                blurRadius: 10,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color, size: 24),
              ),
              const SizedBox(height: 8),
              Text(
                label,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                textAlign: TextAlign.center,
              ),
              Text(
                subtitle,
                style: TextStyle(color: Colors.grey[600], fontSize: 11),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Bonjour';
    if (hour < 17) return 'Bon après-midi';
    return 'Bonsoir';
  }

  void _navigateToJobs() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => JobsScreen(technicianId: widget.technicianId),
      ),
    );
  }
}