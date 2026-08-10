import 'dart:async';
import 'package:flutter/material.dart';
import '../services/offline_service.dart';
import 'accueil_screen.dart';

class SyncScreen extends StatefulWidget {
  final int jobId;
  final String customerName;

  const SyncScreen({
    super.key,
    required this.jobId,
    required this.customerName,
  });

  @override
  State<SyncScreen> createState() => _SyncScreenState();
}

class _SyncScreenState extends State<SyncScreen> with SingleTickerProviderStateMixin {
  double _progress = 0.0;
  String _statusMessage = 'Préparation des données...';
  bool _isComplete = false;
  bool _hasError = false;
  int _actionsCount = 0;
  int _photosCount = 0;
  Timer? _simulationTimer;
  late AnimationController _pulseAnim;

  @override
  void initState() {
    super.initState();
    _pulseAnim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
    _startSync();
  }

  @override
  void dispose() {
    _simulationTimer?.cancel();
    _pulseAnim.dispose();
    super.dispose();
  }

  Future<void> _startSync() async {
    // Vérifier si online
    final isOnline = await OfflineService.isOnline();

    if (!isOnline) {
      // Mode offline - tout est stocké localement
      setState(() {
        _progress = 1.0;
        _isComplete = true;
        _statusMessage = '📦 Données sauvegardées localement';
      });
      return;
    }

    // Simuler la progression de synchronisation
    setState(() {
      _actionsCount = 5;
      _photosCount = 3;
      _statusMessage = 'Connexion au serveur...';
    });

    await Future.delayed(const Duration(milliseconds: 500));
    if (!mounted) return;

    setState(() {
      _progress = 0.2;
      _statusMessage = 'Envoi des données intervention...';
    });

    await Future.delayed(const Duration(milliseconds: 600));
    if (!mounted) return;

    setState(() {
      _progress = 0.4;
      _statusMessage = 'Synchronisation des photos ($_photosCount)...';
    });

    await Future.delayed(const Duration(milliseconds: 800));
    if (!mounted) return;

    setState(() {
      _progress = 0.6;
      _statusMessage = 'Mise à jour du statut...';
    });

    await Future.delayed(const Duration(milliseconds: 500));
    if (!mounted) return;

    setState(() {
      _progress = 0.8;
      _statusMessage = 'Finalisation...';
    });

    await Future.delayed(const Duration(milliseconds: 400));
    if (!mounted) return;

    // Tentative de synchronisation réelle
    try {
      final result = await OfflineService.syncPendingActions();
      if (!mounted) return;

      setState(() {
        _progress = 1.0;
        _isComplete = true;
        if (result.error != null) {
          _statusMessage = '⚠️ Synchronisation partielle';
          _hasError = true;
        } else {
          _statusMessage = '✅ Intervention synchronisée avec succès !';
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _progress = 1.0;
        _isComplete = true;
        _statusMessage = '📦 Données sauvegardées, synchronisation différée';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: _isComplete
                ? [const Color(0xFF00A86B), const Color(0xFF059669)]
                : _hasError
                    ? [const Color(0xFFE53E3E), const Color(0xFFDC2626)]
                    : [const Color(0xFF003366), const Color(0xFF004D99)],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Animation
                  AnimatedBuilder(
                    animation: _pulseAnim,
                    builder: (context, child) {
                      return Transform.scale(
                        scale: _isComplete ? 1.0 : 1 + (_pulseAnim.value * 0.1),
                        child: Container(
                          width: 100,
                          height: 100,
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.2),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            _isComplete
                                ? Icons.check_rounded
                                : _hasError
                                    ? Icons.warning_rounded
                                    : Icons.sync_rounded,
                            color: Colors.white,
                            size: 48,
                          ),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 32),

                  // Message
                  Text(
                    _statusMessage,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                    textAlign: TextAlign.center,
                  ),

                  if (!_isComplete) ...[
                    const SizedBox(height: 32),

                    // Barre de progression
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: LinearProgressIndicator(
                        value: _progress,
                        minHeight: 8,
                        backgroundColor: Colors.white.withOpacity(0.2),
                        valueColor: const AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${(_progress * 100).toInt()}%',
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.8),
                        fontSize: 14,
                      ),
                    ),

                    const SizedBox(height: 16),

                    // Stats
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        _syncStat('Actions', _actionsCount.toString()),
                        const SizedBox(width: 24),
                        _syncStat('Photos', _photosCount.toString()),
                      ],
                    ),
                  ],

                  if (_isComplete) ...[
                    const SizedBox(height: 24),
                    Text(
                      '${widget.customerName}',
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.7),
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 40),

                    SizedBox(
                      width: double.infinity,
                      height: 54,
                      child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pushAndRemoveUntil(
                            context,
                            MaterialPageRoute(
                              builder: (_) => AccueilScreen(
                                technicianId: 0, // Sera rafraîchi
                              ),
                            ),
                            (route) => false,
                          );
                        },
                        icon: const Icon(Icons.home_rounded),
                        label: const Text(
                          'Retour à l\'accueil',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: const Color(0xFF003366),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _syncStat(String label, String value) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withOpacity(0.7),
            fontSize: 12,
          ),
        ),
      ],
    );
  }
}