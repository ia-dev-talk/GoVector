export const SETTINGS_STATUS_LABELS = Object.freeze({
  active: 'Disponible',
  connected: 'Raccordé',
  available: 'Disponible',
  planned: 'Planifié',
  readOnly: 'Lecture seule',
});

export function settingsStatusLabel(status) {
  return SETTINGS_STATUS_LABELS[String(status ?? '').trim()] || '';
}
