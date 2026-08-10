import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../services/location_service.dart';
import '../services/auth_service.dart';
import '../services/offline_service.dart';
import '../services/api_service.dart';
import '../widgets/modern_loader.dart';
import '../config/config.dart';

enum TechLiveStatus {
  disponible,
  en_intervention,
  pause,
  hors_service,
  deconnecte,
}

class StatusScreen extends StatefulWidget {
  final int technicianId;

  const StatusScreen({super.key, required this.technicianId});

  @override
  State<StatusScreen> createState() => _StatusScreenState();
}

class _StatusScreenState extends State<StatusScreen> with AutomaticKeepAliveClientMixin {
  TechLiveStatus _currentStatus = TechLiveStatus.disponible;
  bool _isUpdating = false;
  bool _isLoading = true;
  DateTime? _currentPauseStart;
  String _techName = '';
  Timer? _timer;
  bool _isOffline = false;
  DateTime? _lastSync;
  int _pendingCount = 0;

  // GPS
  double? _gpsLat;
  double? _gpsLon;
  double? _gpsAccuracy;
  bool _gpsActive = false;

  // Historique des changements
  final List<_StatusChange> _statusHistory = [];

  static const Map<TechLiveStatus, IconData> _statusIcons = {
    TechLiveStatus.disponible: Icons.check_circle,
    TechLiveStatus.en_intervention: Icons.build,
    TechLiveStatus.pause: Icons.free_breakfast,
    TechLiveStatus.hors_service: Icons.power_settings_new,
    TechLiveStatus.deconnecte: Icons.wifi_off,
  };

  static const Map<TechLiveStatus, Color> _statusColors = {
    TechLiveStatus.disponible: Colors.green,
    TechLiveStatus.en_intervention: Colors.blue,
    TechLiveStatus.pause: Colors.orange,
    TechLiveStatus.hors_service: Colors.red,
    TechLiveStatus.deconnecte: Colors.grey,
  };

  static const Map<TechLiveStatus, String> _statusLabels = {
    TechLiveStatus.disponible: 'Disponible',
    TechLiveStatus.en_intervention: 'En intervention',
    TechLiveStatus.pause: 'En pause',
    TechLiveStatus.hors_service: 'Hors service',
    TechLiveStatus.deconnecte: 'Déconnecté',
  };

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _loadTechnicianName();
    _loadCurrentStatus();
    _checkConnectivity();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (mounted) {
        setState(() {
          _gpsActive = LocationService.isLiveGpsRunning;
        });
        _checkConnectivity();
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _loadTechnicianName() async {
    final name = await AuthService.getTechnicianName();
    if (mounted) setState(() => _techName = name ?? 'Technicien');
  }

  Future<void> _checkConnectivity() async {
    _isOffline = !(await OfflineService.isOnline());
    _lastSync = await OfflineService.getLastSync();
    if (mounted) setState(() {});
  }

  Future<void> _loadCurrentStatus() async {
    try {
      final status = await ApiService.getTechnicianStatus();
      if (mounted && status != null) {
        final mapped = _mapApiStatus(status);
        if (mapped != null) setState(() => _currentStatus = mapped);
      }
    } catch (_) {}
    if (mounted) setState(() => _isLoading = false);
  }

  TechLiveStatus? _mapApiStatus(String status) {
    switch (status) {
      case 'disponible': return TechLiveStatus.disponible;
      case 'en_intervention': return TechLiveStatus.en_intervention;
      case 'pause': return TechLiveStatus.pause;
      case 'hors_service': return TechLiveStatus.hors_service;
      case 'deconnecte': return TechLiveStatus.deconnecte;
      default: return null;
    }
  }

  Future<void> _changeStatus(TechLiveStatus newStatus) async {
    if (newStatus == _currentStatus) return;
    setState(() => _isUpdating = true);

    try {
      final success = await LocationService.updateLiveStatus(
        newStatus.name,
        latitude: _gpsLat,
        longitude: _gpsLon,
        jobId: null,
      );

      if (!success) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Erreur mise à jour statut'), backgroundColor: Colors.red),
          );
        }
        return;
      }

      final oldStatus = _currentStatus;
      setState(() {
        _currentStatus = newStatus;
        if (newStatus == TechLiveStatus.pause) {
          _currentPauseStart = DateTime.now();
        } else {
          _currentPauseStart = null;
        }
        _statusHistory.insert(0, _StatusChange(
          from: _statusLabels[oldStatus]!,
          to: _statusLabels[newStatus]!,
          time: DateTime.now(),
        ));
      });

      if (newStatus == TechLiveStatus.disponible || newStatus == TechLiveStatus.en_intervention) {
        LocationService.startLiveGps(intervalSeconds: AppConfig.gpsUpdateIntervalSeconds);
      } else if (newStatus == TechLiveStatus.hors_service) {
        LocationService.stopLiveGps();
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Statut: ${_statusLabels[newStatus]}'), backgroundColor: _statusColors[newStatus]),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur: $e')));
      }
    } finally {
      if (mounted) setState(() => _isUpdating = false);
    }
  }

  Duration _pauseDuration() {
    if (_currentPauseStart == null) return Duration.zero;
    return DateTime.now().difference(_currentPauseStart!);
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final color = _statusColors[_currentStatus]!;

    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Présence')),
        body: const Center(child: ModernLoader(message: 'Chargement...')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Présence'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadCurrentStatus),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Bannière offline
          if (_isOffline)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 16),
              margin: const EdgeInsets.only(bottom: 8),
              decoration: BoxDecoration(color: Colors.orange.shade700, borderRadius: BorderRadius.circular(8)),
              child: Row(
                children: [
                  const Icon(Icons.wifi_off, color: Colors.white, size: 16),
                  const SizedBox(width: 8),
                  Expanded(child: Text('Hors ligne', style: const TextStyle(color: Colors.white, fontSize: 12))),
                  if (_lastSync != null) Text(DateFormat('HH:mm').format(_lastSync!), style: const TextStyle(color: Colors.white70, fontSize: 11)),
                ],
              ),
            ),

          // HEADER
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: color.withOpacity(0.15),
                    child: Text(
                      _techName.isNotEmpty ? _techName.split(' ').map((n) => n[0]).take(2).join().toUpperCase() : '?',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_techName.isNotEmpty ? _techName : 'Technicien', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                        Text('Matricule: #${widget.technicianId}', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                        Row(
                          children: [
                            Icon(Icons.access_time, size: 12, color: Colors.grey[500]),
                            const SizedBox(width: 4),
                            Text(DateFormat('HH:mm').format(DateTime.now()), style: TextStyle(fontSize: 11, color: Colors.grey[500])),
                            const SizedBox(width: 8),
                            Icon(Icons.calendar_today, size: 12, color: Colors.grey[500]),
                            const SizedBox(width: 4),
                            Text(DateFormat('dd/MM/yyyy').format(DateTime.now()), style: TextStyle(fontSize: 11, color: Colors.grey[500])),
                          ],
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(12)),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
                        const SizedBox(width: 4),
                        Text(_statusLabels[_currentStatus]!, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // CARTE STATUT PRINCIPAL
          Card(
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                gradient: LinearGradient(
                  colors: [color.withOpacity(0.1), color.withOpacity(0.05)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: Column(
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(color: color.withOpacity(0.15), shape: BoxShape.circle),
                    child: Icon(_statusIcons[_currentStatus], size: 40, color: color),
                  ),
                  const SizedBox(height: 12),
                  Text(_statusLabels[_currentStatus]!, style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: color)),
                  if (_currentStatus == TechLiveStatus.pause && _currentPauseStart != null) ...[
                    const SizedBox(height: 4),
                    Text('Pause depuis ${_pauseDuration().inMinutes} min', style: TextStyle(color: Colors.grey[600], fontSize: 13)),
                  ],
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(_gpsActive ? Icons.gps_fixed : Icons.gps_off, size: 16, color: _gpsActive ? Colors.green : Colors.grey),
                      const SizedBox(width: 4),
                      Text(_gpsActive ? 'GPS actif' : 'GPS inactif', style: TextStyle(fontSize: 12, color: _gpsActive ? Colors.green : Colors.grey)),
                      const SizedBox(width: 12),
                      Icon(_isOffline ? Icons.wifi_off : Icons.wifi, size: 16, color: _isOffline ? Colors.orange : Colors.green),
                      const SizedBox(width: 4),
                      Text(_isOffline ? 'Hors ligne' : 'En ligne', style: TextStyle(fontSize: 12, color: _isOffline ? Colors.orange : Colors.green)),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // STATUTS DISPONIBLES
          Text('Changer mon statut', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          ...TechLiveStatus.values.where((s) => s != TechLiveStatus.deconnecte).map((status) {
            final isActive = _currentStatus == status;
            final sColor = _statusColors[status]!;
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Material(
                borderRadius: BorderRadius.circular(12),
                color: isActive ? sColor.withOpacity(0.1) : null,
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: _isUpdating ? null : () => _changeStatus(status),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: isActive ? sColor : Colors.grey.shade300),
                    ),
                    child: Row(
                      children: [
                        Icon(_statusIcons[status], color: isActive ? sColor : Colors.grey.shade600, size: 26),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(_statusLabels[status]!, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: isActive ? sColor : null)),
                        ),
                        if (_isUpdating && isActive)
                          const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2)),
                        if (!(_isUpdating && isActive))
                          Icon(isActive ? Icons.radio_button_checked : Icons.radio_button_off, color: isActive ? sColor : Colors.grey.shade400),
                      ],
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
          const SizedBox(height: 16),

          // GPS
          Text('GPS en direct', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                children: [
                  Row(
                    children: [
                      Icon(_gpsActive ? Icons.gps_fixed : Icons.gps_off, color: _gpsActive ? Colors.green : Colors.grey),
                      const SizedBox(width: 8),
                      Text(_gpsActive ? 'GPS actif' : 'GPS inactif', style: TextStyle(fontWeight: FontWeight.w600, color: _gpsActive ? Colors.green : Colors.grey)),
                      const Spacer(),
                      if (_gpsAccuracy != null)
                        Text('±${_gpsAccuracy!.toStringAsFixed(0)}m', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(child: _gpsInfo('Latitude', _gpsLat?.toStringAsFixed(6) ?? '--')),
                      const SizedBox(width: 8),
                      Expanded(child: _gpsInfo('Longitude', _gpsLon?.toStringAsFixed(6) ?? '--')),
                      const SizedBox(width: 8),
                      Expanded(child: _gpsInfo('Intervalle', '${AppConfig.gpsUpdateIntervalSeconds}s')),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // SYNCHRONISATION
          Text('Synchronisation', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Icon(_isOffline ? Icons.wifi_off : Icons.cloud_done, color: _isOffline ? Colors.orange : Colors.green),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_isOffline ? 'Hors ligne' : 'Synchronisé', style: TextStyle(fontWeight: FontWeight.w600)),
                        if (_lastSync != null)
                          Text('Dernière synchro: ${DateFormat('HH:mm').format(_lastSync!)}', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                      ],
                    ),
                  ),
                  TextButton.icon(
                    onPressed: _checkConnectivity,
                    icon: const Icon(Icons.refresh, size: 18),
                    label: const Text('Vérifier', style: TextStyle(fontSize: 12)),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // HISTORIQUE DES CHANGEMENTS
          if (_statusHistory.isNotEmpty) ...[
            Text('Derniers changements', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  children: _statusHistory.take(5).map((change) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        const Icon(Icons.swap_horiz, size: 16, color: Colors.grey),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text('${change.from} → ${change.to}', style: const TextStyle(fontSize: 12)),
                        ),
                        Text(DateFormat('HH:mm').format(change.time), style: TextStyle(fontSize: 11, color: Colors.grey[500])),
                      ],
                    ),
                  )).toList(),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _gpsInfo(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 10, color: Colors.grey[500])),
        Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _StatusChange {
  final String from;
  final String to;
  final DateTime time;

  const _StatusChange({required this.from, required this.to, required this.time});
}