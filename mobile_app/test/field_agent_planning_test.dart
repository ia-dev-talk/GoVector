import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/agent/field_agent_shell.dart';
import 'package:mobile_app/models/job.dart';
import 'package:mobile_app/services/field_agent_service.dart';

FieldAgentJobContext _context({
  required int jobId,
  required int technicianId,
  required String technicianName,
  String customer = 'Client test',
  String address = 'Casablanca',
  String operator = 'Orange Maroc',
  String? employeeId,
}) {
  return FieldAgentJobContext(
    job: Job(
      id: jobId,
      jobNumber: 'DTLI-$jobId',
      jobType: 'INSTALLATION',
      status: 'assigned',
      customerName: customer,
      serviceAddress: address,
      assignedTechId: technicianId,
      latitude: 33.57,
      longitude: -7.59,
      operator: operator,
    ),
    technicianId: technicianId,
    technicianName: technicianName,
    employeeId: employeeId,
  );
}

void main() {
  test('Agent reads available technician stock from stock_summary', () {
    final stock = <String, dynamic>{
      'vehicle_stock': [
        {'available_quantity': 3},
        {'available_quantity': 7},
      ],
      'stock_summary': {
        'line_count': 2,
        'total_units': 14,
        'available_units': 10,
      },
    };

    expect(fieldAgentStockAvailableUnits(stock), 10);
  });

  test('Agent falls back to vehicle_stock when summary is absent', () {
    final stock = <String, dynamic>{
      'vehicle_stock': [
        {'available_quantity': 3},
        {'available_quantity': '4'},
        {'quantity': 2},
      ],
    };

    expect(fieldAgentStockAvailableUnits(stock), 9);
  });

  test('Agent active team metric counts technicians, not jobs', () {
    final jobs = [
      _context(jobId: 1, technicianId: 10, technicianName: 'Amine Benali'),
      _context(jobId: 2, technicianId: 10, technicianName: 'Amine Benali'),
      _context(jobId: 3, technicianId: 20, technicianName: 'Sara Alaoui'),
    ];

    expect(fieldAgentActiveTechnicianCount(jobs), 2);
  });

  test('Agent planning search covers operational identifiers', () {
    final row = _context(
      jobId: 42,
      technicianId: 10,
      technicianName: 'Amine Benali',
      customer: 'Client Maarif',
      address: 'Boulevard Zerktouni Casablanca',
      operator: 'Orange Maroc',
      employeeId: 'TECH-0010',
    );

    expect(fieldAgentJobMatchesQuery(row, 'DTLI-42'), isTrue);
    expect(fieldAgentJobMatchesQuery(row, 'amine'), isTrue);
    expect(fieldAgentJobMatchesQuery(row, 'maarif'), isTrue);
    expect(fieldAgentJobMatchesQuery(row, 'zerktouni'), isTrue);
    expect(fieldAgentJobMatchesQuery(row, 'orange'), isTrue);
    expect(fieldAgentJobMatchesQuery(row, 'TECH-0010'), isTrue);
    expect(fieldAgentJobMatchesQuery(row, 'inexistant'), isFalse);
  });
}
