import { memo } from 'react';

import {
  CheckIcon,
  DatabaseIcon,
  InfoIcon,
  MobileIcon,
  MonitorIcon,
} from './SettingsIcons';


const SettingsAbout = memo(
  function SettingsAbout({
    version,
    environment,
  }) {
    const architecture = [
      {
        label: 'Frontend',
        value: 'React + Vite',
        Icon: MonitorIcon,
      },
      {
        label: 'Backend',
        value: 'FastAPI + SQLAlchemy',
        Icon: DatabaseIcon,
      },
      {
        label: 'Base de données',
        value: 'PostgreSQL',
        Icon: DatabaseIcon,
      },
      {
        label: 'Mobile cible',
        value: 'Flutter offline-first',
        Icon: MobileIcon,
      },
    ];

    return (
      <div className="sv3-section">
        <div className="sv3-section-heading">
          <div>
            <span>Plateforme</span>
            <h2>À propos</h2>
            <p>
              Identité technique et principes structurants
              de GoVector.
            </p>
          </div>

          <span className="sv3-connection-state sv3-connection-state--ready">
            <span aria-hidden="true" />
            Lecture seule
          </span>
        </div>

        <div className="sv3-about-hero">
          <span className="sv3-about-icon">
            <InfoIcon />
          </span>

          <div>
            <span>GoVector FTTH</span>
            <h3>
              Couche d’orchestration spécialisée terrain
            </h3>
            <p>
              Pilotage des interventions, ressources,
              référentiels géographiques, stocks,
              supervision et intégrations métier.
            </p>
          </div>

          <dl>
            <div>
              <dt>Version</dt>
              <dd>v{version}</dd>
            </div>

            <div>
              <dt>Environnement</dt>
              <dd>{environment}</dd>
            </div>

            <div>
              <dt>Licence</dt>
              <dd>AGPL-3.0 + NOTICE</dd>
            </div>
          </dl>
        </div>

        <article className="sv3-principles-panel">
          <header>
            <InfoIcon />
            <div>
              <span>Identité du produit</span>
              <strong>© 2026 Nizar Iounes · BigDataai-Dev</strong>
            </div>
          </header>
          <p>
            GoVector est distribué selon GNU AGPL v3. Les composants tiers
            conservent leurs licences et attributions respectives.
          </p>
        </article>

        <div className="sv3-architecture-grid">
          {architecture.map((item) => (
            <article key={item.label}>
              <span>
                <item.Icon />
              </span>

              <div>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
              </div>
            </article>
          ))}
        </div>

        <article className="sv3-principles-panel">
          <header>
            <CheckIcon />
            <div>
              <span>Principes non négociables</span>
              <strong>
                Configuration partagée et auditable
              </strong>
            </div>
          </header>

          <ul>
            <li>
              Aucune règle métier critique codée uniquement
              dans une interface.
            </li>
            <li>
              Aucun bouton administrateur sans endpoint,
              permission et persistance réels.
            </li>
            <li>
              Les mêmes contrats doivent alimenter le web,
              le mobile et les connecteurs terrain.
            </li>
            <li>
              Les valeurs absentes restent explicitement
              non configurées.
            </li>
          </ul>
        </article>
      </div>
    );
  },
);


export default SettingsAbout;
