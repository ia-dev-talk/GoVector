import {
  PeopleIcon,
  RefreshIcon,
  SearchIcon,
} from './PersonnelIcons';

export default function PersonnelHeader({
  total = 0,
  query = '',
  onQueryChange,
  onRefresh,
  refreshing = false,
  liveConnected = true,
}) {
  return (
    <header className="personnel-v3-header">
      <div className="personnel-v3-heading">
        <span className="personnel-v3-eyebrow">
          Ressources terrain
        </span>

        <div className="personnel-v3-title-row">
          <h1>Personnel</h1>

          <span
            className={[
              'personnel-v3-live',
              liveConnected
                ? 'personnel-v3-live--connected'
                : 'personnel-v3-live--reconnecting',
            ].join(' ')}
          >
            <span aria-hidden="true" />
            {liveConnected
              ? 'Temps réel'
              : 'Reconnexion'}
          </span>
        </div>

        <p>
          Disponibilité, charge et compétences de l’équipe terrain
        </p>
      </div>

      <div className="personnel-v3-header-summary">
        <span className="personnel-v3-header-summary-icon">
          <PeopleIcon />
        </span>

        <div>
          <strong>{total}</strong>
          <span>techniciens</span>
        </div>
      </div>

      <div className="personnel-v3-header-actions">
        <label className="personnel-v3-search">
          <SearchIcon />

          <input
            type="search"
            value={query}
            placeholder="Nom, matricule, équipe, secteur, compétence…"
            aria-label="Rechercher un technicien"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) =>
              onQueryChange?.(event.target.value)
            }
          />
        </label>

        <button
          type="button"
          className="personnel-v3-refresh"
          onClick={onRefresh}
          disabled={refreshing || typeof onRefresh !== 'function'}
          aria-label={
            refreshing
              ? 'Actualisation en cours'
              : 'Actualiser le personnel'
          }
          title="Actualiser"
        >
          <RefreshIcon
            className={refreshing ? 'is-spinning' : undefined}
          />
        </button>
      </div>
    </header>
  );
}
