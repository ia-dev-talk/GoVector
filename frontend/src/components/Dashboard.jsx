import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api, apiClient } from '../api/client';
import { useSimEvents } from '../hooks/useSimEvents';
import AIAssistant from './AIAssistant';
import CalendarPicker from './CalendarPicker';
import ContextMenu from './ContextMenu';
import {
  BoltIcon,
  ChartIcon,
  ExcelIcon,
  ExportIcon,
  FilterIcon,
  MapIcon,
  PersonnelIcon,
  RefreshIcon,
  SearchIcon,
  SupervisionIcon,
  TimelineIcon,
} from './DashboardIcons';
import EditJobWindow from './EditJobWindow';
import ExportCenter from './export/ExportCenter';
import FilterWindow from './FilterWindow';
import ImportCenter from './import/ImportCenter';
import JobDetailPanel from './JobDetailPanel';
import JobGrid from './JobGrid';
import JobSearchWindow from './JobSearchWindow';
import MapWindow from './MapWindow';
import NewJobWindow from './NewJobWindow';
import PersonnelWindow from './PersonnelWindow';
import SimBar from './SimBar';
import SupervisoryDashboard from './dashboard/SupervisoryDashboard';
import TechGrid from './TechGrid';
import TechnicianDetailPanel from './TechnicianDetailPanel';
import TechTimeline from './TechTimeline';
import Toast from './Toast';
import Button from './ui/Button';

const ACTIVE_TECHNICIAN_STATUSES = new Set([
  'disponible',
  'en_intervention',
  'en_route',
]);

const OFF_DUTY_TECHNICIAN_STATUSES = new Set([
  'hors_service',
]);

const ROLE_CONFIG = {
  ADMIN: {
    label: 'Administrateur',
    icon: '👑',
    color: 'var(--color-warning)',
  },
  CHEF_ORIENTEUR: {
    label: 'Agent terrain',
    icon: '🗺️',
    color: 'var(--color-primary-light)',
  },
  ORIENTEUR: {
    label: 'Orienteur',
    icon: '📋',
    color: 'var(--color-success)',
  },
  TECHNICIAN: {
    label: 'Technicien',
    icon: '👷',
    color: 'var(--color-info)',
  },
};

const UNKNOWN_ROLE = {
  label: 'Inconnu',
  icon: '❓',
  color: 'var(--color-gray-400)',
};

const DAYS = [
  'Dim',
  'Lun',
  'Mar',
  'Mer',
  'Jeu',
  'Ven',
  'Sam',
];

const MONTHS = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Aoû',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
];

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}

function normalizeComparableText(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
}

function hasIdentifier(value) {
  return (
    value !== null &&
    value !== undefined &&
    normalizeText(value) !== ''
  );
}

function sameIdentifier(first, second) {
  if (
    !hasIdentifier(first) ||
    !hasIdentifier(second)
  ) {
    return false;
  }

  return String(first) === String(second);
}

function uniqueIdentifiers(values) {
  const identifiers = [];
  const known = new Set();

  asArray(values).forEach((value) => {
    if (!hasIdentifier(value)) {
      return;
    }

    const key = String(value);

    if (known.has(key)) {
      return;
    }

    known.add(key);
    identifiers.push(value);
  });

  return identifiers;
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    return value.split(',');
  }

  return [];
}

function extractNamedValues(value) {
  const values = [];
  const known = new Set();

  normalizeList(value).forEach((item) => {
    let name = '';

    if (
      typeof item === 'string' ||
      typeof item === 'number'
    ) {
      name = normalizeText(item).split(':')[0];
    } else if (isRecord(item)) {
      name = normalizeText(
        item.name ??
          item.label ??
          item.skill ??
          item.code,
      );
    }

    const normalizedName =
      normalizeComparableText(name);

    if (
      !normalizedName ||
      known.has(normalizedName)
    ) {
      return;
    }

    known.add(normalizedName);
    values.push({
      raw: normalizeText(name),
      normalized: normalizedName,
    });
  });

  return values;
}

function fmtDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function fmtUTCDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function fmtDateDisplay(date) {
  return `${DAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function sameDay(first, second) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function getTargetDate(isDemo, viewDate) {
  return isDemo
    ? fmtUTCDate(new Date())
    : fmtDate(viewDate);
}

function getTechnicianStatus(technician) {
  return normalizeComparableText(
    technician?.live_status ??
      technician?.status,
  );
}

function getApiErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;

  if (
    typeof detail === 'string' &&
    detail.trim()
  ) {
    return detail.trim();
  }

  if (
    typeof error?.message === 'string' &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  return fallback;
}

function updateSelection(
  previousSelection,
  identifier,
  event,
  displayedIds,
) {
  if (!hasIdentifier(identifier)) {
    return previousSelection;
  }

  const previous = uniqueIdentifiers(
    previousSelection,
  );

  const isSelected = previous.some((value) =>
    sameIdentifier(value, identifier),
  );

  if (event?.metaKey || event?.ctrlKey) {
    return isSelected
      ? previous.filter(
          (value) =>
            !sameIdentifier(
              value,
              identifier,
            ),
        )
      : [...previous, identifier];
  }

  if (
    event?.shiftKey &&
    previous.length > 0 &&
    Array.isArray(displayedIds)
  ) {
    const lastSelected =
      previous[previous.length - 1];

    const firstIndex =
      displayedIds.findIndex((value) =>
        sameIdentifier(value, lastSelected),
      );

    const secondIndex =
      displayedIds.findIndex((value) =>
        sameIdentifier(value, identifier),
      );

    if (
      firstIndex === -1 ||
      secondIndex === -1
    ) {
      return [identifier];
    }

    const start = Math.min(
      firstIndex,
      secondIndex,
    );

    const end = Math.max(
      firstIndex,
      secondIndex,
    );

    return uniqueIdentifiers([
      ...previous,
      ...displayedIds.slice(start, end + 1),
    ]);
  }

  return (
    previous.length === 1 &&
    isSelected
  )
    ? []
    : [identifier];
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

export default function Dashboard({
  userRole,
  onLogout,
}) {
  const [techs, setTechs] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);

  const [showSupervisory, setShowSupervisory] =
    useState(false);

  const isAdmin = userRole === 'ADMIN';
  const isChef =
    userRole === 'CHEF_ORIENTEUR';
  const isOrienteur =
    userRole === 'ORIENTEUR';

  const currentRole =
    ROLE_CONFIG[userRole] || UNKNOWN_ROLE;

  const [viewDate, setViewDate] = useState(
    () => new Date(),
  );
  const [calOpen, setCalOpen] =
    useState(false);
  const calAnchorRef = useRef(null);

  const isToday = sameDay(
    viewDate,
    new Date(),
  );

  const [splitRatio, setSplitRatio] =
    useState(0.4);
  const [dividerDrag, setDividerDrag] =
    useState(false);
  const [timelineHeight, setTimelineHeight] =
    useState(180);
  const [tlDrag, setTlDrag] =
    useState(false);
  const [mapOpen, setMapOpen] =
    useState(false);
  const [timelineOpen, setTimelineOpen] =
    useState(false);
  const [autoRouting, setAutoRouting] =
    useState(false);

  const [filterOpen, setFilterOpen] =
    useState(false);
  const [personnelOpen, setPersonnelOpen] =
    useState(false);
  const [jobSearchOpen, setJobSearchOpen] =
    useState(false);
  const [newJobOpen, setNewJobOpen] =
    useState(false);
  const [importOpen, setImportOpen] =
    useState(false);
  const [exportOpen, setExportOpen] =
    useState(false);

  const [detailJob, setDetailJob] =
    useState(null);
  const [detailTechnician, setDetailTechnician] =
    useState(null);
  const [editJob, setEditJob] =
    useState(null);
  const [chartMode, setChartMode] =
    useState(null);

  const [displayFilter, setDisplayFilter] =
    useState(null);
  const [jobFilter, setJobFilter] =
    useState(null);
  const [techFilter, setTechFilter] =
    useState(null);

  const [overrideWarning, setOverrideWarning] =
    useState(null);
  const [autoRouteConfirm, setAutoRouteConfirm] =
    useState(false);
  const [ctxMenu, setCtxMenu] =
    useState(null);

  const [selJobs, setSelJobs] =
    useState([]);
  const [selTechs, setSelTechs] =
    useState([]);

  const [dragJob, setDragJob] =
    useState(null);

  const [isDemo, setIsDemo] =
    useState(false);
  const [simElapsed, setSimElapsed] =
    useState(null);
  const [overrunMap, setOverrunMap] =
    useState(() => new Map());
  const [demoLocked, setDemoLocked] =
    useState(false);

  const [realClock, setRealClock] = useState(
    () =>
      new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
  );

  const [orienteurs, setOrienteurs] =
    useState([]);
  const [toasts, setToasts] =
    useState([]);

  const splitRef = useRef(null);
  const techPaneRef = useRef(null);
  const techGridRef = useRef(null);
  const jobGridRef = useRef(null);
  const focusedGridRef = useRef('jobs');
  const dragJobRef = useRef(null);
  const dragGhostRef = useRef(null);
  const selJobsRef = useRef(selJobs);
  const loadDataRef = useRef(null);
  const toastRef = useRef(null);
  const techsRef = useRef([]);
  const fJobsRef = useRef([]);
  const demoLockedRef = useRef(false);
  const loadRequestRef = useRef(0);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef(new Set());

  const toast = useCallback(
    (message, type = 'info') => {
      const normalizedMessage =
        normalizeText(message);

      if (!normalizedMessage) {
        return;
      }

      const id = ++toastIdRef.current;

      setToasts((previous) => [
        ...previous,
        {
          id,
          msg: normalizedMessage,
          type,
        },
      ]);

      const timeoutId = window.setTimeout(() => {
        toastTimersRef.current.delete(timeoutId);
        setToasts((previous) =>
          previous.filter(
            (item) => item.id !== id,
          ),
        );
      }, 3000);

      toastTimersRef.current.add(timeoutId);
    },
    [],
  );

  useEffect(() => {
    const toastTimers = toastTimersRef.current;
    return () => {
      toastTimers.forEach(
        (timeoutId) =>
          window.clearTimeout(timeoutId),
      );
      toastTimers.clear();
    };
  }, []);

  useEffect(() => {
    let active = true;

    api.simStatus()
      .then((response) => {
        if (!active) {
          return;
        }

        if (response?.data?.is_demo) {
          setIsDemo(true);
          setViewDate(new Date());
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    api.getOrienteurs()
      .then((response) => {
        if (!active) {
          return;
        }

        setOrienteurs(
          Array.isArray(response?.data)
            ? response.data
            : [],
        );
      })
      .catch((error) => {
        if (active) {
          console.error(
            'Erreur de chargement des orienteurs :',
            error,
          );
          setOrienteurs([]);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRealClock(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const loadData = useCallback(
    async (showRefresh = false) => {
      const requestId =
        loadRequestRef.current + 1;
      loadRequestRef.current = requestId;

      if (showRefresh) {
        setRefreshing(true);
      }

      const targetDate = getTargetDate(
        isDemo,
        viewDate,
      );

      try {
        const [techniciansResponse, jobsResponse, summaryResponse] =
          await Promise.all([
            api.getTechnicians(),
            api.getJobs({
              scheduled_date: targetDate,
            }),
            api.getJobsSummary({
              target_date: targetDate,
            }),
          ]);

        if (
          requestId !== loadRequestRef.current
        ) {
          return;
        }

        const nextTechnicians =
          Array.isArray(techniciansResponse?.data)
            ? techniciansResponse.data.filter(
                isRecord,
              )
            : [];

        const nextJobs =
          Array.isArray(jobsResponse?.data)
            ? jobsResponse.data.filter(isRecord)
            : [];

        const nextSummary = isRecord(
          summaryResponse?.data,
        )
          ? summaryResponse.data
          : {};

        setTechs(nextTechnicians);
        setJobs(nextJobs);
        setSummary(nextSummary);
      } catch (error) {
        if (
          requestId !== loadRequestRef.current
        ) {
          return;
        }

        console.error(
          'Erreur de chargement du dashboard :',
          error,
        );

        toast(
          getApiErrorMessage(
            error,
            'Échec du chargement des données',
          ),
          'error',
        );
      } finally {
        if (
          requestId === loadRequestRef.current
        ) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [isDemo, toast, viewDate],
  );

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadData();
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadData]);

  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    techsRef.current = techs;
  }, [techs]);

  useEffect(() => {
    dragJobRef.current = dragJob;
  }, [dragJob]);

  useEffect(() => {
    selJobsRef.current = selJobs;
  }, [selJobs]);

  useEffect(() => {
    demoLockedRef.current = demoLocked;
  }, [demoLocked]);

  useEffect(() => {
    setSelTechs((previous) =>
      previous.filter((identifier) =>
        techs.some((technician) =>
          sameIdentifier(
            technician.id,
            identifier,
          ),
        ),
      ),
    );
  }, [techs]);

  useEffect(() => {
    setSelJobs((previous) =>
      previous.filter((identifier) =>
        jobs.some((job) =>
          sameIdentifier(job.id, identifier),
        ),
      ),
    );
  }, [jobs]);

  const handleExportJobs = useCallback(
    async () => {
      const token =
        localStorage.getItem('token');

      if (!token) {
        toast(
          "Vous n'êtes pas authentifié pour exporter.",
          'error',
        );
        return;
      }

      try {
        const response = await apiClient.get(
          '/reports/export',
          {
            responseType: 'blob',
          },
        );

        const blob = new Blob(
          [response.data],
          {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        );

        const url =
          window.URL.createObjectURL(blob);
        const anchor =
          document.createElement('a');

        anchor.style.display = 'none';
        anchor.href = url;
        anchor.download = `rapport_ftth_${fmtDate(new Date())}.xlsx`;

        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);

        toast(
          'Exportation Excel réussie !',
          'success',
        );
      } catch (error) {
        console.error(
          "Erreur d'export :",
          error,
        );

        toast(
          `Échec de l'exportation : ${getApiErrorMessage(
            error,
            'Erreur inconnue',
          )}`,
          'error',
        );
      }
    },
    [toast],
  );

  const deleteJob = useCallback(
    async (job) => {
      if (!hasIdentifier(job?.id)) {
        toast(
          "Impossible d'identifier l'intervention à supprimer.",
          'error',
        );
        return;
      }

      const jobReference =
        normalizeText(job.job_number) || job.id;

      const confirmed = window.confirm(
        `Supprimer l'intervention #${jobReference} ?`,
      );

      if (!confirmed) {
        return;
      }

      try {
        await api.deleteJob(job.id);
        setDetailJob(null);
        setEditJob(null);
        setSelJobs((previous) =>
          previous.filter(
            (identifier) =>
              !sameIdentifier(
                identifier,
                job.id,
              ),
          ),
        );
        toast(
          `Intervention #${jobReference} supprimée`,
          'success',
        );
        await loadData(true);
      } catch (error) {
        console.error(
          "Erreur de suppression de l'intervention :",
          error,
        );
        toast(
          getApiErrorMessage(
            error,
            "Échec de la suppression de l'intervention",
          ),
          'error',
        );
      }
    },
    [loadData, toast],
  );

  const doBatchAssign = useCallback(
    async (jobIds, techId) => {
      const normalizedJobIds =
        uniqueIdentifiers(jobIds);

      const technician = techs.find((item) =>
        sameIdentifier(item.id, techId),
      );

      if (
        !technician ||
        normalizedJobIds.length === 0
      ) {
        return;
      }

      try {
        const response = await api.batchAssign(
          normalizedJobIds,
          technician.id,
        );

        const assignedCount = toFiniteNumber(
          response?.data?.assigned,
          0,
        );

        toast(
          `${assignedCount} intervention${
            assignedCount !== 1 ? 's' : ''
          } → ${
            normalizeText(technician.name) ||
            `Technicien #${technician.id}`
          }`,
          assignedCount > 0
            ? 'success'
            : 'warning',
        );

        await loadData(true);
      } catch (error) {
        console.error(
          "Erreur d'affectation :",
          error,
        );
        toast(
          getApiErrorMessage(
            error,
            "Échec de l'affectation",
          ),
          'error',
        );
      }
    },
    [loadData, techs, toast],
  );

  const doAssignWithCheck = useCallback(
    async (jobIds, techId) => {
      if (demoLockedRef.current) {
        toastRef.current?.(
          'Arrêtez la démo pour affecter des interventions',
          'warning',
        );
        return;
      }

      const normalizedJobIds =
        uniqueIdentifiers(jobIds);

      const technician = techs.find((item) =>
        sameIdentifier(item.id, techId),
      );

      if (
        !technician ||
        normalizedJobIds.length === 0
      ) {
        return;
      }

      if (normalizedJobIds.length === 1) {
        const job = jobs.find((item) =>
          sameIdentifier(
            item.id,
            normalizedJobIds[0],
          ),
        );

        if (job) {
          const issues = [];
          const technicianSkills = new Set(
            extractNamedValues(
              technician.skills,
            ).map((item) => item.normalized),
          );

          const missingSkills =
            extractNamedValues(
              job.required_skills,
            )
              .filter(
                (item) =>
                  !technicianSkills.has(
                    item.normalized,
                  ),
              )
              .map((item) => item.raw);

          issues.push({
            label: `Compétence${
              missingSkills.length > 0
                ? ` (manquante(s) : ${missingSkills.join(', ')})`
                : ''
            }`,
            pass: missingSkills.length === 0,
          });

          const routeCriteria =
            normalizeComparableText(
              job.route_criteria,
            );

          const technicianRoutes =
            extractNamedValues(
              technician.assigned_routes,
            );

          const routeMatch =
            !routeCriteria ||
            technicianRoutes.some(
              (route) =>
                route.normalized ===
                routeCriteria,
            );

          issues.push({
            label: `Tournée${
              !routeMatch
                ? ` (interv : ${
                    normalizeText(
                      job.route_criteria,
                    ) || '—'
                  }, tech : ${
                    technicianRoutes
                      .map((route) => route.raw)
                      .join(', ') || 'aucune'
                  })`
                : ''
            }`,
            pass: routeMatch,
          });

          if (issues.some((issue) => !issue.pass)) {
            setOverrideWarning({
              jobIds: normalizedJobIds,
              techId: technician.id,
              techName:
                normalizeText(
                  technician.name,
                ) ||
                `Technicien #${technician.id}`,
              issues,
            });
            return;
          }
        }
      }

      await doBatchAssign(
        normalizedJobIds,
        technician.id,
      );
    },
    [doBatchAssign, jobs, techs],
  );

  useEffect(() => {
    if (!dragJob) {
      return undefined;
    }

    const ghost = dragGhostRef.current;

    const updateGhost = (
      clientX,
      clientY,
    ) => {
      if (!ghost) {
        return;
      }

      const currentJob = dragJobRef.current;
      const currentSelection =
        selJobsRef.current;

      ghost.style.left = `${clientX + 12}px`;
      ghost.style.top = `${clientY - 10}px`;
      ghost.style.display = 'block';

      const isBatch =
        currentSelection.length > 1 &&
        currentJob &&
        currentSelection.some((identifier) =>
          sameIdentifier(
            identifier,
            currentJob.id,
          ),
        );

      ghost.textContent = isBatch
        ? `${currentSelection.length} interventions`
        : currentJob
          ? `Intervention #${
              currentJob.job_number ||
              currentJob.id
            } — ${
              normalizeText(
                currentJob.customer_name,
              ) || 'Client non renseigné'
            }`
          : '';
    };

    const dropAt = (clientX, clientY) => {
      const currentJob = dragJobRef.current;

      if (
        currentJob &&
        techGridRef.current
      ) {
        const element =
          document.elementFromPoint(
            clientX,
            clientY,
          );

        if (techPaneRef.current?.contains(element)) {
          const techId =
            techGridRef.current.getTechIdAtPoint(
              clientX,
              clientY,
            );

          if (techId !== null) {
            const currentSelection =
              selJobsRef.current;

            const selectedCurrentJob =
              currentSelection.some(
                (identifier) =>
                  sameIdentifier(
                    identifier,
                    currentJob.id,
                  ),
              );

            const jobIds =
              currentSelection.length > 0 &&
              selectedCurrentJob
                ? currentSelection
                : [currentJob.id];

            doAssignWithCheck(jobIds, techId);
          }
        }
      }

      if (ghost) {
        ghost.style.display = 'none';
      }

      setDragJob(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    const handleMouseMove = (event) => {
      updateGhost(
        event.clientX,
        event.clientY,
      );
    };

    const handleMouseUp = (event) => {
      dropAt(
        event.clientX,
        event.clientY,
      );
    };

    const handleTouchMove = (event) => {
      const touch = event.touches[0];

      if (!touch) {
        return;
      }

      event.preventDefault();
      updateGhost(
        touch.clientX,
        touch.clientY,
      );
    };

    const handleTouchEnd = (event) => {
      const touch = event.changedTouches[0];

      if (!touch) {
        return;
      }

      dropAt(
        touch.clientX,
        touch.clientY,
      );
    };

    document.addEventListener(
      'mousemove',
      handleMouseMove,
    );
    document.addEventListener(
      'mouseup',
      handleMouseUp,
    );
    document.addEventListener(
      'touchmove',
      handleTouchMove,
      { passive: false },
    );
    document.addEventListener(
      'touchend',
      handleTouchEnd,
    );

    return () => {
      document.removeEventListener(
        'mousemove',
        handleMouseMove,
      );
      document.removeEventListener(
        'mouseup',
        handleMouseUp,
      );
      document.removeEventListener(
        'touchmove',
        handleTouchMove,
      );
      document.removeEventListener(
        'touchend',
        handleTouchEnd,
      );

      if (ghost) {
        ghost.style.display = 'none';
      }

      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [doAssignWithCheck, dragJob]);

  const handleSimEvent = useCallback((event) => {
    if (event?.event_type === 'clock_tick') {
      setSimElapsed(
        event.details?.elapsed_minutes ?? null,
      );
      return;
    }

    if (
      event?.event_type === 'job_assigned' ||
      event?.event_type === 'job_started'
    ) {
      loadDataRef.current?.();
      return;
    }

    if (event?.event_type === 'job_completed') {
      setOverrunMap((previous) => {
        const next = new Map(previous);
        next.delete(event.job_id);
        return next;
      });
      loadDataRef.current?.();
      return;
    }

    if (event?.event_type === 'overrun_warning') {
      setOverrunMap((previous) => {
        const next = new Map(previous);
        next.set(
          event.job_id,
          event.details?.severity ?? 'yellow',
        );
        return next;
      });
      return;
    }

    if (event?.event_type === 'scripted_beat') {
      toastRef.current?.(
        event.details?.description ??
          'Événement scénarisé déclenché',
        'info',
      );
      loadDataRef.current?.();
      return;
    }

    if (event?.event_type === 'day_complete') {
      toastRef.current?.(
        'Journée de démonstration terminée — toutes les interventions sont finies',
        'success',
      );
      loadDataRef.current?.();
    }
  }, []);

  useSimEvents(handleSimEvent);

  useEffect(() => {
    const closeContextMenu = () => {
      setCtxMenu(null);
    };

    document.addEventListener(
      'click',
      closeContextMenu,
    );

    return () => {
      document.removeEventListener(
        'click',
        closeContextMenu,
      );
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;

      if (
        target instanceof Element &&
        (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        )
      ) {
        return;
      }

      if (
        target instanceof Element &&
        target.closest(
          '.fw-window, .fw-filter, .fw-personnel, .fw-job-search, .fw-job-detail',
        )
      ) {
        return;
      }

      if (event.key === 'Escape') {
        setCtxMenu(null);
        setMapOpen(false);
        setFilterOpen(false);
        setPersonnelOpen(false);
        setJobSearchOpen(false);
        setDetailJob(null);
        setDetailTechnician(null);
        setAutoRouteConfirm(false);
        setOverrideWarning(null);
        setChartMode(null);
        return;
      }

      if (
        event.key.toLowerCase() === 'a' &&
        (event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();

        if (focusedGridRef.current === 'techs') {
          const identifiers =
            techsRef.current
              .map((technician) => technician.id)
              .filter(hasIdentifier);

          setSelTechs(
            uniqueIdentifiers(identifiers),
          );
          techGridRef.current?.selectAll();
        } else {
          const identifiers =
            fJobsRef.current
              .map((job) => job.id)
              .filter(hasIdentifier);

          setSelJobs(
            uniqueIdentifiers(identifiers),
          );
          jobGridRef.current?.selectAll();
        }

        return;
      }

      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 'r') {
        loadData(true);
      } else if (key === 'm') {
        setMapOpen((previous) => !previous);
      } else if (key === 't') {
        setTimelineOpen(
          (previous) => !previous,
        );
      } else if (key === 'f') {
        setFilterOpen(
          (previous) => !previous,
        );
      } else if (key === 'p') {
        setPersonnelOpen(
          (previous) => !previous,
        );
      } else if (key === 'j') {
        setJobSearchOpen(
          (previous) => !previous,
        );
      } else if (
        key === 'a' &&
        (isAdmin || isOrienteur) &&
        !demoLockedRef.current
      ) {
        setAutoRouteConfirm(true);
      }
    };

    document.addEventListener(
      'keydown',
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        'keydown',
        handleKeyDown,
      );
    };
  }, [isAdmin, isOrienteur, loadData]);

  const goDay = useCallback((offset) => {
    setViewDate((previous) => {
      const next = new Date(previous);
      next.setDate(next.getDate() + offset);
      return next;
    });
  }, []);

  const handleOverrideConfirm = useCallback(
    async () => {
      if (!overrideWarning) {
        return;
      }

      const {
        jobIds,
        techId,
      } = overrideWarning;

      setOverrideWarning(null);
      await doBatchAssign(jobIds, techId);
    },
    [doBatchAssign, overrideWarning],
  );

  const doBatchUnassign = useCallback(
    async (jobIds) => {
      const normalizedJobIds =
        uniqueIdentifiers(jobIds);

      if (normalizedJobIds.length === 0) {
        return;
      }

      try {
        const response = await api.batchUnassign(
          normalizedJobIds,
        );

        const unassignedCount = toFiniteNumber(
          response?.data?.unassigned,
          0,
        );

        toast(
          `${unassignedCount} intervention${
            unassignedCount !== 1 ? 's' : ''
          } désaffectée${
            unassignedCount !== 1 ? 's' : ''
          }`,
          unassignedCount > 0
            ? 'success'
            : 'warning',
        );

        setSelJobs([]);
        await loadData(true);
      } catch (error) {
        console.error(
          'Erreur de désaffectation :',
          error,
        );
        toast(
          getApiErrorMessage(
            error,
            'Échec de la désaffectation',
          ),
          'error',
        );
      }
    },
    [loadData, toast],
  );

  const toggleCharts = useCallback((mode) => {
    setChartMode((previous) =>
      previous === mode ? null : mode,
    );
  }, []);

  const handleAutoRoute = useCallback(
    async () => {
      if (autoRouting) {
        return;
      }

      setAutoRouting(true);

      try {
        const response = await api.autoRoute({
          target_date: getTargetDate(
            isDemo,
            viewDate,
          ),
        });

        const assignedCount = toFiniteNumber(
          response?.data?.jobs_assigned,
          0,
        );

        const unassignedCount = toFiniteNumber(
          response?.data?.jobs_unassigned,
          0,
        );

        toast(
          `${assignedCount} intervention${
            assignedCount !== 1 ? 's' : ''
          } affectée${
            assignedCount !== 1 ? 's' : ''
          }${
            unassignedCount > 0
              ? ` · ${unassignedCount} non affectée${
                  unassignedCount !== 1 ? 's' : ''
                }`
              : ''
          }`,
          assignedCount > 0
            ? 'success'
            : 'warning',
        );

        await loadData(true);
      } catch (error) {
        console.error(
          "Erreur d'affectation automatique :",
          error,
        );
        toast(
          getApiErrorMessage(
            error,
            "Échec de l'affectation automatique",
          ),
          'error',
        );
      } finally {
        setAutoRouting(false);
      }
    },
    [
      autoRouting,
      isDemo,
      loadData,
      toast,
      viewDate,
    ],
  );

  const handleJobAction = useCallback(
    async (action, job) => {
      setCtxMenu(null);

      if (!hasIdentifier(job?.id)) {
        return;
      }

      const labels = {
        cancel: 'Annulé',
        unassign: 'Désaffecté',
        hold: 'Mis en attente',
      };

      try {
        if (action === 'cancel') {
          await api.cancelJob(job.id);
        } else if (action === 'unassign') {
          await api.unassignJob(job.id);
        } else if (action === 'hold') {
          await api.updateJobStatus(
            job.id,
            'on_hold',
          );
        } else if (action === 'batch_unassign') {
          await doBatchUnassign(selJobs);
          return;
        } else if (action === 'delete') {
          await deleteJob(job);
          return;
        } else {
          return;
        }

        toast(
          `Intervention #${
            job.job_number || job.id
          } — ${labels[action]}`,
          'success',
        );

        await loadData(true);
      } catch (error) {
        console.error(
          `Erreur de l'action ${action} :`,
          error,
        );
        toast(
          getApiErrorMessage(
            error,
            `Échec de l'action ${action} sur l'intervention #${job.id}`,
          ),
          'error',
        );
      }
    },
    [
      deleteJob,
      doBatchUnassign,
      loadData,
      selJobs,
      toast,
    ],
  );

  const handleTechAction = useCallback(
    async (action, technician) => {
      setCtxMenu(null);

      if (!hasIdentifier(technician?.id)) {
        return;
      }

      const statusByAction = {
        set_available: 'disponible',
        set_on_break: 'pause',
        set_off_duty: 'hors_service',
      };

      const status = statusByAction[action];

      if (!status) {
        return;
      }

      const selectedTechnician = selTechs.some(
        (identifier) =>
          sameIdentifier(
            identifier,
            technician.id,
          ),
      );

      const technicianIds =
        selTechs.length > 1 &&
        selectedTechnician
          ? uniqueIdentifiers(selTechs)
          : [technician.id];

      const results = await Promise.allSettled(
        technicianIds.map((technicianId) =>
          api.updateTechStatus(
            technicianId,
            status,
          ),
        ),
      );

      const successCount = results.filter(
        (result) =>
          result.status === 'fulfilled',
      ).length;

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(
            `Échec de mise à jour du technicien ${technicianIds[index]} :`,
            result.reason,
          );
        }
      });

      if (successCount === 0) {
        toast(
          'Échec de la mise à jour du statut',
          'error',
        );
        return;
      }

      const statusLabel = status.replace(
        /_/g,
        ' ',
      );

      toast(
        technicianIds.length > 1
          ? `${successCount} techniciens → ${statusLabel}`
          : `${
              normalizeText(technician.name) ||
              `Technicien #${technician.id}`
            } → ${statusLabel}`,
        successCount === technicianIds.length
          ? 'success'
          : 'warning',
      );

      await loadData(true);
    },
    [loadData, selTechs, toast],
  );

  const handleAssignToTech = useCallback(
    async (jobId, techId) => {
      setCtxMenu(null);

      const selectedJob = selJobs.some(
        (identifier) =>
          sameIdentifier(identifier, jobId),
      );

      const jobIds =
        selJobs.length > 0 && selectedJob
          ? selJobs
          : [jobId];

      await doAssignWithCheck(jobIds, techId);
    },
    [doAssignWithCheck, selJobs],
  );

  const handleAssignTechToOrienteur =
    useCallback(
      async (techId, orienteurId) => {
        setCtxMenu(null);

        if (
          !hasIdentifier(techId) ||
          !hasIdentifier(orienteurId)
        ) {
          return;
        }

        try {
          await api.assignTechnicianToOrienteur(
            orienteurId,
            techId,
          );
          toast(
            "Technicien affecté à l'orienteur",
            'success',
          );
          await loadData(true);
        } catch (error) {
          console.error(
            "Erreur d'affectation à l'orienteur :",
            error,
          );
          toast(
            getApiErrorMessage(
              error,
              "Échec de l'affectation du technicien",
            ),
            'error',
          );
        }
      },
      [loadData, toast],
    );

  const handleJobClick = useCallback(
    (identifier, event, displayedIds) => {
      setSelJobs((previous) =>
        updateSelection(
          previous,
          identifier,
          event,
          displayedIds,
        ),
      );
    },
    [],
  );

  const handleTechClick = useCallback(
    (identifier, event, displayedIds) => {
      setSelTechs((previous) =>
        updateSelection(
          previous,
          identifier,
          event,
          displayedIds,
        ),
      );
    },
    [],
  );

  const handleJobDoubleClick = useCallback(
    (job) => {
      if (!isRecord(job)) {
        return;
      }

      setDetailJob(job);
    },
    [],
  );

  const handleTechDoubleClick = useCallback(
    (technician) => {
      if (!isRecord(technician)) {
        return;
      }

      setDetailTechnician(technician);
      setPersonnelOpen(false);
    },
    [],
  );

  const handleLocateTech = useCallback(
    (techId) => {
      if (!hasIdentifier(techId)) {
        return;
      }

      setSelTechs([techId]);
      setPersonnelOpen(false);
      toast(
        `Technicien #${techId} localisé`,
        'info',
      );
    },
    [toast],
  );

  const toggleJobFilter = useCallback(
    (status) => {
      setJobFilter((previous) =>
        previous === status ? null : status,
      );
      setTechFilter(null);
    },
    [],
  );

  const toggleTechFilter = useCallback(
    (status) => {
      setTechFilter((previous) =>
        previous === status ? null : status,
      );
      setJobFilter(null);
    },
    [],
  );

  const handleDisplayFilterApply = useCallback(
    (filter) => {
      setDisplayFilter(filter || null);
      toast(
        filter
          ? 'Filtre appliqué'
          : 'Filtre effacé',
        'info',
      );
    },
    [toast],
  );

  useEffect(() => {
    if (!dividerDrag) {
      return undefined;
    }

    const handleMouseMove = (event) => {
      if (!splitRef.current) {
        return;
      }

      const bounds =
        splitRef.current.getBoundingClientRect();

      const nextRatio =
        (event.clientY - bounds.top) /
        bounds.height;

      setSplitRatio(
        Math.min(
          Math.max(nextRatio, 0.1),
          0.85,
        ),
      );
    };

    const handleMouseUp = () => {
      setDividerDrag(false);
    };

    document.addEventListener(
      'mousemove',
      handleMouseMove,
    );
    document.addEventListener(
      'mouseup',
      handleMouseUp,
    );
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener(
        'mousemove',
        handleMouseMove,
      );
      document.removeEventListener(
        'mouseup',
        handleMouseUp,
      );
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dividerDrag]);

  useEffect(() => {
    if (!tlDrag) {
      return undefined;
    }

    const handleMouseMove = (event) => {
      if (!splitRef.current) {
        return;
      }

      const bounds =
        splitRef.current.getBoundingClientRect();

      const distanceFromBottom =
        bounds.bottom - event.clientY;

      setTimelineHeight(
        Math.min(
          Math.max(
            distanceFromBottom,
            100,
          ),
          500,
        ),
      );
    };

    const handleMouseUp = () => {
      setTlDrag(false);
    };

    document.addEventListener(
      'mousemove',
      handleMouseMove,
    );
    document.addEventListener(
      'mouseup',
      handleMouseUp,
    );
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener(
        'mousemove',
        handleMouseMove,
      );
      document.removeEventListener(
        'mouseup',
        handleMouseUp,
      );
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [tlDrag]);

  const activeTechnicians = useMemo(
    () =>
      techs.filter((technician) =>
        ACTIVE_TECHNICIAN_STATUSES.has(
          getTechnicianStatus(technician),
        ),
      ).length,
    [techs],
  );

  const offDutyTechnicians = useMemo(
    () =>
      techs.filter((technician) =>
        OFF_DUTY_TECHNICIAN_STATUSES.has(
          getTechnicianStatus(technician),
        ),
      ).length,
    [techs],
  );

  const filteredJobsData = useMemo(() => {
    let result = jobs;

    if (displayFilter) {
      const timeSlots = asArray(
        displayFilter.timeSlots,
      );
      const jobTypes = asArray(
        displayFilter.jobTypes,
      );
      const routeCriteria = asArray(
        displayFilter.routeCriteria,
      );

      result = result.filter((job) => {
        const slot =
          job.time_slot_start &&
          job.time_slot_end
            ? `${job.time_slot_start}–${job.time_slot_end}`
            : null;

        if (
          slot &&
          timeSlots.length > 0 &&
          !timeSlots.includes(slot)
        ) {
          return false;
        }

        if (
          job.job_type &&
          jobTypes.length > 0 &&
          !jobTypes.includes(job.job_type)
        ) {
          return false;
        }

        if (
          job.route_criteria &&
          routeCriteria.length > 0 &&
          !routeCriteria.includes(
            job.route_criteria,
          )
        ) {
          return false;
        }

        return true;
      });
    }

    if (jobFilter) {
      result = result.filter(
        (job) => job.status === jobFilter,
      );
    }

    return result;
  }, [displayFilter, jobFilter, jobs]);

  useEffect(() => {
    fJobsRef.current = filteredJobsData;
  }, [filteredJobsData]);

  const filteredTechniciansData = useMemo(() => {
    let result = techs;

    const filteredTechIds = asArray(
      displayFilter?.techIds,
    );

    if (filteredTechIds.length > 0) {
      result = result.filter((technician) =>
        filteredTechIds.some((identifier) =>
          sameIdentifier(
            technician.id,
            identifier,
          ),
        ),
      );
    }

    if (techFilter === 'active') {
      result = result.filter((technician) =>
        ACTIVE_TECHNICIAN_STATUSES.has(
          getTechnicianStatus(technician),
        ),
      );
    } else if (techFilter === 'off_duty') {
      result = result.filter((technician) =>
        OFF_DUTY_TECHNICIAN_STATUSES.has(
          getTechnicianStatus(technician),
        ),
      );
    }

    return result;
  }, [displayFilter, techFilter, techs]);

  const timelineTechnicians = useMemo(
    () =>
      selTechs.length > 0
        ? techs.filter((technician) =>
            selTechs.some((identifier) =>
              sameIdentifier(
                technician.id,
                identifier,
              ),
            ),
          )
        : [],
    [selTechs, techs],
  );

  if (loading && techs.length === 0) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        Chargement de GoVector...
      </div>
    );
  }

  const safeSummary = isRecord(summary)
    ? summary
    : {};

  const pending = toFiniteNumber(
    safeSummary.pending,
    0,
  );
  const assigned = toFiniteNumber(
    safeSummary.assigned,
    0,
  );
  const inProgress = toFiniteNumber(
    safeSummary.in_progress,
    0,
  );
  const completed = toFiniteNumber(
    safeSummary.completed,
    0,
  );
  const onHold = toFiniteNumber(
    safeSummary.on_hold,
    0,
  );
  const failed = toFiniteNumber(
    safeSummary.failed,
    0,
  );

  const totalJobs = jobs.length;
  const filteredJobs =
    filteredJobsData.length;
  const totalTechnicians = techs.length;
  const filteredTechnicians =
    filteredTechniciansData.length;

  return (
    <div
      className={`app-shell${
        demoLocked ? ' demo-locked' : ''
      }`}
    >
      <header
        className={`header-bar header-bar--${
          userRole?.toLowerCase() || 'default'
        }`}
      >
        <div className="header-brand">
          <div className="header-brand-icon" />
          <strong>GoVector</strong>
          <span className="header-version">
            v{__APP_VERSION__}
          </span>
        </div>

        <span className="header-real-clock">
          {realClock}
        </span>

        <div className="header-divider" />

        <div className="day-picker">
          {!isDemo && (
            <button
              type="button"
              className="day-picker-btn"
              onClick={() => goDay(-1)}
              aria-label="Jour précédent"
            >
              ◂
            </button>
          )}

          <button
            ref={calAnchorRef}
            type="button"
            className={`day-picker-date${
              isToday
                ? ' day-picker-date--today'
                : ''
            }${
              isDemo
                ? ' day-picker-date--locked'
                : ''
            }`}
            onClick={() => {
              if (!isDemo) {
                setCalOpen(
                  (previous) => !previous,
                );
              }
            }}
          >
            {isDemo
              ? 'Journée Démo'
              : isToday
                ? "Aujourd'hui"
                : fmtDateDisplay(viewDate)}
          </button>

          {!isDemo && (
            <button
              type="button"
              className="day-picker-btn"
              onClick={() => goDay(1)}
              aria-label="Jour suivant"
            >
              ▸
            </button>
          )}

          {!isDemo && calOpen && (
            <CalendarPicker
              value={viewDate}
              onChange={(date) => {
                if (date instanceof Date) {
                  setViewDate(date);
                }
              }}
              onClose={() => setCalOpen(false)}
              anchorRef={calAnchorRef}
            />
          )}
        </div>

        <div className="header-actions">
          {(isAdmin || isChef || isOrienteur) && (
            <Button
              variant="primary"
              onClick={() => setNewJobOpen(true)}
            >
              + Nouvelle Intervention
            </Button>
          )}

          {isAdmin && (
            <Button
              variant={
                importOpen
                  ? 'primary'
                  : 'secondary'
              }
              onClick={() => setImportOpen(true)}
              disabled={demoLocked}
            >
              📄{' '}
              <span className="btn-label">
                Import Excel
              </span>
            </Button>
          )}

          {(isAdmin || isOrienteur || isChef) && (
            <Button
              variant={
                filterOpen
                  ? 'primary'
                  : 'secondary'
              }
              onClick={() =>
                setFilterOpen(
                  (previous) => !previous,
                )
              }
              disabled={demoLocked}
            >
              <FilterIcon />
              <span className="btn-label">
                Filtres
              </span>
            </Button>
          )}

          <Button
            variant={
              personnelOpen
                ? 'primary'
                : 'secondary'
            }
            onClick={() =>
              setPersonnelOpen(
                (previous) => !previous,
              )
            }
            disabled={demoLocked}
          >
            <PersonnelIcon />
            <span className="btn-label">
              Personnel
            </span>
          </Button>

          <Button
            variant={
              jobSearchOpen
                ? 'primary'
                : 'secondary'
            }
            onClick={() =>
              setJobSearchOpen(
                (previous) => !previous,
              )
            }
            disabled={demoLocked}
          >
            <SearchIcon />
            <span className="btn-label">
              Recherche
            </span>
          </Button>

          <div className="header-divider" />

          <Button
            variant={
              timelineOpen
                ? 'primary'
                : 'secondary'
            }
            onClick={() =>
              setTimelineOpen(
                (previous) => !previous,
              )
            }
          >
            <TimelineIcon />
            <span className="btn-label">
              Planning
            </span>
          </Button>

          <Button
            variant={
              mapOpen
                ? 'primary'
                : 'secondary'
            }
            onClick={() =>
              setMapOpen(
                (previous) => !previous,
              )
            }
          >
            <MapIcon />
            <span className="btn-label">
              Carte
            </span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => loadData(true)}
            disabled={refreshing}
          >
            <RefreshIcon spinning={refreshing} />
            <span className="btn-label">
              Actualiser
            </span>
          </Button>

          {(isAdmin || isOrienteur) && (
            <Button
              variant="warning"
              onClick={() =>
                setAutoRouteConfirm(true)
              }
              disabled={
                demoLocked ||
                autoRouting ||
                pending === 0
              }
            >
              <BoltIcon />
              <span className="btn-label">
                {autoRouting
                  ? 'Affectation...'
                  : `Auto-Affectation ${pending}`}
              </span>
            </Button>
          )}

          <div className="header-divider" />

          <Button
            variant={
              chartMode === 'secteurs'
                ? 'primary'
                : 'secondary'
            }
            onClick={() =>
              toggleCharts('secteurs')
            }
          >
            <ChartIcon />
            <span className="btn-label">
              Secteurs
            </span>
          </Button>

          <Button
            variant={
              chartMode === 'status'
                ? 'primary'
                : 'secondary'
            }
            onClick={() =>
              toggleCharts('status')
            }
          >
            <ChartIcon />
            <span className="btn-label">
              Statuts
            </span>
          </Button>

          {(isAdmin || isOrienteur) && (
            <Button
              variant="success"
              onClick={handleExportJobs}
              disabled={demoLocked}
            >
              <ExcelIcon />
              <span className="btn-label">
                Export Excel
              </span>
            </Button>
          )}

          {(isAdmin || isOrienteur || isChef) && (
            <Button
              variant={
                exportOpen
                  ? 'primary'
                  : 'success'
              }
              onClick={() => setExportOpen(true)}
              disabled={demoLocked}
            >
              <ExportIcon />
              <span className="btn-label">
                Export
              </span>
            </Button>
          )}

          <Button
            variant={
              showSupervisory
                ? 'primary'
                : 'secondary'
            }
            onClick={() =>
              setShowSupervisory(
                (previous) => !previous,
              )
            }
          >
            <SupervisionIcon />
            <span className="btn-label">
              Supervision
            </span>
          </Button>

          <Button
            variant="secondary"
            onClick={onLogout}
          >
            Déconnexion
          </Button>
        </div>
      </header>

      <SimBar
        elapsedMinutes={simElapsed}
        onToast={toast}
        onRunningChange={setDemoLocked}
      />

      <div
        className="dashboard-role-badge"
        style={{
          '--role-color': currentRole.color,
        }}
      >
        <span className="dashboard-role-icon">
          {currentRole.icon}
        </span>
        <span className="dashboard-role-label">
          {currentRole.label}
        </span>
      </div>

      {(isAdmin || isChef || isOrienteur) && (
        <div className="dashboard-bar">
          <DashboardIndicator
            active={jobFilter === 'pending'}
            onClick={() =>
              toggleJobFilter('pending')
            }
            count={pending}
            color="danger"
            label="Non affectés"
          />
          <DashboardIndicator
            active={jobFilter === 'assigned'}
            onClick={() =>
              toggleJobFilter('assigned')
            }
            count={assigned}
            color="info"
            label="Affectés"
          />
          <DashboardIndicator
            active={jobFilter === 'in_progress'}
            onClick={() =>
              toggleJobFilter('in_progress')
            }
            count={inProgress}
            color="info"
            label="En cours"
          />
          <DashboardIndicator
            active={jobFilter === 'completed'}
            onClick={() =>
              toggleJobFilter('completed')
            }
            count={completed}
            color="success"
            label="Terminés"
          />
          <DashboardIndicator
            active={jobFilter === 'on_hold'}
            onClick={() =>
              toggleJobFilter('on_hold')
            }
            count={onHold}
            color="warning"
            label="En attente"
          />
          <DashboardIndicator
            active={jobFilter === 'failed'}
            onClick={() =>
              toggleJobFilter('failed')
            }
            count={failed}
            color="warning"
            label="Échecs"
          />

          <div className="header-divider" />

          <DashboardIndicator
            active={techFilter === 'active'}
            onClick={() =>
              toggleTechFilter('active')
            }
            count={activeTechnicians}
            color="success"
            label="Techniciens actifs"
          />
          <DashboardIndicator
            active={techFilter === 'off_duty'}
            onClick={() =>
              toggleTechFilter('off_duty')
            }
            count={offDutyTechnicians}
            color="muted"
            label="Hors service"
          />

          <div className="dash-indicator">
            <span className="dash-count dash-count--muted">
              {techs.length}
            </span>
            <span className="dash-label">
              Total
            </span>
          </div>

          {(jobFilter ||
            techFilter ||
            displayFilter) && (
            <>
              <div className="header-divider" />
              <button
                type="button"
                className="dash-indicator dash-indicator--clear"
                onClick={() => {
                  setJobFilter(null);
                  setTechFilter(null);
                  setDisplayFilter(null);
                }}
              >
                ✕ Effacer
                {displayFilter ? ' tout' : ''}
              </button>
            </>
          )}
        </div>
      )}

      {showSupervisory && (
        <div
          className="supervisory-overlay"
          onClick={() =>
            setShowSupervisory(false)
          }
        >
          <div
            className="supervisory-window"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="fw-titlebar">
              <span className="fw-title">
                📊 Centre de Supervision
              </span>
              <button
                type="button"
                className="fw-close"
                onClick={() =>
                  setShowSupervisory(false)
                }
                aria-label="Fermer la supervision"
              >
                ✕
              </button>
            </div>

            <div className="supervisory-body">
              <SupervisoryDashboard
                onClose={() =>
                  setShowSupervisory(false)
                }
                onNavigate={(mode) => {
                  setShowSupervisory(false);

                  if (mode === 'map') {
                    setMapOpen(true);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      <main className="main-content">
        <div
          className="split-container"
          ref={splitRef}
        >
          <div
            className="pane"
            style={{
              flex: `0 0 ${splitRatio * 100}%`,
            }}
            onMouseDown={() => {
              focusedGridRef.current = 'techs';
            }}
            onTouchStart={() => {
              focusedGridRef.current = 'techs';
            }}
          >
            <div className="pane-header">
              <span className="pane-title">
                👷 Techniciens
              </span>
              <span className="pane-count">
                {filteredTechnicians}
                {(techFilter || displayFilter)
                  ? ` / ${totalTechnicians}`
                  : ''}
              </span>

              {selTechs.length > 0 && (
                <span className="pane-selection">
                  {selTechs.length} sélectionné
                  {selTechs.length > 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div
              className="pane-body"
              ref={techPaneRef}
            >
              <TechGrid
                ref={techGridRef}
                technicians={filteredTechniciansData}
                selectedIds={selTechs}
                onRowClicked={handleTechClick}
                onRowDoubleClicked={
                  handleTechDoubleClick
                }
                onContextMenu={(event, technician) => {
                  event.preventDefault();
                  setCtxMenu({
                    x: event.clientX,
                    y: event.clientY,
                    type: 'tech',
                    data: technician,
                  });
                }}
                isDragTarget={Boolean(dragJob)}
              />
            </div>
          </div>

          <div
            className={`split-divider${
              dividerDrag
                ? ' split-divider--active'
                : ''
            }`}
            onMouseDown={(event) => {
              event.preventDefault();
              setDividerDrag(true);
            }}
          >
            <div className="split-divider-grip" />
          </div>

          <div
            className="pane"
            style={{ flex: 1 }}
            onMouseDown={() => {
              focusedGridRef.current = 'jobs';
            }}
            onTouchStart={() => {
              focusedGridRef.current = 'jobs';
            }}
          >
            <div className="pane-header">
              <span className="pane-title">
                📋 Interventions
              </span>
              <span className="pane-count">
                {filteredJobs}
                {(jobFilter || displayFilter)
                  ? ` / ${totalJobs}`
                  : ''}
              </span>

              {selJobs.length > 0 && (
                <span className="pane-selection">
                  {selJobs.length} sélectionnée
                  {selJobs.length > 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="pane-body">
              <JobGrid
                ref={jobGridRef}
                jobs={filteredJobsData}
                selectedIds={selJobs}
                onRowClicked={handleJobClick}
                onContextMenu={(event, job) => {
                  event.preventDefault();
                  setCtxMenu({
                    x: event.clientX,
                    y: event.clientY,
                    type: 'job',
                    data: job,
                  });
                }}
                onDragStart={(job) => {
                  setDragJob(job);
                }}
                onRowDoubleClicked={
                  handleJobDoubleClick
                }
                overrunMap={overrunMap}
                simElapsed={simElapsed}
              />
            </div>
          </div>

          {timelineOpen && (
            <>
              <div
                className={`split-divider${
                  tlDrag
                    ? ' split-divider--active'
                    : ''
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setTlDrag(true);
                }}
              >
                <div className="split-divider-grip" />
              </div>

              <div
                className="pane"
                style={{
                  flex: `0 0 ${timelineHeight}px`,
                  minHeight: '100px',
                }}
              >
                <div className="pane-header">
                  <span className="pane-title">
                    📅 Planning
                  </span>

                  {timelineTechnicians.length > 0 && (
                    <span className="pane-count">
                      {timelineTechnicians
                        .map(
                          (technician) =>
                            technician.name,
                        )
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  )}
                </div>

                <div className="pane-body">
                  <TechTimeline
                    technicians={
                      timelineTechnicians
                    }
                    jobs={jobs}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <div
        ref={dragGhostRef}
        className="drag-ghost"
        style={{ display: 'none' }}
      />

      {mapOpen && (
        <MapWindow
          technicians={techs}
          jobs={jobs}
          onClose={() => setMapOpen(false)}
        />
      )}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          type={ctxMenu.type}
          data={ctxMenu.data}
          technicians={techs}
          orienteurs={orienteurs}
          selectedJobIds={selJobs}
          selectedTechIds={selTechs}
          onJobAction={handleJobAction}
          onTechAction={handleTechAction}
          onAssignToTech={handleAssignToTech}
          onAssignTechToOrienteur={
            handleAssignTechToOrienteur
          }
        />
      )}

      {filterOpen && (
        <FilterWindow
          jobs={jobs}
          technicians={techs}
          activeFilter={displayFilter}
          onApply={(filter) => {
            handleDisplayFilterApply(filter);
            setFilterOpen(false);
          }}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {personnelOpen && (
        <PersonnelWindow
          technicians={techs}
          onLocateTech={handleLocateTech}
          onContextMenu={(event, technician) => {
            event.preventDefault();
            setCtxMenu({
              x: event.clientX,
              y: event.clientY,
              type: 'tech',
              data: technician,
            });
          }}
          onTechDetail={handleTechDoubleClick}
          onClose={() =>
            setPersonnelOpen(false)
          }
        />
      )}

      {jobSearchOpen && (
        <JobSearchWindow
          viewDate={viewDate}
          onClose={() =>
            setJobSearchOpen(false)
          }
          onJobDetail={handleJobDoubleClick}
          onDragStart={(job) => {
            setDragJob(job);
          }}
          onContextMenu={(event, job) => {
            event.preventDefault();
            setCtxMenu({
              x: event.clientX,
              y: event.clientY,
              type: 'job',
              data: job,
            });
          }}
        />
      )}

      {detailJob && (
        <JobDetailPanel
          job={detailJob}
          onClose={() => setDetailJob(null)}
          onDelete={deleteJob}
          onEdit={(job) => setEditJob(job)}
        />
      )}

      {detailTechnician && (
        <TechnicianDetailPanel
          technician={detailTechnician}
          onClose={() =>
            setDetailTechnician(null)
          }
        />
      )}

      {editJob && (
        <EditJobWindow
          job={editJob}
          onClose={() => setEditJob(null)}
          onSaved={() => {
            setEditJob(null);
            loadData(true);
          }}
        />
      )}

      {autoRouteConfirm && (
        <div
          className="override-overlay"
          onClick={() =>
            setAutoRouteConfirm(false)
          }
        >
          <div
            className="override-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="override-title">
              Confirmation d&apos;affectation automatique
            </div>

            <div className="override-body">
              L&apos;affectation automatique va attribuer{' '}
              <strong>
                {pending} intervention
                {pending !== 1 ? 's' : ''} en attente
                {pending !== 1 ? 's' : ''}
              </strong>{' '}
              aux techniciens disponibles selon leurs
              compétences, leur secteur et la distance.
            </div>

            <div className="override-actions">
              <button
                type="button"
                className="btn btn--sm"
                onClick={() =>
                  setAutoRouteConfirm(false)
                }
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn btn--sm btn--warning"
                onClick={() => {
                  setAutoRouteConfirm(false);
                  handleAutoRoute();
                }}
                disabled={autoRouting}
              >
                <BoltIcon />
                Affecter {pending} interventions
              </button>
            </div>
          </div>
        </div>
      )}

      {overrideWarning && (
        <div
          className="override-overlay"
          onClick={() =>
            setOverrideWarning(null)
          }
        >
          <div
            className="override-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="override-title">
              Avertissement d&apos;affectation
            </div>

            <div className="override-body">
              Affectation de{' '}
              {overrideWarning.jobIds.length === 1
                ? `l'intervention #${overrideWarning.jobIds[0]}`
                : `${overrideWarning.jobIds.length} interventions`}{' '}
              à{' '}
              <strong>
                {overrideWarning.techName}
              </strong>
              {' :'}

              {overrideWarning.issues.map(
                (issue, index) => (
                  <div
                    key={`${issue.label}-${index}`}
                    className="override-issue"
                  >
                    <span
                      className={
                        issue.pass
                          ? 'override-check'
                          : 'override-x'
                      }
                    >
                      {issue.pass ? '✓' : '✕'}
                    </span>
                    {issue.label}
                  </div>
                ),
              )}
            </div>

            <div className="override-actions">
              <button
                type="button"
                className="btn btn--sm"
                onClick={() =>
                  setOverrideWarning(null)
                }
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn btn--sm btn--warning"
                onClick={handleOverrideConfirm}
              >
                Forcer l&apos;affectation
              </button>
            </div>
          </div>
        </div>
      )}

      {newJobOpen && (
        <NewJobWindow
          onClose={() => setNewJobOpen(false)}
          onCreated={() => loadData(true)}
        />
      )}

      {chartMode === 'secteurs' && (
        <div
          className="charts-overlay"
          onClick={() => setChartMode(null)}
        >
          <div
            className="charts-window"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="fw-titlebar">
              <span className="fw-title">
                Volume par Secteur FTTH
              </span>
              <button
                type="button"
                className="fw-close"
                onClick={() => setChartMode(null)}
                aria-label="Fermer le graphique"
              >
                ✕
              </button>
            </div>
            <div className="charts-body">
              <ChartsSecteurs />
            </div>
          </div>
        </div>
      )}

      {chartMode === 'status' && (
        <div
          className="charts-overlay"
          onClick={() => setChartMode(null)}
        >
          <div
            className="charts-window"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="fw-titlebar">
              <span className="fw-title">
                Proportions des États de Commandes
              </span>
              <button
                type="button"
                className="fw-close"
                onClick={() => setChartMode(null)}
                aria-label="Fermer le graphique"
              >
                ✕
              </button>
            </div>
            <div className="charts-body">
              <ChartsStatus />
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="import-overlay">
          <div className="import-window">
            <div className="import-header">
              <h2>Import Excel</h2>
              <button
                type="button"
                className="import-close"
                onClick={() =>
                  setImportOpen(false)
                }
                aria-label="Fermer l'import"
              >
                ✕
              </button>
            </div>

            <div className="import-body">
              <ImportCenter
                onClose={() =>
                  setImportOpen(false)
                }
                onImported={(created) => {
                  loadData(true);
                  toast(
                    created
                      ? `${created} intervention(s) importée(s).`
                      : 'Import terminé.',
                    'success',
                  );
                  setImportOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <ExportCenter
          onClose={() => setExportOpen(false)}
        />
      )}

      <div className="toast-container">
        {toasts.map((item) => (
          <Toast
            key={item.id}
            message={item.msg}
            type={item.type}
          />
        ))}
      </div>

      <AIAssistant
        jobs={jobs}
        technicians={techs}
      />
    </div>
  );
}

function ChartsSecteurs() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    api.getChartsSecteurs()
      .then((response) => {
        if (!active) {
          return;
        }

        setData(
          isRecord(response?.data)
            ? response.data
            : null,
        );
        setError(!isRecord(response?.data));
      })
      .catch((requestError) => {
        if (!active) {
          return;
        }

        console.error(
          'Erreur de chargement du graphique secteurs :',
          requestError,
        );
        setError(true);
      });

    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="loading-screen">
        Données indisponibles
      </div>
    );
  }

  if (!data) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        Chargement...
      </div>
    );
  }

  const labels = asArray(data.labels);
  const datasets = asArray(data.datasets).filter(
    isRecord,
  );

  const values = datasets.flatMap((dataset) =>
    asArray(dataset.data).map((value) =>
      toFiniteNumber(value, 0),
    ),
  );

  const maxValue = Math.max(...values, 1);

  return (
    <div className="charts-content">
      <div className="charts-legend">
        {datasets.map((dataset, index) => (
          <span
            key={`${dataset.label ?? 'dataset'}-${index}`}
            className="charts-legend-item"
          >
            <span
              className="charts-legend-color"
              style={{
                background:
                  dataset.backgroundColor,
              }}
            />
            {dataset.label || '—'}
          </span>
        ))}
      </div>

      <div className="charts-bars">
        {labels.map((label, labelIndex) => {
          const datasetValues = datasets.map(
            (dataset) =>
              toFiniteNumber(
                asArray(dataset.data)[labelIndex],
                0,
              ),
          );

          const total = datasetValues.reduce(
            (sum, value) => sum + value,
            0,
          );

          return (
            <div
              key={`${label}-${labelIndex}`}
              className="chart-bar-group"
            >
              <div className="chart-bar-stack">
                {datasets.map(
                  (dataset, datasetIndex) => {
                    const value =
                      datasetValues[datasetIndex];
                    const height =
                      (value / maxValue) * 140;

                    return (
                      <div
                        key={`${dataset.label ?? 'dataset'}-${datasetIndex}`}
                        className="chart-bar-segment"
                        style={{
                          height: `${height}px`,
                          background:
                            dataset.backgroundColor,
                        }}
                        title={`${dataset.label || '—'}: ${value}`}
                      />
                    );
                  },
                )}
              </div>
              <div className="chart-bar-label">
                {label}
              </div>
              <div className="chart-bar-value">
                {total}
              </div>
            </div>
          );
        })}
      </div>

      {isRecord(data.meta) && (
        <div className="charts-meta">
          Total pannes: {data.meta.total_pannes} ·{' '}
          Raccordements: {data.meta.total_raccordements} ·{' '}
          Production: {data.meta.total_production}
        </div>
      )}
    </div>
  );
}

function ChartsStatus() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    api.getChartsStatus()
      .then((response) => {
        if (!active) {
          return;
        }

        setData(
          isRecord(response?.data)
            ? response.data
            : null,
        );
        setError(!isRecord(response?.data));
      })
      .catch((requestError) => {
        if (!active) {
          return;
        }

        console.error(
          'Erreur de chargement du graphique statuts :',
          requestError,
        );
        setError(true);
      });

    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="loading-screen">
        Données indisponibles
      </div>
    );
  }

  if (!data) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        Chargement...
      </div>
    );
  }

  const labels = asArray(data.labels);
  const dataset = asArray(data.datasets).find(
    isRecord,
  );
  const values = asArray(dataset?.data).map(
    (value) => toFiniteNumber(value, 0),
  );
  const colors = asArray(
    dataset?.backgroundColor,
  );
  const maxValue = Math.max(...values, 1);
  const details = isRecord(data.meta?.details)
    ? data.meta.details
    : {};
  const proportions = isRecord(
    data.meta?.proportions,
  )
    ? data.meta.proportions
    : {};

  return (
    <div className="charts-content">
      <div className="charts-legend">
        {labels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className="charts-legend-item"
          >
            <span
              className="charts-legend-color"
              style={{
                background: colors[index],
              }}
            />
            {details[label]?.label || label}
          </span>
        ))}
      </div>

      <div className="charts-bars">
        {labels.map((label, index) => {
          const value = values[index] ?? 0;
          const height =
            (value / maxValue) * 140;

          return (
            <div
              key={`${label}-${index}`}
              className="chart-bar-group"
            >
              <div className="chart-bar-stack">
                <div
                  className="chart-bar-segment"
                  style={{
                    height: `${height}px`,
                    background: colors[index],
                  }}
                />
              </div>
              <div className="chart-bar-label">
                {label}
              </div>
              <div className="chart-bar-value">
                {value}
              </div>
            </div>
          );
        })}
      </div>

      {isRecord(data.meta) && (
        <div className="charts-meta">
          Total: {data.meta.total}
          {Object.entries(proportions).length > 0
            ? ` · ${Object.entries(proportions)
                .map(
                  ([key, value]) =>
                    `${key}: ${value}%`,
                )
                .join(' · ')}`
            : ''}
        </div>
      )}
    </div>
  );
}

function DashboardIndicator({
  active,
  onClick,
  count,
  color,
  label,
}) {
  return (
    <button
      type="button"
      className={`dash-indicator${
        active ? ' dash-indicator--active' : ''
      }`}
      onClick={onClick}
    >
      <span
        className={`dash-count dash-count--${color}`}
      >
        {count}
      </span>
      <span className="dash-label">
        {label}
      </span>
    </button>
  );
}
