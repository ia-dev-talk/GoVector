/**
 * En-tête compact du cockpit BlueVector.
 * La marque reste portée par le shell principal : cette surface expose
 * uniquement le contexte utile au pilotage opérationnel.
 */

import { memo } from 'react';

import {
  RefreshIcon,
  SearchIcon,
} from '../DashboardIcons';

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return fallback;
  }

  return String(value).trim() || fallback;
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="4.5" width="15" height="13" rx="2.5" />
      <path d="M2.5 8h15M6.5 2.5v4M13.5 2.5v4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.75V10l3 1.75" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="6.5" r="3" />
      <path d="M3.5 17c.7-3.4 3.1-5.3 6.5-5.3s5.8 1.9 6.5 5.3" />
    </svg>
  );
}

const CockpitHeader = memo(function CockpitHeader({
  userName = 'Utilisateur',
  realClock = '--:--',
  liveConnected = false,
  onRefresh,
  refreshing = false,
  searchQuery = '',
  onSearchChange,
  onSearchSubmit,
  currentDate = new Date(),
  onNewIntervention,
  locale = 'fr-FR',
  searchPlaceholder = 'Technicien, client, adresse, PBO…',
}) {
  const date = normalizeDate(currentDate);
  const normalizedLocale = normalizeText(locale, 'fr-FR');
  const normalizedQuery = normalizeText(searchQuery);
  const canRefresh = typeof onRefresh === 'function';
  const canChangeSearch = typeof onSearchChange === 'function';
  const canSubmitSearch = typeof onSearchSubmit === 'function';

  const dateLabel = new Intl.DateTimeFormat(normalizedLocale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
    .format(date)
    .replace(/\./g, '')
    .replace(/^./, (character) => character.toLocaleUpperCase(normalizedLocale));

  const refreshLabel = refreshing
    ? 'Actualisation en cours'
    : canRefresh
      ? 'Actualiser le pilotage'
      : 'Actualisation indisponible';

  const handleSearchSubmit = (event) => {
    event.preventDefault();

    if (canSubmitSearch && normalizedQuery) {
      onSearchSubmit();
    }
  };

  return (
    <header className="cockpit-header cockpit-header--v3" aria-label="En-tête du pilotage de la journée">
      <div className="cockpit-header-identity">
        <span className="cockpit-header-eyebrow">Bonjour, {normalizeText(userName, 'Orienteur')}</span>

        <div className="cockpit-header-title-row">
          <h1>Voici votre activité du jour</h1>

          <span
            className={`cockpit-live-state ${
              liveConnected
                ? 'cockpit-live-state--connected'
                : 'cockpit-live-state--reconnecting'
            }`}
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true" />
            {liveConnected ? 'Temps réel' : 'Reconnexion'}
          </span>
        </div>

        <p>{dateLabel}</p>
      </div>

      <div className="cockpit-header-context">
        <div className="cockpit-context-chip cockpit-context-chip--user" title={`Session : ${normalizeText(userName, 'Utilisateur')}`}>
          <UserIcon />
          <span>{normalizeText(userName, 'Utilisateur')}</span>
        </div>

        <div className="cockpit-context-chip">
          <CalendarIcon />
          <time dateTime={dateKey(date)}>{dateLabel}</time>
        </div>

        <div className="cockpit-context-chip cockpit-context-chip--clock">
          <ClockIcon />
          <time dateTime={date.toISOString()}>{normalizeText(realClock, '--:--')}</time>
        </div>
      </div>

      <div className="cockpit-header-actions">
        <form className="cockpit-search cockpit-search--v3" role="search" onSubmit={handleSearchSubmit}>
          <SearchIcon aria-hidden="true" />
          <input
            type="search"
            className="cockpit-search-input"
            placeholder={searchPlaceholder}
            aria-label="Recherche dans le pilotage du jour"
            value={searchQuery ?? ''}
            readOnly={!canChangeSearch}
            disabled={!canChangeSearch && !canSubmitSearch}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              if (canChangeSearch) {
                onSearchChange(event.target.value);
              }
            }}
          />
        </form>

        <button
          type="button"
          className="cockpit-new-intervention"
          onClick={onNewIntervention}
          disabled={typeof onNewIntervention !== 'function'}
        >
          <span aria-hidden="true">＋</span>
          Nouvelle intervention
        </button>

        <button
          type="button"
          className="cockpit-refresh-button"
          onClick={canRefresh ? onRefresh : undefined}
          disabled={refreshing || !canRefresh}
          title={refreshLabel}
          aria-label={refreshLabel}
          aria-busy={refreshing}
        >
          <RefreshIcon spinning={refreshing} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
});

CockpitHeader.displayName = 'CockpitHeader';

export default CockpitHeader;
