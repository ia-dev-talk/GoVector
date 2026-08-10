/** Avertissement compact pour les chargements partiels du cockpit. */

import { memo } from 'react';
import { RefreshIcon } from '../DashboardIcons';

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v4.5M12 17h.01" />
    </svg>
  );
}

const CockpitDataNotice = memo(function CockpitDataNotice({
  message,
  lastSync,
  onRetry,
  retrying = false,
}) {
  if (!message) return null;

  const canRetry = typeof onRetry === 'function';

  return (
    <aside className="cockpit-data-notice" role="alert">
      <span className="cockpit-data-notice-icon" aria-hidden="true"><WarningIcon /></span>

      <div className="cockpit-data-notice-copy">
        <strong>Certaines données sont indisponibles</strong>
        <span>{message}</span>
      </div>

      {lastSync && lastSync !== '--:--' ? (
        <span className="cockpit-data-notice-sync">
          Dernière réussite
          <strong>{lastSync}</strong>
        </span>
      ) : null}

      <button
        type="button"
        className="cockpit-data-notice-action"
        onClick={canRetry ? onRetry : undefined}
        disabled={retrying || !canRetry}
        aria-label={retrying ? 'Nouvelle tentative en cours' : 'Réessayer le chargement'}
      >
        <RefreshIcon spinning={retrying} aria-hidden="true" />
        <span>{retrying ? 'Actualisation' : 'Réessayer'}</span>
      </button>
    </aside>
  );
});

CockpitDataNotice.displayName = 'CockpitDataNotice';

export default CockpitDataNotice;
