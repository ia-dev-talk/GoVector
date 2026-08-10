import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../features/sync/technician_outbox_event.dart';
import '../../services/intervention_service.dart';
import '../../services/offline_service.dart';

class MobileJobJournal extends StatefulWidget {
  const MobileJobJournal({
    super.key,
    required this.jobId,
    required this.refreshToken,
  });

  final int jobId;
  final Object refreshToken;

  @override
  State<MobileJobJournal> createState() => _MobileJobJournalState();
}

class _MobileJobJournalState extends State<MobileJobJournal> {
  List<_JournalEntry> _entries = const [];
  bool _loading = true;
  bool _serverUnavailable = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant MobileJobJournal oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.jobId != widget.jobId ||
        oldWidget.refreshToken != widget.refreshToken) {
      _load();
    }
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    List<Map<String, dynamic>> server = const [];
    var serverUnavailable = false;
    try {
      server = await InterventionService.getActivityLog(jobId: widget.jobId);
    } catch (_) {
      serverUnavailable = true;
    }
    final local = await OfflineService.getPendingEventsForJob(widget.jobId);
    final entries = <_JournalEntry>[
      for (final item in server) _JournalEntry.fromServer(item),
      for (final event in local) _JournalEntry.fromLocal(event),
    ]..sort((a, b) => a.occurredAt.compareTo(b.occurredAt));
    if (!mounted) return;
    setState(() {
      _entries = entries;
      _loading = false;
      _serverUnavailable = serverUnavailable;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.md),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
        border: Border.all(color: BlueVectorColors.border),
      ),
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : _entries.isEmpty
          ? Text(
              _serverUnavailable
                  ? 'Journal serveur indisponible hors ligne.'
                  : 'Aucune activité enregistrée.',
              style: const TextStyle(color: BlueVectorColors.textMuted),
            )
          : Column(
              children: [
                if (_serverUnavailable)
                  const Padding(
                    padding: EdgeInsets.only(bottom: BlueVectorSpacing.sm),
                    child: Row(
                      children: [
                        Icon(
                          Icons.cloud_off_outlined,
                          size: 14,
                          color: BlueVectorColors.warning,
                        ),
                        SizedBox(width: BlueVectorSpacing.xs),
                        Text(
                          'Activités locales affichées',
                          style: TextStyle(
                            color: BlueVectorColors.warning,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                for (var index = 0; index < _entries.length; index++)
                  _JournalRow(
                    entry: _entries[index],
                    isLast: index == _entries.length - 1,
                  ),
              ],
            ),
    );
  }
}

class _JournalEntry {
  const _JournalEntry({
    required this.label,
    required this.occurredAt,
    this.localState,
  });

  final String label;
  final DateTime occurredAt;
  final String? localState;

  factory _JournalEntry.fromServer(Map<String, dynamic> json) {
    final action = json['action']?.toString() ?? 'activity';
    return _JournalEntry(
      label: json['description']?.toString().trim().isNotEmpty == true
          ? json['description'].toString()
          : _actionLabel(action),
      occurredAt:
          DateTime.tryParse(json['created_at']?.toString() ?? '')?.toLocal() ??
          DateTime.fromMillisecondsSinceEpoch(0),
    );
  }

  factory _JournalEntry.fromLocal(TechnicianOutboxEvent event) {
    final attention =
        event.status == TechnicianOutboxStatus.conflict ||
        event.status == TechnicianOutboxStatus.rejected;
    return _JournalEntry(
      label: _localDescription(event),
      occurredAt: event.occurredAt.toLocal(),
      localState: attention ? 'À vérifier' : 'Local',
    );
  }

  static String _localDescription(TechnicianOutboxEvent event) {
    final detail =
        event.payload['value'] ??
        event.payload['comment'] ??
        event.payload['note'] ??
        event.payload['reference'] ??
        event.payload['code'];
    final label = _actionLabel(event.type);
    return detail == null ? label : '$label — $detail';
  }

  static String _actionLabel(String action) => switch (action) {
    'accepted' => 'Intervention acceptée',
    'en_route' => 'Départ vers le client',
    'on_site' => 'Arrivée sur site',
    'in_progress' || 'work_in_progress' => 'Travaux démarrés',
    'installation_done' => 'Installation terminée',
    'client_validation' => 'Validation terrain enregistrée',
    'en_attente_validation' ||
    'complete_job' => 'Intervention transmise pour validation',
    'failed' => 'Intervention en échec',
    'postponed' => 'Intervention reportée',
    'intervention_photo' => 'Photo ajoutée',
    'intervention_video' => 'Vidéo ajoutée',
    'intervention_document' => 'Document ajouté',
    'intervention_comment' => 'Commentaire',
    'field_measurement' => 'Mesure ajoutée',
    'otdr_measurement' => 'Mesure OTDR ajoutée',
    'incident_report' => 'Incident / anomalie',
    'installation_work' => 'Travaux enregistrés',
    'equipment_scan' => 'Équipement scanné',
    'network_reference' => 'Référence réseau ajoutée',
    'material_used' => 'Matériel utilisé',
    'gps_position' => 'Position GPS enregistrée',
    'site_location' => 'Position exacte du site signalée',
    'cable_entry' => 'Entrée de câble signalée',
    'cable_exit' => 'Sortie de câble signalée',
    'client_call' => 'Appel client enregistré',
    'client_signature' => 'Signature client ajoutée',
    _ => action.replaceAll('_', ' '),
  };
}

class _JournalRow extends StatelessWidget {
  const _JournalRow({required this.entry, required this.isLast});

  final _JournalEntry entry;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final pending = entry.localState != null;
    final color = entry.localState == 'À vérifier'
        ? BlueVectorColors.danger
        : pending
        ? BlueVectorColors.warning
        : BlueVectorColors.success;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 24,
            child: Column(
              children: [
                Icon(
                  pending ? Icons.schedule_rounded : Icons.check_circle_rounded,
                  color: color,
                  size: 18,
                ),
                if (!isLast)
                  Expanded(
                    child: Container(width: 1, color: BlueVectorColors.border),
                  ),
              ],
            ),
          ),
          const SizedBox(width: BlueVectorSpacing.sm),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: BlueVectorSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entry.label,
                    style: const TextStyle(
                      color: BlueVectorColors.textPrimary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Text(
                        DateFormat('HH:mm', 'fr_FR').format(entry.occurredAt),
                        style: const TextStyle(
                          color: BlueVectorColors.textMuted,
                          fontSize: 10,
                        ),
                      ),
                      if (entry.localState != null) ...[
                        const SizedBox(width: BlueVectorSpacing.xs),
                        Text(
                          entry.localState!,
                          style: TextStyle(
                            color: color,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
