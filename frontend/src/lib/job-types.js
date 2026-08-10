/**
 * Configuration métier du wizard FTTH.
 *
 * Le backend accepte davantage de valeurs JobType, mais seuls les types
 * disposant ici d'un workflow, de champs et de validations explicites sont
 * proposés par JobWizard. Les autres types ne reçoivent aucune règle inventée.
 */

function normalizeText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function normalizeIdentifier(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('fr')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function uniqueStrings(values) {
  const result = [];
  const known = new Set();

  (Array.isArray(values) ? values : []).forEach((value) => {
    const normalized = normalizeText(value);

    if (!normalized || known.has(normalized)) {
      return;
    }

    known.add(normalized);
    result.push(normalized);
  });

  return Object.freeze(result);
}

function defineJobType({
  id,
  label,
  icon,
  color,
  description,
  avgDuration,
  material,
  expectedPhotos,
  steps = [],
  fields,
  required,
}) {
  const normalizedId = normalizeIdentifier(id);
  const normalizedFields = uniqueStrings(fields);
  const fieldNames = new Set(normalizedFields);
  const normalizedRequired = uniqueStrings(required);

  const unknownRequiredFields = normalizedRequired.filter(
    (fieldName) => !fieldNames.has(fieldName),
  );

  if (unknownRequiredFields.length > 0) {
    throw new Error(
      `Configuration ${normalizedId}: champs obligatoires absents de fields: ` +
        unknownRequiredFields.join(', '),
    );
  }

  return Object.freeze({
    id: normalizedId,
    label: normalizeText(label),
    icon: normalizeText(icon),
    color: normalizeText(color),
    description: normalizeText(description),
    avgDuration: Number(avgDuration),
    material: uniqueStrings(material),
    expectedPhotos: Number(expectedPhotos),
    steps: uniqueStrings(steps),
    fields: normalizedFields,
    required: normalizedRequired,
  });
}

/**
 * Valeurs réelles de l'enum JobType du backend.
 *
 * Cette liste ne signifie pas que tous ces types sont disponibles dans le
 * wizard. Elle sert uniquement à vérifier l'alignement avec l'API.
 */
export const BACKEND_JOB_TYPE_IDS = Object.freeze([
  'INSTALLATION',
  'DEPANNAGE',
  'MAINTENANCE',
  'SAV',
  'DISCONNECT',
  'INSPECTION',
  'INCIDENT',
  'URGENCE',
  'MIGRATION',
  'RACCORDEMENT',
  'AUDIT',
  'TUBAGE',
  'NON_JOIGNABLE',
  'ANNULATION',
  'SPLITTER',
  'CROQUIS_RESEAU',
]);

const JOB_TYPE_DEFINITIONS = [
  defineJobType({
    id: 'INSTALLATION',
    label: 'Installation FTTH',
    icon: '📡',
    color: 'var(--color-info, #2196f3)',
    description: "Installation complète d'une ligne FTTH chez un client",
    avgDuration: 90,
    material: [
      'ONT',
      'Routeur WiFi',
      'Câble optique',
      'PTO',
      'Connecteurs',
    ],
    expectedPhotos: 0,
    steps: [
      'pto',
      'ont',
      'router',
      'splitter',
    ],
    fields: [
      'operator',
      'pto',
      'ont_serial',
      'router_serial',
      'splitter',
      'splitter_port',
      'cable_length_m',
      'optical_power_dbm',
    ],
    required: [],
  }),

  defineJobType({
    id: 'DEPANNAGE',
    label: 'Dépannage',
    icon: '🔧',
    color: 'var(--color-warning, #ff9800)',
    description: 'Intervention de dépannage sur ligne FTTH existante',
    avgDuration: 60,
    material: [
      'ONT (si remplacement)',
      'Câble (si besoin)',
    ],
    expectedPhotos: 0,
    fields: [
      'optical_power_dbm',
      'ont_serial',
      'router_serial',
    ],
    required: [],
  }),

  defineJobType({
    id: 'MIGRATION',
    label: 'Migration',
    icon: '🔄',
    color: 'var(--color-accent, #9c27b0)',
    description: "Migration d'un client vers un nouvel opérateur",
    avgDuration: 75,
    material: [
      'Nouvel ONT',
      'Nouveau Routeur',
      'Câble (si besoin)',
    ],
    expectedPhotos: 0,
    fields: [
      'ont_serial',
      'router_serial',
      'pto',
      'pbo',
    ],
    required: [],
  }),

  defineJobType({
    id: 'RACCORDEMENT',
    label: 'Raccordement',
    icon: '🔗',
    color: 'var(--color-success, #4caf50)',
    description: "Raccordement d'un nouveau client au réseau FTTH",
    avgDuration: 120,
    material: [
      'Câble optique',
      'Boîtier',
      'Connecteurs',
      'PTO',
    ],
    expectedPhotos: 0,
    fields: [
      'nro',
      'sro',
      'pbo',
      'splitter',
      'splitter_port',
      'cable_length_m',
      'pto',
    ],
    required: [],
  }),

  defineJobType({
    id: 'AUDIT',
    label: 'Audit',
    icon: '📋',
    color: 'var(--text-muted, #607d8b)',
    description: "Audit de l'état du réseau FTTH",
    avgDuration: 45,
    material: [
      'Appareil photo',
      'Checklist',
    ],
    expectedPhotos: 0,
    fields: [
      'optical_power_dbm',
    ],
    required: [],
  }),
];

export const JOB_TYPES_CONFIG = Object.freeze(
  Object.fromEntries(
    JOB_TYPE_DEFINITIONS.map((configuration) => [
      configuration.id,
      configuration,
    ]),
  ),
);

export const WIZARD_JOB_TYPE_IDS = Object.freeze(
  JOB_TYPE_DEFINITIONS.map((configuration) => configuration.id),
);

export const WIZARD_JOB_TYPE_OPTIONS = Object.freeze(
  JOB_TYPE_DEFINITIONS.map((configuration) =>
    Object.freeze({
      value: configuration.id,
      label: configuration.label,
      icon: configuration.icon,
    }),
  ),
);

export const UNCONFIGURED_JOB_TYPE_IDS = Object.freeze(
  BACKEND_JOB_TYPE_IDS.filter(
    (jobTypeId) => !JOB_TYPES_CONFIG[jobTypeId],
  ),
);

export function isBackendJobType(value) {
  return BACKEND_JOB_TYPE_IDS.includes(
    normalizeIdentifier(value),
  );
}

export function isWizardJobType(value) {
  return Boolean(
    JOB_TYPES_CONFIG[
      normalizeIdentifier(value)
    ],
  );
}

export function getJobTypeConfig(value) {
  return (
    JOB_TYPES_CONFIG[
      normalizeIdentifier(value)
    ] || null
  );
}

export function getJobTypeLabel(value, fallback = '') {
  const configuration = getJobTypeConfig(value);

  if (configuration) {
    return configuration.label;
  }

  return normalizeText(fallback);
}

function defineOption(value, label) {
  return Object.freeze({
    value: normalizeText(value),
    label: normalizeText(label),
  });
}

export const PANNE_TYPES = Object.freeze([
  defineOption(
    'internet',
    'Problème Internet',
  ),
  defineOption(
    'tv',
    'Problème TV',
  ),
  defineOption(
    'telephone',
    'Problème Téléphone',
  ),
  defineOption(
    'los',
    'LOS (pas de signal optique)',
  ),
  defineOption(
    'pon',
    'PON (problème réseau)',
  ),
  defineOption(
    'debit',
    'Débit insuffisant',
  ),
]);

export const PANNE_TYPES_BY_VALUE = Object.freeze(
  Object.fromEntries(
    PANNE_TYPES.map((option) => [
      option.value,
      option,
    ]),
  ),
);

export function getPanneType(value) {
  const key = normalizeText(value)
    .toLocaleLowerCase('fr');

  return PANNE_TYPES_BY_VALUE[key] || null;
}

export function getPanneTypeLabel(value, fallback = '') {
  return (
    getPanneType(value)?.label ||
    normalizeText(fallback)
  );
}

function defineWizardStep(id, label, icon) {
  return Object.freeze({
    id: normalizeIdentifier(id)
      .toLocaleLowerCase('fr'),
    label: normalizeText(label),
    icon: normalizeText(icon),
  });
}

export const WIZARD_STEPS = Object.freeze([
  defineWizardStep(
    'type',
    'Type',
    '🎯',
  ),
  defineWizardStep(
    'client',
    'Client',
    '👤',
  ),
  defineWizardStep(
    'reseau',
    'Réseau FTTH',
    '🌐',
  ),
  defineWizardStep(
    'details',
    'Détails',
    '📝',
  ),
  defineWizardStep(
    'affectation',
    'Affectation',
    '👷',
  ),
  defineWizardStep(
    'validation',
    'Validation',
    '✅',
  ),
]);

export const WIZARD_STEP_IDS = Object.freeze(
  WIZARD_STEPS.map((step) => step.id),
);

export function getWizardStep(value) {
  const id = normalizeIdentifier(value)
    .toLocaleLowerCase('fr');

  return (
    WIZARD_STEPS.find(
      (step) => step.id === id,
    ) || null
  );
}
