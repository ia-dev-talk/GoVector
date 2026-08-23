import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from '../api/client';
import ContextMenu from '../components/ContextMenu';
import TechGrid from '../components/TechGrid';
import Toast from '../components/Toast';
import PersonnelHeader from '../features/personnel/PersonnelHeader';
import PersonnelInspector from '../features/personnel/PersonnelInspector';
import PersonnelKpiStrip from '../features/personnel/PersonnelKpiStrip';
import PersonnelToolbar from '../features/personnel/PersonnelToolbar';
import {
  hasPersonnelServerConflict,
  isPersonnelDraftDirty,
  personnelDraftFingerprint,
  personnelServerFingerprint,
} from '../features/personnel/personnelDraftGuard';
import { personnelSectorApi } from '../features/personnel/personnelSectorApi';
import {
  OFFLINE_TECH_STATUSES,
  EDITABLE_LIVE_STATUSES,
  getLocalDateKey,
  isGpsActive,
  normalizeIdentifier,
  normalizeSearchText,
  normalizeStatus,
  normalizeStringList,
  shouldCheckGps,
  text,
} from '../features/personnel/personnelUtils';
import { useRuntimeSettings } from '../contexts/RuntimeSettingsContext';
import { useWebSocket } from '../hooks/useWebSocket';
import '../styles/personnel-v3.css';

const EMPTY_FILTERS = Object.freeze({
  sector: null,
  team: null,
  status: null,
  operator: null,
  skill: null,
  gps: null,
});

const DISCARD_TECHNICIAN_CHANGES_MESSAGE =
  'Abandonner les modifications de cette fiche technicien ?';

const OVERWRITE_TECHNICIAN_CHANGES_MESSAGE =
  'Cette fiche a été mise à jour depuis le serveur pendant votre édition. Enregistrer quand même vos modifications locales ?';

function apiErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }
  return text(error?.message, fallback);
}

function technicianMatchesJob(technicianId, job) {
  const expected = normalizeIdentifier(technicianId);
  if (!expected) return false;
  return [
    job?.assigned_tech_id,
    job?.assigned_technician_id,
    job?.technician_id,
    job?.assignment?.technician_id,
  ].some((value) => normalizeIdentifier(value) === expected);
}

function normalizeSectorAssignment(value) {
  const sectorIds = Array.isArray(value?.sector_ids)
    ? value.sector_ids
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    : [];
  const sectorNames = Array.isArray(value?.sector_names)
    ? value.sector_names.map((item) => text(item)).filter(Boolean)
    : [];
  const primarySectorId = Number(value?.primary_sector_id);

  return {
    technician_id: Number(value?.technician_id),
    primary_sector_id:
      Number.isInteger(primarySectorId) && primarySectorId > 0
        ? primarySectorId
        : null,
    primary_sector_name: text(value?.primary_sector_name),
    sector_ids: [...new Set(sectorIds)],
    sector_names: [...new Set(sectorNames)],
  };
}

function enrichTechniciansWithSectors(technicians, assignments) {
  const assignmentByTechnician = new Map(
    assignments
      .map(normalizeSectorAssignment)
      .filter((item) => Number.isInteger(item.technician_id))
      .map((item) => [String(item.technician_id), item]),
  );

  return technicians.map((technician) => {
    const assignment =
      assignmentByTechnician.get(String(technician.id)) ?? {
        primary_sector_id: null,
        primary_sector_name: '',
        sector_ids: [],
        sector_names: [],
      };

    return {
      ...technician,
      ...assignment,
      route_criteria: assignment.primary_sector_name,
      assigned_routes: assignment.sector_names,
    };
  });
}

const PERSISTED_TECHNICIAN_FIELDS = Object.freeze([
  'name',
  'employee_id',
  'phone',
  'email',
  'address',
  'shift_start',
  'shift_end',
  'max_jobs_per_day',
  'skills',
]);

function pickPersistedTechnicianFields(source) {
  return Object.fromEntries(
    PERSISTED_TECHNICIAN_FIELDS
      .filter((field) => Object.hasOwn(source, field))
      .map((field) => [field, source[field]]),
  );
}

export default function PersonnelPage({
  userRole,
  onNavigate,
  navigationPayload,
}) {
  const { settings } = useRuntimeSettings();
  const gpsStaleAfterMinutes =
    settings?.operational?.gps_stale_after_minutes ?? null;

  const [technicians, setTechnicians] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [orienteurs, setOrienteurs] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dataError, setDataError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [detailTechId, setDetailTechId] = useState(null);
  const [detailDirty, setDetailDirty] = useState(false);
  const [detailConflict, setDetailConflict] = useState(false);
  const [detailRevision, setDetailRevision] = useState(0);
  const [contextMenu, setContextMenu] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [kpiFilter, setKpiFilter] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [referenceNow, setReferenceNow] = useState(0);

  const toastSequence = useRef(0);
  const loadDataRef = useRef(null);
  const inspectorHostRef = useRef(null);
  const inspectorBaselineRef = useRef('');
  const serverBaselineRef = useRef('');
  const detailDirtyRef = useRef(false);
  const conflictToastRef = useRef('');

  const canEditGeneral =
    userRole === 'ADMIN' || userRole === 'CHEF_ORIENTEUR';

  const toast = useCallback((message, type = 'info') => {
    const id = toastSequence.current + 1;
    toastSequence.current = id;
    setToasts((current) => [...current, { id, msg: message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3500);
  }, []);

  const readInspectorDraft = useCallback(() => {
    const root = inspectorHostRef.current;
    if (!root) return '';
    const controls = root.querySelectorAll(
      '.personnel-v3-inspector input:not(:disabled), .personnel-v3-inspector select:not(:disabled), .personnel-v3-inspector textarea:not(:disabled)',
    );
    return personnelDraftFingerprint(
      Array.from(controls).map((control) => ({
        type: control.type || control.tagName,
        value: control.value,
        checked: control.checked,
      })),
    );
  }, []);

  const markDetailClean = useCallback(() => {
    const snapshot = readInspectorDraft();
    inspectorBaselineRef.current = snapshot;
    detailDirtyRef.current = false;
    setDetailDirty(false);
  }, [readInspectorDraft]);

  const allowDiscardDetail = useCallback(() => {
    if (!detailDirtyRef.current) return true;
    if (!window.confirm(DISCARD_TECHNICIAN_CHANGES_MESSAGE)) return false;
    detailDirtyRef.current = false;
    inspectorBaselineRef.current = '';
    serverBaselineRef.current = '';
    conflictToastRef.current = '';
    setDetailDirty(false);
    setDetailConflict(false);
    return true;
  }, []);

  const handleInspectorEdit = useCallback(() => {
    const currentFingerprint = readInspectorDraft();
    const dirty = isPersonnelDraftDirty(
      inspectorBaselineRef.current,
      currentFingerprint,
    );
    detailDirtyRef.current = dirty;
    setDetailDirty(dirty);
    if (!dirty) {
      setDetailConflict(false);
      conflictToastRef.current = '';
    }
  }, [readInspectorDraft]);

  const loadData = useCallback(
    async ({ manual = false, silent = false } = {}) => {
      if (manual) setRefreshing(true);
      else if (!silent) setLoading(true);
      setDataError('');

      try {
        const results = await Promise.allSettled([
          api.getTechnicians(),
          api.getJobs({ scheduled_date: getLocalDateKey() }),
          api.getOrienteurs(),
          api.getSectors(),
          personnelSectorApi.getAssignments(),
        ]);

        const [
          technicianResult,
          jobResult,
          orienteurResult,
          sectorResult,
          assignmentResult,
        ] = results;

        if (technicianResult.status === 'rejected') {
          throw technicianResult.reason;
        }

        const loadedTechnicians = Array.isArray(
          technicianResult.value?.data,
        )
          ? technicianResult.value.data
          : [];
        const loadedAssignments =
          assignmentResult.status === 'fulfilled' &&
          Array.isArray(assignmentResult.value?.data)
            ? assignmentResult.value.data
            : [];

        setTechnicians(
          enrichTechniciansWithSectors(
            loadedTechnicians,
            loadedAssignments,
          ),
        );

        setJobs(
          jobResult.status === 'fulfilled' &&
          Array.isArray(jobResult.value?.data)
            ? jobResult.value.data
            : [],
        );
        setOrienteurs(
          orienteurResult.status === 'fulfilled' &&
          Array.isArray(orienteurResult.value?.data)
            ? orienteurResult.value.data
            : [],
        );
        setSectors(
          sectorResult.status === 'fulfilled' &&
          Array.isArray(sectorResult.value?.data)
            ? [...sectorResult.value.data].sort((left, right) =>
                text(left?.name).localeCompare(text(right?.name), 'fr', {
                  sensitivity: 'base',
                }),
              )
            : [],
        );

        const partialFailures = results
          .slice(1)
          .filter((result) => result.status === 'rejected').length;
        if (partialFailures > 0) {
          setDataError(
            'Les techniciens sont disponibles, mais certaines données complémentaires n’ont pas pu être chargées.',
          );
        }
      } catch (error) {
        const message = apiErrorMessage(
          error,
          'Impossible de charger le personnel.',
        );
        setDataError(message);
        toast(message, 'error');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => loadData(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadData]);

  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    const updateClock = () => setReferenceNow(Date.now());
    const timeoutId = window.setTimeout(updateClock, 0);
    const intervalId = window.setInterval(updateClock, 10000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, []);

  const handleTechEvent = useCallback((eventType) => {
    if (
      ['tech:status_changed', 'tech:location_updated'].includes(eventType)
    ) {
      loadDataRef.current?.({ silent: true });
    }
  }, []);

  const { connected } = useWebSocket('dashboard', {
    onTechEvent: handleTechEvent,
  });

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  useEffect(() => {
    if (!detailDirty) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    const handleSidebarLeave = (event) => {
      const target = event.target instanceof Element
        ? event.target.closest('.sidebar-nav-item')
        : null;
      if (!target || target.getAttribute('aria-current') === 'page') return;
      if (window.confirm(DISCARD_TECHNICIAN_CHANGES_MESSAGE)) {
        detailDirtyRef.current = false;
        setDetailDirty(false);
        setDetailConflict(false);
        inspectorBaselineRef.current = '';
        serverBaselineRef.current = '';
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleSidebarLeave, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleSidebarLeave, true);
    };
  }, [detailDirty]);

  const filteredTechnicians = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    return technicians.filter((tech) => {
      const status = normalizeStatus(tech.live_status);

      if (
        filters.sector &&
        normalizeSearchText(tech.route_criteria) !==
          normalizeSearchText(filters.sector)
      ) return false;
      if (
        filters.team &&
        normalizeSearchText(tech.team) !== normalizeSearchText(filters.team)
      ) return false;
      if (
        filters.operator &&
        normalizeSearchText(tech.operator) !==
          normalizeSearchText(filters.operator)
      ) return false;
      if (filters.status && status !== normalizeStatus(filters.status)) {
        return false;
      }
      if (
        filters.skill &&
        !normalizeStringList(tech.skills).includes(
          normalizeSearchText(filters.skill),
        )
      ) return false;
      if (
        filters.gps === 'active' &&
        !isGpsActive(tech, referenceNow, gpsStaleAfterMinutes)
      ) return false;
      if (
        filters.gps === 'lost' &&
        !shouldCheckGps(tech, referenceNow, gpsStaleAfterMinutes)
      ) return false;
      if (kpiFilter === 'disponible' && status !== 'disponible') return false;
      if (kpiFilter === 'en_route' && status !== 'en_route') return false;
      if (
        kpiFilter === 'en_intervention' && status !== 'en_intervention'
      ) return false;
      if (kpiFilter === 'pause' && status !== 'pause') return false;
      if (
        kpiFilter === 'hors_service' && !OFFLINE_TECH_STATUSES.has(status)
      ) return false;
      if (
        kpiFilter === 'gps_lost' &&
        !shouldCheckGps(tech, referenceNow, gpsStaleAfterMinutes)
      ) return false;
      if (!normalizedQuery) return true;

      const values = [
        tech.name,
        tech.phone,
        tech.email,
        tech.team,
        tech.route_criteria,
        tech.employee_id,
        tech.operator,
        tech.orienteur_name,
      ].map(normalizeSearchText);

      return (
        values.some((value) => value.includes(normalizedQuery)) ||
        normalizeStringList(tech.skills).some((value) =>
          value.includes(normalizedQuery),
        )
      );
    });
  }, [
    filters,
    gpsStaleAfterMinutes,
    kpiFilter,
    query,
    referenceNow,
    technicians,
  ]);

  const counts = useMemo(() => {
    const result = {
      total: technicians.length,
      disponible: 0,
      en_route: 0,
      en_intervention: 0,
      pause: 0,
      hors_service: 0,
      gps_lost: 0,
    };

    technicians.forEach((tech) => {
      const status = normalizeStatus(tech.live_status);
      if (status === 'disponible') result.disponible += 1;
      if (status === 'en_route') result.en_route += 1;
      if (status === 'en_intervention') result.en_intervention += 1;
      if (status === 'pause') result.pause += 1;
      if (OFFLINE_TECH_STATUSES.has(status)) result.hors_service += 1;
      if (shouldCheckGps(tech, referenceNow, gpsStaleAfterMinutes)) {
        result.gps_lost += 1;
      }
    });
    return result;
  }, [gpsStaleAfterMinutes, referenceNow, technicians]);

  const detailTech = useMemo(() => {
    const expected = normalizeIdentifier(detailTechId);
    if (!expected) return null;
    return technicians.find(
      (tech) => normalizeIdentifier(tech.id) === expected,
    ) ?? null;
  }, [detailTechId, technicians]);

  const detailServerFingerprint = useMemo(
    () => personnelServerFingerprint(detailTech),
    [detailTech],
  );

  useEffect(() => {
    if (!detailTechId || !detailTech) {
      inspectorBaselineRef.current = '';
      serverBaselineRef.current = '';
      detailDirtyRef.current = false;
      setDetailDirty(false);
      setDetailConflict(false);
      return undefined;
    }

    serverBaselineRef.current = detailServerFingerprint;
    conflictToastRef.current = '';
    const frameId = window.requestAnimationFrame(markDetailClean);
    return () => window.cancelAnimationFrame(frameId);
  }, [detailRevision, detailTechId, markDetailClean]);

  useEffect(() => {
    if (!detailTech || !detailServerFingerprint) return;
    if (!serverBaselineRef.current) {
      serverBaselineRef.current = detailServerFingerprint;
      return;
    }
    if (detailServerFingerprint === serverBaselineRef.current) return;

    if (hasPersonnelServerConflict({
      dirty: detailDirtyRef.current,
      baselineFingerprint: serverBaselineRef.current,
      currentFingerprint: detailServerFingerprint,
    })) {
      setDetailConflict(true);
      if (conflictToastRef.current !== detailServerFingerprint) {
        conflictToastRef.current = detailServerFingerprint;
        toast(
          'La fiche technicien a changé côté serveur. Vos modifications locales sont conservées tant que vous ne choisissez pas de les enregistrer ou de les abandonner.',
          'warning',
        );
      }
      return;
    }

    serverBaselineRef.current = detailServerFingerprint;
    setDetailConflict(false);
    setDetailRevision((current) => current + 1);
  }, [detailServerFingerprint, detailTech, toast]);

  useEffect(() => {
    const target = normalizeIdentifier(
      navigationPayload?.technicianId ??
      navigationPayload?.technician_id ??
      navigationPayload?.id,
    );
    if (!target || technicians.length === 0) return;
    const match = technicians.find(
      (tech) => normalizeIdentifier(tech.id) === target,
    );
    if (match) {
      const currentId = normalizeIdentifier(detailTechId);
      if (
        currentId &&
        currentId !== target &&
        detailDirtyRef.current &&
        !window.confirm(DISCARD_TECHNICIAN_CHANGES_MESSAGE)
      ) {
        return;
      }
      detailDirtyRef.current = false;
      setDetailDirty(false);
      setDetailConflict(false);
      inspectorBaselineRef.current = '';
      serverBaselineRef.current = '';
      setDetailTechId(match.id);
      setDetailRevision(0);
      setSelectedIds([match.id]);
    }
  }, [detailTechId, navigationPayload, technicians]);

  const detailTodayJobs = useMemo(
    () => detailTech
      ? jobs.filter((job) => technicianMatchesJob(detailTech.id, job))
      : [],
    [detailTech, jobs],
  );

  const guardedNavigate = useCallback(
    (page, payload) => {
      if (!allowDiscardDetail()) return false;
      if (typeof onNavigate !== 'function') return false;
      return onNavigate(page, payload);
    },
    [allowDiscardDetail, onNavigate],
  );

  const openIntervention = useCallback(
    (job) => {
      const id = Number(job?.id);
      if (!Number.isInteger(id) || id <= 0) return;
      guardedNavigate('interventions', { id, from: 'personnel' });
    },
    [guardedNavigate],
  );

  const openTechnicianStock = useCallback(
    (tech) => {
      const technicianId = Number(tech?.id);
      if (!Number.isInteger(technicianId) || technicianId <= 0) return;
      guardedNavigate('stocks', {
        technicianId,
        technicianName: text(tech?.name),
        from: 'personnel',
      });
    },
    [guardedNavigate],
  );

  const requestOpenTechnician = useCallback(
    (tech) => {
      const nextId = normalizeIdentifier(tech?.id);
      if (!nextId) return;
      if (normalizeIdentifier(detailTechId) === nextId) return;
      if (!allowDiscardDetail()) return;
      inspectorBaselineRef.current = '';
      serverBaselineRef.current = '';
      setDetailConflict(false);
      setDetailRevision(0);
      setDetailTechId(tech.id);
    },
    [allowDiscardDetail, detailTechId],
  );

  const requestCloseTechnician = useCallback(() => {
    if (!allowDiscardDetail()) return;
    setDetailTechId(null);
    setDetailRevision(0);
  }, [allowDiscardDetail]);

  const handleTechClick = useCallback((id, event, displayedIds) => {
    setSelectedIds((current) => {
      if (event.metaKey || event.ctrlKey) {
        return current.includes(id)
          ? current.filter((value) => value !== id)
          : [...current, id];
      }
      if (
        event.shiftKey && current.length > 0 && Array.isArray(displayedIds)
      ) {
        const firstIndex = displayedIds.indexOf(current[current.length - 1]);
        const nextIndex = displayedIds.indexOf(id);
        if (firstIndex >= 0 && nextIndex >= 0) {
          const start = Math.min(firstIndex, nextIndex);
          const end = Math.max(firstIndex, nextIndex);
          return [
            ...new Set([...current, ...displayedIds.slice(start, end + 1)]),
          ];
        }
      }
      return current.length === 1 && current[0] === id ? [] : [id];
    });
  }, []);

  const handleSaveTech = useCallback(
    async (tech, updates) => {
      const {
        live_status: liveStatus,
        primary_sector_id: primarySectorId,
        sector_ids: sectorIds,
        ...candidateGeneralUpdates
      } = updates;
      const generalUpdates = pickPersistedTechnicianFields(
        candidateGeneralUpdates,
      );
      const currentStatus = normalizeStatus(tech.live_status);
      const nextStatus = normalizeStatus(liveStatus);
      const statusChanged =
        EDITABLE_LIVE_STATUSES.includes(nextStatus) &&
        nextStatus !== currentStatus;

      if (!canEditGeneral && !statusChanged) return false;
      setBusy(true);
      try {
        if (canEditGeneral) {
          await api.updateTechnician(tech.id, generalUpdates);
          await personnelSectorApi.updateAssignment(tech.id, {
            primary_sector_id: primarySectorId || null,
            sector_ids: Array.isArray(sectorIds) ? sectorIds : [],
          });
        }
        if (statusChanged) {
          await api.updateTechStatus(tech.id, nextStatus);
        }
        await loadData({ manual: true });
        toast('Technicien et secteurs enregistrés', 'success');
        return true;
      } catch (error) {
        toast(
          apiErrorMessage(error, 'Impossible d’enregistrer le technicien.'),
          'error',
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [canEditGeneral, loadData, toast],
  );

  const handleInspectorSave = useCallback(
    async (tech, updates) => {
      if (
        detailConflict &&
        !window.confirm(OVERWRITE_TECHNICIAN_CHANGES_MESSAGE)
      ) {
        return false;
      }
      const saved = await handleSaveTech(tech, updates);
      if (!saved) return false;
      detailDirtyRef.current = false;
      setDetailDirty(false);
      setDetailConflict(false);
      conflictToastRef.current = '';
      serverBaselineRef.current = '';
      inspectorBaselineRef.current = '';
      setDetailRevision((current) => current + 1);
      return true;
    },
    [detailConflict, handleSaveTech],
  );

  const updateTechnicianStatuses = useCallback(
    async (technicianIds, status) => {
      const ids = [
        ...new Set(
          technicianIds.map(normalizeIdentifier).filter(Boolean),
        ),
      ];
      if (ids.length === 0 || !EDITABLE_LIVE_STATUSES.includes(status)) {
        return;
      }
      setBusy(true);
      const results = await Promise.allSettled(
        ids.map((id) => api.updateTechStatus(id, status)),
      );
      const successCount = results.filter(
        (result) => result.status === 'fulfilled',
      ).length;
      if (successCount > 0) {
        toast(
          `${successCount} technicien${successCount > 1 ? 's' : ''} mis à jour`,
          'success',
        );
        await loadData({ manual: true });
      } else {
        toast('Échec de la mise à jour du statut', 'error');
      }
      setBusy(false);
    },
    [loadData, toast],
  );

  const handleBulkStatus = useCallback(
    (status) => updateTechnicianStatuses(selectedIds, status),
    [selectedIds, updateTechnicianStatuses],
  );

  const handleTechAction = useCallback(
    (action, tech) => {
      setContextMenu(null);
      const statusByAction = {
        set_available: 'disponible',
        set_on_break: 'pause',
        set_off_duty: 'hors_service',
      };
      const status = statusByAction[action];
      if (!status) return;
      const ids =
        selectedIds.length > 1 && selectedIds.includes(tech.id)
          ? selectedIds
          : [tech.id];
      updateTechnicianStatuses(ids, status);
    },
    [selectedIds, updateTechnicianStatuses],
  );

  const handleAssignToOrienteur = useCallback(
    async (techId, orienteurId) => {
      setContextMenu(null);
      setBusy(true);
      try {
        await api.assignTechnicianToOrienteur(orienteurId, techId);
        await loadData({ manual: true });
        toast('Technicien affecté à l’orienteur', 'success');
      } catch (error) {
        toast(
          apiErrorMessage(error, 'Impossible d’affecter le technicien.'),
          'error',
        );
      } finally {
        setBusy(false);
      }
    },
    [loadData, toast],
  );

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setKpiFilter(null);
  }, []);

  if (loading && technicians.length === 0) {
    return (
      <div className="personnel-v3-loading">
        <div className="loading-spinner" />
        Chargement du personnel…
      </div>
    );
  }

  return (
    <div className="personnel-v3-page">
      <PersonnelHeader
        total={technicians.length}
        query={query}
        onQueryChange={setQuery}
        onRefresh={() => loadData({ manual: true })}
        refreshing={refreshing}
        liveConnected={connected}
      />

      {dataError ? (
        <div className="personnel-v3-notice" role="alert">
          <div>
            <strong>Données partielles</strong>
            <span>{dataError}</span>
          </div>
          <button
            type="button"
            onClick={() => loadData({ manual: true })}
            disabled={refreshing}
          >
            Réessayer
          </button>
        </div>
      ) : null}

      {detailConflict ? (
        <div className="personnel-v3-notice" role="alert">
          <div>
            <strong>Fiche modifiée côté serveur</strong>
            <span>
              Vos changements locaux sont conservés. Enregistrer demandera une confirmation explicite afin d’éviter un écrasement silencieux.
            </span>
          </div>
        </div>
      ) : null}

      <div className="personnel-v3-content">
        <PersonnelKpiStrip
          counts={counts}
          activeFilter={kpiFilter}
          onFilterChange={(nextFilter) =>
            setKpiFilter((current) =>
              current === nextFilter ? null : nextFilter,
            )
          }
        />

        <main
          className={[
            'personnel-v3-workspace',
            detailTech ? 'personnel-v3-workspace--inspector-open' : '',
          ].filter(Boolean).join(' ')}
        >
          <section className="personnel-v3-grid-panel">
            <header className="personnel-v3-panel-header">
              <div>
                <span>Équipe terrain</span>
                <h2>Techniciens</h2>
              </div>
              <div className="personnel-v3-panel-counts">
                <span>{filteredTechnicians.length} affichés</span>
                {selectedIds.length > 0 ? (
                  <strong>
                    {selectedIds.length} sélectionné{selectedIds.length > 1 ? 's' : ''}
                  </strong>
                ) : null}
              </div>
            </header>

            <PersonnelToolbar
              technicians={technicians}
              filters={filters}
              filtersOpen={filtersOpen}
              onToggleFilters={() => setFiltersOpen((value) => !value)}
              onFilterChange={(key, value) =>
                setFilters((current) => ({ ...current, [key]: value }))
              }
              onClearFilters={clearFilters}
              displayedCount={filteredTechnicians.length}
              totalCount={technicians.length}
              selectedCount={selectedIds.length}
              onBulkStatus={handleBulkStatus}
              busy={busy}
            />

            <div className="personnel-v3-grid-body">
              <TechGrid
                technicians={filteredTechnicians}
                selectedIds={selectedIds}
                onRowClicked={handleTechClick}
                onRowDoubleClicked={requestOpenTechnician}
                onContextMenu={(event, tech) => {
                  event.preventDefault();
                  setContextMenu({
                    x: event.clientX,
                    y: event.clientY,
                    type: 'tech',
                    data: tech,
                  });
                }}
              />
            </div>
          </section>

          <div
            ref={inspectorHostRef}
            onInputCapture={handleInspectorEdit}
            onChangeCapture={handleInspectorEdit}
            style={{ display: 'contents' }}
          >
            <PersonnelInspector
              key={`${detailTech?.id ?? 'empty'}:${detailRevision}`}
              tech={detailTech}
              selectedCount={selectedIds.length}
              todayJobs={detailTodayJobs}
              canEditGeneral={canEditGeneral}
              sectors={sectors}
              referenceNow={referenceNow}
              gpsStaleAfterMinutes={gpsStaleAfterMinutes}
              onClose={requestCloseTechnician}
              onSave={handleInspectorSave}
              onOpenJob={openIntervention}
              onOpenStock={openTechnicianStock}
            />
          </div>
        </main>
      </div>

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          type={contextMenu.type}
          data={contextMenu.data}
          orienteurs={orienteurs}
          selectedTechIds={selectedIds}
          onTechAction={handleTechAction}
          onAssignTechToOrienteur={handleAssignToOrienteur}
        />
      ) : null}

      <div className="toast-container">
        {toasts.map((item) => (
          <Toast key={item.id} message={item.msg} type={item.type} />
        ))}
      </div>
    </div>
  );
}
