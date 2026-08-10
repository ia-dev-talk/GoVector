/* eslint-disable react-refresh/only-export-components */
/**
 * RuntimeSettingsContext — configuration métier active de BlueVector.
 *
 * Le provider charge les paramètres runtime après authentification et les
 * partage avec toutes les pages web. Les valeurs absentes restent
 * explicitement non configurées : aucune règle métier n'est inventée ici.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from '../api/client';
import { normalizeWorkflowCapabilities } from '../lib/workflow-capabilities';

const EMPTY_COMPLETION_POLICY = Object.freeze({
  default: Object.freeze({
    require_client_signature: false,
    require_cable_length: false,
    require_measurements: false,
    require_gps: false,
    require_stock_consumption: false,
    minimum_photos: 0,
    required_field_keys: Object.freeze([]),
  }),
  by_job_type: Object.freeze({}),
  by_operator: Object.freeze({}),
});

const EMPTY_OPERATIONAL_SETTINGS =
  Object.freeze({
    gps_stale_after_minutes: null,
    gps_history_retention_days: null,
    completion_policy: EMPTY_COMPLETION_POLICY,
  });

const EMPTY_RUNTIME_SETTINGS =
  Object.freeze({
    generated_at: null,
    operational:
      EMPTY_OPERATIONAL_SETTINGS,
    meta: Object.freeze({}),
    workflow: Object.freeze({
      schema_version: null,
      current_role: null,
      statuses: Object.freeze([]),
      commands: Object.freeze([]),
      completion_policy: null,
    }),
  });

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
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

function normalizeOperationalSettings(
  value,
) {
  const source = isRecord(value)
    ? value
    : {};

  return {
    gps_stale_after_minutes:
      positiveIntegerOrNull(
        source.gps_stale_after_minutes ??
          source.gpsStaleAfterMinutes,
      ),
    gps_history_retention_days:
      positiveIntegerOrNull(
        source.gps_history_retention_days ??
          source.gpsHistoryRetentionDays,
      ),
    completion_policy: isRecord(source.completion_policy)
      ? source.completion_policy
      : EMPTY_COMPLETION_POLICY,
  };
}

function normalizeNamespaceMeta(
  value,
) {
  const source = isRecord(value)
    ? value
    : {};

  return {
    schema_version:
      nonNegativeInteger(
        source.schema_version,
        1,
      ),
    revision:
      nonNegativeInteger(
        source.revision,
        0,
      ),
    updated_at:
      text(source.updated_at) || null,
  };
}

function normalizeRuntimeSettings(
  value,
  workflowValue,
) {
  const source = isRecord(value)
    ? value
    : {};

  const rawMeta = isRecord(source.meta)
    ? source.meta
    : {};

  return {
    generated_at:
      text(source.generated_at) || null,
    operational:
      normalizeOperationalSettings(
        source.operational,
      ),
    meta: Object.fromEntries(
      Object.entries(rawMeta)
        .filter(([, metadata]) =>
          isRecord(metadata),
        )
        .map(
          ([namespace, metadata]) => [
            namespace,
            normalizeNamespaceMeta(
              metadata,
            ),
          ],
        ),
    ),
    workflow: normalizeWorkflowCapabilities(workflowValue),
  };
}

function settingsErrorMessage(error) {
  const detail =
    error?.response?.data?.detail;

  if (
    typeof detail === 'string' &&
    detail.trim()
  ) {
    return detail.trim();
  }

  return (
    text(error?.message) ||
    'Impossible de charger les paramètres runtime.'
  );
}

const DEFAULT_CONTEXT_VALUE =
  Object.freeze({
    settings:
      EMPTY_RUNTIME_SETTINGS,
    loading: false,
    error: '',
    reload: async () =>
      EMPTY_RUNTIME_SETTINGS,
    applyOperationalDocument:
      () =>
        EMPTY_OPERATIONAL_SETTINGS,
  });

const RuntimeSettingsContext =
  createContext(
    DEFAULT_CONTEXT_VALUE,
  );

export function RuntimeSettingsProvider({
  children,
}) {
  const [settings, setSettings] =
    useState(
      EMPTY_RUNTIME_SETTINGS,
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const requestSequenceRef =
    useRef(0);

  const reload = useCallback(
    async () => {
      const requestId =
        requestSequenceRef.current + 1;

      requestSequenceRef.current =
        requestId;

      setLoading(true);
      setError('');

      try {
        const [response, workflowResponse] =
          await Promise.all([
            api.getRuntimeSettings(),
            api.getWorkflowCapabilities(),
          ]);

        const normalized =
          normalizeRuntimeSettings(
            response?.data,
            workflowResponse?.data,
          );

        if (
          requestId ===
          requestSequenceRef.current
        ) {
          setSettings(normalized);
        }

        return normalized;
      } catch (requestError) {
        if (
          requestId ===
          requestSequenceRef.current
        ) {
          setError(
            settingsErrorMessage(
              requestError,
            ),
          );
        }

        throw requestError;
      } finally {
        if (
          requestId ===
          requestSequenceRef.current
        ) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    reload().catch(() => {
      /*
       * L'erreur reste disponible dans le contexte.
       * Le chargement des paramètres ne doit pas
       * masquer toute l'application.
       */
    });

    return () => {
      requestSequenceRef.current += 1;
    };
  }, [reload]);

  const applyOperationalDocument =
    useCallback((document) => {
      const source = isRecord(document)
        ? document
        : {};

      const operational =
        normalizeOperationalSettings(
          source.values ??
            source.operational,
        );

      setSettings((current) => ({
        ...current,
        generated_at:
          new Date().toISOString(),
        operational,
        meta: {
          ...current.meta,
          operational:
            normalizeNamespaceMeta(
              source,
            ),
        },
      }));

      setError('');

      return operational;
    }, []);

  const contextValue = useMemo(
    () => ({
      settings,
      loading,
      error,
      reload,
      applyOperationalDocument,
    }),
    [
      applyOperationalDocument,
      error,
      loading,
      reload,
      settings,
    ],
  );

  return (
    <RuntimeSettingsContext.Provider
      value={contextValue}
    >
      {children}
    </RuntimeSettingsContext.Provider>
  );
}

export function useRuntimeSettings() {
  return useContext(
    RuntimeSettingsContext,
  );
}
