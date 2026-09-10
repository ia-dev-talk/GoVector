import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/actions/pilot_form_schema.dart';

void main() {
  test(
    'SORTIE DE PCO exposes conditional cable, splitter and joint fields',
    () {
      final schema = pilotFormSchemaForJobType('TUBAGE');
      final fields = schema.sections
          .expand((section) => section.fields)
          .toList();

      expect(schema.label, 'SORTIE DE PCO IAM');
      expect(
        fields
            .firstWhere((field) => field.key == 'additional_cable_entry')
            .condition
            ?.field,
        'additional_cable',
      );
      expect(
        fields
            .firstWhere((field) => field.key == 'additional_cable_entry')
            .action,
        'cable_entry:additional_1',
      );
      expect(
        fields
            .firstWhere((field) => field.key == 'additional_cable_2_entry')
            .action,
        'cable_entry:additional_2',
      );
      expect(
        fields
            .firstWhere((field) => field.key == 'splitter_before')
            .condition
            ?.field,
        'new_splitter',
      );
      expect(
        fields
            .firstWhere((field) => field.key == 'joint_before')
            .condition
            ?.field,
        'new_joint',
      );
    },
  );

  test('Raccordement only reveals the reason when the intervention fails', () {
    final schema = pilotFormSchemaForJobType('RACCORDEMENT');
    final fields = schema.sections.expand((section) => section.fields).toList();
    final reason = fields.firstWhere((field) => field.key == 'failure_reason');

    expect(schema.label, 'Raccordement');
    expect(reason.condition?.field, 'completed');
    expect(reason.condition?.equals, false);
  });
}
