import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../design_system/bluevector_tokens.dart';
import '../../models/job.dart';
import 'technician_job_status.dart';

abstract final class MobileJobPresenter {
  static String normalizedStatus(Job job) {
    return TechnicianJobStatus.normalize(job.status);
  }

  static bool isTerminal(Job job) {
    return TechnicianJobStatus.isTechnicianTerminalStatus(job.status);
  }

  static bool isActive(Job job) {
    return TechnicianJobStatus.isTechnicianActiveStatus(job.status);
  }

  static bool isUrgent(Job job) {
    final priority = (job.priority ?? '').trim().toUpperCase();
    final validation = (job.validationStatus ?? '').trim().toUpperCase();
    final type = job.jobType.trim().toUpperCase();

    return priority == 'URGENT' || validation == 'URGENT' || type == 'URGENCE';
  }

  static DateTime? scheduledAt(Job job) {
    final value = job.scheduledDate;

    if (value == null || value.isEmpty) {
      return null;
    }

    return DateTime.tryParse(value)?.toLocal();
  }

  static bool isToday(Job job) {
    final date = scheduledAt(job);

    if (date == null) {
      return false;
    }

    final now = DateTime.now();

    return date.year == now.year &&
        date.month == now.month &&
        date.day == now.day;
  }

  static bool isUpcoming(Job job) {
    final date = scheduledAt(job);

    if (date == null || isTerminal(job)) {
      return false;
    }

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    return date.isAfter(today.add(const Duration(days: 1))) ||
        (!isToday(job) && date.isAfter(today));
  }

  static String timeLabel(Job job) {
    final date = scheduledAt(job);

    if (date == null) {
      return '--:--';
    }

    return DateFormat('HH:mm', 'fr_FR').format(date);
  }

  static String dayLabel(Job job) {
    final date = scheduledAt(job);

    if (date == null) {
      return 'Date non renseignée';
    }

    if (isToday(job)) {
      return 'Aujourd’hui';
    }

    return DateFormat('EEE d MMM', 'fr_FR').format(date);
  }

  static String statusLabel(Job job) {
    switch (normalizedStatus(job)) {
      case 'assigned':
      case 'affectee':
      case 'accepted':
        return 'Affectée';
      case 'en_route':
        return 'En route';
      case 'arrived':
      case 'on_site':
      case 'in_progress':
      case 'work_in_progress':
      case 'en_cours':
      case 'ftth_install':
      case 'tests':
      case 'validation':
      case 'client_validation':
      case 'installation_done':
        // These remain distinct internally for audit/backward compatibility,
        // but the technician only needs to understand that they are on site.
        return 'Sur site';
      case 'en_attente_validation':
        return 'À contrôler';
      case 'completed':
      case 'terminee':
        return 'Terminée';
      case 'failed':
        return 'Échec';
      case 'cancelled':
      case 'annulee':
        return 'Annulée';
      case 'postponed':
        return 'Reportée';
      case 'client_absent':
        return 'Client absent';
      default:
        return job.status.isEmpty ? 'À traiter' : job.status;
    }
  }

  static Color statusColor(Job job) {
    switch (normalizedStatus(job)) {
      case 'in_progress':
      case 'work_in_progress':
      case 'en_cours':
      case 'ftth_install':
        return BlueVectorColors.success;
      case 'en_route':
      case 'arrived':
      case 'on_site':
        return BlueVectorColors.warning;
      case 'tests':
      case 'validation':
      case 'client_validation':
      case 'installation_done':
        return BlueVectorColors.violet;
      case 'completed':
      case 'terminee':
      case 'en_attente_validation':
        return BlueVectorColors.success;
      case 'failed':
        return BlueVectorColors.danger;
      case 'cancelled':
      case 'annulee':
        return BlueVectorColors.textMuted;
      case 'postponed':
      case 'client_absent':
        return BlueVectorColors.warning;
      default:
        return BlueVectorColors.primaryBright;
    }
  }

  static IconData typeIcon(Job job) {
    final type = job.jobType.toUpperCase();

    if (type.contains('INSTALL')) {
      return Icons.cable_rounded;
    }

    if (type.contains('DEPANN') || type.contains('SAV')) {
      return Icons.build_rounded;
    }

    if (type.contains('MAINTEN')) {
      return Icons.engineering_rounded;
    }

    if (type.contains('MIGRATION')) {
      return Icons.swap_horiz_rounded;
    }

    return Icons.assignment_outlined;
  }

  static String title(Job job) {
    final raw = job.jobType.trim();

    if (raw.isEmpty) {
      return 'Intervention FTTH';
    }

    final normalized = raw
        .toUpperCase()
        .replaceAll(RegExp(r'[\s_-]+'), ' ')
        .trim();

    const labels = <String, String>{
      'DEPANNAGE': 'Dépannage',
      'DEPANNAGE FTTH': 'Dépannage FTTH',
      'SAV': 'SAV',
      'SAV FTTH': 'SAV FTTH',
      'INSTALLATION': 'Installation',
      'INSTALLATION FTTH': 'Installation FTTH',
      'MAINTENANCE': 'Maintenance',
      'MAINTENANCE FTTH': 'Maintenance FTTH',
      'MIGRATION': 'Migration',
      'MIGRATION FTTH': 'Migration FTTH',
      'URGENCE': 'Urgence',
    };

    final known = labels[normalized];
    if (known != null) {
      return known;
    }

    if (raw == raw.toUpperCase()) {
      return raw
          .toLowerCase()
          .split(RegExp(r'\s+'))
          .where((part) => part.isNotEmpty)
          .map(
            (part) => part.length == 1
                ? part.toUpperCase()
                : '${part[0].toUpperCase()}${part.substring(1)}',
          )
          .join(' ');
    }

    return raw;
  }

  static String reference(Job job) {
    if (job.jobNumber.trim().isNotEmpty) {
      return job.jobNumber;
    }

    return 'Intervention #${job.id}';
  }
}
