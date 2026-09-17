import 'package:flutter/material.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../services/location_service.dart';

class MobileGpsScreen extends StatefulWidget {
  const MobileGpsScreen({super.key, this.roleLabel = 'Terrain'});

  final String roleLabel;

  @override
  State<MobileGpsScreen> createState() => _MobileGpsScreenState();
}

class _MobileGpsScreenState extends State<MobileGpsScreen>
    with WidgetsBindingObserver {
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    Future<void>.microtask(_refreshPosition);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      LocationService.refreshStatus();
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;

    setState(() => _busy = true);

    try {
      await action();
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _refreshPosition() async {
    await _run(() async {
      final status = await LocationService.refreshStatus();

      if (status.availability == GpsAvailability.ready) {
        await LocationService.getCurrentPosition();
      }
    });
  }

  Future<void> _requestPermission() async {
    await _run(() async {
      final granted = await LocationService.requestPermission();

      if (granted) {
        await LocationService.getCurrentPosition();
      }
    });
  }

  Future<void> _openGpsSettings() async {
    await LocationService.openLocationSettings();
  }

  Future<void> _openAppSettings() async {
    await LocationService.openAppSettings();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BlueVectorColors.background,
      appBar: AppBar(title: Text('GPS · ${widget.roleLabel}')),
      body: ValueListenableBuilder<GpsStatusSnapshot>(
        valueListenable: LocationService.statusListenable,
        builder: (context, gps, _) {
          final presentation = _presentation(gps);

          return RefreshIndicator(
            onRefresh: _refreshPosition,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(BlueVectorSpacing.md),
              children: [
                _StatusCard(
                  icon: presentation.icon,
                  color: presentation.color,
                  title: presentation.title,
                  body: presentation.body,
                ),
                const SizedBox(height: BlueVectorSpacing.md),
                _PositionCard(gps: gps),
                const SizedBox(height: BlueVectorSpacing.md),
                _LiveTrackingCard(gps: gps),
                const SizedBox(height: BlueVectorSpacing.lg),
                FilledButton.icon(
                  onPressed: _busy ? null : _refreshPosition,
                  icon: _busy
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.my_location_rounded),
                  label: const Text('Actualiser ma position'),
                ),
                const SizedBox(height: BlueVectorSpacing.sm),
                if (gps.availability == GpsAvailability.permissionDenied)
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _requestPermission,
                    icon: const Icon(Icons.location_on_outlined),
                    label: const Text('Autoriser le GPS'),
                  ),
                if (gps.availability == GpsAvailability.serviceDisabled)
                  OutlinedButton.icon(
                    onPressed: _openGpsSettings,
                    icon: const Icon(Icons.gps_fixed_rounded),
                    label: const Text('Ouvrir les réglages GPS'),
                  ),
                if (gps.availability == GpsAvailability.permissionDeniedForever)
                  OutlinedButton.icon(
                    onPressed: _openAppSettings,
                    icon: const Icon(Icons.settings_outlined),
                    label: const Text('Réglages de l’application'),
                  ),
                if (gps.availability == GpsAvailability.error) ...[
                  const SizedBox(height: BlueVectorSpacing.sm),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : _refreshPosition,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Réessayer'),
                  ),
                ],
                if (gps.error != null && gps.error!.trim().isNotEmpty) ...[
                  const SizedBox(height: BlueVectorSpacing.md),
                  Text(
                    gps.error!,
                    style: const TextStyle(
                      color: BlueVectorColors.danger,
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  _GpsPresentation _presentation(GpsStatusSnapshot gps) {
    switch (gps.availability) {
      case GpsAvailability.ready:
        return const _GpsPresentation(
          icon: Icons.gps_fixed_rounded,
          color: BlueVectorColors.success,
          title: 'GPS actif',
          body: 'La localisation est disponible sur cet appareil.',
        );

      case GpsAvailability.serviceDisabled:
        return const _GpsPresentation(
          icon: Icons.location_disabled_rounded,
          color: BlueVectorColors.warning,
          title: 'GPS désactivé',
          body: 'Activez la localisation du téléphone pour continuer.',
        );

      case GpsAvailability.permissionDenied:
        return const _GpsPresentation(
          icon: Icons.location_off_outlined,
          color: BlueVectorColors.warning,
          title: 'Autorisation requise',
          body: 'GoVector n’a pas encore accès à votre position.',
        );

      case GpsAvailability.permissionDeniedForever:
        return const _GpsPresentation(
          icon: Icons.block_rounded,
          color: BlueVectorColors.danger,
          title: 'Autorisation bloquée',
          body: 'Autorisez la localisation depuis les réglages Android.',
        );

      case GpsAvailability.error:
        return const _GpsPresentation(
          icon: Icons.error_outline_rounded,
          color: BlueVectorColors.danger,
          title: 'Erreur GPS',
          body: 'GoVector n’arrive pas à obtenir la position.',
        );

      case GpsAvailability.unknown:
        return const _GpsPresentation(
          icon: Icons.gps_not_fixed_rounded,
          color: BlueVectorColors.textMuted,
          title: 'GPS à vérifier',
          body: 'Appuyez sur Actualiser ma position.',
        );
    }
  }
}

class _PositionCard extends StatelessWidget {
  const _PositionCard({required this.gps});

  final GpsStatusSnapshot gps;

  @override
  Widget build(BuildContext context) {
    final positionAt = gps.positionAt?.toLocal();

    final time = positionAt == null
        ? '—'
        : '${positionAt.hour.toString().padLeft(2, '0')}:'
              '${positionAt.minute.toString().padLeft(2, '0')}:'
              '${positionAt.second.toString().padLeft(2, '0')}';

    return _Panel(
      title: 'Ma position',
      child: Column(
        children: [
          _ValueRow(
            label: 'Latitude',
            value: gps.latitude?.toStringAsFixed(6) ?? '—',
          ),
          _ValueRow(
            label: 'Longitude',
            value: gps.longitude?.toStringAsFixed(6) ?? '—',
          ),
          _ValueRow(
            label: 'Précision',
            value: gps.accuracy == null ? '—' : '±${gps.accuracy!.round()} m',
          ),
          _ValueRow(label: 'Dernière position', value: time),
        ],
      ),
    );
  }
}

class _LiveTrackingCard extends StatelessWidget {
  const _LiveTrackingCard({required this.gps});

  final GpsStatusSnapshot gps;

  @override
  Widget build(BuildContext context) {
    return _Panel(
      title: 'Suivi terrain',
      child: Row(
        children: [
          Icon(
            gps.isLiveTracking
                ? Icons.radio_button_checked_rounded
                : Icons.radio_button_off_rounded,
            color: gps.isLiveTracking
                ? BlueVectorColors.success
                : BlueVectorColors.textMuted,
          ),
          const SizedBox(width: BlueVectorSpacing.sm),
          Expanded(
            child: Text(
              gps.isLiveTracking
                  ? 'Suivi GPS en direct actif'
                  : 'Suivi GPS en direct inactif',
              style: const TextStyle(
                color: BlueVectorColors.textPrimary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.icon,
    required this.color,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.lg),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.large),
        border: Border.all(color: BlueVectorColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: color, size: 28),
          ),
          const SizedBox(width: BlueVectorSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: BlueVectorColors.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: BlueVectorSpacing.xxs),
                Text(
                  body,
                  style: const TextStyle(color: BlueVectorColors.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.md),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
        border: Border.all(color: BlueVectorColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: BlueVectorColors.textPrimary,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: BlueVectorSpacing.md),
          child,
        ],
      ),
    );
  }
}

class _ValueRow extends StatelessWidget {
  const _ValueRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: BlueVectorSpacing.xxs),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(color: BlueVectorColors.textSecondary),
            ),
          ),
          Text(
            value,
            style: const TextStyle(
              color: BlueVectorColors.textPrimary,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _GpsPresentation {
  const _GpsPresentation({
    required this.icon,
    required this.color,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String body;
}
