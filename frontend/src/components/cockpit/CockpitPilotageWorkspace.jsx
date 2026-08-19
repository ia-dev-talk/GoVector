import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { apiClient } from '../../api/client';
import {
  DEFAULT_COCKPIT_VIEW,
  cockpitViewFingerprint,
  normalizeCockpitView,
  toggleCockpitSection,
} from './cockpitViewPreferences';
import {
  buildCockpitPilotage,
  text,
} from './cockpitPilotageSelectors';
import '../../styles/cockpit-customization.css';


const COCKPIT_VIEW_OPTIONS = Object.freeze([
  ['metrics', 'Indicateurs'],
  ['progression', 'Progression'],
  ['decisions', 'Décisions'],
  ['capacity', 'Capacité'],
  ['quality', 'Qualité'],
  ['activity', 'Activité live'],
  ['quickAccess', 'Accès rapides'],
]);


function Icon({ name }) {
  const paths = {
    planned: (
      <>
        <rect x="5" y="4.5" width="14" height="17" rx="2.5" />
        <path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" />
      </>
    ),
    assigned: (
      <>
        <path d="M4 17V8.5A2.5 2.5 0 0 1 6.5 6h10A2.5 2.5 0 0 1 19 8.5V17M4 13h15" />
        <circle cx="8" cy="17" r="2" />
        <circle cx="16" cy="17" r="2" />
      </>
    ),
    activity: <path d="M3 12h4l2.2-5 4.1 10 2.2-5H21" />,
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.6 2.7L16.5 9" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.2" />
        <path d="M3 20c.7-4 2.8-6 6-6s5.3 2 6 6M14.5 14.5c3.1-.4 5.3 1.2 6 4.5" />
      </>
    ),
    warning: (
      <>
        <path d="M12 3 2.5 20h19L12 3Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
    map: (
      <>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
        <path d="M9 3v15M15 6v15" />
      </>
    ),
    arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.planned}
    </svg>
  );
}


function percentage(value) {
  return Number.isFinite(value) ? `${value} %` : '—';
}


function PanelHeader({ eyebrow, title, action }) {
  return (
    <header className="cpv4-panel-header">
      <div>
        <span>{eyebrow}</span>
        <strong>{title}</strong>
      </div>
      {action}
    </header>
  );
}


function LinkButton({ children, onClick }) {
  return (
    <button type="button" className="cpv4-link" onClick={onClick}>
      {children}
    </button>
  );
}


function Metric({ label, value, subtitle, tone, icon, onClick }) {
  return (
    <button
      type="button"
      className={`cpv4-metric cpv4-metric--${tone}`}
      onClick={onClick}
    >
      <span className="cpv4-metric-icon">
        <Icon name={icon} />
      </span>
      <span>
        <strong>{value}</strong>
        <b>{label}</b>
        <small>{subtitle}</small>
      </span>
    </button>
  );
}


function CockpitViewControls({
  visibility,
  syncState,
  syncError,
  onToggle,
  onReset,
}) {
  const visibleCount = Object.values(visibility).filter(Boolean).length;
  const syncLabel = {
    loading: 'Chargement du profil…',
    saving: 'Enregistrement…',
    saved: 'Synchronisée avec votre profil',
    error: 'Synchronisation indisponible',
  }[syncState] ?? 'Synchronisée avec votre profil';

  return (
    <div className="cpv4-configbar">
      <div className="cpv4-configbar-copy">
        <strong>Vue cockpit personnalisable</strong>
        <span>
          {visibleCount}/{COCKPIT_VIEW_OPTIONS.length} blocs visibles · {syncLabel}
        </span>
        {syncError ? <small role="status">{syncError}</small> : null}
      </div>

      <details>
        <summary>Personnaliser la vue</summary>
        <div className="cpv4-config-popover">
          <span>Blocs du cockpit</span>
          <div className="cpv4-config-grid">
            {COCKPIT_VIEW_OPTIONS.map(([key, label]) => {
              const lastVisible = visibility[key] && visibleCount === 1;

              return (
                <label className="cpv4-config-option" key={key}>
                  <input
                    type="checkbox"
                    checked={visibility[key]}
                    disabled={lastVisible}
                    title={lastVisible ? 'Au moins un bloc doit rester visible' : undefined}
                    onChange={() => onToggle(key)}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            className="cpv4-config-reset"
            onClick={onReset}
          >
            Réinitialiser la vue par défaut
          </button>
        </div>
      </details>
    </div>
  );
}


function Progression({ stages, onOpen }) {
  const completed = stages.find((stage) => stage.key === 'completed');

  return (
    <section className="cpv4-panel cpv4-progression">
      <PanelHeader
        eyebrow="Avancement réel"
        title="Chaîne de réalisation"
        action={
          <LinkButton onClick={onOpen}>
            Interventions <Icon name="arrow" />
          </LinkButton>
        }
      />

      <div className="cpv4-progression-body">
        <div className="cpv4-progress-head">
          <span>Clôture du planning</span>
          <strong>{percentage(completed?.rate)}</strong>
        </div>

        <div className="cpv4-progress-track">
          <span style={{ width: `${completed?.rate ?? 0}%` }} />
        </div>

        <div className="cpv4-stages">
          {stages.map((stage, index) => (
            <article key={stage.key}>
              <i>{index + 1}</i>
              <span>
                <small>{stage.label}</small>
                <strong>{stage.value}</strong>
              </span>
              <b>{percentage(stage.rate)}</b>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}


function Decisions({ decisions, onNavigate }) {
  return (
    <section className="cpv4-panel">
      <PanelHeader
        eyebrow="Arbitrage"
        title="À décider maintenant"
        action={
          <LinkButton onClick={() => onNavigate?.('supervision')}>
            Supervision <Icon name="arrow" />
          </LinkButton>
        }
      />

      <div className="cpv4-decisions">
        {decisions.length > 0 ? (
          decisions.map((decision) => (
            <button
              type="button"
              key={decision.key}
              className={`cpv4-decision cpv4-decision--${decision.tone}`}
              onClick={() => onNavigate?.(decision.page)}
            >
              <span><Icon name="warning" /></span>
              <span>
                <strong>{decision.title}</strong>
                <small>{decision.detail}</small>
              </span>
              <Icon name="arrow" />
            </button>
          ))
        ) : (
          <div className="cpv4-calm">
            <span><Icon name="check" /></span>
            <strong>Aucun arbitrage urgent</strong>
            <p>La journée ne présente aucune décision prioritaire.</p>
          </div>
        )}
      </div>
    </section>
  );
}


function Capacity({ pilotage, onNavigate }) {
  const maximum = Math.max(
    ...pilotage.sectors.map((sector) => sector.count),
    1,
  );

  const personnel = [
    ['available', 'Disponibles', pilotage.personnel.available],
    ['onJob', 'En intervention', pilotage.personnel.onJob],
    ['onBreak', 'En pause', pilotage.personnel.onBreak],
    ['offline', 'Hors ligne', pilotage.personnel.offline],
  ];

  return (
    <section className="cpv4-panel">
      <PanelHeader
        eyebrow="Capacité et couverture"
        title="Ressources terrain"
        action={
          <div className="cpv4-header-actions">
            <LinkButton onClick={() => onNavigate?.('personnel')}>
              Personnel
            </LinkButton>
            <LinkButton onClick={() => onNavigate?.('secteurs')}>
              Secteurs
            </LinkButton>
          </div>
        }
      />

      <div className="cpv4-capacity">
        <div className="cpv4-personnel">
          {personnel.map(([key, label, value]) => (
            <article key={key} className={`cpv4-personnel--${key}`}>
              <i />
              <small>{label}</small>
              <strong>{value}</strong>
            </article>
          ))}
        </div>

        <div className="cpv4-sectors">
          <div className="cpv4-label">Charge visible par secteur</div>

          {pilotage.sectors.length > 0 ? (
            pilotage.sectors.map((sector) => (
              <div className="cpv4-sector-row" key={sector.sector}>
                <span>{sector.sector}</span>
                <i>
                  <span
                    style={{
                      width: `${Math.max(
                        5,
                        Math.round((sector.count / maximum) * 100),
                      )}%`,
                    }}
                  />
                </i>
                <strong>{sector.count}</strong>
              </div>
            ))
          ) : (
            <div className="cpv4-empty">
              Aucun secteur renseigné dans le planning chargé.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}


function Quality({ quality, onOpen }) {
  return (
    <section className="cpv4-panel">
      <PanelHeader
        eyebrow="Fiabilité du pilotage"
        title="Qualité opérationnelle"
        action={
          <button type="button" className="cpv4-score" onClick={onOpen}>
            {percentage(quality.overall)}
          </button>
        }
      />

      <div className="cpv4-quality">
        {quality.metrics.map((metric) => (
          <div key={metric.key}>
            <span>{metric.label}</span>
            <i>
              <span
                className={metric.value !== null && metric.value < 70 ? 'warning' : ''}
                style={{ width: `${metric.value ?? 0}%` }}
              />
            </i>
            <strong>{percentage(metric.value)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}


function RecentActivity({ activities }) {
  const recent = Array.isArray(activities) ? activities.slice(0, 4) : [];

  return (
    <section className="cpv4-panel">
      <PanelHeader eyebrow="Temps réel" title="Derniers mouvements" />

      <div className="cpv4-activity">
        {recent.length > 0 ? (
          recent.map((activity, index) => (
            <article key={activity?.id ?? `${activity?.time}-${index}`}>
              <time>{text(activity?.time, '--:--')}</time>
              <span>
                <strong>{text(activity?.action, 'Événement terrain')}</strong>
                <small>
                  {[text(activity?.name), text(activity?.location)]
                    .filter(Boolean)
                    .join(' · ') || 'Système BlueVector'}
                </small>
              </span>
            </article>
          ))
        ) : (
          <div className="cpv4-empty">
            Aucun mouvement reçu pendant cette session.
          </div>
        )}
      </div>
    </section>
  );
}


function QuickAccess({ pilotage, canAssign, onNavigate }) {
  const links = [
    ['supervision', 'Supervision', `${pilotage.decisions.length} décision${pilotage.decisions.length !== 1 ? 's' : ''}`, 'warning'],
    ['interventions', 'Interventions', canAssign ? `${pilotage.summary.unassigned} à affecter` : `${pilotage.summary.total} planifiées`, 'planned'],
    ['carte', 'Carte live', `${pilotage.geo.technicians} techniciens GPS`, 'map'],
    ['rapports', 'Rapports', `Qualité ${percentage(pilotage.quality.overall)}`, 'chart'],
  ];

  return (
    <section className="cpv4-panel">
      <PanelHeader eyebrow="Navigation" title="Accès opérationnels" />

      <div className="cpv4-access">
        {links.map(([page, label, detail, icon]) => (
          <button type="button" key={page} onClick={() => onNavigate?.(page)}>
            <span><Icon name={icon} /></span>
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            <Icon name="arrow" />
          </button>
        ))}
      </div>
    </section>
  );
}


const CockpitPilotageWorkspace = memo(function CockpitPilotageWorkspace({
  summary,
  jobs = [],
  personnelSummary,
  sectorLoad = [],
  positionedCounts,
  activities = [],
  canAssign = false,
  onNavigate,
  statusMetadata = [],
}) {
  const [visibility, setVisibility] = useState({ ...DEFAULT_COCKPIT_VIEW });
  const [preferenceSync, setPreferenceSync] = useState('loading');
  const [preferenceError, setPreferenceError] = useState('');
  const [preferenceHydrated, setPreferenceHydrated] = useState(false);
  const persistedFingerprint = useRef('');

  useEffect(() => {
    let cancelled = false;

    apiClient
      .get('/auth/me/cockpit-view')
      .then((response) => {
        if (cancelled) {
          return;
        }

        const normalized = normalizeCockpitView(response.data);
        persistedFingerprint.current = cockpitViewFingerprint(normalized);
        setVisibility(normalized);
        setPreferenceHydrated(true);
        setPreferenceSync('saved');
        setPreferenceError('');
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setPreferenceHydrated(false);
        setPreferenceSync('error');
        setPreferenceError(
          'Votre vue reste utilisable, mais elle ne sera pas synchronisée tant que le profil est indisponible.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!preferenceHydrated) {
      return undefined;
    }

    const fingerprint = cockpitViewFingerprint(visibility);
    if (fingerprint === persistedFingerprint.current) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      apiClient
        .put('/auth/me/cockpit-view', normalizeCockpitView(visibility))
        .then((response) => {
          const normalized = normalizeCockpitView(response.data);
          persistedFingerprint.current = cockpitViewFingerprint(normalized);
          setPreferenceSync('saved');
          setPreferenceError('');
        })
        .catch(() => {
          setPreferenceSync('error');
          setPreferenceError(
            'La dernière personnalisation n’a pas pu être enregistrée. Réessayez après rétablissement de la connexion.',
          );
        });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [preferenceHydrated, visibility]);

  const pilotage = useMemo(
    () =>
      buildCockpitPilotage({
        jobs,
        summary,
        personnelSummary,
        sectorLoad,
        positionedCounts,
        statusMetadata,
      }),
    [jobs, personnelSummary, positionedCounts, sectorLoad, statusMetadata, summary],
  );

  const metrics = [
    ['Planifiées', pilotage.summary.total, 'Journée chargée', 'primary', 'planned', 'interventions'],
    ['Affectées', pilotage.summary.assigned, 'Planning terrain', 'info', 'assigned', 'interventions'],
    ['En cours', pilotage.summary.in_progress, 'Activité terrain', 'purple', 'activity', 'interventions'],
    ['Terminées', pilotage.summary.completed, 'Clôturées', 'success', 'check', 'rapports'],
    ['Non affectées', pilotage.summary.unassigned, 'À planifier', pilotage.summary.unassigned > 0 ? 'warning' : 'muted', 'warning', 'interventions'],
    ['Disponibles', pilotage.personnel.available, `${pilotage.personnel.total} techniciens`, 'success', 'users', 'personnel'],
  ];

  const markPreferenceSaving = () => {
    setPreferenceSync('saving');
    setPreferenceError('');
  };

  const toggleSection = (key) => {
    markPreferenceSaving();
    setVisibility((current) => toggleCockpitSection(current, key));
  };

  const resetView = () => {
    markPreferenceSaving();
    setVisibility({ ...DEFAULT_COCKPIT_VIEW });
  };

  return (
    <div className="cockpit-body cockpit-v4-workspace">
      <CockpitViewControls
        visibility={visibility}
        syncState={preferenceSync}
        syncError={preferenceError}
        onToggle={toggleSection}
        onReset={resetView}
      />

      {visibility.metrics ? (
        <section className="cpv4-metrics" aria-label="Situation de la journée">
          {metrics.map(([label, value, subtitle, tone, icon, page]) => (
            <Metric
              key={label}
              label={label}
              value={value}
              subtitle={subtitle}
              tone={tone}
              icon={icon}
              onClick={() => onNavigate?.(page)}
            />
          ))}
        </section>
      ) : null}

      {visibility.progression || visibility.decisions ? (
        <div className="cpv4-primary">
          {visibility.progression ? (
            <Progression
              stages={pilotage.stages}
              onOpen={() => onNavigate?.('interventions')}
            />
          ) : null}
          {visibility.decisions ? (
            <Decisions decisions={pilotage.decisions} onNavigate={onNavigate} />
          ) : null}
        </div>
      ) : null}

      {visibility.capacity || visibility.quality ? (
        <div className="cpv4-secondary">
          {visibility.capacity ? (
            <Capacity pilotage={pilotage} onNavigate={onNavigate} />
          ) : null}
          {visibility.quality ? (
            <Quality
              quality={pilotage.quality}
              onOpen={() => onNavigate?.('rapports')}
            />
          ) : null}
        </div>
      ) : null}

      {visibility.activity || visibility.quickAccess ? (
        <div className="cpv4-tertiary">
          {visibility.activity ? (
            <RecentActivity activities={activities} />
          ) : null}
          {visibility.quickAccess ? (
            <QuickAccess
              pilotage={pilotage}
              canAssign={canAssign}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

CockpitPilotageWorkspace.displayName = 'CockpitPilotageWorkspace';

export default CockpitPilotageWorkspace;