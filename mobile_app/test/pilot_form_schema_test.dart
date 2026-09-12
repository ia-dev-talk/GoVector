import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/actions/pilot_form_schema.dart';

void main() {
  List<PilotFieldDefinition> fieldsFor(String jobType) =>
      pilotFormSchemaForJobType(jobType)
          .sections
          .expand((section) => section.fields)
          .toList();

  PilotFieldDefinition field(String jobType, String key) =>
      fieldsFor(jobType).singleWhere((item) => item.key == key);

  test('Raccordement mirrors the confirmed Praxedo report', () {
    final schema = pilotFormSchemaForJobType('RACCORDEMENT');
    final fields = fieldsFor('RACCORDEMENT');

    expect(schema.id, 'raccordement');
    for (final key in [
      'observations',
      'photo_before',
      'photo_during',
      'photo_after',
      'site_gps',
      'completed',
      'technician_signature',
    ]) {
      expect(field('RACCORDEMENT', key).isRequired, isTrue, reason: key);
    }
    expect(field('RACCORDEMENT', 'failure_reason').condition?.field, 'completed');
    expect(field('RACCORDEMENT', 'failure_reason').condition?.equals, false);
    expect(field('RACCORDEMENT', 'failure_reason').isRequired, isTrue);
    expect(field('RACCORDEMENT', 'client_signature').isRequired, isFalse);
    expect(field('RACCORDEMENT', 'cable').kind, PilotFieldKind.text);
    expect(field('RACCORDEMENT', 'cable').multiline, isTrue);
    expect(fields.any((item) => item.key == 'cable_entry'), isFalse);
    expect(fields.any((item) => item.key == 'cable_exit'), isFalse);
    expect(fields.any((item) => item.key == 'pco'), isTrue);
    expect(fields.any((item) => item.key == 'msan'), isTrue);
  });

  test('PB and PM use the confirmed Raccordement form', () {
    expect(pilotFormSchemaForJobType('PB').id, 'raccordement');
    expect(pilotFormSchemaForJobType('PM').id, 'raccordement');
  });

  test('PTO mirrors required Praxedo fields and failure condition', () {
    final schema = pilotFormSchemaForJobType('PTO');

    expect(schema.id, 'pto');
    for (final key in [
      'num_port',
      'observations',
      'photo_before',
      'photo_during',
      'photo_after',
      'site_gps',
      'completed',
      'technician_signature',
    ]) {
      expect(field('PTO', key).isRequired, isTrue, reason: key);
    }
    final reason = field('PTO', 'failure_reason');
    expect(reason.condition?.field, 'completed');
    expect(reason.condition?.equals, false);
    expect(reason.isRequired, isTrue);
    expect(field('PTO', 'client_signature').isRequired, isFalse);
  });

  test('SORTIE DE PCO exposes conditional cable, splitter and joint fields', () {
    final schema = pilotFormSchemaForJobType('TUBAGE');

    expect(schema.label, 'SORTIE DE PCO IAM');
    expect(field('TUBAGE', 'cable_entry').isRequired, isTrue);
    expect(field('TUBAGE', 'cable_exit').isRequired, isTrue);
    expect(field('TUBAGE', 'cable_departure_photo').isRequired, isTrue);
    expect(field('TUBAGE', 'cable_arrival_photo').isRequired, isTrue);
    expect(
      field('TUBAGE', 'additional_cable_entry').condition?.field,
      'additional_cable',
    );
    expect(
      field('TUBAGE', 'additional_cable_entry').action,
      'cable_entry:additional_1',
    );
    expect(
      field('TUBAGE', 'additional_cable_2_entry').action,
      'cable_entry:additional_2',
    );
    expect(field('TUBAGE', 'splitter_before').condition?.field, 'new_splitter');
    expect(field('TUBAGE', 'joint_before').condition?.field, 'new_joint');
  });

  test('SORTIE DE PCO locks confirmed raccordement photo types', () {
    expect(field('TUBAGE', 'pco_progress').kind, PilotFieldKind.photo);
    expect(field('TUBAGE', 'pco_progress').photoLabel, 'pco_during');
    expect(field('TUBAGE', 'pco_progress').isRequired, isTrue);
    expect(field('TUBAGE', 'pco_after').kind, PilotFieldKind.photo);
    expect(field('TUBAGE', 'pco_after').isRequired, isTrue);
    expect(field('TUBAGE', 'pco_label').kind, PilotFieldKind.text);
    expect(field('TUBAGE', 'pco_label').isRequired, isTrue);
    expect(field('TUBAGE', 'pto').kind, PilotFieldKind.photo);
    expect(field('TUBAGE', 'ont_signal').kind, PilotFieldKind.photo);
    expect(field('TUBAGE', 'ont_serial').kind, PilotFieldKind.photo);
    expect(field('TUBAGE', 'ont_serial').photoLabel, 'ont_serial');
    expect(field('TUBAGE', 'ont_serial').isRequired, isTrue);
    expect(field('TUBAGE', 'client_connected').isRequired, isFalse);
    expect(field('TUBAGE', 'comment').isRequired, isFalse);
  });

  test('configured SORTIE DE PCO IAM uses its dedicated form', () {
    final schema = pilotFormSchemaForJobType('SORTIE DE PCO IAM');
    expect(schema.id, 'sortie_pco_iam');
    expect(fieldsFor('SORTIE DE PCO IAM').any((item) => item.key == 'splitter_after'), isTrue);
  });

  test('FTTH Réalisable mirrors confirmed Praxedo photo evidence', () {
    final schema = pilotFormSchemaForJobType('FTTH Réalisable');

    expect(schema.id, 'ftth_realisable');
    expect(field('FTTH Réalisable', 'branch_cable_length_m').isRequired, isTrue);
    expect(field('FTTH Réalisable', 'pco').kind, PilotFieldKind.photo);
    expect(field('FTTH Réalisable', 'pco').isRequired, isTrue);
    expect(field('FTTH Réalisable', 'pco_label').kind, PilotFieldKind.text);
    expect(field('FTTH Réalisable', 'pco_label').isRequired, isTrue);
    expect(field('FTTH Réalisable', 'pto').kind, PilotFieldKind.photo);
    expect(field('FTTH Réalisable', 'ont_signal').kind, PilotFieldKind.photo);
    expect(field('FTTH Réalisable', 'ont_serial').kind, PilotFieldKind.photo);
    expect(field('FTTH Réalisable', 'ont_serial').photoLabel, 'ont_serial');
    expect(field('FTTH Réalisable', 'client_connected').isRequired, isFalse);
    expect(field('FTTH Réalisable', 'comment').isRequired, isFalse);
    expect(fieldsFor('FTTH Réalisable').any((item) => item.key == 'photo_before'), isFalse);
  });
}
