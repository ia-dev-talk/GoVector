import { memo } from 'react';

import {
  CheckIcon,
  ClockIcon,
  RoadmapIcon,
} from './SettingsIcons';


function statusInfo(status) {
  return {
    partial: {
      label: 'Partiel',
      tone: 'warning',
      Icon: CheckIcon,
    },
    planned: {
      label: 'Planifié',
      tone: 'planned',
      Icon: ClockIcon,
    },
    backendRequired: {
      label: 'Backend requis',
      tone: 'neutral',
      Icon: RoadmapIcon,
    },
  }[status] || {
    label: 'À cadrer',
    tone: 'neutral',
    Icon: RoadmapIcon,
  };
}


const SettingsRoadmap = memo(
  function SettingsRoadmap({
    capabilities,
  }) {
    return (
      <div className="sv3-section">
        <div className="sv3-section-heading">
          <div>
            <span>Gouvernance produit</span>
            <h2>Capacités à connecter</h2>
            <p>
              Les anciennes interfaces simulées ont été retirées.
              Chaque capacité reviendra uniquement avec son
              backend, ses permissions et sa persistance.
            </p>
          </div>

          <span className="sv3-connection-state sv3-connection-state--planned">
            <span aria-hidden="true" />
            Feuille de route
          </span>
        </div>

        <div className="sv3-roadmap-list">
          {capabilities.map((capability, index) => {
            const info =
              statusInfo(capability.status);

            return (
              <article
                key={capability.id}
                className="sv3-roadmap-row"
              >
                <span className="sv3-roadmap-index">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <span
                  className={[
                    'sv3-roadmap-icon',
                    `sv3-roadmap-icon--${info.tone}`,
                  ].join(' ')}
                >
                  <info.Icon />
                </span>

                <div className="sv3-roadmap-copy">
                  <header>
                    <h3>{capability.label}</h3>

                    <span
                      className={[
                        'sv3-status-chip',
                        `sv3-status-chip--${info.tone}`,
                      ].join(' ')}
                    >
                      {info.label}
                    </span>
                  </header>

                  <p>{capability.description}</p>

                  <div>
                    <span>Prochaine étape</span>
                    <strong>
                      {capability.nextStep}
                    </strong>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  },
);


export default SettingsRoadmap;
