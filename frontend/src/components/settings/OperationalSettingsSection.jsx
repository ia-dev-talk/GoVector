/**
 * OperationalSettingsSection — paramètres opérationnels réellement persistés.
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from '../../api/client';
import { useRuntimeSettings } from '../../contexts/RuntimeSettingsContext';
import Button from '../ui/Button';
import Card from '../ui/Card';
import {
  OPERATIONAL_RELOAD_CONFIRMATION,
  buildOperationalSavePayload,
  buildOperationalUpdateRequest,
  isOperationalRuleDirty,
  operationalConnectionLabel,
  shouldConfirmOperationalReload,
} from './operationalSettingsPolicy';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function positiveIntegerOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function apiErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (isRecord(detail) && text(detail.message)) return text(detail.message);
  if (Array.isArray(detail) && detail.length > 0) {
    const messages = detail.map((item) => text(item?.msg)).filter(Boolean);
    if (messages.length > 0) return messages.join(' ');
  }
  return text(error?.message) || fallback;
}

function normalizeDocument(value) {
  const source = isRecord(value) ? value : {};
  const values = isRecord(source.values) ? source.values : {};
  return {
    namespace: text(source.namespace) || 'operational',
    schemaVersion: nonNegativeInteger(source.schema_version, 1),
    revision: nonNegativeInteger(source.revision, 0),
    updatedAt: text(source.updated_at) || null,
    updatedBy: positiveIntegerOrNull(source.updated_by),
    values,
    gpsStaleAfterMinutes: positiveIntegerOrNull(
      values.gps_stale_after_minutes ?? values.gpsStaleAfterMinutes,
    ),
    gpsHistoryRetentionDays: positiveIntegerOrNull(
      values.gps_history_retention_days ?? values.gpsHistoryRetentionDays,
    ),
  };
}

function formatDateTime(value) {
  if (!value) return 'Jamais enregistrée';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date indisponible';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

const OperationalSettingsSection = memo(function OperationalSettingsSection({
  toast,
  refreshRevision = 0,
  onDirtyChange,
}) {
  const { applyOperationalDocument } = useRuntimeSettings();
  const [settingsDocument, setSettingsDocument] = useState(() => normalizeDocument(null));
  const [enabled, setEnabled] = useState(false);
  const [minutesInput, setMinutesInput] = useState('');
  const [loadedMinutes, setLoadedMinutes] = useState(null);
  const [retentionEnabled, setRetentionEnabled] = useState(false);
  const [retentionDaysInput, setRetentionDaysInput] = useState('');
  const [loadedRetentionDays, setLoadedRetentionDays] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [graceInput, setGraceInput] = useState('30');
  const [flagMissingSector, setFlagMissingSector] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const requestSequenceRef = useRef(0);
  const lastFailedSaveIntentRef = useRef(null);

  const clearSaveFailure = useCallback(() => {
    setSaveError('');
    lastFailedSaveIntentRef.current = null;
  }, []);

  const applyLoadedDocument = useCallback((rawDocument) => {
    const normalized = normalizeDocument(rawDocument);
    setSettingsDocument(normalized);
    setGraceInput(String(normalized.values.orienteur_observation?.appointment_grace_minutes ?? 30));
    setFlagMissingSector(normalized.values.orienteur_observation?.flag_missing_sector ?? true);
    setLoadedMinutes(normalized.gpsStaleAfterMinutes);
    setEnabled(normalized.gpsStaleAfterMinutes !== null);
    setMinutesInput(
      normalized.gpsStaleAfterMinutes === null
        ? ''
        : String(normalized.gpsStaleAfterMinutes),
    );
    setLoadedRetentionDays(normalized.gpsHistoryRetentionDays);
    setRetentionEnabled(normalized.gpsHistoryRetentionDays !== null);
    setRetentionDaysInput(
      normalized.gpsHistoryRetentionDays === null
        ? ''
        : String(normalized.gpsHistoryRetentionDays),
    );
    setLoadError('');
    setSaveError('');
    lastFailedSaveIntentRef.current = null;
    return normalized;
  }, []);

  const loadSettings = useCallback(async () => {
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    setLoading(true);
    setLoadError('');
    try {
      const response = await api.getOperationalSettings();
      if (requestId !== requestSequenceRef.current) return null;
      return applyLoadedDocument(response?.data);
    } catch (error) {
      if (requestId === requestSequenceRef.current) {
        setLoadError(
          apiErrorMessage(
            error,
            'Impossible de charger les paramètres opérationnels.',
          ),
        );
      }
      return null;
    } finally {
      if (requestId === requestSequenceRef.current) setLoading(false);
    }
  }, [applyLoadedDocument]);

  useEffect(() => {
    loadSettings();
    return () => {
      requestSequenceRef.current += 1;
    };
  }, [loadSettings, refreshRevision]);

  const parsedMinutes = useMemo(
    () => positiveIntegerOrNull(minutesInput),
    [minutesInput],
  );
  const parsedRetentionDays = useMemo(
    () => positiveIntegerOrNull(retentionDaysInput),
    [retentionDaysInput],
  );
  const graceMinutes = graceInput.trim() === '' ? NaN : Number(graceInput);
  const graceValid = Number.isInteger(graceMinutes) && graceMinutes >= 0 && graceMinutes <= 1440;
  const observationDirty = graceMinutes !== (settingsDocument.values.orienteur_observation?.appointment_grace_minutes ?? 30)
    || flagMissingSector !== (settingsDocument.values.orienteur_observation?.flag_missing_sector ?? true);
  const valid = graceValid &&
    (!enabled || parsedMinutes !== null) &&
    (!retentionEnabled || (
      parsedRetentionDays !== null && parsedRetentionDays <= 3650
    ));
  const staleDirty = isOperationalRuleDirty({
    enabled,
    parsedValue: parsedMinutes,
    loadedValue: loadedMinutes,
  });
  const retentionDirty = isOperationalRuleDirty({
    enabled: retentionEnabled,
    parsedValue: parsedRetentionDays,
    loadedValue: loadedRetentionDays,
  });
  const dirty = staleDirty || retentionDirty || observationDirty;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => {
    onDirtyChange?.(false);
  }, [onDirtyChange]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty]);

  const handleReset = useCallback(() => {
    setGraceInput(String(settingsDocument.values.orienteur_observation?.appointment_grace_minutes ?? 30));
    setFlagMissingSector(settingsDocument.values.orienteur_observation?.flag_missing_sector ?? true);
    const configured = loadedMinutes !== null;
    setEnabled(configured);
    setMinutesInput(configured ? String(loadedMinutes) : '');
    const retentionConfigured = loadedRetentionDays !== null;
    setRetentionEnabled(retentionConfigured);
    setRetentionDaysInput(
      retentionConfigured ? String(loadedRetentionDays) : '',
    );
    clearSaveFailure();
  }, [clearSaveFailure, loadedMinutes, loadedRetentionDays, settingsDocument.values]);

  const persistIntent = useCallback(async (intent) => {
    setSaving(true);
    setSaveError('');
    try {
      const response = await api.updateOperationalSettings(intent);
      const normalized = applyLoadedDocument(response?.data);
      applyOperationalDocument(response?.data);
      if (typeof toast === 'function') {
        toast(
          `Paramètres opérationnels enregistrés (révision ${normalized.revision}).`,
          'success',
        );
      }
      return true;
    } catch (error) {
      const message = apiErrorMessage(
        error,
        'Impossible d’enregistrer les paramètres opérationnels.',
      );
      lastFailedSaveIntentRef.current = intent;
      setSaveError(message);
      if (typeof toast === 'function') toast(message, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  }, [applyLoadedDocument, applyOperationalDocument, toast]);

  const handleSave = useCallback(async () => {
    if (!graceValid) {
      setSaveError('Saisissez une tolérance de rendez-vous entre 0 et 1440 minutes.');
      return;
    }
    if (enabled && parsedMinutes === null) {
      setSaveError('Saisissez un nombre entier de minutes supérieur à zéro.');
      return;
    }
    if (
      retentionEnabled &&
      (parsedRetentionDays === null || parsedRetentionDays > 3650)
    ) {
      setSaveError('Saisissez une durée GPS comprise entre 1 et 3650 jours.');
      return;
    }
    const values = buildOperationalSavePayload(settingsDocument.values, {
      enabled,
      parsedMinutes,
      retentionEnabled,
      parsedRetentionDays,
    });
    const intent = buildOperationalUpdateRequest(
      settingsDocument.revision,
      { ...values, orienteur_observation: {
        appointment_grace_minutes: graceMinutes,
        flag_missing_sector: flagMissingSector,
      } },
    );
    lastFailedSaveIntentRef.current = intent;
    await persistIntent(intent);
  }, [
    graceValid,
    graceMinutes,
    flagMissingSector,
    enabled,
    parsedMinutes,
    parsedRetentionDays,
    persistIntent,
    retentionEnabled,
    settingsDocument.revision,
    settingsDocument.values,
  ]);

  const handleRetrySave = useCallback(async () => {
    const intent = lastFailedSaveIntentRef.current;
    if (!intent || saving) return;
    await persistIntent(intent);
  }, [persistIntent, saving]);

  const handleReloadFromServer = useCallback(async () => {
    if (saving) return;
    if (
      shouldConfirmOperationalReload(dirty) &&
      !window.confirm(OPERATIONAL_RELOAD_CONFIRMATION)
    ) {
      return;
    }
    await loadSettings();
  }, [dirty, loadSettings, saving]);

  const runtimeLabel = enabled && parsedMinutes !== null
    ? `Position ancienne après ${parsedMinutes} min`
    : 'Règle désactivée';
  const connectionLabel = operationalConnectionLabel(loadError);

  const footer = (
    <div className="admin-operational-actions">
      <Button
        variant="secondary"
        onClick={handleReset}
        disabled={loading || saving || !dirty || Boolean(loadError)}
      >
        Annuler les modifications
      </Button>
      <Button
        variant="primary"
        onClick={handleSave}
        loading={saving}
        disabled={loading || !dirty || !valid || Boolean(loadError)}
      >
        Enregistrer
      </Button>
    </div>
  );

  const clearSaveErrorOnEdit = () => {
    clearSaveFailure();
  };

  return (
    <div className="admin-section">
      <div className="admin-section-heading-row">
        <div>
          <h3 className="admin-section-title">Exploitation</h3>
          <p className="admin-section-desc">
            Règles opérationnelles consommées en temps réel par le cockpit,
            la supervision et, plus tard, l’application mobile.
          </p>
        </div>
        <span
          className={[
            'admin-settings-connection',
            loadError
              ? 'admin-settings-connection--error'
              : 'admin-settings-connection--ready',
          ].join(' ')}
        >
          <span aria-hidden="true" />
          {connectionLabel}
        </span>
      </div>

      {loadError ? (
        <div className="admin-settings-error" role="alert">
          <div>
            <strong>Chargement impossible</strong>
            <span>{loadError}</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={loadSettings}
            disabled={loading}
          >
            Réessayer le chargement
          </Button>
        </div>
      ) : null}

      {saveError && !loadError ? (
        <div className="admin-settings-error" role="alert">
          <div>
            <strong>Enregistrement impossible</strong>
            <span>{saveError}</span>
          </div>
          <div className="admin-operational-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRetrySave}
              disabled={saving || !lastFailedSaveIntentRef.current}
            >
              Réessayer l’enregistrement
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReloadFromServer}
              disabled={saving || loading}
            >
              Recharger depuis le serveur
            </Button>
          </div>
        </div>
      ) : null}

      <Card
        title="Supervision GPS et Agent Orienteur"
        className="admin-operational-card"
        footer={!loadError ? footer : null}
      >
        {loading ? (
          <div className="admin-settings-loading" role="status">
            Chargement de la configuration…
          </div>
        ) : loadError ? (
          <div className="admin-settings-loading" role="status">
            Configuration indisponible. Rechargez la source serveur avant de modifier ces règles.
          </div>
        ) : (
          <>
            <div className="admin-operational-rule">
              <div className="admin-operational-rule-copy">
                <strong>Agent Orienteur · règles d’observation</strong>
                <span>Règles partagées par les analyses de dossiers. Elles n’activent aucune affectation automatique.</span>
              </div>
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor="orienteur-grace">Tolérance après le rendez-vous (minutes)</label>
              <input id="orienteur-grace" className="admin-input" type="number" min="0" max="1440" step="1"
                value={graceInput} disabled={saving}
                onChange={(event) => { setGraceInput(event.target.value); clearSaveFailure(); }} />
              <p>De 0 à 1440 minutes avant de signaler un créneau dépassé hors passage actif.</p>
              <label><input type="checkbox" checked={flagMissingSector} disabled={saving}
                onChange={(event) => { setFlagMissingSector(event.target.checked); clearSaveFailure(); }} /> Signaler les dossiers sans secteur opérationnel</label>
            </div>
            <div className="admin-operational-rule">
              <div className="admin-operational-rule-copy">
                <strong>Détecter les positions GPS anciennes</strong>
                <span>
                  Signale un technicien en intervention lorsque sa dernière
                  position dépasse le seuil configuré. La règle reste inactive
                  lorsque le paramètre est désactivé.
                </span>
              </div>
              <label className="admin-toggle admin-toggle--compact">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => {
                    setEnabled(event.target.checked);
                    clearSaveErrorOnEdit();
                  }}
                />
                <span className="admin-toggle-slider" aria-hidden="true" />
                <span className="admin-toggle-label">
                  {enabled ? 'Activée' : 'Désactivée'}
                </span>
              </label>
            </div>

            <div
              className={[
                'admin-operational-threshold',
                enabled ? '' : 'admin-operational-threshold--disabled',
              ].filter(Boolean).join(' ')}
            >
              <div className="admin-field">
                <label className="admin-label" htmlFor="gps-stale-after-minutes">
                  Seuil d’ancienneté GPS
                </label>
                <div className="admin-input-with-suffix">
                  <input
                    id="gps-stale-after-minutes"
                    className="admin-input"
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={minutesInput}
                    disabled={!enabled}
                    placeholder="Ex. 30"
                    onChange={(event) => {
                      setMinutesInput(event.target.value);
                      clearSaveErrorOnEdit();
                    }}
                  />
                  <span>minutes</span>
                </div>
                <small className="admin-field-help">
                  Entier strictement positif. Aucune valeur implicite n’est appliquée par GoVector.
                </small>
              </div>
              <div className="admin-operational-impact">
                <span>État qui sera appliqué</span>
                <strong>{runtimeLabel}</strong>
                <small>Cockpit · Supervision · filtres opérationnels</small>
              </div>
            </div>

            <div className="admin-settings-metadata">
              <div><span>Namespace</span><strong>{settingsDocument.namespace}</strong></div>
              <div><span>Schéma</span><strong>v{settingsDocument.schemaVersion}</strong></div>
              <div><span>Révision</span><strong>{settingsDocument.revision}</strong></div>
              <div>
                <span>Dernière mise à jour</span>
                <strong>{formatDateTime(settingsDocument.updatedAt)}</strong>
              </div>
              <div>
                <span>Modifié par</span>
                <strong>
                  {settingsDocument.updatedBy
                    ? `Utilisateur #${settingsDocument.updatedBy}`
                    : 'Système'}
                </strong>
              </div>
            </div>

            <div className="admin-operational-rule">
              <div className="admin-operational-rule-copy">
                <strong>Limiter la conservation des traces GPS brutes</strong>
                <span>
                  Supprime chaque jour les positions plus anciennes que la durée
                  validée par votre organisation. Une durée non configurée reste
                  un blocage de mise en production.
                </span>
              </div>
              <label className="admin-toggle admin-toggle--compact">
                <input
                  type="checkbox"
                  checked={retentionEnabled}
                  onChange={(event) => {
                    setRetentionEnabled(event.target.checked);
                    clearSaveErrorOnEdit();
                  }}
                />
                <span className="admin-toggle-slider" aria-hidden="true" />
                <span className="admin-toggle-label">
                  {retentionEnabled ? 'Configurée' : 'À décider'}
                </span>
              </label>
            </div>

            <div
              className={[
                'admin-operational-threshold',
                retentionEnabled ? '' : 'admin-operational-threshold--disabled',
              ].filter(Boolean).join(' ')}
            >
              <div className="admin-field">
                <label className="admin-label" htmlFor="gps-history-retention-days">
                  Conservation des points GPS bruts
                </label>
                <div className="admin-input-with-suffix">
                  <input
                    id="gps-history-retention-days"
                    className="admin-input"
                    type="number"
                    min="1"
                    max="3650"
                    step="1"
                    inputMode="numeric"
                    value={retentionDaysInput}
                    disabled={!retentionEnabled}
                    placeholder="Durée validée"
                    onChange={(event) => {
                      setRetentionDaysInput(event.target.value);
                      clearSaveErrorOnEdit();
                    }}
                  />
                  <span>jours</span>
                </div>
                <small className="admin-field-help">
                  À définir selon la finalité déclarée, les obligations contractuelles
                  et la validation de conformité. GoVector n’invente aucune durée légale.
                </small>
              </div>
              <div className="admin-operational-impact">
                <span>Traitement appliqué</span>
                <strong>
                  {retentionEnabled && parsedRetentionDays !== null
                    ? `Purge après ${parsedRetentionDays} jours`
                    : 'Décision requise avant production'}
                </strong>
                <small>Exécution quotidienne · points GPS bruts uniquement</small>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
});

export default OperationalSettingsSection;
