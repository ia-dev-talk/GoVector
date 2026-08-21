import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  INTERVENTION_SCOPE_EVENT,
} from '../../api/exhaustiveCollections';
import './intervention-scope-boundary.css';

function formatScopeDate(value) {
  if (!value) {
    return 'la date demandée';
  }

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export default function InterventionScopeBoundary({
  children,
}) {
  const [scopeState, setScopeState] = useState({
    status: 'idle',
    date: null,
    lastReadyDate: null,
    code: null,
  });

  useEffect(() => {
    const handleScope = (event) => {
      const detail = event?.detail;
      if (!detail?.status || !detail?.date) {
        return;
      }

      setScopeState((previous) => {
        if (detail.status === 'ready') {
          return {
            status: 'ready',
            date: detail.date,
            lastReadyDate: detail.date,
            code: null,
          };
        }

        if (detail.status === 'loading') {
          if (detail.date === previous.lastReadyDate) {
            return previous;
          }

          return {
            ...previous,
            status: 'loading',
            date: detail.date,
            code: null,
          };
        }

        if (detail.status === 'error') {
          if (detail.date === previous.lastReadyDate) {
            return previous;
          }

          return {
            ...previous,
            status: 'error',
            date: detail.date,
            code: detail.code || null,
          };
        }

        return previous;
      });
    };

    window.addEventListener(
      INTERVENTION_SCOPE_EVENT,
      handleScope,
    );

    return () => {
      window.removeEventListener(
        INTERVENTION_SCOPE_EVENT,
        handleScope,
      );
    };
  }, []);

  const retry = useCallback(() => {
    setScopeState((previous) => ({
      ...previous,
      status: 'loading',
      code: null,
    }));

    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'r',
        bubbles: true,
      }),
    );
  }, []);

  const isBlocking =
    scopeState.status === 'loading' ||
    scopeState.status === 'error';

  return (
    <div className="intervention-scope-boundary">
      {children}

      {isBlocking ? (
        <div
          className="intervention-scope-shield"
          role={
            scopeState.status === 'error'
              ? 'alert'
              : 'status'
          }
          aria-live="polite"
        >
          <div className="intervention-scope-card">
            <div
              className={[
                'intervention-scope-indicator',
                scopeState.status === 'error'
                  ? 'intervention-scope-indicator--error'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            />

            <div>
              <span className="intervention-scope-eyebrow">
                Périmètre interventions
              </span>
              <strong>
                {scopeState.status === 'error'
                  ? 'Chargement impossible'
                  : 'Chargement du planning'}
              </strong>
              <p>
                {scopeState.status === 'error'
                  ? `Les données visibles en arrière-plan ne sont pas celles du ${formatScopeDate(scopeState.date)}. Elles restent verrouillées pour éviter toute action sur le mauvais périmètre.`
                  : `Validation des interventions, techniciens et KPI pour le ${formatScopeDate(scopeState.date)}.`}
              </p>

              {scopeState.code === 'BLUEVECTOR_COLLECTION_UNSTABLE' ? (
                <small>
                  Les données ont changé pendant la pagination. Un nouveau snapshot cohérent est nécessaire.
                </small>
              ) : null}
            </div>

            {scopeState.status === 'error' ? (
              <button
                type="button"
                className="intervention-scope-retry"
                onClick={retry}
              >
                Réessayer
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
