enum PilotFieldKind { text, number, yesNo, photo, action }

class PilotFieldCondition {
  const PilotFieldCondition(this.field, this.equals);

  final String field;
  final Object equals;
}

class PilotFieldDefinition {
  const PilotFieldDefinition({
    required this.key,
    required this.label,
    required this.kind,
    this.condition,
    this.photoLabel,
    this.action,
    this.helper,
  });

  final String key;
  final String label;
  final PilotFieldKind kind;
  final PilotFieldCondition? condition;
  final String? photoLabel;
  final String? action;
  final String? helper;
}

class PilotFormSection {
  const PilotFormSection({required this.title, required this.fields});

  final String title;
  final List<PilotFieldDefinition> fields;
}

class PilotFormSchema {
  const PilotFormSchema({
    required this.id,
    required this.label,
    required this.sections,
  });

  final String id;
  final String label;
  final List<PilotFormSection> sections;
}

// Praxedo "Raccordement" is the form used by PB and PM in the pilot evidence.
const _raccordementSchema = PilotFormSchema(
  id: 'raccordement',
  label: 'Raccordement',
  sections: [
    PilotFormSection(
      title: 'Compte rendu',
      fields: [
        PilotFieldDefinition(
          key: 'observations',
          label: 'Observations',
          kind: PilotFieldKind.text,
        ),
        PilotFieldDefinition(
          key: 'photo_before',
          label: 'Photos avant',
          kind: PilotFieldKind.photo,
          photoLabel: 'before',
        ),
        PilotFieldDefinition(
          key: 'photo_during',
          label: 'Photos pendant',
          kind: PilotFieldKind.photo,
          photoLabel: 'during',
        ),
        PilotFieldDefinition(
          key: 'photo_after',
          label: 'Photos après',
          kind: PilotFieldKind.photo,
          photoLabel: 'after',
        ),
        PilotFieldDefinition(
          key: 'site_gps',
          label: 'Point GPS de l’intervention',
          kind: PilotFieldKind.action,
          action: 'site_location',
        ),
        PilotFieldDefinition(
          key: 'completed',
          label: 'Intervention réalisée ?',
          kind: PilotFieldKind.yesNo,
        ),
        PilotFieldDefinition(
          key: 'failure_reason',
          label: 'Pourquoi ?',
          kind: PilotFieldKind.text,
          condition: PilotFieldCondition('completed', false),
        ),
      ],
    ),
    PilotFormSection(
      title: 'Preuves et réseau',
      fields: [
        PilotFieldDefinition(
          key: 'technician_signature',
          label: 'Signature technicien',
          kind: PilotFieldKind.photo,
          photoLabel: 'technician_signature',
        ),
        PilotFieldDefinition(
          key: 'client_signature',
          label: 'Signature client',
          kind: PilotFieldKind.action,
          action: 'client_signature',
        ),
        PilotFieldDefinition(
          key: 'cable_entry',
          label: 'Câble — relevé départ',
          kind: PilotFieldKind.action,
          action: 'cable_entry',
        ),
        PilotFieldDefinition(
          key: 'cable_exit',
          label: 'Câble — relevé arrivée',
          kind: PilotFieldKind.action,
          action: 'cable_exit',
        ),
        PilotFieldDefinition(
          key: 'pco',
          label: 'PCO',
          kind: PilotFieldKind.text,
        ),
        PilotFieldDefinition(
          key: 'msan',
          label: 'MSAN',
          kind: PilotFieldKind.text,
        ),
      ],
    ),
  ],
);

// Praxedo FTTH Réalisable: keep only the fields observed in the supplied form.
const _ftthRealisableSchema = PilotFormSchema(
  id: 'ftth_realisable',
  label: 'FTTH Réalisable',
  sections: [
    PilotFormSection(
      title: 'Compte rendu FTTH',
      fields: [
        PilotFieldDefinition(
          key: 'branch_cable_length_m',
          label: 'Câble de branchement (ml)',
          kind: PilotFieldKind.number,
        ),
        PilotFieldDefinition(
          key: 'pco',
          label: 'PCO',
          kind: PilotFieldKind.text,
        ),
        PilotFieldDefinition(
          key: 'pco_label',
          label: 'Étiquetage PCO',
          kind: PilotFieldKind.text,
        ),
        PilotFieldDefinition(
          key: 'pto',
          label: 'Prise (PTO)',
          kind: PilotFieldKind.text,
        ),
        PilotFieldDefinition(
          key: 'ont_signal',
          label: 'ONT + Signal',
          kind: PilotFieldKind.text,
        ),
        PilotFieldDefinition(
          key: 'ont_serial',
          label: 'N° Série ONT (GPON SN)',
          kind: PilotFieldKind.text,
        ),
        PilotFieldDefinition(
          key: 'client_connected',
          label: 'Client connecté ?',
          kind: PilotFieldKind.yesNo,
        ),
        PilotFieldDefinition(
          key: 'comment',
          label: 'Commentaire',
          kind: PilotFieldKind.text,
        ),
      ],
    ),
  ],
);

// Praxedo PTO evidence supplied previously: NUM_PORT + OBSERVATIONS, the three
// before/during/after photo stages, GPS and the realised/failure branch.
const _ptoSchema = PilotFormSchema(
  id: 'pto',
  label: 'PTO',
  sections: [
    PilotFormSection(
      title: 'Compte rendu PTO',
      fields: [
        PilotFieldDefinition(
          key: 'num_port',
          label: 'NUM_PORT',
          kind: PilotFieldKind.text,
        ),
        PilotFieldDefinition(
          key: 'observations',
          label: 'OBSERVATIONS',
          kind: PilotFieldKind.text,
        ),
        PilotFieldDefinition(
          key: 'photo_before',
          label: 'Photos avant',
          kind: PilotFieldKind.photo,
          photoLabel: 'before',
        ),
        PilotFieldDefinition(
          key: 'photo_during',
          label: 'Photos pendant',
          kind: PilotFieldKind.photo,
          photoLabel: 'during',
        ),
        PilotFieldDefinition(
          key: 'photo_after',
          label: 'Photos après',
          kind: PilotFieldKind.photo,
          photoLabel: 'after',
        ),
        PilotFieldDefinition(
          key: 'site_gps',
          label: 'Point GPS de l’intervention',
          kind: PilotFieldKind.action,
          action: 'site_location',
        ),
        PilotFieldDefinition(
          key: 'completed',
          label: 'REALISEE',
          kind: PilotFieldKind.yesNo,
        ),
        PilotFieldDefinition(
          key: 'failure_reason',
          label: 'POURQUOI',
          kind: PilotFieldKind.text,
          condition: PilotFieldCondition('completed', false),
        ),
      ],
    ),
  ],
);

const _sortiePcoSchema = PilotFormSchema(
  id: 'sortie_pco_iam',
  label: 'SORTIE DE PCO IAM',
  sections: [
    PilotFormSection(
      title: 'Pose de câble',
      fields: [
        PilotFieldDefinition(
          key: 'cable_entry',
          label: 'Départ — type de pose, câble, code et relevé',
          kind: PilotFieldKind.action,
          action: 'cable_entry',
        ),
        PilotFieldDefinition(
          key: 'cable_departure_photo',
          label: 'Photo départ',
          kind: PilotFieldKind.photo,
          photoLabel: 'cable_departure',
        ),
        PilotFieldDefinition(
          key: 'cable_exit',
          label: 'Arrivée — relevé et longueur calculée',
          kind: PilotFieldKind.action,
          action: 'cable_exit',
        ),
        PilotFieldDefinition(
          key: 'cable_arrival_photo',
          label: 'Photo arrivée',
          kind: PilotFieldKind.photo,
          photoLabel: 'cable_arrival',
        ),
        PilotFieldDefinition(
          key: 'additional_cable',
          label: 'Câble supplémentaire ?',
          kind: PilotFieldKind.yesNo,
        ),
        PilotFieldDefinition(
          key: 'additional_cable_entry',
          label: 'Câble supplémentaire — départ',
          kind: PilotFieldKind.action,
          action: 'cable_entry:additional_1',
          condition: PilotFieldCondition('additional_cable', true),
        ),
        PilotFieldDefinition(
          key: 'additional_cable_departure_photo',
          label: 'Câble supplémentaire — photo départ',
          kind: PilotFieldKind.photo,
          photoLabel: 'cable_departure',
          condition: PilotFieldCondition('additional_cable', true),
        ),
        PilotFieldDefinition(
          key: 'additional_cable_exit',
          label: 'Câble supplémentaire — arrivée',
          kind: PilotFieldKind.action,
          action: 'cable_exit:additional_1',
          condition: PilotFieldCondition('additional_cable', true),
        ),
        PilotFieldDefinition(
          key: 'additional_cable_arrival_photo',
          label: 'Câble supplémentaire — photo arrivée',
          kind: PilotFieldKind.photo,
          photoLabel: 'cable_arrival',
          condition: PilotFieldCondition('additional_cable', true),
        ),
        PilotFieldDefinition(
          key: 'additional_cable_2',
          label: 'Câble supplémentaire 2 ?',
          kind: PilotFieldKind.yesNo,
          condition: PilotFieldCondition('additional_cable', true),
        ),
        PilotFieldDefinition(
          key: 'additional_cable_2_entry',
          label: 'Câble supplémentaire 2 — départ',
          kind: PilotFieldKind.action,
          action: 'cable_entry:additional_2',
          condition: PilotFieldCondition('additional_cable_2', true),
        ),
        PilotFieldDefinition(
          key: 'additional_cable_2_departure_photo',
          label: 'Câble supplémentaire 2 — photo départ',
          kind: PilotFieldKind.photo,
          photoLabel: 'cable_departure',
          condition: PilotFieldCondition('additional_cable_2', true),
        ),
        PilotFieldDefinition(
          key: 'additional_cable_2_exit',
          label: 'Câble supplémentaire 2 — arrivée',
          kind: PilotFieldKind.action,
          action: 'cable_exit:additional_2',
          condition: PilotFieldCondition('additional_cable_2', true),
        ),
        PilotFieldDefinition(
          key: 'additional_cable_2_arrival_photo',
          label: 'Câble supplémentaire 2 — photo arrivée',
          kind: PilotFieldKind.photo,
          photoLabel: 'cable_arrival',
          condition: PilotFieldCondition('additional_cable_2', true),
        ),
      ],
    ),
    PilotFormSection(
      title: 'Raccordement',
      fields: [
        PilotFieldDefinition(
          key: 'new_splitter',
          label: 'Nouveau splitter ?',
          kind: PilotFieldKind.yesNo,
        ),
        PilotFieldDefinition(
          key: 'splitter_before',
          label: 'SPLITTER AVANT',
          kind: PilotFieldKind.photo,
          photoLabel: 'splitter_before',
          condition: PilotFieldCondition('new_splitter', true),
        ),
        PilotFieldDefinition(
          key: 'splitter_after',
          label: 'SPLITTER APRÈS',
          kind: PilotFieldKind.photo,
          photoLabel: 'splitter_after',
          condition: PilotFieldCondition('new_splitter', true),
        ),
        PilotFieldDefinition(
          key: 'new_joint',
          label: 'Nouveau Joint ?',
          kind: PilotFieldKind.yesNo,
        ),
        PilotFieldDefinition(
          key: 'joint_before',
          label: 'JOINT AVANT',
          kind: PilotFieldKind.photo,
          photoLabel: 'joint_before',
          condition: PilotFieldCondition('new_joint', true),
        ),
        PilotFieldDefinition(
          key: 'joint_after',
          label: 'JOINT APRÈS',
          kind: PilotFieldKind.photo,
          photoLabel: 'joint_after',
          condition: PilotFieldCondition('new_joint', true),
        ),
        PilotFieldDefinition(
          key: 'pco_progress',
          label: 'PCO EN COURS',
          kind: PilotFieldKind.photo,
          photoLabel: 'pco_progress',
        ),
        PilotFieldDefinition(
          key: 'pco_after',
          label: 'PCO APRÈS',
          kind: PilotFieldKind.photo,
          photoLabel: 'pco_after',
        ),
        PilotFieldDefinition(
          key: 'pco_label',
          label: 'Étiquetage PCO',
          kind: PilotFieldKind.text,
          helper: 'Saisir le libellé de l’étiquette posée sur le PCO.',
        ),
        PilotFieldDefinition(
          key: 'branch_cable_length_m',
          label: 'Câble de branchement (ml)',
          kind: PilotFieldKind.number,
        ),
        PilotFieldDefinition(
          key: 'pto',
          label: 'Prise (PTO)',
          kind: PilotFieldKind.photo,
          photoLabel: 'pto',
        ),
        PilotFieldDefinition(
          key: 'ont_signal',
          label: 'ONT + Signal',
          kind: PilotFieldKind.photo,
          photoLabel: 'ont_signal',
        ),
        PilotFieldDefinition(
          key: 'ont_serial',
          label: 'N° Série ONT (GPON SN)',
          kind: PilotFieldKind.text,
        ),
        PilotFieldDefinition(
          key: 'client_connected',
          label: 'Client connecté ?',
          kind: PilotFieldKind.yesNo,
        ),
        PilotFieldDefinition(
          key: 'comment',
          label: 'Commentaire',
          kind: PilotFieldKind.text,
        ),
      ],
    ),
  ],
);

String _normalizedJobType(String value) => value
    .trim()
    .toUpperCase()
    .replaceAll(RegExp(r'[\s_-]+'), ' ');

PilotFormSchema pilotFormSchemaForJobType(String jobType) {
  final normalized = _normalizedJobType(jobType);
  if (normalized == 'TUBAGE' || normalized.contains('SORTIE DE PCO')) {
    return _sortiePcoSchema;
  }
  if (normalized == 'PTO') return _ptoSchema;
  if (normalized.contains('FTTH') &&
      (normalized.contains('RÉALISABLE') || normalized.contains('REALISABLE'))) {
    return _ftthRealisableSchema;
  }
  if (normalized == 'PB' ||
      normalized == 'PM' ||
      normalized.contains('RACCORDEMENT')) {
    return _raccordementSchema;
  }
  return _raccordementSchema;
}
