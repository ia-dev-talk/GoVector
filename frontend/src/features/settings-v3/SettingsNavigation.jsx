import { memo } from 'react';

import {
  InfoIcon,
  LocationIcon,
  ModulesIcon,
  OverviewIcon,
  PlugIcon,
  RoadmapIcon,
} from './SettingsIcons';


const ICONS = {
  overview: OverviewIcon,
  location: LocationIcon,
  modules: ModulesIcon,
  plug: PlugIcon,
  roadmap: RoadmapIcon,
  info: InfoIcon,
};


function statusLabel(status) {
  return {
    active: 'Actif',
    connected: 'Connecté',
    available: 'Modules',
    planned: 'Planifié',
    readOnly: 'Lecture',
  }[status] || '';
}


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
          <strong>Source de vérité</strong>
          <p>
            Seuls les contrôles raccordés à une persistance
            réelle sont modifiables.
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
                        {statusLabel(item.status)}
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
