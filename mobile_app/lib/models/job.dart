class Job {
  final int id;
  final String jobNumber;
  final String jobType;
  final String status;
  final String customerName;
  final String serviceAddress;
  final int? assignedTechId;

  final double? gpsLatitude;
  final double? gpsLongitude;

  final String? beforePhoto;
  final String? afterPhoto;

  final String? customerPhone;
  final String? scheduledDate;

  final double latitude;
  final double longitude;
  final bool hasServiceCoordinates;

  final String? coordinatorComments;

  final String? ontSerial;
  final String? routerSerial;
  final String? macAddress;
  final String? wifiBoxSerial;

  final String? operator;
  final String? nro;
  final String? sro;
  final String? pbo;
  final String? splitter;
  final int? splitterPort;
  final String? pto;
  final double? opticalPowerDbm;
  final int? cableLengthM;

  final String? validationStatus;
  final bool? rejectedByOperator;
  final String? failureReason;

  Job({
    required this.id,
    required this.jobNumber,
    required this.jobType,
    required this.status,
    required this.customerName,
    required this.serviceAddress,
    required this.assignedTechId,

    this.gpsLatitude,
    this.gpsLongitude,

    this.beforePhoto,
    this.afterPhoto,

    this.customerPhone,
    this.scheduledDate,

    required this.latitude,
    required this.longitude,
    this.hasServiceCoordinates = true,

    this.coordinatorComments,

    this.ontSerial,
    this.routerSerial,
    this.macAddress,
    this.wifiBoxSerial,

    this.operator,
    this.nro,
    this.sro,
    this.pbo,
    this.splitter,
    this.splitterPort,
    this.pto,
    this.opticalPowerDbm,
    this.cableLengthM,

    this.validationStatus,
    this.rejectedByOperator,
    this.failureReason,
  });

  factory Job.fromJson(Map<String, dynamic> json) {
    return Job(
      id: json["id"],
      jobNumber: json["job_number"] ?? "",
      jobType: json["job_type"] ?? "",
      status: json["status"] ?? "",
      customerName: json["customer_name"] ?? "",
      serviceAddress: json["service_address"] ?? "",
      assignedTechId: json["assigned_tech_id"],

      gpsLatitude:
          (json["gps_latitude"] as num?)?.toDouble(),

      gpsLongitude:
          (json["gps_longitude"] as num?)?.toDouble(),

      beforePhoto: json["before_photo"],

      afterPhoto: json["after_photo"],

      customerPhone:
    json["customer_phone"],

      scheduledDate:
    json["scheduled_date"],

      latitude:
    (json["latitude"] as num?)?.toDouble() ?? 0,

      longitude:
    (json["longitude"] as num?)?.toDouble() ?? 0,
      hasServiceCoordinates:
          json["latitude"] != null && json["longitude"] != null,

      coordinatorComments:
          json["coordinator_comments"],

      ontSerial: json["ont_serial"],
      routerSerial: json["router_serial"],
      macAddress: json["mac_address"],
      wifiBoxSerial: json["wifi_box_serial"],
      operator: json["operator"],
      nro: json["nro"],
      sro: json["sro"],
      pbo: json["pbo"],
      splitter: json["splitter"],
      splitterPort: json["splitter_port"],
      pto: json["pto"],
      opticalPowerDbm:(json["optical_power_dbm"] as num?)?.toDouble(),
      cableLengthM: json["cable_length_m"],

      validationStatus: json["validation_status"],
      rejectedByOperator: json["rejected_by_operator"],
      failureReason: json["failure_reason"],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      "id": id,
      "job_number": jobNumber,
      "job_type": jobType,
      "status": status,
      "customer_name": customerName,
      "service_address": serviceAddress,
      "assigned_tech_id": assignedTechId,
      "gps_latitude": gpsLatitude,
      "gps_longitude": gpsLongitude,
      "before_photo": beforePhoto,
      "after_photo": afterPhoto,
      "customer_phone": customerPhone,
      "scheduled_date": scheduledDate,
      "latitude": hasServiceCoordinates ? latitude : null,
      "longitude": hasServiceCoordinates ? longitude : null,
      "coordinator_comments": coordinatorComments,
      "ont_serial": ontSerial,
      "router_serial": routerSerial,
      "mac_address": macAddress,
      "wifi_box_serial": wifiBoxSerial,
      "operator": operator,
      "nro": nro,
      "sro": sro,
      "pbo": pbo,
      "splitter": splitter,
      "splitter_port": splitterPort,
      "pto": pto,
      "optical_power_dbm": opticalPowerDbm,
      "cable_length_m": cableLengthM,
      "validation_status": validationStatus,
      "rejected_by_operator": rejectedByOperator,
      "failure_reason": failureReason,
    };
  }
}