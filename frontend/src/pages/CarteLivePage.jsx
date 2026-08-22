/**
 * CarteLivePage — suivi géographique terrain BlueVector.
 *
 * Supervision décide. Carte live localise, sélectionne et ouvre le contexte.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from '../api/client';
import { useRuntimeSettings } from '../contexts/RuntimeSettingsContext';
import { personnelSectorApi } from '../features/personnel/personnelSectorApi';
import LiveMapActivity from '../features/live-map/LiveMapActivity';
import LiveFieldMap from '../features/live-map/LiveFieldMap';
import LiveMapHeader from '../features/live-map/LiveMapHeader';
import LiveMapInspector from '../features/live-map/LiveMapInspector';
import {
  ClipboardIcon,
  LayersIcon,
  UsersIcon,
} from '../features/live-map/LiveMapIcons';
import LiveMapRail from '../features/live-map/LiveMapRail';
import {
  asRecords,
  errorMessage,
  formatTime,
  getTechGpsState,
  hasValidJobCoordinates,
  hasValidTechCoordinates,
  jobId,
  jobSector,
  normalizeIdentifier,
  normalizeStatus,
  searchMatches,
  technicianId,
  technicianName,
  technicianSectorNames,
  text,
} from '../features/live-map/liveMapUtils';
import { useWebSocket } from '../hooks/useWebSocket';
import '../styles/live-map-v3.css';


const EMPTY_FILTERS = Object.freeze({
  sector: '',
  team: '',
  status: '',
  operator: '',
});

const MAX_ACTIVITIES = 50;
const REALTIME_RELOAD_DELAY = 650;


function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1,
  ).padStart(2, '0');
  const day = String(
    date.getDate(),
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}


function sortedUnique(values) {
  return [
    ...new Set(
      values
        .map((value) => text(value))
        .filter(Boolean),
    ),
  ].sort((first, second) =>
    first.localeCompare(
      second,
      'fr',
      { sensitivity: 'base' },
    ),
  );
}


function mergeSectorAssignments(
  technicians,
  assignments,
) {
  const assignmentsByTechnician =
    new Map(
      asRecords(assignments).map(
        (assignment) => [
          normalizeIdentifier(
            assignment?.technician_id,
          ),
          assignment,
        ],
      ),
    );

  return technicians.map((technician) => {
    const assignment =
      assignmentsByTechnician.get(
        technicianId(technician),
      );

    if (!assignment) {
      return technician;
    }

    return {
      ...technician,
      primary_sector_id:
        assignment.primary_sector_id ??
        null,
      primary_sector_name:
        text(
          assignment.primary_sector_name,
        ),
      sector_ids:
        Array.isArray(
          assignment.sector_ids,
        )
          ? assignment.sector_ids
          : [],
      sector_names:
        Array.isArray(
          assignment.sector_names,
        )
          ? assignment.sector_names
          : [],
      sectors:
        Array.isArray(assignment.sectors)
          ? assignment.sectors
          : [],
    };
  });
}


function LayerToggle({
  active,
  onClick,
  icon,
  label,
  count,
  tone,
}) {
  return (
    <button
      type="button"
      className={[
        'lm-layer-toggle',
        `lm-layer-toggle--${tone}`,
        active
          ? 'lm-layer-toggle--active'
          : '',
      ].join(' ')}
      onClick={onClick}
      aria-pressed={active}
    >
      {icon}
      <span>{label}</span>
      <strong>{count}</strong>
    </button>
  );
}


export default function CarteLivePage({
  onNavigate,
}) {
  const { settings } =
    useRuntimeSettings();

  const staleAfterMinutes =
    settings?.operational
      ?.gps_stale_after_minutes ?? null;

  const [technicians, setTechnicians] =
    useState([]);

  const [jobs, setJobs] =
    useState([]);

  const [sectors, setSectors] =
    useState([]);

  const [filters, setFilters] =
    useState(EMPTY_FILTERS);

  const [searchQuery, setSearchQuery] =
    useState('');

  const [activeTab, setActiveTab] =
    useState('technicians');

  const [railCollapsed, setRailCollapsed] =
    useState(false);

  const [layers, setLayers] =
    useState({
      technicians: true,
      jobs: true,
    });

  const [selected, setSelected] =
    useState(null);

  const [activitiesOpen, setActivitiesOpen] =
    useState(false);

  const [activities, setActivities] =
    useState([]);

  const [referenceNow, setReferenceNow] =
    useState(() => Date.now());

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [loadError, setLoadError] =
    useState('');

  const [lastUpdatedAt, setLastUpdatedAt] =
    useState(null);

  const requestRef = useRef(0);
  const reloadTimerRef = useRef(null);
  const activityIdRef = useRef(0);

  useEffect(() => {
    const interval =
      window.setInterval(() => {
        setReferenceNow(Date.now());
      }, 10000);

    return () =>
      window.clearInterval(interval);
  }, []);

  const addActivity = useCallback(
    (
      message,
      tone = 'info',
    ) => {
      const date = new Date();

      setActivities((current) => [
        {
          id:
            ++activityIdRef.current,
          message,
          tone,
          time: formatTime(date),
        },
        ...current,
      ].slice(0, MAX_ACTIVITIES));
    },
    [],
  );

  const loadData = useCallback(
    async ({
      manual = false,
    } = {}) => {
      const requestId =
        requestRef.current + 1;

      requestRef.current = requestId;

      if (manual) {
        setRefreshing(true);
      }

      setLoadError('');

      try {
        const [
          techniciansResponse,
          jobsResponse,
          sectorsResponse,
          assignmentsResponse,
        ] = await Promise.all([
          api.getTechnicians(),
          api.getJobs({
            scheduled_date:
              localDateKey(),
          }),
          api.getSectors({
            limit: 500,
          }),
          personnelSectorApi
            .getAssignments(),
        ]);

        if (
          requestId !==
          requestRef.current
        ) {
          return;
        }

        const rawTechnicians =
          asRecords(
            techniciansResponse?.data,
          );
        const assignments =
          asRecords(
            assignmentsResponse?.data,
          );

        setTechnicians(
          mergeSectorAssignments(
            rawTechnicians,
            assignments,
          ),
        );
        setJobs(
          asRecords(jobsResponse?.data),
        );
        setSectors(
          asRecords(sectorsResponse?.data),
        );
        setLastUpdatedAt(new Date());
      } catch (error) {
        if (
          requestId !==
          requestRef.current
        ) {
          return;
        }

        setLoadError(
          errorMessage(
            error,
            'Mise à jour Carte live incomplète — dernier snapshot cohérent conservé',
          ),
        );
      }

      setLoading(false);
      setRefreshing(false);
    },
    [],
  );

  useEffect(() => {
    const timer =
      window.setTimeout(() => {
        loadData();
      }, 0);

    return () => {
      window.clearTimeout(timer);
      requestRef.current += 1;
    };
  }, [loadData]);

  useEffect(
    () => () => {
      if (
        reloadTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          reloadTimerRef.current,
        );
      }
    },
    [],
  );

  const scheduleReload =
    useCallback(() => {
      if (
        reloadTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          reloadTimerRef.current,
        );
      }

      reloadTimerRef.current =
        window.setTimeout(() => {
          reloadTimerRef.current =
            null;

          loadData();
        }, REALTIME_RELOAD_DELAY);
    }, [loadData]);

  const handleJobEvent =
    useCallback(
      (eventType, data) => {
        const labels = {
          'job:assigned': 'affectée',
          'job:started': 'démarrée',
          'job:completed': 'terminée',
          'job:cancelled': 'annulée',
        };

        const label =
          labels[eventType];

        if (label) {
          addActivity(
            `Intervention #${text(
              data?.job_id,
              '—',
            )} ${label}`,
            eventType ===
            'job:completed'
              ? 'success'
              : eventType ===
                  'job:cancelled'
                ? 'danger'
                : 'info',
          );
        }

        scheduleReload();
      },
      [
        addActivity,
        scheduleReload,
      ],
    );

  const handleTechEvent =
    useCallback(
      (eventType, data) => {
        if (
          eventType ===
          'tech:status_changed'
        ) {
          addActivity(
            `Technicien ${text(
              data?.name ??
                data?.technician_id ??
                data?.id,
              'inconnu',
            )} : ${text(
              data?.status,
              'statut modifié',
            ).replace(/_/g, ' ')}`,
            'warning',
          );
        } else if (
          eventType.includes('location')
        ) {
          addActivity(
            `Nouvelle position reçue pour ${text(
              data?.name ??
                data?.technician_id ??
                data?.id,
              'un technicien',
            )}`,
            'info',
          );
        }

        scheduleReload();
      },
      [
        addActivity,
        scheduleReload,
      ],
    );

  const {
    connected: realtimeConnected,
  } = useWebSocket(
    'dashboard',
    {
      onJobEvent:
        handleJobEvent,
      onTechEvent:
        handleTechEvent,
    },
  );

  const filterOptions =
    useMemo(() => ({
      sectors:
        sortedUnique([
          ...sectors.map(
            (sector) => sector?.name,
          ),
          ...technicians.flatMap(
            technicianSectorNames,
          ),
          ...jobs.map(jobSector),
        ]),
      teams:
        sortedUnique(
          technicians.map(
            (technician) =>
              technician?.team,
          ),
        ),
      statuses:
        sortedUnique(
          technicians.map(
            (technician) =>
              technician?.live_status ??
              technician?.status,
          ),
        ).map((value) => ({
          value,
          label: value.replace(/_/g, ' '),
        })),
      operators:
        sortedUnique(
          jobs.map(
            (job) => job?.operator,
          ),
        ),
    }), [
      jobs,
      sectors,
      technicians,
    ]);

  const filteredTechnicians =
    useMemo(
      () =>
        technicians
          .filter((technician) => {
            if (
              filters.sector &&
              !technicianSectorNames(
                technician,
              ).includes(
                filters.sector,
              )
            ) {
              return false;
            }

            if (
              filters.team &&
              text(technician?.team) !==
              filters.team
            ) {
              return false;
            }

            if (
              filters.status &&
              normalizeStatus(
                technician?.live_status ??
                  technician?.status,
              ) !==
              normalizeStatus(
                filters.status,
              )
            ) {
              return false;
            }

            return searchMatches(
              [
                technicianName(technician),
                technician?.employee_id,
                technician?.matricule,
                technician?.team,
                technician?.phone,
                ...technicianSectorNames(
                  technician,
                ),
              ],
              searchQuery,
            );
          })
          .sort((first, second) =>
            technicianName(first)
              .localeCompare(
                technicianName(second),
                'fr',
              ),
          ),
      [
        filters,
        searchQuery,
        technicians,
      ],
    );

  const filteredJobs =
    useMemo(
      () =>
        jobs.filter((job) => {
          if (
            filters.sector &&
            jobSector(job) !==
            filters.sector
          ) {
            return false;
          }

          if (
            filters.operator &&
            text(job?.operator) !==
            filters.operator
          ) {
            return false;
          }

          return searchMatches(
            [
              job?.id,
              job?.job_number,
              job?.command_number,
              job?.customer_name,
              job?.customer_phone,
              job?.service_address,
              job?.operator,
              job?.job_type,
              jobSector(job),
              job?.assigned_tech_name,
              job?.assigned_technician_name,
            ],
            searchQuery,
          );
        }),
      [
        filters,
        jobs,
        searchQuery,
      ],
    );

  const selectedData =
    useMemo(() => {
      if (!selected) {
        return null;
      }

      const collection =
        selected.type === 'technician'
          ? technicians
          : jobs;

      const data = collection.find(
        (item) =>
          (
            selected.type ===
            'technician'
              ? technicianId(item)
              : jobId(item)
          ) === selected.id,
      );

      return data
        ? {
            ...selected,
            data,
          }
        : null;
    }, [
      jobs,
      selected,
      technicians,
    ]);

  const handleSelect =
    useCallback(
      (selection) => {
        setSelected({
          type: selection.type,
          id: selection.id,
        });

        if (
          selection.open &&
          selection.type === 'job'
        ) {
          onNavigate?.(
            'interventions',
            {
              id:
                Number(selection.id) ||
                selection.id,
            },
          );
        }
      },
      [onNavigate],
    );

  const handleFilterChange =
    useCallback(
      (key, value) => {
        setFilters((current) => ({
          ...current,
          [key]: value,
        }));
      },
      [],
    );

  const hasActiveFilters =
    Boolean(
      searchQuery ||
      Object.values(filters).some(Boolean),
    );

  const geolocatedTechnicians =
    useMemo(
      () =>
        filteredTechnicians.filter(
          hasValidTechCoordinates,
        ),
      [filteredTechnicians],
    );

  const geolocatedJobs =
    useMemo(
      () =>
        filteredJobs.filter(
          hasValidJobCoordinates,
        ),
      [filteredJobs],
    );

  const gpsSummary =
    useMemo(() => {
      const summary = {
        active: 0,
        stale: 0,
        unavailable: 0,
        offline: 0,
        other: 0,
      };

      filteredTechnicians.forEach(
        (technician) => {
          const state =
            getTechGpsState(
              technician,
              referenceNow,
              staleAfterMinutes,
            );

          if (
            Object.hasOwn(
              summary,
              state,
            )
          ) {
            summary[state] += 1;
          } else {
            summary.other += 1;
          }
        },
      );

      return summary;
    }, [
      filteredTechnicians,
      referenceNow,
      staleAfterMinutes,
    ]);

  return (
    <div className="lm-page">
      <LiveMapHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRefresh={() =>
          loadData({
            manual: true,
          })
        }
        refreshing={refreshing}
        connected={realtimeConnected}
        technicianCount={
          filteredTechnicians.length
        }
        jobCount={filteredJobs.length}
        lastUpdatedAt={lastUpdatedAt}
      />

      {loadError && (
        <div
          className="lm-notice"
          role="alert"
        >
          <span>{loadError}</span>

          <button
            type="button"
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

      <div className="lm-context-bar">
        <div className="lm-layer-group">
          <span className="lm-context-label">
            <LayersIcon />
            Couches
          </span>

          <LayerToggle
            active={layers.technicians}
            onClick={() =>
              setLayers((current) => ({
                ...current,
                technicians:
                  !current.technicians,
              }))
            }
            icon={<UsersIcon />}
            label="Techniciens"
            count={geolocatedTechnicians.length}
            tone="tech"
          />

          <LayerToggle
            active={layers.jobs}
            onClick={() =>
              setLayers((current) => ({
                ...current,
                jobs: !current.jobs,
              }))
            }
            icon={<ClipboardIcon />}
            label="Interventions"
            count={geolocatedJobs.length}
            tone="job"
          />
        </div>

        <div className="lm-gps-summary">
          <span>
            <i className="lm-dot lm-dot--success" />
            {gpsSummary.active} GPS actifs
          </span>

          <span>
            <i className="lm-dot lm-dot--warning" />
            {gpsSummary.stale} anciens
          </span>

          <span>
            <i className="lm-dot lm-dot--danger" />
            {gpsSummary.unavailable} indisponibles
          </span>

          <span>
            Seuil :{' '}
            <strong>
              {staleAfterMinutes
                ? `${staleAfterMinutes} min`
                : 'non configuré'}
            </strong>
          </span>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            className="lm-clear-filters"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setSearchQuery('');
            }}
          >
            Effacer les filtres
          </button>
        )}
      </div>

      <main
        className={[
          'lm-workspace',
          railCollapsed
            ? 'lm-workspace--rail-collapsed'
            : '',
          selectedData
            ? ''
            : 'lm-workspace--no-inspector',
        ].join(' ')}
      >
        <LiveMapRail
          collapsed={railCollapsed}
          onToggleCollapsed={() =>
            setRailCollapsed(
              (current) => !current,
            )
          }
          activeTab={activeTab}
          onTabChange={setActiveTab}
          technicians={filteredTechnicians}
          jobs={filteredJobs}
          selected={selected}
          onSelect={handleSelect}
          filters={filters}
          onFilterChange={handleFilterChange}
          filterOptions={filterOptions}
          referenceNow={referenceNow}
          staleAfterMinutes={staleAfterMinutes}
          hasActiveFilters={hasActiveFilters}
        />

        <LiveFieldMap
          technicians={
            geolocatedTechnicians
          }
          jobs={geolocatedJobs}
          layers={layers}
          selected={selected}
          onSelect={handleSelect}
          referenceNow={referenceNow}
          staleAfterMinutes={
            staleAfterMinutes
          }
        />

        {selectedData && (
          <LiveMapInspector
            selected={selectedData}
            referenceNow={referenceNow}
            staleAfterMinutes={
              staleAfterMinutes
            }
            onClose={() =>
              setSelected(null)
            }
            onNavigate={onNavigate}
          />
        )}
      </main>

      <LiveMapActivity
        open={activitiesOpen}
        onToggle={() =>
          setActivitiesOpen(
            (current) => !current,
          )
        }
        activities={activities}
      />

      {loading && (
        <div className="lm-loading">
          Chargement des données cartographiques…
        </div>
      )}
    </div>
  );
}
