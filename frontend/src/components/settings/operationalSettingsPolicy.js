export const OPERATIONAL_RELOAD_CONFIRMATION =
  'Recharger la configuration depuis le serveur ? Les modifications non enregistrées seront perdues.';

export function shouldConfirmOperationalReload(dirty) {
  return dirty === true;
}

export function isOperationalRuleDirty({
  enabled,
  parsedValue,
  loadedValue,
}) {
  const wasEnabled = loadedValue !== null;
  if (Boolean(enabled) !== wasEnabled) return true;
  if (!enabled) return false;
  return parsedValue !== loadedValue;
}

export function buildOperationalSavePayload(
  currentValues,
  {
    enabled,
    parsedMinutes,
    retentionEnabled,
    parsedRetentionDays,
  },
) {
  return {
    ...(currentValues && typeof currentValues === 'object'
      ? currentValues
      : {}),
    gps_stale_after_minutes: enabled
      ? parsedMinutes
      : null,
    gps_history_retention_days: retentionEnabled
      ? parsedRetentionDays
      : null,
  };
}

export function operationalConnectionLabel(loadError) {
  return loadError
    ? 'Configuration indisponible'
    : 'Connecté au backend';
}
