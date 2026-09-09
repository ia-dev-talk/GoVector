import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/config.dart';
import '../features/sync/technician_outbox_event.dart';
import 'technician_outbox_store.dart';

class TechnicianSyncRunResult {
  const TechnicianSyncRunResult({
    required this.synced,
    required this.failed,
    required this.total,
    this.offline = false,
    this.error,
  });

  final int synced;
  final int failed;
  final int total;
  final bool offline;
  final String? error;
}

class TechnicianSyncService {
  TechnicianSyncService({
    required this.store,
    required this.endpoint,
    required this.tokenProvider,
    required this.onlineProbe,
    http.Client? client,
    this.onAcknowledgedBatch,
  }) : client = client ?? http.Client();

  final TechnicianOutboxStore store;
  final Uri endpoint;
  final Future<String?> Function() tokenProvider;
  final Future<bool> Function() onlineProbe;
  final http.Client client;
  final Future<void> Function()? onAcknowledgedBatch;

  final Map<String, Future<TechnicianSyncRunResult>> _inFlight = {};

  Future<TechnicianSyncRunResult> sync(TechnicianOutboxOwner owner) {
    final ownerKey = '${owner.userId}:${owner.technicianId}';
    final existing = _inFlight[ownerKey];
    if (existing != null) {
      return existing;
    }

    final run = _performSync(owner);
    _inFlight[ownerKey] = run;
    run.then(
      (_) => _releaseSingleFlight(ownerKey, run),
      onError: (Object _, StackTrace _) => _releaseSingleFlight(ownerKey, run),
    );
    return run;
  }

  void _releaseSingleFlight(
    String ownerKey,
    Future<TechnicianSyncRunResult> run,
  ) {
    if (identical(_inFlight[ownerKey], run)) {
      _inFlight.remove(ownerKey);
    }
  }

  Future<TechnicianSyncRunResult> _performSync(
    TechnicianOutboxOwner owner,
  ) async {
    if (!await onlineProbe()) {
      return const TechnicianSyncRunResult(
        synced: 0,
        failed: 0,
        total: 0,
        offline: true,
      );
    }

    final token = await tokenProvider();
    if (token == null || token.isEmpty) {
      return const TechnicianSyncRunResult(
        synced: 0,
        failed: 0,
        total: 0,
        error: 'Token manquant',
      );
    }

    final claimed = await store.claimSyncBatch(owner);
    if (claimed.isEmpty) {
      return const TechnicianSyncRunResult(synced: 0, failed: 0, total: 0);
    }

    http.Response response;
    try {
      response = await client
          .post(
            endpoint,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $token',
            },
            body: jsonEncode({
              'events': claimed.map((event) => event.toSyncJson()).toList(),
            }),
          )
          .timeout(AppConfig.httpTimeout);
    } catch (error) {
      await _markWholeBatchRetryable(owner, claimed, 'network_error', '$error');
      return TechnicianSyncRunResult(
        synced: 0,
        failed: claimed.length,
        total: claimed.length,
        error: '$error',
      );
    }

    if (response.statusCode != 200) {
      final code = response.statusCode == 401 || response.statusCode == 403
          ? 'authentication_error'
          : 'http_${response.statusCode}';
      await _markWholeBatchRetryable(owner, claimed, code, response.body);
      return TechnicianSyncRunResult(
        synced: 0,
        failed: claimed.length,
        total: claimed.length,
        error: code,
      );
    }

    List<dynamic> rawResults;
    try {
      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      rawResults = decoded['results'] as List<dynamic>;
    } catch (error) {
      await _markWholeBatchRetryable(
        owner,
        claimed,
        'invalid_response',
        '$error',
      );
      return TechnicianSyncRunResult(
        synced: 0,
        failed: claimed.length,
        total: claimed.length,
        error: 'invalid_response',
      );
    }

    final claimedIds = claimed.map((event) => event.eventId).toSet();
    final acknowledgements = <String, TechnicianSyncEventAck>{};
    for (final rawResult in rawResults) {
      if (rawResult is! Map) {
        continue;
      }
      final result = rawResult.cast<String, dynamic>();
      final eventId = result['event_id']?.toString();
      if (eventId == null || !claimedIds.contains(eventId)) {
        continue;
      }
      final status = _serverStatus(result['status']?.toString());
      acknowledgements[eventId] = TechnicianSyncEventAck(
        eventId: eventId,
        status: status,
        code: result['code']?.toString(),
        error: result['error']?.toString(),
      );
    }

    for (final event in claimed) {
      acknowledgements.putIfAbsent(
        event.eventId,
        () => TechnicianSyncEventAck(
          eventId: event.eventId,
          status: TechnicianOutboxStatus.retryable,
          code: 'missing_result',
          error: 'Le serveur n’a pas acquitté cet événement',
        ),
      );
    }

    final results = acknowledgements.values.toList();
    await store.applyAcknowledgements(owner, results);
    final synced = results
        .where((result) => result.status == TechnicianOutboxStatus.acknowledged)
        .length;
    if (synced > 0) {
      await onAcknowledgedBatch?.call();
    }
    return TechnicianSyncRunResult(
      synced: synced,
      failed: results.length - synced,
      total: results.length,
    );
  }

  TechnicianOutboxStatus _serverStatus(String? value) {
    return switch (value) {
      'acknowledged' => TechnicianOutboxStatus.acknowledged,
      'conflict' => TechnicianOutboxStatus.conflict,
      'rejected' => TechnicianOutboxStatus.rejected,
      _ => TechnicianOutboxStatus.retryable,
    };
  }

  Future<void> _markWholeBatchRetryable(
    TechnicianOutboxOwner owner,
    List<TechnicianOutboxEvent> claimed,
    String code,
    String error,
  ) {
    return store.applyAcknowledgements(owner, [
      for (final event in claimed)
        TechnicianSyncEventAck(
          eventId: event.eventId,
          status: TechnicianOutboxStatus.retryable,
          code: code,
          error: error,
        ),
    ]);
  }
}
