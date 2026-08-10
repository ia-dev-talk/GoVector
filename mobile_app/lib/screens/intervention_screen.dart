import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:image_picker/image_picker.dart';

import '../features/interventions/completion_requirement_label.dart';
import '../services/intervention_service.dart';
import '../services/location_service.dart';
import '../services/ocr_service.dart';
import '../widgets/barcode_scanner_widget.dart';
import '../widgets/photo_button.dart';
import '../widgets/validation_requirement.dart';
import 'failure_screen.dart';
import 'postpone_screen.dart';

/// États du workflow métier — 8 étapes obligatoires
enum WorkflowStep {
  assigned('assigned', 'Assignée', Icons.assignment, 0),
  en_route('en_route', 'En route', Icons.directions_car, 1),
  arrived('arrived', 'Arrivé sur site', Icons.location_on, 2),
  in_progress('in_progress', 'En cours', Icons.build, 3),
  ftth_install('ftth_install', 'Installation FTTH', Icons.cable, 4),
  tests('tests', 'Tests', Icons.science, 5),
  validation('validation', 'Validation', Icons.verified, 6),
  completed('completed', 'Terminée', Icons.done_all, 7);

  final String status;
  final String label;
  final IconData icon;
  final int step;

  const WorkflowStep(this.status, this.label, this.icon, this.step);

  static WorkflowStep fromStatus(String status) {
    return WorkflowStep.values.firstWhere(
      (s) => s.status == status,
      orElse: () => WorkflowStep.assigned,
    );
  }

  bool get isTerminal => this == WorkflowStep.completed;
}

class InterventionScreen extends StatefulWidget {
  final int technicianId;
  final Map<String, dynamic> intervention;

  const InterventionScreen({
    super.key,
    required this.technicianId,
    required this.intervention,
  });

  @override
  State<InterventionScreen> createState() => _InterventionScreenState();
}

class _InterventionScreenState extends State<InterventionScreen> {
  final _formKey = GlobalKey<FormState>();
  bool isLoading = false;
  bool isTerminated = false;
  String wifiBoxSerial = '';

  // Statut courant
  String _currentStatus = '';

  // Chronomètre
  DateTime? _departureTime;
  DateTime? _arrivalTime;
  DateTime? _workStartTime;
  DateTime? _workEndTime;
  Duration _travelDuration = Duration.zero;
  Duration _workDuration = Duration.zero;
  Duration _pauseDuration = Duration.zero;
  bool _isPaused = false;
  DateTime? _pauseStart;
  Timer? _timer;
  String _pauseReason = '';

  // Champs terrain
  final _commentController = TextEditingController();
  String? _beforePhotoPath;
  String? _afterPhotoPath;
  String? _armoirePhotoPath;
  String? _ptoPhotoPath;
  String? _ontPhotoPath;
  String? _cablingPhotoPath;
  String? _incidentPhotoPath;
  String _ontSerial = '';
  String _routerSerial = '';
  String _macAddress = '';
  String _ptoNumber = '';
  String _nroValue = '';
  String _sroValue = '';
  String _pboValue = '';
  String _splitterValue = '';
  String _splitterPortValue = '';
  String _opticalPower = '';
  String _cableLength = '';

  // GPS
  double? _gpsLatitude;
  double? _gpsLongitude;
  double? _gpsAccuracy;
  bool _isGettingGps = false;

  // Étapes validées (pour UI uniquement)
  final Set<String> _completedSteps = {};
  Set<String>? _requiredFieldKeys;

  // Stock embarqué
  List<Map<String,dynamic>> _jobStock = [];

  bool _jobStockLoading = false;


  WorkflowStep get _currentStep => WorkflowStep.fromStatus(_currentStatus);

  @override
  void initState() {
    super.initState();
    _currentStatus = widget.intervention['status']?.toString() ?? 'assigned';
    _loadCompletedSteps();
    _loadCompletionRequirements();
    _loadJobStock();
    _startAutoRefresh();
  }

  Future<void> _loadCompletedSteps() async {
    try {
      final jobId = widget.intervention['id'] ?? widget.intervention['job_id'];
      if (jobId != null) {
        final activity = await InterventionService.getActivityLog(jobId: jobId);
        for (final entry in activity) {
          final status = entry['new_status']?.toString();
          if (status != null && mounted) {
            setState(() => _completedSteps.add(status));
          }
        }
      }
    } catch (_) {
      // Silencieux
    }
  }

  Future<void> _loadCompletionRequirements() async {
    final jobId = widget.intervention['id'] ?? widget.intervention['job_id'];
    if (jobId == null) return;
    try {
      final response = await InterventionService.getCompletionRequirements(
        jobId: jobId,
      );
      final keys = (response['required_field_keys'] as List<dynamic>? ?? const [])
          .map((value) => value.toString())
          .toSet();
      if (mounted) setState(() => _requiredFieldKeys = keys);
    } catch (_) {
      if (mounted) setState(() => _requiredFieldKeys = null);
    }
  }

  bool _isRequired(String key) => _requiredFieldKeys?.contains(key) == true;

  Future<void> _loadJobStock() async {
    final jobId = widget.intervention['id'] ?? widget.intervention['job_id'];
    if (jobId == null) return;
    setState(() => _jobStockLoading = true);
    try {
      final stock = await InterventionService.getJobStock(
  jobId: jobId,
);
      if (mounted) setState(() => _jobStock = stock);
    } catch (_) {
      // Silencieux
    } finally {
      if (mounted) setState(() => _jobStockLoading = false);
    }
  }

  void _startAutoRefresh() {
    if (_departureTime != null && !isTerminated) {
      _timer?.cancel();
      _timer = Timer.periodic(const Duration(seconds: 10), (_) {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _commentController.dispose();
    _timer?.cancel();
    super.dispose();
  }



  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  Duration get _elapsedSinceDeparture {
    if (_departureTime == null) return Duration.zero;
    return DateTime.now().difference(_departureTime!);
  }

  String _formatDuration(Duration d) {
    final h = d.inHours.toString().padLeft(2, '0');
    final m = (d.inMinutes % 60).toString().padLeft(2, '0');
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$h:$m:$s';
  }

  String _getTotalDuration() {
    final total = _elapsedSinceDeparture - _pauseDuration;
    if (total.isNegative) return '00:00:00';
    return _formatDuration(total);
  }

  void _updateStatus(String newStatus) {
    setState(() {
      _currentStatus = newStatus;
      _completedSteps.add(newStatus);
    });
  }

  // --- NAVIGATION ---
  Future<void> _openNavigation() async {
    final job = widget.intervention;
    final lat = (job['latitude'] ?? job['gps_latitude']) as double?;
    final lon = (job['longitude'] ?? job['gps_longitude']) as double?;
    final address = job['service_address'] as String?;

    if (lat != null && lon != null) {
      await LocationService.openNavigation(
        latitude: lat,
        longitude: lon,
        label: address,
      );
    } else if (address != null && address.isNotEmpty) {
      await LocationService.openNavigationByAddress(address);
    } else {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Coordonnées GPS non disponibles')),
      );
    }
  }

  // --- GPS ---
  Future<void> _getCurrentLocation() async {
    setState(() => _isGettingGps = true);
    try {
      final position = await LocationService.getCurrentPosition();
      if (position != null && mounted) {
        setState(() {
          _gpsLatitude = position.latitude;
          _gpsLongitude = position.longitude;
          _gpsAccuracy = position.accuracy;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('📍 ${position.latitude.toStringAsFixed(6)}, ${position.longitude.toStringAsFixed(6)}'),
            backgroundColor: Colors.green,
          ),
        );
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Impossible d\'obtenir la position'), backgroundColor: Colors.orange),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur GPS: $e')));
      }
    } finally {
      if (mounted) setState(() => _isGettingGps = false);
    }
  }

  // --- PHOTOS ---
  Future<void> _takePhoto(String type) async {
    final picker = ImagePicker();
    final XFile? photo = await picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
    );
    if (photo != null && mounted) {
      setState(() {
        switch (type) {
          case 'before': _beforePhotoPath = photo.path; break;
          case 'after': _afterPhotoPath = photo.path; break;
          case 'armoire': _armoirePhotoPath = photo.path; break;
          case 'pto': _ptoPhotoPath = photo.path; break;
          case 'ont': _ontPhotoPath = photo.path; break;
          case 'cabling': _cablingPhotoPath = photo.path; break;
          case 'incident': _incidentPhotoPath = photo.path; break;
        }
      });
    }
  }

  // --- SCAN SN ROUTEUR ---
  Future<void> _scanRouterSerial() async {
    try {
      final picker = ImagePicker();
      final XFile? photo = await picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
        preferredCameraDevice: CameraDevice.rear,
      );
      if (photo == null) return;
      if (!mounted) return;

      final imageFile = File(photo.path);
      final result = await OCRService.scanRouterSerial(imageFile);

      if (result != null && result['serial_number'] != null) {
        setState(() => wifiBoxSerial = result['serial_number']);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('SN détecté: ${result['serial_number']}'), backgroundColor: Colors.green),
          );
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Numéro non détecté'), backgroundColor: Colors.orange),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur: $e'), backgroundColor: Theme.of(context).colorScheme.error),
        );
      }
    }
  }

  // --- TRANSITIONS DE STATUT ---
  Future<bool> _transitionTo(String newStatus, {String? comment}) async {
    final jobId = widget.intervention['id'] ?? widget.intervention['job_id'];
    if (jobId == null) return false;

    setState(() => isLoading = true);

    try {
      await InterventionService.updateStatus(
        jobId: jobId,
        newStatus: newStatus,
        latitude: _gpsLatitude,
        longitude: _gpsLongitude,
        comment: comment,
      );

 // GPS Live
      if (newStatus == 'en_route') {
        LocationService.startLiveGps(jobId: jobId, intervalSeconds: 15);
        if (_gpsLatitude != null && _gpsLongitude != null) {
          await LocationService.updateLiveStatus(
            'en_intervention',
            latitude: _gpsLatitude,
            longitude: _gpsLongitude,
            jobId: jobId,
          );
        }
      } else if (newStatus == 'completed' || newStatus == 'failed' || newStatus == 'client_absent') {
        LocationService.stopLiveGps();
        await LocationService.updateLiveStatus('disponible');
      }

      if (!mounted) return false;
      setState(() => _currentStatus = newStatus);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('✅ ${_getStatusLabel(newStatus)}'), backgroundColor: Colors.green),
      );
      return true;
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur: $e')));
      }
      return false;
    } finally {
      if (mounted) setState(() => isLoading = false);
    }
  }

  Future<void> _startIntervention() async {
    final jobId = widget.intervention['id'] ?? widget.intervention['job_id'];
    if (jobId == null) return;

    setState(() => isLoading = true);
    try {
      if (_gpsLatitude == null) {
        final position = await LocationService.getCurrentPosition();
        if (position != null) {
          _gpsLatitude = position.latitude;
          _gpsLongitude = position.longitude;
        }
      }

      await InterventionService.startJob(
        jobId: jobId,
        latitude: _gpsLatitude,
        longitude: _gpsLongitude,
        comment: 'Départ vers le client',
      );

      LocationService.startLiveGps(jobId: jobId, intervalSeconds: 15);
      if (_gpsLatitude != null && _gpsLongitude != null) {
        await LocationService.updateLiveStatus('en_intervention', latitude: _gpsLatitude, longitude: _gpsLongitude, jobId: jobId);
      }

      if (!mounted) return;
      setState(() {
        _departureTime = DateTime.now();
        _currentStatus = 'en_route';
      });
      _startAutoRefresh();

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('🚗 En route vers le client'), backgroundColor: Colors.green),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur: $e')));
      }
    } finally {
      if (mounted) setState(() => isLoading = false);
    }
  }

Future<void> _arriveOnSite() async {
    final success = await _transitionTo('on_site');
    if (success && mounted) {
      setState(() {
        _arrivalTime = DateTime.now();
        _travelDuration = _arrivalTime!.difference(_departureTime ?? _arrivalTime!);
        _workStartTime = DateTime.now();
      });
    }
  }


  Future<void> _pauseWork() async {
    if (_isPaused) return;
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => _PauseReasonDialog(),
    );
    if (reason == null) return;

    setState(() {
      _isPaused = true;
      _pauseStart = DateTime.now();
      _pauseReason = reason;
    });
  }

  Future<void> _resumeWork() async {
    if (!_isPaused || _pauseStart == null) return;
    setState(() {
      _pauseDuration += DateTime.now().difference(_pauseStart!);
      _isPaused = false;
      _pauseStart = null;
      _pauseReason = '';
    });
  }

  Future<void> _completeWork() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Terminer l\'intervention'),
        content: const Text('Confirmer la fin de l\'intervention ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), style: TextButton.styleFrom(foregroundColor: Colors.green), child: const Text('Terminer')),
        ],
      ),
    );
    if (confirm != true) return;

    final jobId = widget.intervention['id'] ?? widget.intervention['job_id'];
    if (jobId == null) return;

    setState(() {
      isLoading = true;
      _workEndTime = DateTime.now();
      _workDuration = _workEndTime!.difference(_workStartTime ?? _workEndTime!) - _pauseDuration;
    });

    try {
      final payload = {
        'wifi_box_serial': wifiBoxSerial.isEmpty ? null : wifiBoxSerial,
        'comment': _commentController.text.isEmpty ? null : _commentController.text,
        'pto': _ptoNumber.isEmpty ? null : _ptoNumber,
        'ont_serial': _ontSerial.isEmpty ? null : _ontSerial,
        'router_serial': _routerSerial.isEmpty ? null : _routerSerial,
        'mac_address': _macAddress.isEmpty ? null : _macAddress,
        'nro': _nroValue.isEmpty ? null : _nroValue,
        'sro': _sroValue.isEmpty ? null : _sroValue,
        'pbo': _pboValue.isEmpty ? null : _pboValue,
        'splitter': _splitterValue.isEmpty ? null : _splitterValue,
        'splitter_port': _splitterPortValue.isEmpty ? null : int.tryParse(_splitterPortValue),
        'optical_power_dbm': _opticalPower.isEmpty ? null : double.tryParse(_opticalPower),
        'cable_length_m': _cableLength.isEmpty ? null : int.tryParse(_cableLength),
        'gps_latitude': _gpsLatitude,
        'gps_longitude': _gpsLongitude,
        'real_duration_minutes': _workDuration.inMinutes,
      };

      await InterventionService.terminateJob(jobId: jobId, payload: payload);

      LocationService.stopLiveGps();
      await LocationService.updateLiveStatus('disponible');

      if (!mounted) return;
      setState(() {
        isLoading = false;
        isTerminated = true;
        _currentStatus = 'completed';
        _timer?.cancel();
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur: $e')));
        setState(() => isLoading = false);
      }
    }
  }

  // --- GESTION ÉCHEC / REPORT ---
  Future<void> _openFailureScreen() async {
    final jobId = widget.intervention['id'] ?? widget.intervention['job_id'];
    if (jobId == null) return;

    final result = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => FailureScreen(jobId: jobId)),
    );

    if (result == true && mounted) {
      Navigator.pop(context);
    }
  }

  Future<void> _openPostponeScreen() async {
    final jobId = widget.intervention['id'] ?? widget.intervention['job_id'];
    if (jobId == null) return;

    final result = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => PostponeScreen(jobId: jobId)),
    );

    if (result == true && mounted) {
      Navigator.pop(context);
    }
  }

  // --- VALIDATION ---
  List<ValidationRequirement> _getRequirements() {
    return [
      ValidationRequirement(
        id: 'started',
        label: 'Départ effectué',
        isRequired: false,
        isSatisfied: _completedSteps.contains('en_route'),
        type: ValidationRequirementType.gps,
      ),
      ValidationRequirement(
        id: 'arrived',
        label: 'Arrivé sur site',
        isRequired: false,
        isSatisfied:
            _completedSteps.contains('arrived') ||
            _completedSteps.contains('in_progress'),
        type: ValidationRequirementType.gps,
      ),
      ValidationRequirement(
        id: 'gps',
        label: 'Position GPS',
        isRequired: _isRequired('gps'),
        isSatisfied: _gpsLatitude != null,
        type: ValidationRequirementType.gps,
      ),
      ValidationRequirement(
        id: 'pto',
        label: 'Numéro PTO',
        isRequired: _isRequired('pto'),
        isSatisfied: _ptoNumber.trim().isNotEmpty,
        type: ValidationRequirementType.fieldData,
      ),
      ValidationRequirement(
        id: 'ont_serial',
        label: 'N° série ONT',
        isRequired: _isRequired('ont_serial'),
        isSatisfied: _ontSerial.trim().isNotEmpty,
        type: ValidationRequirementType.serial,
      ),
      ValidationRequirement(
        id: 'router_serial',
        label: 'N° série routeur/WiFi',
        isRequired: _isRequired('router_serial'),
        isSatisfied:
            wifiBoxSerial.trim().isNotEmpty || _routerSerial.trim().isNotEmpty,
        type: ValidationRequirementType.serial,
      ),
      ValidationRequirement(
        id: 'mac_address',
        label: 'Adresse MAC',
        isRequired: _isRequired('mac_address'),
        isSatisfied: _macAddress.trim().isNotEmpty,
        type: ValidationRequirementType.fieldData,
      ),
      ValidationRequirement(
        id: 'optical_power_dbm',
        label: 'Puissance optique',
        isRequired: _isRequired('optical_power_dbm'),
        isSatisfied: _opticalPower.isNotEmpty,
        type: ValidationRequirementType.fieldData,
      ),
      ValidationRequirement(
        id: 'cable_length_m',
        label: 'Longueur de câble',
        isRequired: _isRequired('cable_length_m'),
        isSatisfied: _cableLength.isNotEmpty,
        type: ValidationRequirementType.fieldData,
      ),
      ValidationRequirement(
        id: 'client_signature',
        label: 'Signature client',
        isRequired: _isRequired('client_signature'),
        isSatisfied:
            widget.intervention['client_signature']?.toString().isNotEmpty ==
            true,
        type: ValidationRequirementType.fieldData,
      ),
      ValidationRequirement(
        id: 'photo_before',
        label: 'Photo avant',
        isRequired: _isRequired('photos'),
        isSatisfied: _beforePhotoPath != null,
        type: ValidationRequirementType.photo,
      ),
      ValidationRequirement(
        id: 'photo_after',
        label: 'Photo après',
        isRequired: _isRequired('photos'),
        isSatisfied: _afterPhotoPath != null,
        type: ValidationRequirementType.photo,
      ),
      ValidationRequirement(
        id: 'comment',
        label: 'Commentaire',
        isRequired: _isRequired('comment'),
        isSatisfied: _commentController.text.trim().isNotEmpty,
        type: ValidationRequirementType.comment,
      ),
    ];
  }

  List<ValidationRequirement> _getMissingRequirements() {
    return _getRequirements().where((r) => r.isRequired && !r.isSatisfied).toList();
  }

  void _showValidationErrors(List<ValidationRequirement> missing) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Validation'),
        icon: const Icon(Icons.error_outline, color: Colors.red, size: 48),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Avant de terminer, veuillez compléter :'),
            const SizedBox(height: 12),
            ...missing.map((r) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Icon(Icons.close, color: Colors.red.shade400, size: 20),
                  const SizedBox(width: 8),
                  Expanded(child: Text(r.label, style: const TextStyle(fontSize: 14))),
                ],
              ),
            )),
          ],
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Compris'))],
      ),
    );
  }

  // --- LABELS ---
  String _getStatusLabel(String status) {
    switch (status) {
      case 'assigned': return 'Assignée';
      case 'accepted': return 'Acceptée';
      case 'en_route': return 'En route';
      case 'arrived': return 'Arrivé';
      case 'in_progress': return 'En cours';
      case 'completed': return 'Terminée';
      case 'cancelled': return 'Annulée';
      case 'failed': return 'Échec';
      case 'client_absent': return 'Client absent';
      case 'blocked': return 'Bloquée';
      default: return status.replaceAll('_', ' ');
    }
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'completed': return Colors.green;
      case 'in_progress': case 'en_route': return Colors.blue;
      case 'failed': case 'client_absent': return Colors.red;
      case 'cancelled': return Colors.grey;
      default: return Theme.of(context).colorScheme.primary;
    }
  }

  // --- BUILD ---
  @override
  Widget build(BuildContext context) {
    final job = widget.intervention;
    final jobId = job['id'] ?? job['job_id'];
    final lat = job['latitude'] ?? job['gps_latitude'];
    final lon = job['longitude'] ?? job['gps_longitude'];
    final hasLocation = lat != null && lon != null;
    final isTerminal = _currentStatus == 'completed' || _currentStatus == 'cancelled' || _currentStatus == 'failed' || _currentStatus == 'client_absent';
    final showWorkflow = !isTerminal && !isTerminated;

    return Scaffold(
      appBar: AppBar(
        title: Text('Intervention #${jobId ?? ''}'),
        actions: [
          if (showWorkflow && !isLoading) ...[
            IconButton(
              icon: _isGettingGps
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Icon(_gpsLatitude != null ? Icons.my_location : Icons.location_disabled),
              tooltip: 'GPS',
              onPressed: _isGettingGps ? null : _getCurrentLocation,
            ),
            if (hasLocation)
              IconButton(
                icon: const Icon(Icons.navigation),
                tooltip: 'S\'y rendre',
                onPressed: _openNavigation,
              ),
            IconButton(
              icon: const Icon(Icons.qr_code_scanner),
              tooltip: 'Scanner SN',
              onPressed: () async {
                final code = await Navigator.push<String>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => BarcodeScannerWidget(onScanned: (value) => value),
                  ),
                );
                if (code != null && mounted) {
                  setState(() => wifiBoxSerial = code);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('SN: $code')),
                  );
                }
              },
            ),
          ],
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // === TIMELINE ===
            if (showWorkflow) _buildTimelineCard(),

            const SizedBox(height: 12),

            // === CARTE CLIENT ===
            _buildClientCard(job, hasLocation: hasLocation, showWorkflow: showWorkflow),

            const SizedBox(height: 12),

            // === CHRONOMÈTRE ===
            if (_departureTime != null && !isTerminated) _buildTimerCard(),

            const SizedBox(height: 12),

            // === BOUTONS D'ACTION ===
            if (showWorkflow) _buildActionButtons(),

            if (showWorkflow) const SizedBox(height: 12),

             // === STOCK EMBARQUÉ ===
            if (showWorkflow) _buildStockCard(),

            // === DONNÉES TERRAIN ===
            if (showWorkflow) _buildFieldDataSection(),

            // === ÉTAT TERMINÉ ===
            if (isTerminated) _buildSuccessState(),

            // === ÉTATS TERMINAUX ===
            if (isTerminal) _buildTerminalState(),
          ],
        ),
      ),
    );
  }

  Widget _buildTimelineCard() {
    final steps = WorkflowStep.values;
    final currentIdx = _currentStep.step;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.timeline, size: 20, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 8),
                Text('Progression', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: List.generate(steps.length, (index) {
                final isCompleted = currentIdx > index;
                final isCurrent = currentIdx == index;
                return Expanded(
                  child: _buildStepIndicator(
                    index: index,
                    total: steps.length,
                    label: steps[index].label,
                    icon: steps[index].icon,
                    isCompleted: isCompleted,
                    isCurrent: isCurrent,
                  ),
                );
              }),
            ),
            if (currentIdx >= 3) ...[
              const SizedBox(height: 8),
              Text(
                _currentStep.label,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildStepIndicator({
    required int index,
    required int total,
    required String label,
    required IconData icon,
    required bool isCompleted,
    required bool isCurrent,
  }) {
    final color = isCompleted
        ? Colors.green
        : isCurrent
            ? Theme.of(context).colorScheme.primary
            : Colors.grey.shade300;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            if (index > 0)
              Expanded(
                child: Container(
                  height: 2,
                  color: isCompleted ? Colors.green : Colors.grey.shade300,
                ),
              ),
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: isCompleted || isCurrent ? color : Colors.transparent,
                shape: BoxShape.circle,
                border: Border.all(color: color, width: 2),
              ),
              child: isCompleted
                  ? const Icon(Icons.check, color: Colors.white, size: 16)
                  : Icon(icon, color: color, size: 16),
            ),
            if (index < total - 1)
              Expanded(
                child: Container(
                  height: 2,
                  color: isCompleted ? Colors.green : Colors.grey.shade300,
                ),
              ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(
            fontSize: 9,
            color: isCompleted || isCurrent ? color : Colors.grey,
            fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
          ),
          textAlign: TextAlign.center,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }

  Widget _buildClientCard(Map<String, dynamic> job, {bool hasLocation = false, bool showWorkflow = false}) {
    final phone = job['customer_phone']?.toString() ?? '';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                  child: Icon(Icons.person, color: Theme.of(context).colorScheme.onPrimaryContainer),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        job['customer_name'] ?? 'Client',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                      ),
                      if (job['operator'] != null)
                        Text(job['operator'], style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        )),
                    ],
                  ),
                ),
                if (_currentStatus == 'en_route' || _currentStatus == 'in_progress')
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: _getStatusColor(_currentStatus).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      _getStatusLabel(_currentStatus),
                      style: TextStyle(fontSize: 11, color: _getStatusColor(_currentStatus), fontWeight: FontWeight.w600),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            if (job['service_address'] != null)
              _infoRow(Icons.location_on, job['service_address']),
            if (phone.isNotEmpty) ...[
              const SizedBox(height: 4),
              Row(
                children: [
                  Expanded(child: _infoRow(Icons.phone, phone)),
                  if (phone.isNotEmpty) ...[
                    IconButton(
                      icon: const Icon(Icons.phone_in_talk, size: 20),
                      tooltip: 'Appeler',
                      onPressed: () => LocationService.openNavigationByAddress('tel:$phone'),
                    ),
                    IconButton(
                      icon: const Icon(Icons.copy, size: 20),
                      tooltip: 'Copier',
                      onPressed: () {
                        // Copier dans le presse-papier
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Numéro copié')),
                        );
                      },
                    ),
                  ],
                ],
              ),
            ],
            if (job['time_slot_start'] != null && job['time_slot_end'] != null) ...[
              const SizedBox(height: 4),
              _infoRow(Icons.schedule, '${job['time_slot_start']} - ${job['time_slot_end']}'),
            ],
            if (job['priority'] != null)
              _infoRow(Icons.flag, job['priority']?.toString() ?? ''),
            if (hasLocation && showWorkflow) ...[
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _openNavigation,
                  icon: const Icon(Icons.directions_car),
                  label: const Text('Ouvrir dans Google Maps'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _infoRow(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Icon(icon, size: 16, color: Theme.of(context).colorScheme.onSurfaceVariant),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: Theme.of(context).textTheme.bodySmall)),
        ],
      ),
    );
  }

  Widget _buildTimerCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.timer, size: 20, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 8),
                Text('Chronométrage', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                const Spacer(),
                if (_isPaused)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(color: Colors.orange, borderRadius: BorderRadius.circular(8)),
                    child: const Text('PAUSÉ', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _timerItem('Départ', _departureTime != null ? DateFormat('HH:mm').format(_departureTime!) : '--:--'),
                const SizedBox(width: 8),
                _timerItem('Arrivée', _arrivalTime != null ? DateFormat('HH:mm').format(_arrivalTime!) : '--:--'),
                const SizedBox(width: 8),
                _timerItem('Total', _getTotalDuration()),
              ],
            ),
            if (_pauseDuration.inSeconds > 0) ...[
              const SizedBox(height: 8),
              Text('Pause: ${_formatDuration(_pauseDuration)}', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.orange)),
              if (_pauseReason.isNotEmpty)
                Text('Motif: $_pauseReason', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey)),
            ],
            if (_workDuration.inSeconds > 0) ...[
              const SizedBox(height: 4),
              Text('Travail: ${_formatDuration(_workDuration)}', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.green)),
            ],
          ],
        ),
      ),
    );
  }

    Widget _buildStockCard() {
    if (_jobStockLoading) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }

    if (_jobStock == null || _jobStock == null || (_jobStock as List).isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text('Aucun stock embarqué', style: TextStyle(color: Colors.grey)),
        ),
      );
    }

final stock = _jobStock;

// Comptage automatique par type
final Map<String, int> counts = {};

for (final item in stock) {
  final type = (item['type'] ?? 'Autre').toString();
  final qty = (item['available_quantity'] ?? item['quantity'] ?? 0) as int;

  counts[type] = (counts[type] ?? 0) + qty;
}

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.inventory_2, size: 20, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 8),
                Text('Stock embarqué', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 12),
            if (counts.isNotEmpty)
              Row(
                children: counts.entries.map((e) => Expanded(
                  child: Container(
                    padding: EdgeInsets.all(8),
                    margin: EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primaryContainer,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      children: [
                        Text('${e.value}', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Theme.of(context).colorScheme.primary)),
                       Text(
  e.key.toString(),
  textAlign: TextAlign.center,
  style: const TextStyle(
    fontSize: 10,
    color: Colors.grey,
  ),
),
                      ],
                    ),
                  ),
                )).toList(),
              ),
            const SizedBox(height: 12),
            ...stock.map((item) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Expanded(child: Text(item['label'] ?? item['reference'] ?? 'Article', style: TextStyle(fontSize: 12))),
                  Container(
                    padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: (item['available_quantity'] ?? 0) <= 2 ? Colors.orange.shade100 : Colors.green.shade50,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      'Dispo: ${item['available_quantity'] ?? 0} / ${item['quantity'] ?? 0}',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            )),
            const SizedBox(height: 8),
            ElevatedButton.icon(
              onPressed: () => _showConsumeDialog(stock),
              icon: Icon(Icons.remove_circle_outline, size: 18),
              label: Text('Consommer du matériel'),
              style: ElevatedButton.styleFrom(minimumSize: Size(double.infinity, 36)),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _showConsumeDialog(List<dynamic> stockItems) async {
if (stockItems.isEmpty) {
  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(
      content: Text('Aucun matériel disponible'),
    ),
  );
  return;
}

final availableItems = stockItems.where(
  (item) => (item['available_quantity'] ?? 0) > 0,
).toList();

if (availableItems.isEmpty) {
  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(
      content: Text('Aucun matériel disponible'),
    ),
  );
  return;
}

final selectedItem = availableItems.first;

    if (selectedItem == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Aucun matériel disponible'), backgroundColor: Colors.orange),
      );
      return;
    }

    final qtyController = TextEditingController(text: '1');
    final serialController = TextEditingController();

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Consommer ${selectedItem['label'] ?? selectedItem['reference']}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: qtyController,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: 'Quantité', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: serialController,
              decoration: InputDecoration(labelText: 'N° de série (optionnel)', border: OutlineInputBorder()),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text('Annuler')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), style: TextButton.styleFrom(foregroundColor: Colors.green), child: Text('Consommer')),
        ],
      ),
    );

    if (result != true) return;

    final jobId = widget.intervention['id'] ?? widget.intervention['job_id'];
    if (jobId == null) return;

    try {
      await InterventionService.consumeJobStock(
      jobId: jobId,
      items: [
          {
            'item_id': selectedItem['item_id'] ?? selectedItem['id'],
            'quantity': int.tryParse(qtyController.text) ?? 1,
            if (serialController.text.isNotEmpty) 'serial_number': serialController.text,
          }
        ],
      );
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('✅ Consommation enregistrée'), backgroundColor: Colors.green),
      );
      _loadJobStock();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erreur: $e'), backgroundColor: Colors.red),
      );
    }
  }


  Widget _timerItem(String label, String value) {
    return Expanded(
      child: Column(
        children: [
          Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Theme.of(context).colorScheme.primary)),
          Text(label, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }

  Widget _buildActionButtons() {
    if (isLoading) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }

    Widget? actionButton;
    switch (_currentStatus) {
      case 'assigned':
      case 'accepted':
        actionButton = ElevatedButton.icon(
          onPressed: _startIntervention,
          icon: Icon(Icons.check_circle),
          label: Text('✅ Accepter & Démarrer'),
          style: ElevatedButton.styleFrom(minimumSize: Size(double.infinity, 52), backgroundColor: Colors.green.shade700),
        );
        break;
      case 'en_route':
        actionButton = ElevatedButton.icon(
          onPressed: _arriveOnSite,
          icon: Icon(Icons.location_on),
          label: Text('📍 Arrivé sur site'),
          style: ElevatedButton.styleFrom(minimumSize: Size(double.infinity, 52), backgroundColor: Colors.blue.shade700),
        );
        break;
      case 'on_site':
        actionButton = ElevatedButton.icon(
          onPressed: () => _transitionTo('in_progress'),
          icon: Icon(Icons.build),
          label: Text('🔧 Début travaux'),
          style: ElevatedButton.styleFrom(minimumSize: Size(double.infinity, 52), backgroundColor: Colors.orange.shade700),
        );
        break;
      case 'in_progress':
        actionButton = ElevatedButton.icon(
          onPressed: () => _transitionTo('installation_done'),
          icon: Icon(Icons.cable),
          label: Text('📦 Installation terminée'),
          style: ElevatedButton.styleFrom(minimumSize: Size(double.infinity, 52), backgroundColor: Colors.purple.shade700),
        );
        break;
      case 'installation_done':
        actionButton = ElevatedButton.icon(
          onPressed: () => _transitionTo('client_validation'),
          icon: Icon(Icons.verified),
          label: Text('✍️ Validation client'),
          style: ElevatedButton.styleFrom(minimumSize: Size(double.infinity, 52), backgroundColor: Colors.teal.shade700),
        );
        break;
      case 'client_validation':
        actionButton = ElevatedButton.icon(
          onPressed: _completeWork,
          icon: Icon(Icons.done_all),
          label: Text('🎉 Clôturer'),
          style: ElevatedButton.styleFrom(minimumSize: Size(double.infinity, 52), backgroundColor: Colors.green.shade700),
        );
        break;
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            if (actionButton != null) actionButton,
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _openFailureScreen(),
                    icon: Icon(Icons.error_outline, size: 18),
                    label: Text('Échec'),
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _openPostponeScreen,
                    icon: Icon(Icons.schedule, size: 18),
                    label: Text('Reporter'),
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.orange),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }


  Widget _buildPauseResumeButtons() {
    if (_isPaused) {
      return SizedBox(
        width: double.infinity,
        height: 48,
        child: ElevatedButton.icon(
          onPressed: isLoading ? null : _resumeWork,
          icon: const Icon(Icons.play_arrow),
          label: Text('Reprendre (motif: $_pauseReason)'),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.green.shade600,
            foregroundColor: Colors.white,
          ),
        ),
      );
    }
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: OutlinedButton.icon(
        onPressed: isLoading ? null : _pauseWork,
        icon: const Icon(Icons.pause, color: Colors.orange),
        label: const Text('Mettre en pause', style: TextStyle(color: Colors.orange)),
        style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.orange)),
      ),
    );
  }

  Widget _buildFieldDataSection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.checklist, size: 20, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 8),
                Text('Données terrain', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                const Spacer(),
                if (_requiredFieldKeys == null)
                  const Text(
                    'Exigences indisponibles',
                    style: TextStyle(fontSize: 11, color: Colors.orange),
                  )
                else if (_getMissingRequirements().isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.red.shade200),
                    ),
                    child: Text(
                      '${_getMissingRequirements().length} requis',
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.red.shade700,
                      ),
                    ),
                  )
                else
                  const Text(
                    'Champs facultatifs',
                    style: TextStyle(fontSize: 11, color: Colors.green),
                  ),
              ],
            ),
            const SizedBox(height: 16),

            // Commentaire
            TextField(
              controller: _commentController,
              maxLines: 2,
              decoration: InputDecoration(
                labelText: 'Commentaire',
                hintText: 'Résultat de l\'intervention...',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                filled: true,
              ),
            ),
            const SizedBox(height: 12),

            // PTO
            TextFormField(
              initialValue: _ptoNumber,
              decoration: InputDecoration(
                labelText: completionRequirementLabel(
                  label: 'Numéro PTO',
                  fieldKey: 'pto',
                  requiredFieldKeys: _requiredFieldKeys,
                ),
                hintText: 'PTO...',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                filled: true,
              ),
              onChanged: (v) => _ptoNumber = v,
            ),
            const SizedBox(height: 8),

            // ONT + MAC
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    initialValue: _ontSerial,
                    decoration: InputDecoration(
                      labelText: completionRequirementLabel(
                        label: 'N° ONT',
                        fieldKey: 'ont_serial',
                        requiredFieldKeys: _requiredFieldKeys,
                      ),
                      hintText: 'SN ONT...',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      filled: true,
                    ),
                    onChanged: (v) => _ontSerial = v,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextFormField(
                    initialValue: _macAddress,
                    decoration: InputDecoration(
                      labelText: completionRequirementLabel(
                        label: 'MAC',
                        fieldKey: 'mac_address',
                        requiredFieldKeys: _requiredFieldKeys,
                      ),
                      hintText: 'XX:XX:XX:XX:XX:XX',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      filled: true,
                    ),
                    onChanged: (v) => _macAddress = v,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // SN Routeur / WiFi
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    initialValue: wifiBoxSerial,
                    decoration: InputDecoration(
                      labelText: completionRequirementLabel(
                        label: 'SN Routeur/WiFi',
                        fieldKey: 'router_serial',
                        requiredFieldKeys: _requiredFieldKeys,
                      ),
                      hintText: 'Scanner ou saisir',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      filled: true,
                      suffixIcon: IconButton(
                        icon: const Icon(Icons.camera_alt, size: 20),
                        onPressed: _scanRouterSerial,
                      ),
                    ),
                    onChanged: (v) => wifiBoxSerial = v,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Puissance optique + câble
            Row(
              children: [
                Expanded(
                  child: TextField(
                    decoration: InputDecoration(
                      labelText: 'Puiss. optique (dBm)',
                      hintText: 'Ex: -18.5',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      filled: true,
                    ),
                    keyboardType: TextInputType.number,
                    onChanged: (v) => _opticalPower = v,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    decoration: InputDecoration(
                      labelText: 'Câble (m)',
                      hintText: 'Ex: 50',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      filled: true,
                    ),
                    keyboardType: TextInputType.number,
                    onChanged: (v) => _cableLength = v,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Données réseau FTTH
            Text('Réseau FTTH', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: TextField(
                  decoration: InputDecoration(labelText: 'NRO', hintText: 'NRO...', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)), filled: true),
                  onChanged: (v) => _nroValue = v,
                )),
                const SizedBox(width: 8),
                Expanded(child: TextField(
                  decoration: InputDecoration(labelText: 'SRO', hintText: 'SRO...', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)), filled: true),
                  onChanged: (v) => _sroValue = v,
                )),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: TextField(
                  decoration: InputDecoration(labelText: 'PBO', hintText: 'PBO...', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)), filled: true),
                  onChanged: (v) => _pboValue = v,
                )),
                const SizedBox(width: 8),
                Expanded(child: TextField(
                  decoration: InputDecoration(labelText: 'Splitter', hintText: '1:8', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)), filled: true),
                  onChanged: (v) => _splitterValue = v,
                )),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              decoration: InputDecoration(
                labelText: 'Port Splitter',
                hintText: 'Numéro du port...',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                filled: true,
              ),
              keyboardType: TextInputType.number,
              onChanged: (v) => _splitterPortValue = v,
            ),
            const SizedBox(height: 16),

            // Photos
            Text('Photos', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                SizedBox(width: 100, height: 100, child: PhotoButton(label: 'Avant', imagePath: _beforePhotoPath, onTap: () => _takePhoto('before'))),
                SizedBox(width: 100, height: 100, child: PhotoButton(label: 'Après', imagePath: _afterPhotoPath, onTap: () => _takePhoto('after'))),
                SizedBox(width: 100, height: 100, child: PhotoButton(label: 'Armoire', imagePath: _armoirePhotoPath, onTap: () => _takePhoto('armoire'))),
                SizedBox(width: 100, height: 100, child: PhotoButton(label: 'PTO', imagePath: _ptoPhotoPath, onTap: () => _takePhoto('pto'))),
                SizedBox(width: 100, height: 100, child: PhotoButton(label: 'ONT', imagePath: _ontPhotoPath, onTap: () => _takePhoto('ont'))),
                SizedBox(width: 100, height: 100, child: PhotoButton(label: 'Câblage', imagePath: _cablingPhotoPath, onTap: () => _takePhoto('cabling'))),
                SizedBox(width: 100, height: 100, child: PhotoButton(label: 'Incident', imagePath: _incidentPhotoPath, onTap: () => _takePhoto('incident'))),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSuccessState() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.green.shade50,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.green.shade200),
      ),
      child: Column(
        children: [
          Icon(Icons.check_circle, size: 64, color: Colors.green.shade600),
          const SizedBox(height: 12),
          Text(
            'Intervention terminée avec succès',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.green.shade700, fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          if (_travelDuration.inMinutes > 0)
            Text('Temps trajet: ${_formatDuration(_travelDuration)}', style: TextStyle(color: Colors.green.shade600)),
          if (_workDuration.inMinutes > 0)
            Text('Temps intervention: ${_formatDuration(_workDuration)}', style: TextStyle(color: Colors.green.shade600)),
          if (_pauseDuration.inSeconds > 0)
            Text('Temps pause: ${_formatDuration(_pauseDuration)}', style: TextStyle(color: Colors.green.shade600)),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Retour à la liste'),
          ),
        ],
      ),
    );
  }

  Widget _buildTerminalState() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: _currentStatus == 'failed' ? Colors.red.shade50 : _currentStatus == 'client_absent' ? Colors.orange.shade50 : Colors.grey.shade100,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: _currentStatus == 'failed' ? Colors.red.shade200 : _currentStatus == 'client_absent' ? Colors.orange.shade200 : Colors.grey.shade300,
        ),
      ),
      child: Column(
        children: [
          Icon(
            _currentStatus == 'failed' ? Icons.error : _currentStatus == 'client_absent' ? Icons.person_off : Icons.cancel,
            size: 64,
            color: _currentStatus == 'failed' ? Colors.red.shade600 : _currentStatus == 'client_absent' ? Colors.orange.shade600 : Colors.grey,
          ),
          const SizedBox(height: 12),
          Text(
            _currentStatus == 'failed' ? 'Intervention en échec' : _currentStatus == 'client_absent' ? 'Client absent' : 'Intervention annulée',
            style: TextStyle(
              color: _currentStatus == 'failed' ? Colors.red.shade700 : _currentStatus == 'client_absent' ? Colors.orange.shade700 : Colors.grey.shade700,
              fontSize: 18, fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Retour à la liste'),
          ),
        ],
      ),
    );
  }
}

/// Dialogue de motif de pause
class _PauseReasonDialog extends StatefulWidget {
  @override
  State<_PauseReasonDialog> createState() => _PauseReasonDialogState();
}

class _PauseReasonDialogState extends State<_PauseReasonDialog> {
  String _selectedReason = 'Pause repas';
  final _otherController = TextEditingController();

  final _reasons = [
    'Pause repas',
    'Client absent temporairement',
    'Attente matériel',
    'Attente accès',
    'Incident',
    'Autre',
  ];

  @override
  void dispose() {
    _otherController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Motif de la pause'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ..._reasons.map((reason) => RadioListTile<String>(
            title: Text(reason, style: const TextStyle(fontSize: 14)),
            value: reason,
            groupValue: _selectedReason,
            onChanged: (v) => setState(() => _selectedReason = v!),
            dense: true,
          )),
          if (_selectedReason == 'Autre')
            TextField(
              controller: _otherController,
              decoration: InputDecoration(
                hintText: 'Précisez le motif...',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                filled: true,
              ),
            ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Annuler')),
        TextButton(
          onPressed: () {
            final reason = _selectedReason == 'Autre' ? _otherController.text.trim() : _selectedReason;
            Navigator.pop(context, reason.isEmpty ? 'Autre' : reason);
          },
          style: TextButton.styleFrom(foregroundColor: Colors.orange),
          child: const Text('Mettre en pause'),
        ),
      ],
    );
  }
}