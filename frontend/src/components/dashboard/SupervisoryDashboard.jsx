/**
 * SupervisoryDashboard — centre de supervision avancé BlueVector.
 *
 * Le résumé analytique reste fourni par l'endpoint dashboard filtré selon
 * l'utilisateur connecté. Les listes cartographiques proviennent des vrais
 * endpoints techniciens et interventions, jamais des agrégats KPI.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from '../../api/client';
import { useRealtimeDashboard } from '../../hooks/useWebSocket';
import MapWindow from '../MapWindow';
import KPICard from './KPICard';
import KPICharts from './KPICharts';
import TechnicianStatusBar from './TechnicianStatusBar';

import '../../styles/dashboard.css';

const DEFAULT_REFRESH_INTERVAL_MS = 30_000;
const WEBSOCKET_REFRESH_DELAY_MS = 500;

const REFRESH_INTERVALS = Object.freeze([
  {
    value: 10_000,
    label: '10 s',
  },
  {
    value: 30_000,
    label: '30 s',
  },
  {
    value: 60_000,
    label: '1 min',
  },
  {
    value: 300_000,
    label: '5 min',
  },
]);

const VIEW_MODES = new Set([
  'full',
  'compact',
  'map',
]);

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function asRecords(value) {
  return Array.isArray(value)
    ? value.filter(isRecord)
    : [];
}

function text(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}

function localDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1,
    ).padStart(2, '0'),
    String(
      date.getDate(),
    ).padStart(2, '0'),
  ].join('-');
}

function nonNegativeNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(value);

  return (
    Number.isFinite(parsed) &&
    parsed >= 0
  )
    ? parsed
    : null;
}

function displayCount(value) {
  const parsed =
    nonNegativeNumber(value);

  return parsed === null
    ? '—'
    : Math.round(parsed);
}

function displayPercentage(value) {
  const parsed =
    nonNegativeNumber(value);

  if (parsed === null) {
    return '—';
  }

  return `${new Intl.NumberFormat(
    'fr-FR',
    {
      maximumFractionDigits: 1,
    },
  ).format(parsed)} %`;
}

function displayMinutes(value) {
  const parsed = Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
    return '—';
  }

  const rounded =
    Math.round(parsed);

  if (
    Math.abs(rounded) < 60
  ) {
    return `${rounded} min`;
  }

  const sign =
    rounded < 0
      ? '−'
      : '';

  const absolute =
    Math.abs(rounded);

  const hours =
    Math.floor(
      absolute / 60,
    );

  const minutes =
    absolute % 60;

  return minutes
    ? `${sign}${hours} h ${minutes} min`
    : `${sign}${hours} h`;
}

function isDashboardSummary(value) {
  return (
    isRecord(value) &&
    isRecord(value.jobs) &&
    isRecord(value.technicians)
  );
}

function apiError(
  error,
  fallback,
) {
  const detail =
    error?.response?.data
      ?.detail;

  if (
    typeof detail ===
      'string' &&
    detail.trim()
  ) {
    return detail.trim();
  }

  if (Array.isArray(detail)) {
    const messages =
      detail
        .map((item) =>
          isRecord(item)
            ? text(
                item.msg ??
                  item.message,
              )
            : text(item),
        )
        .filter(Boolean);

    if (messages.length) {
      return messages.join(
        ' · ',
      );
    }
  }

  return (
    text(
      error?.response?.data
        ?.message,
    ) ||
    text(error?.message) ||
    fallback
  );
}

function normalizedPerformance(
  value,
) {
  return asRecords(value)
    .map((item, index) => {
      const id =
        text(item.id) ||
        `row-${index}`;

      return {
        id,
        name:
          text(item.name) ||
          `Technicien #${id}`,
        totalJobs:
          nonNegativeNumber(
            item.total_jobs,
          ),
        completedJobs:
          nonNegativeNumber(
            item.completed_jobs,
          ),
        productivity:
          nonNegativeNumber(
            item.productivity,
          ),
        averageDuration:
          nonNegativeNumber(
            item.avg_duration_minutes,
          ),
        totalDuration:
          nonNegativeNumber(
            item.total_duration_minutes,
          ),
      };
    })
    .sort(
      (first, second) =>
        (
          second.productivity ??
          -1
        ) -
          (
            first.productivity ??
            -1
          ) ||
        first.name.localeCompare(
          second.name,
          'fr',
          {
            sensitivity: 'base',
          },
        ),
    );
}

function productivityClass(value) {
  if (
    !Number.isFinite(value)
  ) {
    return 'badge--info';
  }

  if (value > 80) {
    return 'badge--success';
  }

  if (value > 50) {
    return 'badge--warning';
  }

  return 'badge--danger';
}

function closeLabel(
  onClose,
) {
  return (
    typeof onClose ===
    'function'
  );
}

export default function SupervisoryDashboard({
  onClose,
  onNavigate,
}) {
  const [summary, setSummary] =
    useState(null);

  const [
    mapTechnicians,
    setMapTechnicians,
  ] = useState([]);

  const [mapJobs, setMapJobs] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    autoRefresh,
    setAutoRefresh,
  ] = useState(true);

  const [
    intervalMs,
    setIntervalMs,
  ] = useState(
    DEFAULT_REFRESH_INTERVAL_MS,
  );

  const [viewMode, setViewMode] =
    useState('full');

  const [error, setError] =
    useState('');

  const [
    lastUpdatedAt,
    setLastUpdatedAt,
  ] = useState(null);

  const requestSequenceRef =
    useRef(0);

  const websocketRefreshRef =
    useRef(null);

  const loadDataRef =
    useRef(null);

  const {
    connected: wsConnected,
    dashboardData,
  } = useRealtimeDashboard();

  const loadData = useCallback(
    async ({
      manual = false,
      includeSummary = true,
    } = {}) => {
      const requestId =
        requestSequenceRef.current +
        1;

      requestSequenceRef.current =
        requestId;

      if (manual) {
        setRefreshing(true);
      }

      const targetDate =
        localDateKey();

      const requests = [];

      if (includeSummary) {
        requests.push({
          key: 'summary',
          promise:
            api.getDashboardSummary({
              target_date:
                targetDate,
            }),
        });
      }

      requests.push(
        {
          key: 'technicians',
          promise:
            api.getTechnicians(),
        },
        {
          key: 'jobs',
          promise: api.getJobs({
            scheduled_date:
              targetDate,
          }),
        },
      );

      const settled =
        await Promise.allSettled(
          requests.map(
            (request) =>
              request.promise,
          ),
        );

      if (
        requestId !==
        requestSequenceRef.current
      ) {
        return;
      }

      const failures = [];
      let successfulResources = 0;

      settled.forEach(
        (result, index) => {
          const key =
            requests[index].key;

          if (
            result.status ===
            'rejected'
          ) {
            const labels = {
              summary:
                'indicateurs',
              technicians:
                'techniciens',
              jobs:
                'interventions',
            };

            failures.push(
              `${labels[key]} : ${apiError(
                result.reason,
                'chargement impossible',
              )}`,
            );

            return;
          }

          const data =
            result.value?.data;

          if (key === 'summary') {
            if (
              isDashboardSummary(
                data,
              )
            ) {
              setSummary(data);
              successfulResources +=
                1;
            } else {
              failures.push(
                'indicateurs : réponse invalide',
              );
            }

            return;
          }

          if (key === 'technicians') {
            if (
              Array.isArray(data)
            ) {
              setMapTechnicians(
                asRecords(data),
              );

              successfulResources +=
                1;
            } else {
              failures.push(
                'techniciens : réponse invalide',
              );
            }

            return;
          }

          if (
            key === 'jobs'
          ) {
            if (
              Array.isArray(data)
            ) {
              setMapJobs(
                asRecords(data),
              );

              successfulResources +=
                1;
            } else {
              failures.push(
                'interventions : réponse invalide',
              );
            }
          }
        },
      );

      if (
        successfulResources > 0
      ) {
        setLastUpdatedAt(
          new Date(),
        );
      }

      setError(
        failures.join(' · '),
      );

      setLoading(false);
      setRefreshing(false);
    },
    [],
  );

  useEffect(() => {
    loadDataRef.current =
      loadData;
  }, [loadData]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      void loadData();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      requestSequenceRef.current +=
        1;

      if (
        websocketRefreshRef.current !==
        null
      ) {
        window.clearTimeout(
          websocketRefreshRef.current,
        );
      }
    };
  }, [loadData]);

  /*
   * Le broadcast dashboard n'est pas injecté directement dans l'état.
   * Le serveur diffuse actuellement un résumé global dans la salle dashboard,
   * alors que l'endpoint REST applique le filtrage selon l'utilisateur.
   * Le message temps réel déclenche donc un rechargement REST canonique.
   */
  useEffect(() => {
    if (
      !isDashboardSummary(
        dashboardData,
      )
    ) {
      return;
    }

    if (
      websocketRefreshRef.current !==
      null
    ) {
      window.clearTimeout(
        websocketRefreshRef.current,
      );
    }

    websocketRefreshRef.current =
      window.setTimeout(() => {
        websocketRefreshRef.current =
          null;

        loadDataRef.current?.({
          includeSummary: true,
        });
      }, WEBSOCKET_REFRESH_DELAY_MS);
  }, [dashboardData]);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }

    const interval =
      window.setInterval(
        () => {
          loadDataRef.current?.({
            /*
             * Quand le WebSocket est actif, le résumé arrive déjà
             * par événement. Le polling entretient seulement la carte.
             */
            includeSummary:
              !wsConnected,
          });
        },
        intervalMs,
      );

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, [
    autoRefresh,
    intervalMs,
    wsConnected,
  ]);

  const setSafeViewMode =
    useCallback((nextMode) => {
      if (
        VIEW_MODES.has(
          nextMode,
        )
      ) {
        setViewMode(
          nextMode,
        );
      }
    }, []);

  const navigate =
    useCallback(
      (
        page,
        payload = null,
      ) => {
        if (
          typeof onNavigate !==
          'function'
        ) {
          return false;
        }

        return onNavigate(
          page,
          payload,
        );
      },
      [onNavigate],
    );

  const openJob =
    useCallback(
      (job) => {
        if (!job?.id) {
          return;
        }

        navigate(
          'interventions',
          {
            id: job.id,
          },
        );
      },
      [navigate],
    );

  const jobs =
    isRecord(summary?.jobs)
      ? summary.jobs
      : {};

  const technicians =
    isRecord(
      summary?.technicians,
    )
      ? summary.technicians
      : {};

  const totalJobs =
    displayCount(jobs.total);

  const completedJobs =
    displayCount(
      jobs.completed,
    );

  const pendingJobs =
    displayCount(
      jobs.pending,
    );

  const assignedJobs =
    displayCount(
      jobs.assigned,
    );

  const inProgressJobs =
    displayCount(
      jobs.in_progress,
    );

  const remainingJobs =
    displayCount(
      jobs.remaining,
    );

  const successRate =
    displayPercentage(
      summary?.success_rate,
    );

  const averageDuration =
    displayMinutes(
      summary?.avg_duration_minutes,
    );

  const averageDelay =
    displayMinutes(
      summary?.avg_delay_minutes,
    );

  const averageDelayNumber =
    Number(
      summary?.avg_delay_minutes,
    );

  const performance =
    useMemo(
      () =>
        normalizedPerformance(
          summary?.tech_performance,
        ),
      [
        summary?.tech_performance,
      ],
    );

  const byOperator =
    asRecords(
      summary?.by_operator,
    );

  const byType =
    asRecords(
      summary?.by_type,
    );

  const priorityBreakdown =
    asRecords(
      summary
        ?.priority_breakdown,
    );

  const hourlyDistribution =
    asRecords(
      summary
        ?.hourly_distribution,
    );

  const closeAvailable =
    closeLabel(onClose);

  if (
    loading &&
    !summary &&
    mapTechnicians.length ===
      0 &&
    mapJobs.length === 0
  ) {
    return (
      <div
        className="dashboard-loading"
        role="status"
        aria-live="polite"
      >
        <div
          className="loading-spinner"
          aria-hidden="true"
        />

        <p>
          Chargement du centre
          de supervision…
        </p>
      </div>
    );
  }

  const toolbar = (
    <div className="dashboard-toolbar">
      <h2>
        {viewMode === 'map'
          ? '🗺️ Carte temps réel'
          : '📊 Centre de supervision'}
      </h2>

      <div className="dashboard-toolbar-actions">
        <span
          className={[
            'live-indicator',
            wsConnected
              ? 'live'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="status"
          title={
            wsConnected
              ? 'Connexion temps réel active'
              : 'Actualisation périodique de secours'
          }
        >
          {wsConnected
            ? '● Temps réel'
            : '○ Polling'}
        </span>

        {lastUpdatedAt && (
          <span
            className="live-indicator"
            title={
              lastUpdatedAt.toLocaleString(
                'fr-FR',
              )
            }
          >
            MAJ{' '}
            {lastUpdatedAt.toLocaleTimeString(
              'fr-FR',
              {
                hour: '2-digit',
                minute: '2-digit',
              },
            )}
          </span>
        )}

        <label
          className="form-checkbox"
          title="Intervalle de secours et de rafraîchissement cartographique"
        >
          <span>
            Intervalle
          </span>

          <select
            className="form-select form-select--sm"
            value={intervalMs}
            onChange={(
              event,
            ) => {
              const nextValue =
                Number(
                  event.target
                    .value,
                );

              if (
                REFRESH_INTERVALS.some(
                  (option) =>
                    option.value ===
                    nextValue,
                )
              ) {
                setIntervalMs(
                  nextValue,
                );
              }
            }}
            aria-label="Intervalle d’actualisation"
          >
            {REFRESH_INTERVALS.map(
              (option) => (
                <option
                  key={
                    option.value
                  }
                  value={
                    option.value
                  }
                >
                  {option.label}
                </option>
              ),
            )}
          </select>
        </label>

        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(
              event,
            ) =>
              setAutoRefresh(
                event.target
                  .checked,
              )
            }
          />

          Auto
        </label>

        <button
          type="button"
          className="btn btn--sm"
          onClick={() =>
            loadData({
              manual: true,
            })
          }
          disabled={refreshing}
        >
          {refreshing
            ? 'Actualisation…'
            : '↻ Actualiser'}
        </button>

        {viewMode === 'map' ? (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() =>
              setSafeViewMode(
                'full',
              )
            }
          >
            Vue complète
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--sm"
              aria-pressed={
                viewMode ===
                'compact'
              }
              onClick={() =>
                setSafeViewMode(
                  viewMode ===
                    'compact'
                    ? 'full'
                    : 'compact',
                )
              }
            >
              {viewMode ===
              'compact'
                ? 'Vue complète'
                : 'Vue compacte'}
            </button>

            <button
              type="button"
              className="btn btn--sm"
              onClick={() =>
                setSafeViewMode(
                  'map',
                )
              }
            >
              Carte
            </button>
          </>
        )}

        {typeof onNavigate ===
          'function' && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() =>
              navigate(
                'interventions',
              )
            }
          >
            Interventions
          </button>
        )}

        {closeAvailable && (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={onClose}
            aria-label="Fermer le centre de supervision"
            title="Fermer"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );

  if (viewMode === 'map') {
    return (
      <section
        className="supervisory-dashboard"
        aria-label="Carte du centre de supervision"
      >
        {toolbar}

        {error && (
          <div
            role="alert"
            style={{
              padding:
                '8px 16px',
              color:
                'var(--color-danger)',
              background:
                'var(--color-danger-dim)',
              borderBottom:
                '1px solid var(--color-danger)',
              fontSize:
                'var(--font-size-sm)',
            }}
          >
            {error}
          </div>
        )}

        <div className="dashboard-map-full">
          <MapWindow
            floating={false}
            technicians={
              mapTechnicians
            }
            jobs={mapJobs}
            onJobClick={
              typeof onNavigate ===
                'function'
                ? openJob
                : undefined
            }
            showFullscreenBtn
            showLegend
          />
        </div>
      </section>
    );
  }

  return (
    <section
      className="supervisory-dashboard"
      aria-label="Centre de supervision avancé"
    >
      {toolbar}

      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems:
              'center',
            justifyContent:
              'space-between',
            gap: 12,
            padding:
              '8px 16px',
            color:
              'var(--color-danger)',
            background:
              'var(--color-danger-dim)',
            borderBottom:
              '1px solid var(--color-danger)',
            fontSize:
              'var(--font-size-sm)',
          }}
        >
          <span>{error}</span>

          <button
            type="button"
            className="btn btn--sm"
            onClick={() =>
              loadData({
                manual: true,
              })
            }
            disabled={refreshing}
          >
            Réessayer
          </button>
        </div>
      )}

      <div
        className={[
          'dashboard-content',
          viewMode === 'compact'
            ? 'dashboard-content--compact'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="dashboard-kpi-row">
          <KPICard
            title="Interventions du jour"
            value={totalJobs}
            subtitle={`${completedJobs} terminées · ${inProgressJobs} en cours`}
            color="primary"
            icon="📋"
          />

          <KPICard
            title="Restantes"
            value={remainingJobs}
            subtitle={`${pendingJobs} en attente · ${assignedJobs} affectées`}
            color={
              Number(
                jobs.remaining,
              ) > 5
                ? 'danger'
                : 'warning'
            }
            icon="⏳"
          />

          <KPICard
            title="Taux de réussite"
            value={successRate}
            subtitle="Terminées parmi les interventions clôturées"
            color={
              Number(
                summary?.success_rate,
              ) > 90
                ? 'success'
                : Number(
                      summary?.success_rate,
                    ) > 70
                  ? 'warning'
                  : 'danger'
            }
            icon="✓"
          />

          <KPICard
            title="Temps moyen"
            value={
              averageDuration
            }
            subtitle="Par intervention terminée"
            color="info"
            icon="⏱"
          />

          <KPICard
            title="Écart d’arrivée moyen"
            value={averageDelay}
            subtitle="Arrivée réelle moins estimation"
            color={
              Number.isFinite(
                averageDelayNumber,
              )
                ? averageDelayNumber >
                  30
                  ? 'danger'
                  : averageDelayNumber >
                      15
                    ? 'warning'
                    : 'success'
                : 'muted'
            }
            icon="⌛"
          />
        </div>

        <TechnicianStatusBar
          available={
            displayCount(
              technicians.available,
            ) === '—'
              ? 0
              : Number(
                  technicians.available,
                )
          }
          onJob={
            displayCount(
              technicians.on_job,
            ) === '—'
              ? 0
              : Number(
                  technicians.on_job,
                )
          }
          enRoute={
            displayCount(
              technicians.en_route,
            ) === '—'
              ? 0
              : Number(
                  technicians.en_route,
                )
          }
          onBreak={
            displayCount(
              technicians.on_break,
            ) === '—'
              ? 0
              : Number(
                  technicians.on_break,
                )
          }
          offDuty={
            displayCount(
              technicians.off_duty,
            ) === '—'
              ? 0
              : Number(
                  technicians.off_duty,
                )
          }
          total={
            displayCount(
              technicians.total,
            ) === '—'
              ? 0
              : Number(
                  technicians.total,
                )
          }
        />

        {viewMode !==
          'compact' && (
          <div className="dashboard-charts-row">
            <div className="dashboard-chart-panel">
              <KPICharts
                byOperator={
                  byOperator
                }
                byType={byType}
                priorityBreakdown={
                  priorityBreakdown
                }
                hourlyDistribution={
                  hourlyDistribution
                }
              />
            </div>

            <div
              className="dashboard-map-panel"
              style={{
                minHeight: 350,
              }}
            >
              <MapWindow
                floating={false}
                technicians={
                  mapTechnicians
                }
                jobs={mapJobs}
                onJobClick={
                  typeof onNavigate ===
                    'function'
                    ? openJob
                    : undefined
                }
                showFullscreenBtn
                showLegend
              />
            </div>
          </div>
        )}

        {viewMode !==
          'compact' &&
          performance.length >
            0 && (
            <div className="dashboard-table-panel">
              <h3>
                Performance des techniciens
              </h3>

              <div className="dashboard-table-wrapper">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        Technicien
                      </th>

                      <th scope="col">
                        Interventions
                      </th>

                      <th scope="col">
                        Terminées
                      </th>

                      <th scope="col">
                        Productivité
                      </th>

                      <th scope="col">
                        Temps moyen
                      </th>

                      <th scope="col">
                        Temps total
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {performance.map(
                      (
                        technician,
                      ) => (
                        <tr
                          key={
                            technician.id
                          }
                        >
                          <th
                            scope="row"
                            style={{
                              textAlign:
                                'left',
                              fontWeight:
                                500,
                            }}
                          >
                            {
                              technician.name
                            }
                          </th>

                          <td>
                            {displayCount(
                              technician.totalJobs,
                            )}
                          </td>

                          <td>
                            {displayCount(
                              technician.completedJobs,
                            )}
                          </td>

                          <td>
                            <span
                              className={`badge ${productivityClass(
                                technician.productivity,
                              )}`}
                            >
                              {displayPercentage(
                                technician.productivity,
                              )}
                            </span>
                          </td>

                          <td>
                            {displayMinutes(
                              technician.averageDuration,
                            )}
                          </td>

                          <td>
                            {displayMinutes(
                              technician.totalDuration,
                            )}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      </div>
    </section>
  );
}
