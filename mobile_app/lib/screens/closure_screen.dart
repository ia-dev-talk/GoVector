import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/intervention_service.dart';
import '../services/offline_service.dart';
import '../services/location_service.dart';
import 'sync_screen.dart';
import 'accueil_screen.dart';

class ClosureScreen extends StatefulWidget {
  final int jobId;
  final String customerName;

  const ClosureScreen({
    super.key,
    required this.jobId,
    required this.customerName,
  });

  @override
  State<ClosureScreen> createState() => _ClosureScreenState();
}

class _ClosureScreenState extends State<ClosureScreen> {
  DateTime _startTime = DateTime.now().subtract(const Duration(minutes: 45));
  DateTime _endTime = DateTime.now();
  bool _isSubmitting = false;

  Duration get _tempsReel => _endTime.difference(_startTime);
  final Duration _tempsPrevu = const Duration(minutes: 60);

  String get _tempsReelStr => _formatDuration(_tempsReel);
  String get _tempsPrevuStr => _formatDuration(_tempsPrevu);

  String _ecartStr() {
    final ecart = _tempsReel - _tempsPrevu;
    if (ecart.isNegative) {
      return 'En avance de ${_formatDuration(ecart.abs())}';
    }
    return 'En retard de ${_formatDuration(ecart)}';
  }

  static String _formatDuration(Duration d) {
    final h = d.inHours.toString().padLeft(2, '0');
    final m = (d.inMinutes % 60).toString().padLeft(2, '0');
    return '${h}h$m';
  }

  Future<void> _submitClosure() async {
    setState(() => _isSubmitting = true);
    try {
      await InterventionService.terminateJob(
        jobId: widget.jobId,
        payload: {
          'real_duration_minutes': _tempsReel.inMinutes,
          'comment': 'Intervention terminée chez ${widget.customerName}',
        },
      );
      LocationService.stopLiveGps();
      await LocationService.updateLiveStatus('disponible');
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => SyncScreen(jobId: widget.jobId, customerName: widget.customerName),
        ),
      );
    } catch (e) {
      setState(() => _isSubmitting = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Clôture'),
        centerTitle: true,
      ),
      body: Column(
        children: [
          // En-tête succès
          Container(
            padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 20),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFF00A86B), Color(0xFF059669)],
              ),
            ),
            child: Column(
              children: [
                Container(
                  width: 72, height: 72,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.done_all_rounded, color: Colors.white, size: 40),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Intervention terminée',
                  style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Text(
                  widget.customerName,
                  style: TextStyle(color: Colors.white.withOpacity(0.9), fontSize: 15),
                ),
              ],
            ),
          ),

          // Contenu
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Temps
                _sectionCard(
                  Icons.timer_rounded,
                  'Temps',
                  [
                    _row('Temps réel', _tempsReelStr, const Color(0xFF3B82F6)),
                    _row('Temps prévu', _tempsPrevuStr, Colors.grey),
                    _row('Écart', _ecartStr(), const Color(0xFFF59E0B)),
                  ],
                ),
                const SizedBox(height: 12),

                // Résumé
                _sectionCard(
                  Icons.checklist_rounded,
                  'Résumé',
                  [
                    _row('Diagnostic', 'Complété ✓', const Color(0xFF00A86B)),
                    _row('Installation', '10 étapes ✓', const Color(0xFF00A86B)),
                    _row('Photos', '3+ photos ✓', const Color(0xFF00A86B)),
                    _row('Tests', '6 tests ✓', const Color(0xFF00A86B)),
                  ],
                ),
                const SizedBox(height: 12),

                // Matériel
                _sectionCard(
                  Icons.inventory_2_rounded,
                  'Matériel utilisé',
                  [
                    _row('PTO', '1x', Colors.grey),
                    _row('ONT', '1x', Colors.grey),
                    _row('Routeur', '1x', Colors.grey),
                    _row('Jarretière', '1x', Colors.grey),
                  ],
                ),
                const SizedBox(height: 12),

                // Historique
                _sectionCard(
                  Icons.history_rounded,
                  'Historique',
                  [
                    _row('Créée', '08:00', Colors.grey),
                    _row('En route', '08:15', const Color(0xFFF59E0B)),
                    _row('Arrivée', '08:35', const Color(0xFF14B8A6)),
                    _row('Début intervention', '08:40', const Color(0xFF003366)),
                    _row('Fin intervention', DateFormat('HH:mm').format(_endTime), const Color(0xFF00A86B)),
                  ],
                ),
              ],
            ),
          ),

          // Bouton
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton.icon(
                  onPressed: _isSubmitting ? null : _submitClosure,
                  icon: _isSubmitting
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.cloud_upload_rounded),
                  label: Text(
                    _isSubmitting ? 'Envoi en cours...' : '📤 Transmettre l\'intervention',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),
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

  Widget _sectionCard(IconData icon, String title, List<Widget> rows) {
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
              Icon(icon, size: 20, color: const Color(0xFF003366)),
              const SizedBox(width: 8),
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            ],
          ),
          const SizedBox(height: 12),
          ...rows,
        ],
      ),
    );
  }

  Widget _row(String label, String value, Color valueColor) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: TextStyle(fontSize: 13, color: Colors.grey[600])),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: valueColor,
            ),
          ),
        ],
      ),
    );
  }
}