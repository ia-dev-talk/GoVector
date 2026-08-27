import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { apiClient } from '../../api/client';
import {
  COCKPIT_VIEW_PRESETS,
  DEFAULT_COCKPIT_ORDER,
  DEFAULT_COCKPIT_VIEW,
  applyCockpitPreset,
  createCockpitPreferenceSaveQueue,
  detectCockpitPreset,
  enqueueCockpitPreferenceSave,
  moveCockpitSection,
  normalizeCockpitOrder,
  toggleCockpitSection,
  visibleCockpitOrder,
} from './cockpitViewPreferences';
import {
  cockpitLayoutFingerprint,
  normalizeCockpitLayout,
} from './cockpitLayoutIdentity';
import {
  cockpitPreferenceRetryMode,
  reconcileCockpitHydration,
} from './cockpitPreferenceHydration';
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

const COCKPIT_VIEW_LABELS = Object.freeze(
  Object.fromEntries(COCKPIT_VIEW_OPTIONS),
);


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
  order,
  syncState,
  syncError,
  canRetry,
  onRetry,
  onPreset,
  onToggle,
  onMove,
  onReset,
}) {
  const visibleCount = Object.values(visibility).filter(Boolean).length;
  const activePreset = detectCockpitPreset(visibility);
  const activePresetLabel = activePreset
    ? COCKPIT_VIEW_PRESETS[activePreset].label
    : 'Personnalisée';
  const controlsDisabled = syncState === 'loading';
  const normalizedOrder = normalizeCockpitOrder(order);
  const syncLabel = {
    loading: 'Chargement du profil…',
    'load-error': 'Profil indisponible · vue locale',
    saving: 'Enregistrement…',
    saved: 'Synchronisée avec votre profil',
    error: 'Synchronisation indisponible',
  }[syncState] ?? 'Synchronisée avec votre profil';

  return (
    <div className="cpv4-configbar">
      <div className="cpv4-configbar-copy">
        <strong>Vue cockpit personnalisable</strong>
        <span>
          Vue {activePresetLabel} · {visibleCount}/{COCKPIT_VIEW_OPTIONS.length} blocs visibles · {syncLabel}
        </span>
        {syncError ? (
          <div>
            <small role="status">{syncError}</small>
            {canRetry ? (
              <button type="button" className="cpv4-link" onClick={onRetry}>
                Réessayer
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <details>
        <summary>Personnaliser la vue</summary>
        <div className="cpv4-config-popover">
          <span>Presets métier</span>
          <div className="cpv4-config-grid">
            {Object.entries(COCKPIT_VIEW_PRESETS).map(([key, preset]) => {
              const selected = activePreset === key;
              return (
                <button
                  type="button"
                  className="cpv4-config-option"
                  key={key}
                  aria-pressed={selected}
                  disabled={controlsDisabled}
                  title={preset.description}
                  onClick={() => onPreset(key)}
                  style={selected ? {
                    borderColor: 'var(--color-accent)',
                    color: 'var(--text-primary)',
                  } : undefined}
                >
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>

          <span style={{ marginTop: '10px' }}>Blocs du cockpit</span>
          <div className="cpv4-config-grid" aria-label="Ordre et visibilité des blocs">
            {normalizedOrder.map((key, index) => {
              const label = COCKPIT_VIEW_LABELS[key] ?? key;
              const lastVisible = visibility[key] && visibleCount === 1;

              return (
                <div className="cpv4-config-option" key={key}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: '1 1 auto' }}>
                    <input
                      type="checkbox"
                      checked={visibility[key]}
                      disabled={controlsDisabled || lastVisible}
                      title={lastVisible ? 'Au moins un bloc doit rester visible' : undefined}
                      onChange={() => onToggle(key)}
                    />
                    <span>{label}</span>
                  </label>
                  <span style={{ display: 'inline-flex', gap: '2px', marginLeft: 'auto' }}>
                    <button
                      type="button"
                      className="cpv4-link"
                      aria-label={`Monter ${label}`}
                      title={`Monter ${label}`}
                      disabled={controlsDisabled || index === 0}
                      onClick={() => onMove(key, 'up')}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="cpv4-link"
                      aria-label={`Descendre ${label}`}
                      title={`Descendre ${label}`}
                      disabled={controlsDisabled || index === normalizedOrder.length - 1}
                      onClick={() => onMove(key, 'down')}
                    >
                      ↓
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
          <small style={{ display: 'block', marginTop: '8px', color: 'var(--text-muted)' }}>
            Les presets changent la visibilité. Votre ordre personnalisé est conservé jusqu’à réinitialisation.
          </small>
          <button
            type="button"
            className="cpv4-config-reset"
            disabled={controlsDisabled}
            onClick={onReset}
          >
            Réinitialiser visibilité et ordre
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
  const [order, setOrder] = useState([...DEFAULT_COCKPIT_ORDER]);
  const [preferenceSync, setPreferenceSync] = useState('loading');
  const [preferenceError, setPreferenceError] = useState('');
  const [preferenceHydrated, setPreferenceHydrated] = useState(false);
  const [preferenceRetryToken, setPreferenceRetryToken] = useState(0);
  const [preferenceHydrationRetryToken, setPreferenceHydrationRetryToken] = useState(0);
  const persistedFingerprint = useRef('');
  const preferenceSaveQueue = useRef(createCockpitPreferenceSaveQueue());
  const preferenceLocallyModified = useRef(false);
  const latestLocalLayout = useRef(
    normalizeCockpitLayout({
      view: DEFAULT_COCKPIT_VIEW,
      order: DEFAULT_COCKPIT_ORDER,
    }),
  );

  useEffect(() => {
    let cancelled = false;

    apiClient
      .get('/auth/me/cockpit-view')
      .then((response) => {
        if (cancelled) {
          return;
        }

        const reconciliation = reconcileCockpitHydration({
          remoteLayout: response.data,
          localLayout: latestLocalLayout.current,
          locallyModified: preferenceLocallyModified.current,
        });

        persistedFingerprint.current = reconciliation.persistedFingerprint;
        latestLocalLayout.current = reconciliation.layout;
        setVisibility(reconciliation.layout.view);
        setOrder(reconciliation.layout.order);
        setPreferenceHydrated(true);
        setPreferenceSync(reconciliation.shouldPersistLocal ? 'saving' : 'saved');
        setPreferenceError('');
        preferenceLocallyModified.current = reconciliation.shouldPersistLocal;
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setPreferenceHydrated(false);
        setPreferenceSync('load-error');
        setPreferenceError(
          preferenceLocallyModified.current
            ? 'Votre vue a été modifiée localement. Réessayez la synchronisation : vos changements seront conservés puis enregistrés après reconnexion.'
            : 'Le profil de vue est indisponible. Vous pouvez continuer localement puis réessayer sans recharger la page.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [preferenceHydrationRetryToken]);

  useEffect(() => {
    if (!preferenceHydrated) {
      return undefined;
    }

    const normalized = normalizeCockpitLayout({ view: visibility, order });
    const fingerprint = cockpitLayoutFingerprint(normalized);
    if (
      fingerprint === persistedFingerprint.current &&
      preferenceSaveQueue.current.pending === 0
    ) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      enqueueCockpitPreferenceSave(preferenceSaveQueue.current, {
        payload: normalized,
        save: (payload) => apiClient
          .put('/auth/me/cockpit-view', payload)
          .then((response) => response.data),
        onLatestSaved: (savedLayout) => {
          const saved = normalizeCockpitLayout(savedLayout);
          persistedFingerprint.current = cockpitLayoutFingerprint(saved);
          preferenceLocallyModified.current = false;
          setPreferenceSync('saved');
          setPreferenceError('');
        },
        onLatestError: () => {
          setPreferenceSync('error');
          setPreferenceError(
            'La dernière personnalisation n’a pas pu être enregistrée. Réessayez après rétablissement de la connexion.',
          );
        },
      });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [order, preferenceHydrated, preferenceRetryToken, visibility]);

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

  const markPreferenceChanged = (nextLayout) => {
    const normalized = normalizeCockpitLayout(nextLayout);
    latestLocalLayout.current = normalized;
    preferenceLocallyModified.current = true;

    if (!preferenceHydrated) {
      setPreferenceSync('load-error');
      setPreferenceError(
        'Votre vue est modifiée localement et n’est pas encore synchronisée. Réessayez lorsque le profil redevient disponible.',
      );
      return normalized;
    }

    setPreferenceSync('saving');
    setPreferenceError('');
    return normalized;
  };

  const applyPreset = (presetKey) => {
    const next = markPreferenceChanged({
      view: applyCockpitPreset(presetKey),
      order: latestLocalLayout.current.order,
    });
    setVisibility(next.view);
  };

  const toggleSection = (key) => {
    const next = markPreferenceChanged({
      view: toggleCockpitSection(latestLocalLayout.current.view, key),
      order: latestLocalLayout.current.order,
    });
    setVisibility(next.view);
  };

  const moveSection = (key, direction) => {
    const next = markPreferenceChanged({
      view: latestLocalLayout.current.view,
      order: moveCockpitSection(latestLocalLayout.current.order, key, direction),
    });
    setOrder(next.order);
  };

  const resetView = () => {
    const next = markPreferenceChanged({
      view: DEFAULT_COCKPIT_VIEW,
      order: DEFAULT_COCKPIT_ORDER,
    });
    setVisibility(next.view);
    setOrder(next.order);
  };

  const retryMode = cockpitPreferenceRetryMode({
    syncState: preferenceSync,
    hydrated: preferenceHydrated,
  });
  const canRetryPreference = retryMode !== null;

  const retryPreference = () => {
    if (retryMode === 'hydrate') {
      setPreferenceSync('loading');
      setPreferenceError('');
      setPreferenceHydrationRetryToken((current) => current + 1);
      return;
    }

    if (retryMode === 'save') {
      setPreferenceSync('saving');
      setPreferenceError('');
      setPreferenceRetryToken((current) => current + 1);
    }
  };

  const renderBlock = (key) => {
    if (!visibility[key]) {
      return null;
    }

    if (key === 'metrics') {
      return (
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
      );
    }

    if (key === 'progression') {
      return (
        <Progression
          stages={pilotage.stages}
          onOpen={() => onNavigate?.('interventions')}
        />
      );
    }

    if (key === 'decisions') {
      return <Decisions decisions={pilotage.decisions} onNavigate={onNavigate} />;
    }

    if (key === 'capacity') {
      return <Capacity pilotage={pilotage} onNavigate={onNavigate} />;
    }

    if (key === 'quality') {
      return (
        <Quality
          quality={pilotage.quality}
          onOpen={() => onNavigate?.('rapports')}
        />
      );
    }

    if (key === 'activity') {
      return <RecentActivity activities={activities} />;
    }

    if (key === 'quickAccess') {
      return (
        <QuickAccess
          pilotage={pilotage}
          canAssign={canAssign}
          onNavigate={onNavigate}
        />
      );
    }

    return null;
  };

  return (
    <div className="cockpit-body cockpit-v4-workspace">
      <CockpitViewControls
        visibility={visibility}
        order={order}
        syncState={preferenceSync}
        syncError={preferenceError}
        canRetry={canRetryPreference}
        onRetry={retryPreference}
        onPreset={applyPreset}
        onToggle={toggleSection}
        onMove={moveSection}
        onReset={resetView}
      />

      <div
        className="cpv4-custom-layout"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
          gap: '12px',
          alignItems: 'stretch',
        }}
      >
        {visibleCockpitOrder(order, visibility).map((key) => (
          <div
            key={key}
            data-cockpit-block={key}
            style={key === 'metrics' ? { gridColumn: '1 / -1' } : undefined}
          >
            {renderBlock(key)}
          </div>
        ))}
      </div>
    </div>
  );
});

CockpitPilotageWorkspace.displayName = 'CockpitPilotageWorkspace';

export default CockpitPilotageWorkspace;
