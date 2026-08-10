import { memo } from 'react';

import {
  ArrowIcon,
  ChartIcon,
  ClipboardIcon,
  MapIcon,
  MonitorIcon,
  PackageIcon,
  UsersIcon,
} from './SettingsIcons';


const ICONS = {
  users: UsersIcon,
  map: MapIcon,
  package: PackageIcon,
  clipboard: ClipboardIcon,
  chart: ChartIcon,
  monitor: MonitorIcon,
};


const SettingsModules = memo(
  function SettingsModules({
    modules,
    onNavigate,
  }) {
    return (
      <div className="sv3-section">
        <div className="sv3-section-heading">
          <div>
            <span>Organisation</span>
            <h2>Référentiels métier</h2>
            <p>
              Les données opérationnelles sont administrées
              dans leurs modules dédiés, pas dupliquées ici.
            </p>
          </div>

          <span className="sv3-connection-state sv3-connection-state--ready">
            <span aria-hidden="true" />
            Raccourcis réels
          </span>
        </div>

        <div className="sv3-modules-grid">
          {modules.map((module) => {
            const Icon =
              ICONS[module.icon] ||
              ClipboardIcon;

            return (
              <article
                key={module.id}
                className="sv3-module-card"
              >
                <span className="sv3-module-icon">
                  <Icon />
                </span>

                <div>
                  <span>{module.eyebrow}</span>
                  <h3>{module.label}</h3>
                  <p>{module.description}</p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onNavigate(module.page)
                  }
                >
                  Ouvrir le module
                  <ArrowIcon />
                </button>
              </article>
            );
          })}
        </div>

        <div className="sv3-principle">
          <DatabaseIconFallback />

          <div>
            <strong>
              Une seule source de vérité
            </strong>
            <span>
              Personnel, secteurs, stocks et interventions
              restent relationnels et persistés dans leurs
              domaines respectifs.
            </span>
          </div>
        </div>
      </div>
    );
  },
);


function DatabaseIconFallback() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  );
}


export default SettingsModules;
