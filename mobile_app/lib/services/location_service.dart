import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

import '../config/config.dart';
import 'auth_service.dart';

enum GpsAvailability {
  unknown,
  ready,
  serviceDisabled,
  permissionDenied,
  permissionDeniedForever,
  error,
}

class GpsStatusSnapshot {
  final GpsAvailability availability;
  final bool isLiveTracking;
  final double? latitude;
  final double? longitude;
  final double? accuracy;
  final DateTime? positionAt;
  final String? error;

  const GpsStatusSnapshot({
    required this.availability,
    required this.isLiveTracking,
    this.latitude,
    this.longitude,
    this.accuracy,
    this.positionAt,
    this.error,
  });

  bool get hasPosition => latitude != null && longitude != null;
}

class LocationService {
  static bool _isInitialized = false;
  static StreamSubscription<Position>? _liveGpsSubscription;
  static bool _isLiveGpsRunning = false;
  static double? _lastLatitude;
  static double? _lastLongitude;
  static double? _lastAccuracy;
  static DateTime? _lastPositionAt;
  static int? _currentJobId;
  static GpsAvailability _availability = GpsAvailability.unknown;
  static String? _lastError;

  static final ValueNotifier<GpsStatusSnapshot> _statusNotifier =
      ValueNotifier<GpsStatusSnapshot>(
        const GpsStatusSnapshot(
          availability: GpsAvailability.unknown,
          isLiveTracking: false,
        ),
      );

  static bool get isLiveGpsRunning => _isLiveGpsRunning;
  static double? get lastLatitude => _lastLatitude;
  static double? get lastLongitude => _lastLongitude;
  static double? get lastAccuracy => _lastAccuracy;
  static DateTime? get lastPositionAt => _lastPositionAt;
  static ValueListenable<GpsStatusSnapshot> get statusListenable =>
      _statusNotifier;

  static GpsStatusSnapshot get status => GpsStatusSnapshot(
    availability: _availability,
    isLiveTracking: _isLiveGpsRunning,
    latitude: _lastLatitude,
    longitude: _lastLongitude,
    accuracy: _lastAccuracy,
    positionAt: _lastPositionAt,
    error: _lastError,
  );

  static void _publishStatus() {
    _statusNotifier.value = status;
  }

  @visibleForTesting
  static GpsAvailability resolveAvailability({
    required bool serviceEnabled,
    required LocationPermission permission,
  }) {
    if (!serviceEnabled) {
      return GpsAvailability.serviceDisabled;
    }

    switch (permission) {
      case LocationPermission.denied:
        return GpsAvailability.permissionDenied;
      case LocationPermission.deniedForever:
        return GpsAvailability.permissionDeniedForever;
      case LocationPermission.whileInUse:
      case LocationPermission.always:
        return GpsAvailability.ready;
      case LocationPermission.unableToDetermine:
        return GpsAvailability.error;
    }
  }

  static Future<GpsStatusSnapshot> refreshStatus({
    bool requestPermissionIfDenied = false,
  }) async {
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();

      if (!serviceEnabled) {
        _availability = GpsAvailability.serviceDisabled;
        _isInitialized = false;
        _lastError = null;
        _publishStatus();
        return status;
      }

      var permission = await Geolocator.checkPermission();

      if (requestPermissionIfDenied &&
          permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      _availability = resolveAvailability(
        serviceEnabled: true,
        permission: permission,
      );
      _isInitialized = _availability == GpsAvailability.ready;
      _lastError = null;
    } catch (error) {
      _availability = GpsAvailability.error;
      _isInitialized = false;
      _lastError = error.toString();
    }

    _publishStatus();
    return status;
  }

  @visibleForTesting
  static Map<String, dynamic> buildGpsPayload({
    required double latitude,
    required double longitude,
    double? speed,
    double? heading,
    double? accuracy,
    DateTime? observedAt,
    int? jobId,
  }) => {
    'latitude': latitude,
    'longitude': longitude,
    if (speed != null && speed >= 0) 'speed': speed,
    if (heading != null && heading >= 0 && heading <= 360) 'heading': heading,
    if (accuracy != null && accuracy >= 0) 'accuracy': accuracy,
    if (observedAt != null) 'observed_at': observedAt.toUtc().toIso8601String(),
    'job_id': ?jobId,
  };

  static Future<void> initialize({int? technicianId}) async {
    if (_isInitialized) return;

    final snapshot = await refreshStatus(requestPermissionIfDenied: true);

    debugPrint('LocationService GPS state: ${snapshot.availability.name}');
  }

  static Future<bool> requestPermission() async {
    final snapshot = await refreshStatus(requestPermissionIfDenied: true);
    return snapshot.availability == GpsAvailability.ready;
  }

  static Future<Position?> getCurrentPosition() async {
    if (!_isInitialized) await initialize();
    if (!_isInitialized) return null;

    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.best,
          timeLimit: Duration(seconds: 10),
        ),
      );
      _rememberPosition(position);
      _availability = GpsAvailability.ready;
      _lastError = null;
      _publishStatus();
      return position;
    } catch (error) {
      _availability = GpsAvailability.error;
      _lastError = error.toString();
      _publishStatus();
      debugPrint('Error getting position: $error');
      return null;
    }
  }

  static void _rememberPosition(Position position) {
    _lastLatitude = position.latitude;
    _lastLongitude = position.longitude;
    _lastAccuracy = position.accuracy >= 0 ? position.accuracy : null;
    _lastPositionAt = position.timestamp;
  }

  static Stream<Position> getPositionStream() {
    return Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.best,
        distanceFilter: 10,
      ),
    );
  }

  static void startLiveGps({int intervalSeconds = 15, int? jobId}) {
    // The selected field visit can change while the shell remains mounted.
    // Always keep the next telemetry point scoped to the current job.
    _currentJobId = jobId;
    if (_isLiveGpsRunning) {
      debugPrint('Live GPS already running for job $_currentJobId');
      return;
    }

    _isLiveGpsRunning = true;
    _publishStatus();
    debugPrint('Starting live GPS with ${intervalSeconds}s interval');
    unawaited(_startLiveGpsStream(intervalSeconds));
  }

  static void stopLiveGps() {
    if (!_isLiveGpsRunning) return;

    unawaited(_liveGpsSubscription?.cancel());
    _liveGpsSubscription = null;
    _isLiveGpsRunning = false;
    _currentJobId = null;
    _publishStatus();
    debugPrint('Live GPS stopped');
  }

  static Future<void> _startLiveGpsStream(int intervalSeconds) async {
    if (!_isInitialized) await initialize();
    if (!_isInitialized || !_isLiveGpsRunning) {
      _isLiveGpsRunning = false;
      _publishStatus();
      return;
    }

    final LocationSettings settings;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      settings = AndroidSettings(
        accuracy: LocationAccuracy.best,
        // Supervision is time based: a stationary technician on site must not
        // appear "stale" simply because the device moved less than 10 m.
        distanceFilter: 0,
        intervalDuration: Duration(seconds: intervalSeconds),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'GoVector · suivi terrain actif',
          notificationText:
              'La position est partagée avec la supervision pendant l’intervention.',
          notificationChannelName: 'Suivi terrain GoVector',
          enableWakeLock: true,
          setOngoing: true,
        ),
      );
    } else {
      settings = const LocationSettings(
        accuracy: LocationAccuracy.best,
        distanceFilter: 10,
      );
    }

    await _liveGpsSubscription?.cancel();
    _liveGpsSubscription =
        Geolocator.getPositionStream(locationSettings: settings).listen(
          (position) => unawaited(_sendGpsPosition(position)),
          onError: (Object error) {
            _availability = GpsAvailability.error;
            _lastError = error.toString();
            _publishStatus();
            debugPrint('Live GPS stream error: $error');
          },
        );
  }

  static Future<void> _sendGpsPosition(Position position) async {
    _rememberPosition(position);
    _availability = GpsAvailability.ready;
    _lastError = null;
    _publishStatus();

    try {
      final token = await AuthService.getToken();
      if (token == null) return;

      final response = await http
          .post(
            AppConfig.apiUri('supervision/gps'),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $token',
            },
            body: jsonEncode(
              buildGpsPayload(
                latitude: position.latitude,
                longitude: position.longitude,
                speed: position.speed,
                heading: position.heading,
                accuracy: position.accuracy,
                observedAt: position.timestamp,
                jobId: _currentJobId,
              ),
            ),
          )
          .timeout(AppConfig.httpTimeout);

      if (response.statusCode != 200) {
        debugPrint(
          'GPS update failed: ${response.statusCode} - ${response.body}',
        );
      }
    } catch (e) {
      debugPrint('Error sending GPS update: $e');
    }
  }

  static Future<bool> updateLiveStatus(
    String status, {
    double? latitude,
    double? longitude,
    int? jobId,
  }) async {
    try {
      final token = await AuthService.getToken();
      if (token == null) return false;

      final body = <String, dynamic>{'status': status};
      if (latitude != null) body['latitude'] = latitude;
      if (longitude != null) body['longitude'] = longitude;
      if (jobId != null) body['job_id'] = jobId;

      final response = await http
          .post(
            AppConfig.apiUri('supervision/status'),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $token',
            },
            body: jsonEncode(body),
          )
          .timeout(AppConfig.httpTimeout);

      if (response.statusCode == 200) {
        debugPrint('Status updated: $status');
        return true;
      } else {
        debugPrint(
          'Status update failed: ${response.statusCode} - ${response.body}',
        );
        return false;
      }
    } catch (e) {
      debugPrint('Error updating status: $e');
      return false;
    }
  }

  static Future<void> openNavigation({
    required double latitude,
    required double longitude,
    String? label,
  }) async {
    debugPrint(
      "[LOCATION] openNavigation lat=$latitude lon=$longitude label=$label",
    );

    // 1. Essayer Waze (application native)
    final uriWaze = Uri.parse("waze://?ll=$latitude,$longitude&navigate=yes");
    if (await canLaunchUrl(uriWaze)) {
      debugPrint("[LOCATION] Lancement Waze: $uriWaze");
      await launchUrl(uriWaze, mode: LaunchMode.externalApplication);
      return;
    }

    // 2. Essayer Google Maps (application native)
    final uriGoogleMaps = Uri.parse(
      "geo:$latitude,$longitude?q=$latitude,$longitude${label != null ? '(${Uri.encodeComponent(label)})' : ''}",
    );
    if (await canLaunchUrl(uriGoogleMaps)) {
      debugPrint("[LOCATION] Lancement Google Maps: $uriGoogleMaps");
      await launchUrl(uriGoogleMaps, mode: LaunchMode.externalApplication);
      return;
    }

    // 3. Fallback Waze web
    final uriWazeFallback = Uri.parse(
      "https://waze.com/ul?ll=$latitude,$longitude&navigate=yes"
      "${label != null ? '&q=${Uri.encodeComponent(label)}' : ''}",
    );
    if (await canLaunchUrl(uriWazeFallback)) {
      debugPrint("[LOCATION] Lancement Waze web: $uriWazeFallback");
      await launchUrl(uriWazeFallback, mode: LaunchMode.externalApplication);
      return;
    }

    // 4. Fallback Google Maps web
    final uriGoogleWeb = Uri.parse(
      "https://www.google.com/maps/dir/?api=1&destination=$latitude,$longitude",
    );
    if (await canLaunchUrl(uriGoogleWeb)) {
      debugPrint("[LOCATION] Lancement Google Maps web: $uriGoogleWeb");
      await launchUrl(uriGoogleWeb, mode: LaunchMode.externalApplication);
      return;
    }

    // 5. Dernier fallback : ouvrir dans le navigateur
    final uriBrowser = Uri.parse(
      "https://www.google.com/maps/search/$latitude,$longitude",
    );
    debugPrint("[LOCATION] Fallback navigateur: $uriBrowser");
    await launchUrl(uriBrowser, mode: LaunchMode.platformDefault);
  }

  static Future<void> openNavigationByAddress(String address) async {
    final encoded = Uri.encodeComponent(address);
    final uriWaze = Uri.parse("waze://?q=$encoded&navigate=yes");
    final uriGoogle = Uri.parse(
      "https://www.google.com/maps/dir/?api=1&destination=$encoded",
    );

    if (await canLaunchUrl(uriWaze)) {
      await launchUrl(uriWaze, mode: LaunchMode.externalApplication);
    } else if (await canLaunchUrl(uriGoogle)) {
      await launchUrl(uriGoogle, mode: LaunchMode.externalApplication);
    } else {
      final uriGoogleWeb = Uri.parse(
        "https://www.google.com/maps/search/$encoded",
      );
      if (await canLaunchUrl(uriGoogleWeb)) {
        await launchUrl(uriGoogleWeb, mode: LaunchMode.externalApplication);
      }
    }
  }

  static double calculateDistance(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
  ) {
    return Geolocator.distanceBetween(lat1, lon1, lat2, lon2) / 1000;
  }
}
