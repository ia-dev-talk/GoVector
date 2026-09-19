import { memo } from 'react';

import {
  RefreshIcon,
  SearchIcon,
  SettingsIcon,
} from './SettingsIcons';


const SettingsHeader = memo(
  function SettingsHeader({
    version,
    environment,
    userRole,
    runtimeLoading,
    runtimeError,
    refreshing,
    query,
    onQueryChange,
    onSearch,
    onRefresh,
  }) {
    const runtimeState = runtimeError
      ? 'Indisponible'
      : runtimeLoading
        ? 'Chargement'
        : 'Connecté';

    return (
      <header className="settings-v3-header">
        <div className="settings-v3-header-identity">
          <span className="settings-v3-title-icon">
            <SettingsIcon />
          </span>

          <div>
            <span className="settings-v3-eyebrow">
              Administration GoVector
            </span>

            <div className="settings-v3-title-row">
              <h1>Paramètres</h1>

              <span
                className={[
                  'sv3-runtime-pill',
                  runtimeError
                    ? 'sv3-runtime-pill--error'
                    : runtimeLoading
                      ? 'sv3-runtime-pill--loading'
                      : 'sv3-runtime-pill--ready',
                ].join(' ')}
              >
                <span aria-hidden="true" />
                Runtime {runtimeState}
              </span>
            </div>

            <p>
              Configuration centralisée, gouvernance et accès
              aux référentiels métier.
            </p>
          </div>
        </div>

        <div className="settings-v3-header-context">
          <span>
            <small>Version</small>
            <strong>v{version}</strong>
          </span>

          <span>
            <small>Environnement</small>
            <strong>{environment}</strong>
          </span>

          <span>
            <small>Rôle</small>
            <strong>{userRole || 'ADMIN'}</strong>
          </span>
        </div>

        <form
          className="settings-v3-header-actions"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <label className="settings-v3-search">
            <SearchIcon />
            <input
              value={query}
              onChange={(event) =>
                onQueryChange(event.target.value)
              }
              placeholder="Rechercher un paramètre..."
              aria-label="Rechercher un paramètre"
            />
          </label>

          <button
            type="button"
            className="settings-v3-icon-button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Actualiser les paramètres runtime"
            title="Actualiser les paramètres runtime"
          >
            <RefreshIcon spinning={refreshing} />
          </button>
        </form>
      </header>
    );
  },
);


export default SettingsHeader;
