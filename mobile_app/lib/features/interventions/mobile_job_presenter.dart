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
    return (job.validationStatus ?? '').toUpperCase() == 'URGENT' ||
        job.jobType.toUpperCase() == 'URGENCE';
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
        return 'Affectée';
      case 'en_route':
        return 'En route';
      case 'arrived':
      case 'on_site':
        return 'Sur site';
      case 'in_progress':
      case 'work_in_progress':
      case 'en_cours':
      case 'ftth_install':
        return 'En cours';
      case 'tests':
        return 'Tests';
      case 'validation':
      case 'client_validation':
        return 'Validation';
      case 'installation_done':
        return 'Installation terminée';
      case 'en_attente_validation':
        return 'À valider';
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
    if (job.jobType.trim().isNotEmpty) {
      return job.jobType;
    }

    return 'Intervention FTTH';
  }

  static String reference(Job job) {
    if (job.jobNumber.trim().isNotEmpty) {
      return job.jobNumber;
    }

    return 'Intervention #${job.id}';
  }
}
