class TechnicianHistoryActivity {
  const TechnicianHistoryActivity({
    required this.action,
    this.createdAt,
    this.description,
    this.oldStatus,
    this.newStatus,
    this.technicianName,
  });

  final String action;
  final DateTime? createdAt;
  final String? description;
  final String? oldStatus;
  final String? newStatus;
  final String? technicianName;

  factory TechnicianHistoryActivity.fromJson(Map<String, dynamic> json) {
    return TechnicianHistoryActivity(
      action: json['action'] as String? ?? '',
      createdAt: DateTime.tryParse(json['created_at'] as String? ?? ''),
      description: json['description'] as String?,
      oldStatus: json['old_status'] as String?,
      newStatus: json['new_status'] as String?,
      technicianName: json['technician_name'] as String?,
    );
  }
}

class TechnicianHistoryItem {
  const TechnicianHistoryItem({
    required this.jobId,
    this.date,
    required this.activity,
    required this.client,
    required this.address,
    required this.status,
    this.jobNumber,
    this.result,
    this.operator,
    this.nro,
    this.sro,
    this.pbo,
    this.pto,
    this.startedAt,
    this.arrivalTime,
    this.durationMinutes,
    this.completedAt,
    this.failureReason,
    this.report,
    this.technicianName,
    this.isCurrent = false,
    this.timeline = const [],
  });

  final int jobId;
  final String? jobNumber;
  final DateTime? date;
  final String activity;
  final String client;
  final String address;
  final String status;
  final String? result;
  final String? operator;
  final String? nro;
  final String? sro;
  final String? pbo;
  final String? pto;
  final DateTime? startedAt;
  final DateTime? arrivalTime;
  final int? durationMinutes;
  final DateTime? completedAt;
  final String? failureReason;
  final String? report;
  final String? technicianName;
  final bool isCurrent;
  final List<TechnicianHistoryActivity> timeline;

  factory TechnicianHistoryItem.fromJson(Map<String, dynamic> json) {
    DateTime? parseDate(String key) {
      return DateTime.tryParse(json[key] as String? ?? '');
    }

    return TechnicianHistoryItem(
      jobId: json['job_id'] as int,
      jobNumber: json['job_number'] as String?,
      date: parseDate('date'),
      activity: json['activity'] as String? ?? '',
      client: json['client'] as String? ?? '',
      address: json['address'] as String? ?? '',
      status: json['status'] as String? ?? '',
      result: json['result'] as String?,
      operator: json['operator'] as String?,
      nro: json['nro'] as String?,
      sro: json['sro'] as String?,
      pbo: json['pbo'] as String?,
      pto: json['pto'] as String?,
      startedAt: parseDate('started_at'),
      arrivalTime: parseDate('arrival_time'),
      durationMinutes: json['duration_minutes'] as int?,
      completedAt: parseDate('completed_at'),
      failureReason: json['failure_reason'] as String?,
      report: json['report'] as String?,
      technicianName: json['technician_name'] as String?,
      isCurrent: json['is_current'] as bool? ?? false,
      timeline: (json['timeline'] as List<dynamic>? ?? const [])
          .map(
            (entry) => TechnicianHistoryActivity.fromJson(
              entry as Map<String, dynamic>,
            ),
          )
          .toList(),
    );
  }
}

class TechnicianHistoryPage {
  const TechnicianHistoryPage({
    required this.items,
    required this.page,
    required this.pageSize,
    required this.total,
    required this.pages,
    this.matchBasis,
    this.matchConfidence,
  });

  final List<TechnicianHistoryItem> items;
  final int page;
  final int pageSize;
  final int total;
  final int pages;
  final String? matchBasis;
  final String? matchConfidence;

  factory TechnicianHistoryPage.fromJson(Map<String, dynamic> json) {
    return TechnicianHistoryPage(
      items: (json['items'] as List<dynamic>? ?? const [])
          .map(
            (entry) =>
                TechnicianHistoryItem.fromJson(entry as Map<String, dynamic>),
          )
          .toList(),
      page: json['page'] as int? ?? 1,
      pageSize: json['page_size'] as int? ?? 20,
      total: json['total'] as int? ?? 0,
      pages: json['pages'] as int? ?? 0,
      matchBasis: json['match_basis'] as String?,
      matchConfidence: json['match_confidence'] as String?,
    );
  }
}

class TechnicianHistoryDetail {
  const TechnicianHistoryDetail({
    required this.intervention,
    required this.activityLog,
    required this.fieldData,
    required this.failures,
    required this.postponements,
    required this.materials,
    required this.mediaReferences,
    required this.readOnly,
  });

  final TechnicianHistoryItem intervention;
  final List<TechnicianHistoryActivity> activityLog;
  final Map<String, dynamic> fieldData;
  final List<Map<String, dynamic>> failures;
  final List<Map<String, dynamic>> postponements;
  final List<Map<String, dynamic>> materials;
  final List<Map<String, dynamic>> mediaReferences;
  final bool readOnly;

  factory TechnicianHistoryDetail.fromJson(Map<String, dynamic> json) {
    List<Map<String, dynamic>> maps(String key) {
      return (json[key] as List<dynamic>? ?? const [])
          .map((value) => Map<String, dynamic>.from(value as Map))
          .toList();
    }

    return TechnicianHistoryDetail(
      intervention: TechnicianHistoryItem.fromJson(
        json['intervention'] as Map<String, dynamic>,
      ),
      activityLog: (json['activity_log'] as List<dynamic>? ?? const [])
          .map(
            (entry) => TechnicianHistoryActivity.fromJson(
              entry as Map<String, dynamic>,
            ),
          )
          .toList(),
      fieldData: Map<String, dynamic>.from(
        json['field_data'] as Map? ?? const {},
      ),
      failures: maps('failures'),
      postponements: maps('postponements'),
      materials: maps('materials'),
      mediaReferences: maps('media_references'),
      readOnly: json['read_only'] as bool? ?? true,
    );
  }
}

class CachedHistory<T> {
  const CachedHistory({
    required this.value,
    required this.fromCache,
    required this.lastUpdated,
  });

  final T value;
  final bool fromCache;
  final DateTime lastUpdated;
}
