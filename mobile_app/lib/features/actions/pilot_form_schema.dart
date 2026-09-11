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
    this.isRequired = false,
    this.multiline = false,
  });

  final String key;
  final String label;
  final PilotFieldKind kind;
  final PilotFieldCondition? condition;
  final String? photoLabel;
  final String? action;
  final String? helper;
  final bool isRequired;
  final bool multiline;
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

// Praxedo screenshot "Compte rendu : Raccordement".
// The blue asterisk on Praxedo is represented by isRequired=true.
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
          isRequired: true,
          multiline: true,
        ),
        PilotFieldDefinition(
          key: 'photo_before',
          label: 'Photos avant',
          kind: PilotFieldKind.photo,
          photoLabel: 'before',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'photo_during',
          label: 'Photos pendant',
          kind: PilotFieldKind.photo,
          photoLabel: 'during',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'photo_after',
          label: 'Photos après',
          kind: PilotFieldKind.photo,
          photoLabel: 'after',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'site_gps',
          label: 'Point GPS de l’intervention',
          kind: PilotFieldKind.action,
          action: 'site_location',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'completed',
          label: 'Intervention réalisée ?',
          kind: PilotFieldKind.yesNo,
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'failure_reason',
          label: 'Pourquoi ?',
          kind: PilotFieldKind.text,
          condition: PilotFieldCondition('completed', false),
          isRequired: true,
          multiline: true,
        ),
        PilotFieldDefinition(
          key: 'technician_signature',
          label: 'Signature du technicien',
          kind: PilotFieldKind.photo,
          photoLabel: 'technician_signature',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'client_signature',
          label: 'Signature du client',
          kind: PilotFieldKind.action,
          action: 'client_signature',
        ),
        PilotFieldDefinition(
          key: 'cable',
          label: 'CABLE',
          kind: PilotFieldKind.text,
          multiline: true,
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

// Praxedo screenshot "Compte rendu : PTO".
const _ptoSchema = PilotFormSchema(
  id: 'pto',
  label: 'PTO',
  sections: [
    PilotFormSection(
      title: 'Compte rendu PTO',
      fields: [
        PilotFieldDefinition(
          key: 'num_port',
          label: 'N° de port',
          kind: PilotFieldKind.text,
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'observations',
          label: 'Observations',
          kind: PilotFieldKind.text,
          isRequired: true,
          multiline: true,
        ),
        PilotFieldDefinition(
          key: 'photo_before',
          label: 'Photos avant',
          kind: PilotFieldKind.photo,
          photoLabel: 'before',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'photo_during',
          label: 'Photos pendant',
          kind: PilotFieldKind.photo,
          photoLabel: 'during',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'photo_after',
          label: 'Photos après',
          kind: PilotFieldKind.photo,
          photoLabel: 'after',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'site_gps',
          label: 'Point GPS de l’intervention',
          kind: PilotFieldKind.action,
          action: 'site_location',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'completed',
          label: 'Intervention réalisée ?',
          kind: PilotFieldKind.yesNo,
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'failure_reason',
          label: 'Pourquoi ?',
          kind: PilotFieldKind.text,
          condition: PilotFieldCondition('completed', false),
          isRequired: true,
          multiline: true,
        ),
        PilotFieldDefinition(
          key: 'technician_signature',
          label: 'Signature du technicien',
          kind: PilotFieldKind.photo,
          photoLabel: 'technician_signature',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'client_signature',
          label: 'Signature du client',
          kind: PilotFieldKind.action,
          action: 'client_signature',
        ),
      ],
    ),
  ],
);

// Praxedo screenshot "Compte rendu : SORTIE DE PCO".
const _sortiePcoSchema = PilotFormSchema(
  id: 'sortie_pco_iam',
  label: 'SORTIE DE PCO IAM',
  sections: [
    PilotFormSection(
      title: 'Pose de câble',
      fields: [
        PilotFieldDefinition(
          key: 'cable_entry',
          label: 'Type de pose, type/code câble et départ',
          kind: PilotFieldKind.action,
          action: 'cable_entry',
          isRequired: true,
          helper: 'Saisir le type de pose, le type de câble, le code câble et le repère de départ.',
        ),
        PilotFieldDefinition(
          key: 'cable_exit',
          label: 'Arrivée et longueur posée',
          kind: PilotFieldKind.action,
          action: 'cable_exit',
          isRequired: true,
          helper: 'Le repère d’arrivée calcule automatiquement la longueur posée.',
        ),
        PilotFieldDefinition(
          key: 'cable_departure_photo',
          label: 'Départ',
          kind: PilotFieldKind.photo,
          photoLabel: 'cable_departure',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'cable_arrival_photo',
          label: 'Arrivée',
          kind: PilotFieldKind.photo,
          photoLabel: 'cable_arrival',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'additional_cable',
          label: 'CÂBLE SUPPLÉMENTAIRE ?',
          kind: PilotFieldKind.yesNo,
        ),
        PilotFieldDefinition(
          key: 'additional_cable_entry',
          label: 'Câble supplémentaire — type/pose/code/départ',
          kind: PilotFieldKind.action,
          action: 'cable_entry:additional_1',
          condition: PilotFieldCondition('additional_cable', true),
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'additional_cable_exit',
          label: 'Câble supplémentaire — arrivée/longueur',
          kind: PilotFieldKind.action,
          action: 'cable_exit:additional_1',
          condition: PilotFieldCondition('additional_cable', true),
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'additional_cable_departure_photo',
          label: 'Câble supplémentaire — départ',
          kind: PilotFieldKind.photo,
          photoLabel: 'cable_departure',
          condition: PilotFieldCondition('additional_cable', true),
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'additional_cable_arrival_photo',
          label: 'Câble supplémentaire — arrivée',
          kind: PilotFieldKind.photo,
          photoLabel: 'cable_arrival',
          condition: PilotFieldCondition('additional_cable', true),
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'additional_cable_2',
          label: 'CÂBLE SUPPLÉMENTAIRE 2 ?',
          kind: PilotFieldKind.yesNo,
          condition: PilotFieldCondition('additional_cable', true),
        ),
        PilotFieldDefinition(
          key: 'additional_cable_2_entry',
          label: 'Câble supplémentaire 2 — type/pose/code/départ',
          kind: PilotFieldKind.action,
          action: 'cable_entry:additional_2',
          condition: PilotFieldCondition('additional_cable_2', true),
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'additional_cable_2_exit',
          label: 'Câble supplémentaire 2 — arrivée/longueur',
          kind: PilotFieldKind.action,
          action: 'cable_exit:additional_2',
          condition: PilotFieldCondition('additional_cable_2', true),
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'additional_cable_2_departure_photo',
          label: 'Câble supplémentaire 2 — départ',
          kind: PilotFieldKind.photo,
          photoLabel: 'cable_departure',
          condition: PilotFieldCondition('additional_cable_2', true),
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'additional_cable_2_arrival_photo',
          label: 'Câble supplémentaire 2 — arrivée',
          kind: PilotFieldKind.photo,
          photoLabel: 'cable_arrival',
          condition: PilotFieldCondition('additional_cable_2', true),
          isRequired: true,
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
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'splitter_after',
          label: 'SPLITTER APRÈS',
          kind: PilotFieldKind.photo,
          photoLabel: 'splitter_after',
          condition: PilotFieldCondition('new_splitter', true),
          isRequired: true,
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
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'joint_after',
          label: 'JOINT APRÈS',
          kind: PilotFieldKind.photo,
          photoLabel: 'joint_after',
          condition: PilotFieldCondition('new_joint', true),
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'pco_progress',
          label: 'PCO EN COURS',
          kind: PilotFieldKind.photo,
          photoLabel: 'pco_progress',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'pco_after',
          label: 'PCO APRÈS',
          kind: PilotFieldKind.photo,
          photoLabel: 'pco_after',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'pco_label',
          label: 'Étiquetage PCO',
          kind: PilotFieldKind.text,
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'branch_cable_length_m',
          label: 'Câble de branchement ml',
          kind: PilotFieldKind.number,
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'pto',
          label: 'Prise (PTO)',
          kind: PilotFieldKind.photo,
          photoLabel: 'pto',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'ont_signal',
          label: 'ONT + Signal',
          kind: PilotFieldKind.photo,
          photoLabel: 'ont_signal',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'ont_serial',
          label: 'N° Série ONT (GPON SN)',
          kind: PilotFieldKind.photo,
          photoLabel: 'ont_serial',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'client_connected',
          label: 'Client connecté',
          kind: PilotFieldKind.yesNo,
        ),
        PilotFieldDefinition(
          key: 'comment',
          label: 'Commentaire',
          kind: PilotFieldKind.text,
          multiline: true,
        ),
      ],
    ),
  ],
);

// Praxedo screenshot "Compte rendu : FTTH Réalisable".
const _ftthRealisableSchema = PilotFormSchema(
  id: 'ftth_realisable',
  label: 'FTTH Réalisable',
  sections: [
    PilotFormSection(
      title: 'Compte rendu FTTH',
      fields: [
        PilotFieldDefinition(
          key: 'branch_cable_length_m',
          label: 'Câble de branchement ml',
          kind: PilotFieldKind.number,
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'pco',
          label: 'PCO',
          kind: PilotFieldKind.photo,
          photoLabel: 'pco',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'pco_label',
          label: 'Étiquetage PCO',
          kind: PilotFieldKind.text,
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'pto',
          label: 'Prise (PTO)',
          kind: PilotFieldKind.photo,
          photoLabel: 'pto',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'ont_signal',
          label: 'ONT + Signal',
          kind: PilotFieldKind.photo,
          photoLabel: 'ont_signal',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'ont_serial',
          label: 'N° Série ONT (GPON SN)',
          kind: PilotFieldKind.photo,
          photoLabel: 'ont_serial',
          isRequired: true,
        ),
        PilotFieldDefinition(
          key: 'client_connected',
          label: 'Client connecté',
          kind: PilotFieldKind.yesNo,
        ),
        PilotFieldDefinition(
          key: 'comment',
          label: 'Commentaire',
          kind: PilotFieldKind.text,
          multiline: true,
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
