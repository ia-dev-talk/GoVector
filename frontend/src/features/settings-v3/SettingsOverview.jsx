import { memo } from 'react';

import {
  AlertIcon,
  CheckIcon,
  ClockIcon,
  DatabaseIcon,
  LocationIcon,
  ShieldIcon,
} from './SettingsIcons';


function formatDateTime(value) {
  if (!value) {
    return 'Non disponible';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Non disponible';
  }

  return new Intl.DateTimeFormat(
    'fr-FR',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    },
  ).format(date);
}


const SettingsOverview = memo(
  function SettingsOverview({
    settings,
    loading,
    error,
    userRole,
    onOpenOperational,
  }) {
    const operational =
      settings?.operational || {};

    const metadata =
      settings?.meta?.operational || {};

    const gpsThreshold =
      operational.gps_stale_after_minutes;

    const connected =
      !loading && !error;

    const summaryCards = [
      {
        id: 'runtime',
        label: 'Runtime settings',
        value: loading
          ? 'Chargement'
          : error
            ? 'Indisponible'
            : 'Connecté',
        description: error
          ? 'Le backend de configuration ne répond pas.'
          : 'Configuration partagée par les pages opérationnelles.',
        tone: error ? 'danger' : 'success',
        Icon: error ? AlertIcon : CheckIcon,
      },
      {
        id: 'namespace',
        label: 'Namespace actif',
        value: 'operational',
        description:
          `Schéma v${metadata.schema_version ?? 1} · révision ${metadata.revision ?? 0}`,
        tone: 'info',
        Icon: DatabaseIcon,
      },
      {
        id: 'gps',
        label: 'Règle GPS ancien',
        value: gpsThreshold
          ? `${gpsThreshold} min`
          : 'Non configurée',
        description: gpsThreshold
          ? 'Seuil appliqué au cockpit et à la supervision.'
          : 'Aucune valeur implicite n’est utilisée.',
        tone: gpsThreshold ? 'success' : 'warning',
        Icon: LocationIcon,
      },
      {
        id: 'access',
        label: 'Accès administration',
        value: userRole || 'ADMIN',
        description:
          'La page Paramètres reste réservée au rôle administrateur.',
        tone: 'neutral',
        Icon: ShieldIcon,
      },
    ];

    return (
      <div className="sv3-section">
        <div className="sv3-section-heading">
          <div>
            <span>Centre de contrôle</span>
            <h2>Vue d’ensemble</h2>
            <p>
              État réel des paramètres actuellement consommés
              par BlueVector.
            </p>
          </div>

          <span
            className={[
              'sv3-connection-state',
              connected
                ? 'sv3-connection-state--ready'
                : 'sv3-connection-state--error',
            ].join(' ')}
          >
            <span aria-hidden="true" />
            {connected
              ? 'Configuration disponible'
              : 'Configuration dégradée'}
          </span>
        </div>

        {error ? (
          <div
            className="sv3-error-banner"
            role="alert"
          >
            <AlertIcon />
            <div>
              <strong>
                Paramètres runtime indisponibles
              </strong>
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        <div className="sv3-summary-grid">
          {summaryCards.map((card) => (
            <article
              key={card.id}
              className={[
                'sv3-summary-card',
                `sv3-summary-card--${card.tone}`,
              ].join(' ')}
            >
              <span className="sv3-summary-icon">
                <card.Icon />
              </span>

              <div>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <p>{card.description}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="sv3-overview-grid">
          <article className="sv3-panel sv3-control-plane">
            <header>
              <div>
                <span>Configuration active</span>
                <strong>Exploitation terrain</strong>
              </div>

              <button
                type="button"
                className="sv3-text-button"
                onClick={onOpenOperational}
              >
                Configurer
              </button>
            </header>

            <div className="sv3-control-row">
              <span className="sv3-control-icon">
                <LocationIcon />
              </span>

              <div>
                <strong>
                  Détection des positions GPS anciennes
                </strong>
                <p>
                  {gpsThreshold
                    ? (
                        'Un technicien est signalé lorsque sa ' +
                        `position dépasse ${gpsThreshold} minutes.`
                      )
                    : (
                        'La règle est désactivée. Aucun seuil ' +
                        'n’est appliqué automatiquement.'
                      )}
                </p>
              </div>

              <span
                className={[
                  'sv3-status-chip',
                  gpsThreshold
                    ? 'sv3-status-chip--ready'
                    : 'sv3-status-chip--warning',
                ].join(' ')}
              >
                {gpsThreshold
                  ? 'Active'
                  : 'À configurer'}
              </span>
            </div>
          </article>

          <article className="sv3-panel sv3-runtime-metadata">
            <header>
              <div>
                <span>Traçabilité runtime</span>
                <strong>Dernière génération</strong>
              </div>

              <ClockIcon />
            </header>

            <dl>
              <div>
                <dt>Runtime généré</dt>
                <dd>
                  {formatDateTime(
                    settings?.generated_at,
                  )}
                </dd>
              </div>

              <div>
                <dt>Namespace mis à jour</dt>
                <dd>
                  {formatDateTime(
                    metadata.updated_at,
                  )}
                </dd>
              </div>

              <div>
                <dt>Révision</dt>
                <dd>{metadata.revision ?? 0}</dd>
              </div>
            </dl>
          </article>
        </div>
      </div>
    );
  },
);


export default SettingsOverview;
