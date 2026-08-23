import { memo } from 'react';

import {
  InfoIcon,
  LocationIcon,
  ModulesIcon,
  OverviewIcon,
  PlugIcon,
  RoadmapIcon,
} from './SettingsIcons';
import { settingsStatusLabel } from './settingsStatusSemantics';


const ICONS = {
  overview: OverviewIcon,
  location: LocationIcon,
  modules: ModulesIcon,
  plug: PlugIcon,
  roadmap: RoadmapIcon,
  info: InfoIcon,
};


const SettingsNavigation = memo(
  function SettingsNavigation({
    groups,
    activeSection,
    onSelect,
  }) {
    return (
      <aside className="sv3-navigation">
        <div className="sv3-navigation-copy">
          <span>Centre de configuration</span>
          <strong>État produit</strong>
          <p>
            Les badges indiquent la disponibilité produit,
            pas l’état temps réel des services.
          </p>
        </div>

        <nav aria-label="Sections des paramètres">
          {groups.map((group) => (
            <section
              key={group.id}
              className="sv3-nav-group"
            >
              <h2>{group.label}</h2>

              <div>
                {group.items.map((item) => {
                  const Icon =
                    ICONS[item.icon] ||
                    OverviewIcon;

                  const active =
                    activeSection === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={[
                        'sv3-nav-item',
                        active
                          ? 'sv3-nav-item--active'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() =>
                        onSelect(item.id)
                      }
                    >
                      <span className="sv3-nav-icon">
                        <Icon />
                      </span>

                      <span className="sv3-nav-copy">
                        <strong>{item.label}</strong>
                        <small>
                          {item.description}
                        </small>
                      </span>

                      <span
                        className={[
                          'sv3-nav-status',
                          `sv3-nav-status--${item.status}`,
                        ].join(' ')}
                      >
                        {settingsStatusLabel(item.status)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
      </aside>
    );
  },
);


export default SettingsNavigation;
