class Equipment {
  final int id;
  final String serialNumber;
  final String operator;
  final String equipmentType;
  final String? model;
  final String status;
  final String? warehouse;
  final String? vehicle;
  final int? assignedJobId;
  final String? macAddress;
  final String createdAt;

  Equipment({
    required this.id,
    required this.serialNumber,
    required this.operator,
    required this.equipmentType,
    this.model,
    required this.status,
    this.warehouse,
    this.vehicle,
    this.assignedJobId,
    this.macAddress,
    required this.createdAt,
  });

  factory Equipment.fromJson(Map<String, dynamic> json) {
    return Equipment(
      id: json['id'] is int ? json['id'] : int.tryParse('${json['id']}') ?? 0,
      serialNumber: json['serial_number'] ?? json['serialNumber'] ?? '',
      operator: json['operator'] ?? '',
      equipmentType: json['equipment_type'] ?? json['equipmentType'] ?? '',
      model: json['model'],
      status: json['status'] ?? '',
      warehouse: json['warehouse'],
      vehicle: json['vehicle'],
      assignedJobId: json['assigned_job_id'] ?? json['assignedJobId'],
      macAddress: json['mac_address'] ?? json['macAddress'],
      createdAt: json['created_at'] ?? json['createdAt'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'serial_number': serialNumber,
      'serialNumber': serialNumber,
      'operator': operator,
      'equipment_type': equipmentType,
      'equipmentType': equipmentType,
      'model': model,
      'status': status,
      'warehouse': warehouse,
      'vehicle': vehicle,
      'assigned_job_id': assignedJobId,
      'assignedJobId': assignedJobId,
      'mac_address': macAddress,
      'macAddress': macAddress,
      'created_at': createdAt,
      'createdAt': createdAt,
    };
  }
}