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

  test('SORTIE DE PCO exposes PCO labeling as text', () {
    final schema = pilotFormSchemaForJobType('TUBAGE');
    final fields = schema.sections.expand((section) => section.fields).toList();
    final pcoLabel = fields.singleWhere((field) => field.key == 'pco_label');

    expect(pcoLabel.label, 'Étiquetage PCO');
    expect(pcoLabel.kind, PilotFieldKind.text);
    expect(pcoLabel.photoLabel, isNull);
    expect(
      fields.singleWhere((field) => field.key == 'pco_progress').kind,
      PilotFieldKind.photo,
    );
    expect(
      fields.singleWhere((field) => field.key == 'pco_after').kind,
      PilotFieldKind.photo,
    );
  });

  test('configured SORTIE DE PCO IAM uses its dedicated form', () {
    final schema = pilotFormSchemaForJobType('SORTIE DE PCO IAM');
    final fields = schema.sections.expand((section) => section.fields).toList();

    expect(schema.id, 'sortie_pco_iam');
    expect(fields.any((field) => field.key == 'cable_departure_photo'), isTrue);
    expect(fields.any((field) => field.key == 'splitter_before'), isTrue);
    expect(fields.any((field) => field.key == 'splitter_after'), isTrue);
  });

  test('PB and PM use the confirmed Raccordement form', () {
    expect(pilotFormSchemaForJobType('PB').id, 'raccordement');
    expect(pilotFormSchemaForJobType('PM').id, 'raccordement');
    final fields = pilotFormSchemaForJobType('PB')
        .sections
        .expand((section) => section.fields)
        .toList();
    expect(fields.any((field) => field.key == 'photo_before'), isTrue);
    expect(fields.any((field) => field.key == 'photo_during'), isTrue);
    expect(fields.any((field) => field.key == 'photo_after'), isTrue);
    expect(fields.any((field) => field.key == 'msan'), isTrue);
  });

  test('PTO uses its own confirmed report fields', () {
    final schema = pilotFormSchemaForJobType('PTO');
    final fields = schema.sections.expand((section) => section.fields).toList();

    expect(schema.id, 'pto');
    expect(fields.any((field) => field.key == 'num_port'), isTrue);
    expect(fields.any((field) => field.key == 'observations'), isTrue);
    expect(fields.any((field) => field.key == 'photo_before'), isTrue);
    expect(fields.any((field) => field.key == 'photo_during'), isTrue);
    expect(fields.any((field) => field.key == 'photo_after'), isTrue);
    final reason = fields.singleWhere((field) => field.key == 'failure_reason');
    expect(reason.condition?.field, 'completed');
    expect(reason.condition?.equals, false);
  });

  test('FTTH Réalisable uses its dedicated confirmed fields only', () {
    final schema = pilotFormSchemaForJobType('FTTH Réalisable');
    final fields = schema.sections.expand((section) => section.fields).toList();

    expect(schema.id, 'ftth_realisable');
    expect(fields.any((field) => field.key == 'branch_cable_length_m'), isTrue);
    expect(fields.any((field) => field.key == 'pco'), isTrue);
    expect(fields.any((field) => field.key == 'pco_label'), isTrue);
    expect(fields.any((field) => field.key == 'pto'), isTrue);
    expect(fields.any((field) => field.key == 'ont_signal'), isTrue);
    expect(fields.any((field) => field.key == 'ont_serial'), isTrue);
    expect(fields.any((field) => field.key == 'client_connected'), isTrue);
    expect(fields.any((field) => field.key == 'photo_before'), isFalse);
    expect(fields.any((field) => field.key == 'photo_after'), isFalse);
  });

  test('Raccordement only reveals the reason when the intervention fails', () {
    final schema = pilotFormSchemaForJobType('RACCORDEMENT');
    final fields = schema.sections.expand((section) => section.fields).toList();
    final reason = fields.firstWhere((field) => field.key == 'failure_reason');

    expect(schema.label, 'Raccordement');
    expect(reason.condition?.field, 'completed');
    expect(reason.condition?.equals, false);
  });
}
