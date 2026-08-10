import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/location_service.dart';
import '../services/intervention_service.dart';
import 'arrival_screen.dart';

class NavigationScreen extends StatefulWidget {
  final int jobId;
  final String customerName;
  final double? destinationLat;
  final double? destinationLon;
  final String? address;
  final String? customerPhone;
  final String? notes;

  const NavigationScreen({
    super.key,
    required this.jobId,
    required this.customerName,
    this.destinationLat,
    this.destinationLon,
    this.address,
    this.customerPhone,
    this.notes,
  });

  @override
  State<NavigationScreen> createState() => _NavigationScreenState();
}

class _NavigationScreenState extends State<NavigationScreen> {
  Timer? _timer;
  DateTime _departureTime = DateTime.now();
  double? _currentLat;
  double? _currentLon;
  double? _distanceKm;
  int _etaMinutes = 0;
  bool _isNavigating = false;

  @override
  void initState() {
    super.initState();
    _startNavigation();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) {
      _updatePosition();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _startNavigation() async {
    // Démarrer le GPS live
    LocationService.startLiveGps(jobId: widget.jobId, intervalSeconds: 10);

    // Mettre à jour le statut
    try {
      await InterventionService.updateStatus(
        jobId: widget.jobId,
        newStatus: 'en_route',
        comment: 'Départ vers le client',
      );
    } catch (_) {}

    setState(() => _isNavigating = true);
    _updatePosition();
  }

  Future<void> _updatePosition() async {
    final position = await LocationService.getCurrentPosition();
    if (position == null) return;

    setState(() {
      _currentLat = position.latitude;
      _currentLon = position.longitude;
    });

    // Calculer distance si destination connue
    if (widget.destinationLat != null && widget.destinationLon != null && _currentLat != null) {
      final dist = LocationService.calculateDistance(
        _currentLat!, _currentLon!,
        widget.destinationLat!, widget.destinationLon!,
      );
      setState(() {
        _distanceKm = dist;
        _etaMinutes = (dist / 0.5).round(); // ~30km/h moyenne ville
      });
    }
  }

  Future<void> _openMaps() async {
    if (widget.destinationLat != null && widget.destinationLon != null) {
      await LocationService.openNavigation(
        latitude: widget.destinationLat!,
        longitude: widget.destinationLon!,
        label: widget.customerName,
      );
    } else if (widget.address != null) {
      await LocationService.openNavigationByAddress(widget.address!);
    }
  }

  Future<void> _callClient() async {
    if (widget.customerPhone != null) {
      await LocationService.openNavigationByAddress('tel:${widget.customerPhone}');
    }
  }

  Future<void> _reportBlocked() async {
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Signaler un problème'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _problemOption(ctx, '🚧', 'Trafic / Embouteillage'),
            _problemOption(ctx, '👤', 'Client absent'),
            _problemOption(ctx, '🚗', 'Accident / Panne'),
            _problemOption(ctx, '🚫', 'Accès impossible'),
            _problemOption(ctx, '⏰', 'Retard important'),
          ],
        ),
      ),
    );
    if (reason != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Signalé: $reason'), backgroundColor: Colors.orange),
      );
    }
  }

  Widget _problemOption(BuildContext ctx, String emoji, String label) {
    return ListTile(
      leading: Text(emoji, style: const TextStyle(fontSize: 24)),
      title: Text(label),
      onTap: () => Navigator.pop(ctx, label),
    );
  }

  @override
  Widget build(BuildContext context) {
    final elapsed = DateTime.now().difference(_departureTime);
    final elapsedStr = '${elapsed.inMinutes.toString().padLeft(2, '0')} min';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Navigation'),
        centerTitle: true,
      ),
      body: Column(
        children: [
          // Carte / En-tête navigation
          Container(
            height: 200,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  const Color(0xFF003366),
                  const Color(0xFF1A5276),
                ],
              ),
            ),
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.navigation_rounded, color: Colors.white, size: 48),
                  const SizedBox(height: 8),
                  Text(
                    'En route vers ${widget.customerName}',
                    style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    widget.address ?? 'Adresse non disponible',
                    style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 13),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),

          // Infos trajet
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: _infoCard(
                    icon: Icons.timer_rounded,
                    value: elapsedStr,
                    label: 'Temps écoulé',
                    color: const Color(0xFF3B82F6),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _infoCard(
                    icon: Icons.route_rounded,
                    value: _distanceKm != null ? '${_distanceKm!.toStringAsFixed(1)} km' : '--',
                    label: 'Distance restante',
                    color: const Color(0xFFF59E0B),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _infoCard(
                    icon: Icons.access_time_rounded,
                    value: '${_etaMinutes} min',
                    label: 'ETA estimé',
                    color: const Color(0xFF10B981),
                  ),
                ),
              ],
            ),
          ),

          // Actions rapides
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(
                  child: _actionButton(
                    icon: Icons.map_rounded,
                    label: 'Ouvrir Maps',
                    color: const Color(0xFF3B82F6),
                    onTap: _openMaps,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _actionButton(
                    icon: Icons.phone_rounded,
                    label: 'Appeler client',
                    color: const Color(0xFF10B981),
                    onTap: _callClient,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 8),

          // Bouton signaler problème
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _reportBlocked,
                icon: const Icon(Icons.warning_amber_rounded, color: Color(0xFFE53E3E)),
                label: const Text('Signaler un problème', style: TextStyle(color: Color(0xFFE53E3E))),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Color(0xFFE53E3E)),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
          ),

          const Spacer(),

          // Notes client
          if (widget.notes != null && widget.notes!.isNotEmpty)
            Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF3E0),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFFFFE0B2)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.info_outline_rounded, color: Color(0xFFE65100), size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Consignes :', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: Color(0xFFE65100))),
                        const SizedBox(height: 4),
                        Text(widget.notes!, style: const TextStyle(fontSize: 13, color: Color(0xFFBF360C))),
                      ],
                    ),
                  ),
                ],
              ),
            ),

          // Bouton arrivé
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton.icon(
                  onPressed: () {
                    LocationService.stopLiveGps();
                    Navigator.pushReplacement(
                      context,
                      MaterialPageRoute(
                        builder: (_) => ArrivalScreen(
                          jobId: widget.jobId,
                          customerName: widget.customerName,
                          arrivalLat: _currentLat,
                          arrivalLon: _currentLon,
                        ),
                      ),
                    );
                  },
                  icon: const Icon(Icons.location_on_rounded, size: 24),
                  label: const Text('📍 Je suis arrivé', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF14B8A6),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _infoCard({
    required IconData icon,
    required String value,
    required String label,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
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
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 6),
          Text(value, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: color)),
          Text(label, style: TextStyle(fontSize: 10, color: Colors.grey[600])),
        ],
      ),
    );
  }

  Widget _actionButton({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Material(
      color: color.withOpacity(0.1),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Column(
            children: [
              Icon(icon, color: color, size: 24),
              const SizedBox(height: 4),
              Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }
}