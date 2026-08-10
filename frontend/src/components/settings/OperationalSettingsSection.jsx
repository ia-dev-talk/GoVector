/**
 * OperationalSettingsSection — paramètres opérationnels réellement persistés.
 *
 * Cette section consomme le contrat backend /settings/operational et met à
 * jour le contexte runtime partagé par le cockpit et la supervision.
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


function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}


function positiveIntegerOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(value);

  return (
    Number.isInteger(parsed) &&
    parsed > 0
  )
    ? parsed
    : null;
}


function nonNegativeInteger(
  value,
  fallback = 0,
) {
  const parsed = Number(value);

  return (
    Number.isInteger(parsed) &&
    parsed >= 0
  )
    ? parsed
    : fallback;
}


function text(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}


function apiErrorMessage(
  error,
  fallback,
) {
  const detail =
    error?.response?.data?.detail;

  if (
    typeof detail === 'string' &&
    detail.trim()
  ) {
    return detail.trim();
  }

  if (
    Array.isArray(detail) &&
    detail.length > 0
  ) {
    const messages = detail
      .map((item) =>
        text(item?.msg),
      )
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(' ');
    }
  }

  return (
    text(error?.message) ||
    fallback
  );
}


function normalizeDocument(value) {
  const source = isRecord(value)
    ? value
    : {};

  const values = isRecord(source.values)
    ? source.values
    : {};

  return {
    namespace:
      text(source.namespace) ||
      'operational',

    schemaVersion:
      nonNegativeInteger(
        source.schema_version,
        1,
      ),

    revision:
      nonNegativeInteger(
        source.revision,
        0,
      ),

    updatedAt:
      text(source.updated_at) || null,

    updatedBy:
      positiveIntegerOrNull(
        source.updated_by,
      ),

    values,

    gpsStaleAfterMinutes:
      positiveIntegerOrNull(
        values.gps_stale_after_minutes ??
          values.gpsStaleAfterMinutes,
      ),

    gpsHistoryRetentionDays:
      positiveIntegerOrNull(
        values.gps_history_retention_days ??
          values.gpsHistoryRetentionDays,
      ),
  };
}


function formatDateTime(value) {
  if (!value) {
    return 'Jamais enregistrée';
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return 'Date indisponible';
  }

  return new Intl.DateTimeFormat(
    'fr-FR',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    },
  ).format(date);
}


const OperationalSettingsSection = memo(
  function OperationalSettingsSection({
    toast,
    refreshRevision = 0,
  }) {
    const {
      applyOperationalDocument,
    } = useRuntimeSettings();

    const [settingsDocument, setSettingsDocument] =
      useState(() =>
        normalizeDocument(null),
      );

    const [enabled, setEnabled] =
      useState(false);

    const [minutesInput, setMinutesInput] =
      useState('');

    const [loadedMinutes, setLoadedMinutes] =
      useState(null);

    const [retentionEnabled, setRetentionEnabled] =
      useState(false);

    const [retentionDaysInput, setRetentionDaysInput] =
      useState('');

    const [loadedRetentionDays, setLoadedRetentionDays] =
      useState(null);

    const [loading, setLoading] =
      useState(true);

    const [saving, setSaving] =
      useState(false);

    const [error, setError] =
      useState('');

    const requestSequenceRef =
      useRef(0);

    const applyLoadedDocument =
      useCallback((rawDocument) => {
        const normalized =
          normalizeDocument(
            rawDocument,
          );

        setSettingsDocument(
          normalized,
        );

        setLoadedMinutes(
          normalized
            .gpsStaleAfterMinutes,
        );

        setEnabled(
          normalized
            .gpsStaleAfterMinutes !==
            null,
        );

        setMinutesInput(
          normalized
            .gpsStaleAfterMinutes ===
            null
            ? ''
            : String(
                normalized
                  .gpsStaleAfterMinutes,
              ),
        );

        setLoadedRetentionDays(
          normalized
            .gpsHistoryRetentionDays,
        );

        setRetentionEnabled(
          normalized
            .gpsHistoryRetentionDays !==
            null,
        );

        setRetentionDaysInput(
          normalized
            .gpsHistoryRetentionDays ===
            null
            ? ''
            : String(
                normalized
                  .gpsHistoryRetentionDays,
              ),
        );

        setError('');

        return normalized;
      }, []);

    const loadSettings =
      useCallback(async () => {
        const requestId =
          requestSequenceRef.current + 1;

        requestSequenceRef.current =
          requestId;

        setLoading(true);
        setError('');

        try {
          const response =
            await api
              .getOperationalSettings();

          if (
            requestId !==
            requestSequenceRef.current
          ) {
            return null;
          }

          return applyLoadedDocument(
            response?.data,
          );
        } catch (loadError) {
          if (
            requestId ===
            requestSequenceRef.current
          ) {
            setError(
              apiErrorMessage(
                loadError,
                'Impossible de charger les paramètres opérationnels.',
              ),
            );
          }

          return null;
        } finally {
          if (
            requestId ===
            requestSequenceRef.current
          ) {
            setLoading(false);
          }
        }
      }, [applyLoadedDocument]);

    useEffect(() => {
      loadSettings();

      return () => {
        requestSequenceRef.current += 1;
      };
    }, [
      loadSettings,
      refreshRevision,
    ]);

    const parsedMinutes =
      useMemo(
        () =>
          positiveIntegerOrNull(
            minutesInput,
          ),
        [minutesInput],
      );

    const parsedRetentionDays =
      useMemo(
        () =>
          positiveIntegerOrNull(
            retentionDaysInput,
          ),
        [retentionDaysInput],
      );

    const valid =
      (!enabled ||
        parsedMinutes !== null) &&
      (!retentionEnabled ||
        (
          parsedRetentionDays !== null &&
          parsedRetentionDays <= 3650
        ));

    const staleDirty = enabled
      ? parsedMinutes !== loadedMinutes
      : loadedMinutes !== null;

    const retentionDirty = retentionEnabled
      ? parsedRetentionDays !== loadedRetentionDays
      : loadedRetentionDays !== null;

    const dirty = staleDirty || retentionDirty;

    const handleReset =
      useCallback(() => {
        const configured =
          loadedMinutes !== null;

        setEnabled(configured);

        setMinutesInput(
          configured
            ? String(loadedMinutes)
            : '',
        );

        const retentionConfigured =
          loadedRetentionDays !== null;

        setRetentionEnabled(
          retentionConfigured,
        );

        setRetentionDaysInput(
          retentionConfigured
            ? String(loadedRetentionDays)
            : '',
        );

        setError('');
      }, [loadedMinutes, loadedRetentionDays]);

    const handleSave =
      useCallback(async () => {
        if (
          enabled &&
          parsedMinutes === null
        ) {
          setError(
            'Saisissez un nombre entier de minutes supérieur à zéro.',
          );
          return;
        }

        if (
          retentionEnabled &&
          (
            parsedRetentionDays === null ||
            parsedRetentionDays > 3650
          )
        ) {
          setError(
            'Saisissez une durée GPS comprise entre 1 et 3650 jours.',
          );
          return;
        }

        setSaving(true);
        setError('');

        try {
          const response =
            await api
              .updateOperationalSettings({
                ...settingsDocument.values,
                gps_stale_after_minutes:
                  enabled
                    ? parsedMinutes
                    : null,
                gps_history_retention_days:
                  retentionEnabled
                    ? parsedRetentionDays
                    : null,
              });

          const normalized =
            applyLoadedDocument(
              response?.data,
            );

          applyOperationalDocument(
            response?.data,
          );

          if (
            typeof toast ===
            'function'
          ) {
            toast(
              normalized
                .gpsStaleAfterMinutes ===
                null
                ? 'Détection GPS ancien désactivée.'
                : (
                    'Seuil GPS ancien enregistré : ' +
                    `${normalized.gpsStaleAfterMinutes} minutes.`
                  ),
              'success',
            );
          }
        } catch (saveError) {
          const message =
            apiErrorMessage(
              saveError,
              'Impossible d’enregistrer les paramètres opérationnels.',
            );

          setError(message);

          if (
            typeof toast ===
            'function'
          ) {
            toast(
              message,
              'error',
            );
          }
        } finally {
          setSaving(false);
        }
      }, [
        applyLoadedDocument,
        applyOperationalDocument,
        enabled,
        parsedMinutes,
        parsedRetentionDays,
        retentionEnabled,
        toast,
        settingsDocument.values,
      ]);

    const runtimeLabel =
      enabled && parsedMinutes !== null
        ? `Position ancienne après ${parsedMinutes} min`
        : 'Règle désactivée';

    const footer = (
      <div className="admin-operational-actions">
        <Button
          variant="secondary"
          onClick={handleReset}
          disabled={
            loading ||
            saving ||
            !dirty
          }
        >
          Annuler les modifications
        </Button>

        <Button
          variant="primary"
          onClick={handleSave}
          loading={saving}
          disabled={
            loading ||
            !dirty ||
            !valid
          }
        >
          Enregistrer
        </Button>
      </div>
    );

    return (
      <div className="admin-section">
        <div className="admin-section-heading-row">
          <div>
            <h3 className="admin-section-title">
              Exploitation
            </h3>

            <p className="admin-section-desc">
              Règles opérationnelles consommées en temps réel
              par le cockpit, la supervision et, plus tard,
              l’application mobile.
            </p>
          </div>

          <span
            className={[
              'admin-settings-connection',
              error
                ? 'admin-settings-connection--error'
                : 'admin-settings-connection--ready',
            ].join(' ')}
          >
            <span aria-hidden="true" />
            {error
              ? 'Backend indisponible'
              : 'Connecté au backend'}
          </span>
        </div>

        {error ? (
          <div
            className="admin-settings-error"
            role="alert"
          >
            <div>
              <strong>
                Chargement impossible
              </strong>

              <span>{error}</span>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={loadSettings}
              disabled={loading}
            >
              Réessayer
            </Button>
          </div>
        ) : null}

        <Card
          title="Supervision GPS"
          className="admin-operational-card"
          footer={footer}
        >
          {loading ? (
            <div
              className="admin-settings-loading"
              role="status"
            >
              Chargement de la configuration…
            </div>
          ) : (
            <>
              <div className="admin-operational-rule">
                <div className="admin-operational-rule-copy">
                  <strong>
                    Détecter les positions GPS anciennes
                  </strong>

                  <span>
                    Signale un technicien en intervention lorsque
                    sa dernière position dépasse le seuil configuré.
                    La règle reste inactive lorsque le paramètre
                    est désactivé.
                  </span>
                </div>

                <label className="admin-toggle admin-toggle--compact">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => {
                      setEnabled(
                        event.target.checked,
                      );
                      setError('');
                    }}
                  />

                  <span
                    className="admin-toggle-slider"
                    aria-hidden="true"
                  />

                  <span className="admin-toggle-label">
                    {enabled
                      ? 'Activée'
                      : 'Désactivée'}
                  </span>
                </label>
              </div>

              <div
                className={[
                  'admin-operational-threshold',
                  enabled
                    ? ''
                    : 'admin-operational-threshold--disabled',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="admin-field">
                  <label
                    className="admin-label"
                    htmlFor="gps-stale-after-minutes"
                  >
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
                        setMinutesInput(
                          event.target.value,
                        );
                        setError('');
                      }}
                    />

                    <span>minutes</span>
                  </div>

                  <small className="admin-field-help">
                    Entier strictement positif. Aucune valeur
                    implicite n’est appliquée par BlueVector.
                  </small>
                </div>

                <div className="admin-operational-impact">
                  <span>
                    État qui sera appliqué
                  </span>

                  <strong>{runtimeLabel}</strong>

                  <small>
                    Cockpit · Supervision · filtres opérationnels
                  </small>
                </div>
              </div>

              <div className="admin-settings-metadata">
                <div>
                  <span>Namespace</span>
                  <strong>
                    {settingsDocument.namespace}
                  </strong>
                </div>

                <div>
                  <span>Schéma</span>
                  <strong>
                    v{settingsDocument.schemaVersion}
                  </strong>
                </div>

                <div>
                  <span>Révision</span>
                  <strong>
                    {settingsDocument.revision}
                  </strong>
                </div>

                <div>
                  <span>Dernière mise à jour</span>
                  <strong>
                    {formatDateTime(
                      settingsDocument.updatedAt,
                    )}
                  </strong>
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
                  <strong>
                    Limiter la conservation des traces GPS brutes
                  </strong>

                  <span>
                    Supprime chaque jour les positions plus anciennes que
                    la durée validée par votre organisation. Une durée non
                    configurée reste un blocage de mise en production.
                  </span>
                </div>

                <label className="admin-toggle admin-toggle--compact">
                  <input
                    type="checkbox"
                    checked={retentionEnabled}
                    onChange={(event) => {
                      setRetentionEnabled(event.target.checked);
                      setError('');
                    }}
                  />

                  <span
                    className="admin-toggle-slider"
                    aria-hidden="true"
                  />

                  <span className="admin-toggle-label">
                    {retentionEnabled
                      ? 'Configurée'
                      : 'À décider'}
                  </span>
                </label>
              </div>

              <div
                className={[
                  'admin-operational-threshold',
                  retentionEnabled
                    ? ''
                    : 'admin-operational-threshold--disabled',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="admin-field">
                  <label
                    className="admin-label"
                    htmlFor="gps-history-retention-days"
                  >
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
                        setError('');
                      }}
                    />

                    <span>jours</span>
                  </div>

                  <small className="admin-field-help">
                    À définir selon la finalité déclarée, les obligations
                    contractuelles et la validation de conformité. BlueVector
                    n’invente aucune durée légale.
                  </small>
                </div>

                <div className="admin-operational-impact">
                  <span>Traitement appliqué</span>

                  <strong>
                    {retentionEnabled && parsedRetentionDays !== null
                      ? `Purge après ${parsedRetentionDays} jours`
                      : 'Décision requise avant production'}
                  </strong>

                  <small>
                    Exécution quotidienne · points GPS bruts uniquement
                  </small>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    );
  },
);


export default OperationalSettingsSection;
