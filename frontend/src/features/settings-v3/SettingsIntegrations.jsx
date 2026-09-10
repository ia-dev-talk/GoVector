import { memo } from 'react';

import {
  MailIcon,
  MapIcon,
  MobileIcon,
  PlugIcon,
} from './SettingsIcons';


const ICONS = {
  plug: PlugIcon,
  map: MapIcon,
  mobile: MobileIcon,
  mail: MailIcon,
};


const SettingsIntegrations = memo(
  function SettingsIntegrations({
    capabilities,
  }) {
    return (
      <div className="sv3-section">
        <div className="sv3-section-heading">
          <div>
            <span>Écosystème GoVector</span>
            <h2>Intégrations</h2>
            <p>
              État architectural des raccordements externes.
              Aucun bouton n’est exposé avant l’existence du
              contrat backend correspondant.
            </p>
          </div>

          <span className="sv3-connection-state sv3-connection-state--planned">
            <span aria-hidden="true" />
            Architecture planifiée
          </span>
        </div>

        <div className="sv3-integrations-grid">
          {capabilities.map((capability) => {
            const Icon =
              ICONS[capability.icon] ||
              PlugIcon;

            return (
              <article
                key={capability.id}
                className="sv3-integration-card"
              >
                <header>
                  <span className="sv3-integration-icon">
                    <Icon />
                  </span>

                  <div>
                    <span>{capability.category}</span>
                    <h3>{capability.label}</h3>
                  </div>

                  <span className="sv3-status-chip sv3-status-chip--planned">
                    À connecter
                  </span>
                </header>

                <p>{capability.description}</p>

                <div>
                  <span>Dépendance avant activation</span>
                  <strong>
                    {capability.dependency}
                  </strong>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  },
);


export default SettingsIntegrations;
