import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/location_service.dart';
import '../services/intervention_service.dart';
import 'diagnostic_screen.dart';

class ArrivalScreen extends StatefulWidget {
  final int jobId;
  final String customerName;
  final double? arrivalLat;
  final double? arrivalLon;

  const ArrivalScreen({
    super.key,
    required this.jobId,
    required this.customerName,
    this.arrivalLat,
    this.arrivalLon,
  });

  @override
  State<ArrivalScreen> createState() => _ArrivalScreenState();
}

class _ArrivalScreenState extends State<ArrivalScreen> with SingleTickerProviderStateMixin {
  DateTime _arrivalTime = DateTime.now();
  double? _gpsLat;
  double? _gpsLon;
  double? _accuracy;
  double? _distanceFromSite;
  bool _isGettingGps = true;
  bool _isArrived = false;
  late AnimationController _pulseAnim;

  @override
  void initState() {
    super.initState();
    _pulseAnim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
    _startArrival();
  }

  @override
  void dispose() {
    _pulseAnim.dispose();
    super.dispose();
  }

  Future<void> _startArrival() async {
    // Enregistrer l'arrivée sur le backend
    try {
      await InterventionService.updateStatus(
        jobId: widget.jobId,
        newStatus: 'on_site',
        latitude: widget.arrivalLat,
        longitude: widget.arrivalLon,
        comment: 'Arrivé sur site',
      );
    } catch (_) {}

    // Obtenir la position GPS actuelle
    final position = await LocationService.getCurrentPosition();
    if (position != null && mounted) {
      setState(() {
        _gpsLat = position.latitude;
        _gpsLon = position.longitude;
        _accuracy = position.accuracy;
        _isGettingGps = false;
      });
    } else if (mounted) {
      setState(() => _isGettingGps = false);
    }
  }

  Future<void> _confirmArrival() async {
    setState(() => _isArrived = true);
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => DiagnosticScreen(
          jobId: widget.jobId,
          customerName: widget.customerName,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final timeStr = DateFormat('HH:mm').format(_arrivalTime);
    final dateStr = DateFormat('EEEE d MMMM yyyy', 'fr_FR').format(_arrivalTime);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Arrivée sur site'),
        centerTitle: true,
      ),
      body: Column(
        children: [
          // En-tête succès
          Container(
            padding: const EdgeInsets.all(32),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFF14B8A6), Color(0xFF0D9488)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Column(
              children: [
                // Animation pulsante
                AnimatedBuilder(
                  animation: _pulseAnim,
                  builder: (context, child) {
                    return Transform.scale(
                      scale: 1 + (_pulseAnim.value * 0.08),
                      child: Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.2),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.location_on_rounded,
                          color: Colors.white,
                          size: 44,
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 16),
                const Text(
                  'Vous êtes arrivé !',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  widget.customerName,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.9),
                    fontSize: 16,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // Informations d'arrivée
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
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
                children: [
                  _arrivalInfoRow(Icons.access_time_rounded, 'Heure d\'arrivée', timeStr),
                  const Divider(height: 20),
                  _arrivalInfoRow(Icons.calendar_today_rounded, 'Date', dateStr),
                  const Divider(height: 20),
                  _arrivalInfoRow(
                    Icons.gps_fixed_rounded,
                    'Position GPS',
                    _isGettingGps
                        ? 'Acquisition...'
                        : _gpsLat != null
                            ? '${_gpsLat!.toStringAsFixed(6)}, ${_gpsLon!.toStringAsFixed(6)}'
                            : 'Non disponible',
                  ),
                  if (_accuracy != null) ...[
                    const Divider(height: 20),
                    _arrivalInfoRow(
                      Icons.satellite_alt_rounded,
                      'Précision',
                      '${_accuracy!.toStringAsFixed(0)} m',
                    ),
                  ],
                  if (_distanceFromSite != null) ...[
                    const Divider(height: 20),
                    _arrivalInfoRow(
                      Icons.route_rounded,
                      'Distance parcourue',
                      '${_distanceFromSite!.toStringAsFixed(2)} km',
                    ),
                  ],
                ],
              ),
            ),
          ),

          const SizedBox(height: 20),

          // Détection automatique
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF0FDF4),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFBBF7D0)),
            ),
            child: Row(
              children: [
                const Icon(Icons.check_circle_rounded, color: Color(0xFF00A86B), size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Arrivée enregistrée à $timeStr',
                    style: const TextStyle(color: Color(0xFF166534), fontSize: 13),
                  ),
                ),
              ],
            ),
          ),

          const Spacer(),

          // Bouton continuer
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton.icon(
                  onPressed: _confirmArrival,
                  icon: const Icon(Icons.arrow_forward_rounded),
                  label: const Text('Démarrer le diagnostic', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF003366),
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

  Widget _arrivalInfoRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: const Color(0xFF003366).withOpacity(0.08),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: const Color(0xFF003366), size: 20),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
              Text(value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ],
    );
  }
}