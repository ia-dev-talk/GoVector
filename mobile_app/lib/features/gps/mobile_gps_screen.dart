import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_map_marker_cluster/flutter_map_marker_cluster.dart';
import 'package:latlong2/latlong.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import '../../services/location_service.dart';
import '../interventions/mobile_job_presenter.dart';

class MobileTechnicianLocation {
  const MobileTechnicianLocation({
    required this.id,
    required this.name,
    required this.liveStatus,
    this.latitude,
    this.longitude,
    this.accuracy,
    this.lastLocationUpdate,
    this.currentJobId,
  });

  final int id;
  final String name;
  final String liveStatus;
  final double? latitude;
  final double? longitude;
  final double? accuracy;
  final DateTime? lastLocationUpdate;
  final int? currentJobId;

  bool get hasPosition {
    final lat = latitude;
    final lon = longitude;

    return lat != null &&
        lon != null &&
        lat.isFinite &&
        lon.isFinite &&
        lat >= -90 &&
        lat <= 90 &&
        lon >= -180 &&
        lon <= 180;
  }
}

class MobileTechnicianLocationsSnapshot {
  const MobileTechnicianLocationsSnapshot({
    required this.technicians,
    this.gpsStaleAfterMinutes,
  });

  final List<MobileTechnicianLocation> technicians;
  final int? gpsStaleAfterMinutes;
}

enum _MapFilter { today, upcoming, all, closed }

class MobileGpsScreen extends StatefulWidget {
  const MobileGpsScreen({
    super.key,
    required this.roleLabel,
    required this.jobs,
    this.technicianNamesByJobId = const {},
    this.technicianLocations = const [],
    this.gpsStaleAfterMinutes,
    this.onRefreshTechnicianLocations,
    this.onOpenJob,
  });

  final String roleLabel;
  final List<Job> jobs;
  final Map<int, String> technicianNamesByJobId;
  final List<MobileTechnicianLocation> technicianLocations;
  final int? gpsStaleAfterMinutes;
  final Future<MobileTechnicianLocationsSnapshot> Function()?
  onRefreshTechnicianLocations;
  final ValueChanged<Job>? onOpenJob;

  @override
  State<MobileGpsScreen> createState() => _MobileGpsScreenState();
}

class _MobileGpsScreenState extends State<MobileGpsScreen>
    with WidgetsBindingObserver {
  final MapController _mapController = MapController();

  static const _technicianRefreshInterval = Duration(seconds: 30);

  _MapFilter _filter = _MapFilter.today;
  bool _refreshing = false;
  bool _refreshingTechnicians = false;
  Timer? _technicianRefreshTimer;
  List<MobileTechnicianLocation> _technicianLocations = const [];
  int? _gpsStaleAfterMinutes;

  List<Job> get _filteredJobs {
    switch (_filter) {
      case _MapFilter.today:
        return widget.jobs
            .where(
              (job) =>
                  !MobileJobPresenter.isTerminal(job) &&
                  (MobileJobPresenter.isToday(job) ||
                      MobileJobPresenter.scheduledAt(job) == null),
            )
            .toList(growable: false);

      case _MapFilter.upcoming:
        return widget.jobs
            .where(MobileJobPresenter.isUpcoming)
            .toList(growable: false);

      case _MapFilter.closed:
        return widget.jobs
            .where(MobileJobPresenter.isTerminal)
            .toList(growable: false);

      case _MapFilter.all:
        return widget.jobs.toList(growable: false);
    }
  }

  List<Job> get _mappedJobs => _filteredJobs
      .where((job) => job.hasServiceCoordinates)
      .toList(growable: false);

  List<MobileTechnicianLocation> get _mappedTechnicians => _technicianLocations
      .where((technician) => technician.hasPosition)
      .toList(growable: false);

  @override
  void initState() {
    super.initState();
    _technicianLocations = widget.technicianLocations;
    _gpsStaleAfterMinutes = widget.gpsStaleAfterMinutes;

    WidgetsBinding.instance.addObserver(this);
    Future<void>.microtask(_refreshPosition);

    if (widget.onRefreshTechnicianLocations != null) {
      Future<void>.microtask(_refreshTechnicianLocations);
      _startTechnicianRefreshTimer();
    }
  }

  @override
  void dispose() {
    _technicianRefreshTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _mapController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_refreshPosition());

      if (widget.onRefreshTechnicianLocations != null) {
        unawaited(_refreshTechnicianLocations());
        _startTechnicianRefreshTimer();
      }
      return;
    }

    _technicianRefreshTimer?.cancel();
    _technicianRefreshTimer = null;
  }

  void _startTechnicianRefreshTimer() {
    if (widget.onRefreshTechnicianLocations == null) return;

    _technicianRefreshTimer?.cancel();
    _technicianRefreshTimer = Timer.periodic(
      _technicianRefreshInterval,
      (_) => unawaited(_refreshTechnicianLocations()),
    );
  }

  Future<void> _refreshTechnicianLocations() async {
    final refresh = widget.onRefreshTechnicianLocations;
    if (refresh == null || _refreshingTechnicians) return;

    _refreshingTechnicians = true;

    try {
      final snapshot = await refresh();
      if (!mounted) return;

      setState(() {
        _technicianLocations = snapshot.technicians;
        _gpsStaleAfterMinutes = snapshot.gpsStaleAfterMinutes;
      });
    } catch (error) {
      debugPrint('Unable to refresh Agent technician locations: $error');
    } finally {
      _refreshingTechnicians = false;
    }
  }

  Future<void> _refreshPosition() async {
    if (_refreshing) return;

    if (mounted) {
      setState(() => _refreshing = true);
    }

    try {
      final status = await LocationService.refreshStatus();

      if (status.availability == GpsAvailability.ready) {
        await LocationService.getCurrentPosition();
      }
    } finally {
      if (mounted) {
        setState(() => _refreshing = false);
      }
    }
  }

  LatLng _initialCenter(GpsStatusSnapshot gps) {
    if (gps.hasPosition) {
      return LatLng(gps.latitude!, gps.longitude!);
    }

    if (_mappedJobs.isNotEmpty) {
      final job = _mappedJobs.first;
      return LatLng(job.latitude, job.longitude);
    }

    if (_mappedTechnicians.isNotEmpty) {
      final technician = _mappedTechnicians.first;
      return LatLng(technician.latitude!, technician.longitude!);
    }

    return const LatLng(33.5731, -7.5898);
  }

  void _centerOnMe(GpsStatusSnapshot gps) {
    if (!gps.hasPosition) {
      unawaited(_refreshPosition());
      return;
    }

    _mapController.move(LatLng(gps.latitude!, gps.longitude!), 16);
  }

  void _fitInterventions(GpsStatusSnapshot gps) {
    final points = <LatLng>[
      for (final job in _mappedJobs) LatLng(job.latitude, job.longitude),
      for (final technician in _mappedTechnicians)
        LatLng(technician.latitude!, technician.longitude!),
      if (gps.hasPosition) LatLng(gps.latitude!, gps.longitude!),
    ];

    if (points.isEmpty) return;

    if (points.length == 1) {
      _mapController.move(points.first, 16);
      return;
    }

    _mapController.fitCamera(
      CameraFit.coordinates(
        coordinates: points,
        padding: const EdgeInsets.fromLTRB(50, 150, 50, 90),
      ),
    );
  }

  void _changeFilter(_MapFilter filter, GpsStatusSnapshot gps) {
    setState(() => _filter = filter);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _fitInterventions(gps);
      }
    });
  }

  Future<void> _showJob(Job job) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) {
        final technician = widget.technicianNamesByJobId[job.id];
        final statusColor = MobileJobPresenter.statusColor(job);

        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              BlueVectorSpacing.lg,
              0,
              BlueVectorSpacing.lg,
              BlueVectorSpacing.lg,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(
                          BlueVectorRadius.medium,
                        ),
                      ),
                      child: Icon(
                        MobileJobPresenter.typeIcon(job),
                        color: statusColor,
                      ),
                    ),
                    const SizedBox(width: BlueVectorSpacing.sm),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            MobileJobPresenter.title(job),
                            style: const TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.w900,
                              color: BlueVectorColors.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            MobileJobPresenter.reference(job),
                            style: const TextStyle(
                              color: BlueVectorColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(
                          BlueVectorRadius.pill,
                        ),
                      ),
                      child: Text(
                        MobileJobPresenter.statusLabel(job),
                        style: TextStyle(
                          color: statusColor,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: BlueVectorSpacing.lg),
                if (technician != null && technician.trim().isNotEmpty)
                  _InfoRow(label: 'Technicien', value: technician),
                _InfoRow(
                  label: 'Client',
                  value: job.customerName.isEmpty
                      ? 'Non renseigné'
                      : job.customerName,
                ),
                _InfoRow(
                  label: 'Adresse',
                  value: job.serviceAddress.isEmpty
                      ? 'Non renseignée'
                      : job.serviceAddress,
                ),
                if (job.operator?.trim().isNotEmpty == true)
                  _InfoRow(label: 'Opérateur', value: job.operator!),
                const SizedBox(height: BlueVectorSpacing.lg),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          Navigator.of(sheetContext).pop();

                          await LocationService.openNavigation(
                            latitude: job.latitude,
                            longitude: job.longitude,
                            label: job.serviceAddress,
                          );
                        },
                        icon: const Icon(Icons.navigation_rounded),
                        label: const Text('Naviguer'),
                      ),
                    ),
                    if (widget.onOpenJob != null) ...[
                      const SizedBox(width: BlueVectorSpacing.sm),
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: () {
                            Navigator.of(sheetContext).pop();
                            widget.onOpenJob!(job);
                          },
                          icon: const Icon(Icons.assignment_outlined),
                          label: const Text('Voir'),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  bool? _technicianPositionIsStale(MobileTechnicianLocation technician) {
    final updatedAt = technician.lastLocationUpdate;
    if (updatedAt == null) return true;

    final staleAfterMinutes = _gpsStaleAfterMinutes;
    if (staleAfterMinutes == null) return null;

    final age = DateTime.now().toUtc().difference(updatedAt.toUtc());
    return age > Duration(minutes: staleAfterMinutes);
  }

  Color _technicianColor(MobileTechnicianLocation technician) {
    final stale = _technicianPositionIsStale(technician);
    if (stale != false) {
      return BlueVectorColors.textMuted;
    }

    switch (technician.liveStatus.trim().toLowerCase()) {
      case 'disponible':
        return BlueVectorColors.success;
      case 'en_intervention':
        return BlueVectorColors.primary;
      case 'pause':
        return BlueVectorColors.warning;
      case 'hors_service':
      case 'deconnecte':
      default:
        return BlueVectorColors.textMuted;
    }
  }

  String _technicianStatusLabel(String status) {
    switch (status.trim().toLowerCase()) {
      case 'disponible':
        return 'Disponible';
      case 'en_intervention':
        return 'En intervention';
      case 'pause':
        return 'En pause';
      case 'hors_service':
        return 'Hors service';
      case 'deconnecte':
        return 'Déconnecté';
      default:
        return status.trim().isEmpty ? 'Statut inconnu' : status;
    }
  }

  String _technicianPositionAge(MobileTechnicianLocation technician) {
    final updatedAt = technician.lastLocationUpdate;
    if (updatedAt == null) return 'Heure inconnue';

    var age = DateTime.now().toUtc().difference(updatedAt.toUtc());
    if (age.isNegative) age = Duration.zero;

    if (age.inMinutes < 1) return 'À l’instant';
    if (age.inMinutes < 60) return 'Il y a ${age.inMinutes} min';
    if (age.inHours < 24) return 'Il y a ${age.inHours} h';
    return 'Il y a ${age.inDays} j';
  }

  Future<void> _showTechnician(MobileTechnicianLocation technician) async {
    final color = _technicianColor(technician);
    final stale = _technicianPositionIsStale(technician);

    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              BlueVectorSpacing.lg,
              0,
              BlueVectorSpacing.lg,
              BlueVectorSpacing.lg,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.12),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.engineering_rounded, color: color),
                    ),
                    const SizedBox(width: BlueVectorSpacing.sm),
                    Expanded(
                      child: Text(
                        technician.name,
                        style: const TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w900,
                          color: BlueVectorColors.textPrimary,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: BlueVectorSpacing.lg),
                _InfoRow(
                  label: 'Statut',
                  value: _technicianStatusLabel(technician.liveStatus),
                ),
                _InfoRow(
                  label: 'Dernière position',
                  value: _technicianPositionAge(technician),
                ),
                if (technician.accuracy != null)
                  _InfoRow(
                    label: 'Précision GPS',
                    value: '±${technician.accuracy!.round()} m',
                  ),
                if (technician.currentJobId != null)
                  _InfoRow(
                    label: 'Intervention en cours',
                    value: '#${technician.currentJobId}',
                  ),
                if (stale == true) ...[
                  const SizedBox(height: BlueVectorSpacing.sm),
                  const Row(
                    children: [
                      Icon(
                        Icons.schedule_rounded,
                        size: 18,
                        color: BlueVectorColors.warning,
                      ),
                      SizedBox(width: BlueVectorSpacing.xs),
                      Expanded(
                        child: Text(
                          'Position ancienne : elle ne représente peut-être plus la position actuelle du technicien.',
                          style: TextStyle(
                            color: BlueVectorColors.textSecondary,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                ] else if (stale == null) ...[
                  const SizedBox(height: BlueVectorSpacing.sm),
                  const Row(
                    children: [
                      Icon(
                        Icons.info_outline_rounded,
                        size: 18,
                        color: BlueVectorColors.textMuted,
                      ),
                      SizedBox(width: BlueVectorSpacing.xs),
                      Expanded(
                        child: Text(
                          'Seuil de fraîcheur GPS non configuré : l’heure de la dernière position est affichée sans la qualifier de récente.',
                          style: TextStyle(
                            color: BlueVectorColors.textSecondary,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  String _filterLabel(_MapFilter filter) {
    switch (filter) {
      case _MapFilter.today:
        return 'Aujourd’hui';
      case _MapFilter.upcoming:
        return 'À venir';
      case _MapFilter.all:
        return 'Toutes';
      case _MapFilter.closed:
        return 'Clôturées';
    }
  }

  int _filterCount(_MapFilter filter) {
    switch (filter) {
      case _MapFilter.today:
        return widget.jobs
            .where(
              (job) =>
                  !MobileJobPresenter.isTerminal(job) &&
                  (MobileJobPresenter.isToday(job) ||
                      MobileJobPresenter.scheduledAt(job) == null),
            )
            .length;

      case _MapFilter.upcoming:
        return widget.jobs.where(MobileJobPresenter.isUpcoming).length;

      case _MapFilter.closed:
        return widget.jobs.where(MobileJobPresenter.isTerminal).length;

      case _MapFilter.all:
        return widget.jobs.length;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<GpsStatusSnapshot>(
      valueListenable: LocationService.statusListenable,
      builder: (context, gps, _) {
        final interventionMarkers = <Marker>[
          for (final job in _mappedJobs)
            Marker(
              point: LatLng(job.latitude, job.longitude),
              width: 48,
              height: 48,
              child: GestureDetector(
                onTap: () => _showJob(job),
                child: Container(
                  decoration: BoxDecoration(
                    color: MobileJobPresenter.statusColor(job),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 3),
                    boxShadow: const [
                      BoxShadow(blurRadius: 7, color: Color(0x33000000)),
                    ],
                  ),
                  child: Icon(
                    MobileJobPresenter.typeIcon(job),
                    color: Colors.white,
                    size: 22,
                  ),
                ),
              ),
            ),
        ];

        final technicianMarkers = <Marker>[
          for (final technician in _mappedTechnicians)
            Marker(
              point: LatLng(technician.latitude!, technician.longitude!),
              width: 52,
              height: 52,
              child: GestureDetector(
                onTap: () => _showTechnician(technician),
                child: Container(
                  decoration: BoxDecoration(
                    color: _technicianColor(technician),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 4),
                    boxShadow: const [
                      BoxShadow(blurRadius: 9, color: Color(0x44000000)),
                    ],
                  ),
                  child: const Icon(
                    Icons.engineering_rounded,
                    color: Colors.white,
                    size: 25,
                  ),
                ),
              ),
            ),
        ];

        return Scaffold(
          backgroundColor: BlueVectorColors.background,
          appBar: AppBar(title: Text('Carte · ${widget.roleLabel}')),
          body: Stack(
            children: [
              FlutterMap(
                mapController: _mapController,
                options: MapOptions(
                  initialCenter: _initialCenter(gps),
                  initialZoom: 13.5,
                  minZoom: 3,
                  maxZoom: 19,
                ),
                children: [
                  TileLayer(
                    urlTemplate:
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'com.govector.mobile',
                  ),
                  MarkerClusterLayerWidget(
                    options: MarkerClusterLayerOptions(
                      maxClusterRadius: 52,
                      size: const Size(46, 46),
                      padding: const EdgeInsets.all(40),
                      maxZoom: 16,
                      markers: interventionMarkers,
                      builder: (context, markers) {
                        return Container(
                          decoration: BoxDecoration(
                            color: BlueVectorColors.backgroundDeep,
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 3),
                            boxShadow: const [
                              BoxShadow(
                                blurRadius: 9,
                                color: Color(0x44000000),
                              ),
                            ],
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            '${markers.length}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w900,
                              fontSize: 14,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  if (technicianMarkers.isNotEmpty)
                    MarkerLayer(markers: technicianMarkers),
                  if (gps.hasPosition)
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: LatLng(gps.latitude!, gps.longitude!),
                          width: 42,
                          height: 42,
                          child: Container(
                            decoration: BoxDecoration(
                              color: BlueVectorColors.primary,
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white, width: 4),
                              boxShadow: const [
                                BoxShadow(
                                  blurRadius: 9,
                                  color: Color(0x44000000),
                                ),
                              ],
                            ),
                            child: const Icon(
                              Icons.person_pin_circle_rounded,
                              color: Colors.white,
                              size: 23,
                            ),
                          ),
                        ),
                      ],
                    ),
                  RichAttributionWidget(
                    attributions: const [
                      TextSourceAttribution('OpenStreetMap contributors'),
                    ],
                  ),
                ],
              ),
              Positioned(
                top: BlueVectorSpacing.sm,
                left: BlueVectorSpacing.sm,
                right: BlueVectorSpacing.sm,
                child: Material(
                  elevation: 3,
                  borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
                  color: BlueVectorColors.surface,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      vertical: BlueVectorSpacing.xs,
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: BlueVectorSpacing.sm,
                          ),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.map_outlined,
                                size: 19,
                                color: BlueVectorColors.primary,
                              ),
                              const SizedBox(width: BlueVectorSpacing.xs),
                              Expanded(
                                child: Text(
                                  _technicianLocations.isEmpty
                                      ? '${_mappedJobs.length} sur la carte'
                                      : '${_mappedJobs.length} interventions · ${_mappedTechnicians.length} techniciens',
                                  style: const TextStyle(
                                    color: BlueVectorColors.textPrimary,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                              if (_filteredJobs.length != _mappedJobs.length)
                                Text(
                                  '${_filteredJobs.length - _mappedJobs.length} sans GPS',
                                  style: const TextStyle(
                                    color: BlueVectorColors.textMuted,
                                    fontSize: 10,
                                  ),
                                ),
                              if (_refreshing) ...[
                                const SizedBox(width: BlueVectorSpacing.xs),
                                const SizedBox.square(
                                  dimension: 15,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 6),
                        SizedBox(
                          height: 34,
                          child: ListView.separated(
                            padding: const EdgeInsets.symmetric(
                              horizontal: BlueVectorSpacing.sm,
                            ),
                            scrollDirection: Axis.horizontal,
                            itemCount: _MapFilter.values.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(width: 6),
                            itemBuilder: (context, index) {
                              final filter = _MapFilter.values[index];
                              final selected = filter == _filter;

                              return ChoiceChip(
                                selected: selected,
                                visualDensity: VisualDensity.compact,
                                label: Text(
                                  '${_filterLabel(filter)} ${_filterCount(filter)}',
                                  style: const TextStyle(fontSize: 10),
                                ),
                                onSelected: (_) => _changeFilter(filter, gps),
                              );
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                right: BlueVectorSpacing.sm,
                bottom:
                    BlueVectorSpacing.md +
                    MediaQuery.viewPaddingOf(context).bottom,
                child: Column(
                  children: [
                    FloatingActionButton.small(
                      heroTag: 'fit-map-${widget.roleLabel}',
                      tooltip: 'Afficher les interventions',
                      onPressed: () => _fitInterventions(gps),
                      child: const Icon(Icons.fit_screen_rounded),
                    ),
                    const SizedBox(height: BlueVectorSpacing.sm),
                    FloatingActionButton(
                      heroTag: 'my-position-${widget.roleLabel}',
                      tooltip: 'Ma position',
                      onPressed: () => _centerOnMe(gps),
                      child: const Icon(Icons.my_location_rounded),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 88,
            child: Text(
              label,
              style: const TextStyle(
                color: BlueVectorColors.textSecondary,
                fontSize: 12,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                color: BlueVectorColors.textPrimary,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
