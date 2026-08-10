/**
 * SecteursPage — référentiel territorial BlueVector.
 *
 * Les secteurs sont des entités persistées, liées aux techniciens par ID.
 * Les géométries QGIS/QField restent explicitement non raccordées.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from '../api/client';
import ExportCenter from '../components/export/ExportCenter';
import Toast from '../components/Toast';
import { useRuntimeSettings } from '../contexts/RuntimeSettingsContext';
import { personnelSectorApi } from '../features/personnel/personnelSectorApi';
import SectorEditorModal from '../features/sectors/SectorEditorModal';
import SectorHeader from '../features/sectors/SectorHeader';
import SectorInspector from '../features/sectors/SectorInspector';
import SectorKpiStrip from '../features/sectors/SectorKpiStrip';
import SectorRegistry from '../features/sectors/SectorRegistry';
import {
  asRecords,
  buildSectorMetrics,
  errorMessage,
  getLocalDateKey,
  normalizeIdentifier,
  normalizeSearchText,
  sectorId,
  summarizeRegistry,
  text,
} from '../features/sectors/sectorUtils';
import { useWebSocket } from '../hooks/useWebSocket';
import '../styles/sectors-v3.css';


const REALTIME_RELOAD_DELAY = 650;


export default function SecteursPage({
  userRole,
  onNavigate,
}) {
  const { settings } =
    useRuntimeSettings();

  const staleAfterMinutes =
    settings?.operational
      ?.gps_stale_after_minutes ?? null;

  const [sectors, setSectors] =
    useState([]);

  const [technicians, setTechnicians] =
    useState([]);

  const [jobs, setJobs] =
    useState([]);

  const [assignments, setAssignments] =
    useState([]);

  const [searchQuery, setSearchQuery] =
    useState('');

  const [kpiFilter, setKpiFilter] =
    useState('all');

  const [statusFilter, setStatusFilter] =
    useState('all');

  const [issueFilter, setIssueFilter] =
    useState('all');

  const [sortBy, setSortBy] =
    useState('name');

  const [selectedSectorId, setSelectedSectorId] =
    useState(null);

  const [editorSector, setEditorSector] =
    useState(undefined);

  const [editorOpen, setEditorOpen] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [editorError, setEditorError] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [loadError, setLoadError] =
    useState('');

  const [referenceNow, setReferenceNow] =
    useState(() => Date.now());

  const [exportOpen, setExportOpen] =
    useState(false);

  const [toasts, setToasts] =
    useState([]);

  const requestRef = useRef(0);
  const reloadTimerRef = useRef(null);
  const toastIdRef = useRef(0);

  const role =
    text(userRole).toUpperCase();

  const canManage =
    [
      'ADMIN',
      'CHEF_ORIENTEUR',
    ].includes(role);

  const toast =
    useCallback(
      (
        message,
        type = 'info',
      ) => {
        const id =
          ++toastIdRef.current;

        setToasts((current) => [
          ...current,
          {
            id,
            message,
            type,
          },
        ]);

        window.setTimeout(() => {
          setToasts((current) =>
            current.filter(
              (item) =>
                item.id !== id,
            ),
          );
        }, 3200);
      },
      [],
    );

  useEffect(() => {
    const interval =
      window.setInterval(() => {
        setReferenceNow(Date.now());
      }, 10000);

    return () =>
      window.clearInterval(interval);
  }, []);

  const loadData =
    useCallback(
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

        const results =
          await Promise.allSettled([
            api.getSectors({
              limit: 500,
            }),
            api.getTechnicians(),
            api.getJobs({
              scheduled_date:
                getLocalDateKey(),
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

        const [
          sectorsResult,
          techniciansResult,
          jobsResult,
          assignmentsResult,
        ] = results;

        const errors = [];

        if (
          sectorsResult.status ===
          'fulfilled'
        ) {
          setSectors(
            asRecords(
              sectorsResult.value?.data,
            ),
          );
        } else {
          errors.push(
            errorMessage(
              sectorsResult.reason,
              'Secteurs indisponibles',
            ),
          );
        }

        if (
          techniciansResult.status ===
          'fulfilled'
        ) {
          setTechnicians(
            asRecords(
              techniciansResult.value?.data,
            ),
          );
        } else {
          errors.push(
            errorMessage(
              techniciansResult.reason,
              'Techniciens indisponibles',
            ),
          );
        }

        if (
          jobsResult.status ===
          'fulfilled'
        ) {
          setJobs(
            asRecords(
              jobsResult.value?.data,
            ),
          );
        } else {
          errors.push(
            errorMessage(
              jobsResult.reason,
              'Interventions indisponibles',
            ),
          );
        }

        if (
          assignmentsResult.status ===
          'fulfilled'
        ) {
          setAssignments(
            asRecords(
              assignmentsResult.value?.data,
            ),
          );
        } else {
          errors.push(
            errorMessage(
              assignmentsResult.reason,
              'Liaisons technicien-secteur indisponibles',
            ),
          );
        }

        setLoadError(
          errors.join(' · '),
        );

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

  const {
    connected: realtimeConnected,
  } = useWebSocket(
    'dashboard',
    {
      onTechEvent:
        scheduleReload,
      onJobEvent:
        scheduleReload,
    },
  );

  const enrichedSectors =
    useMemo(
      () =>
        buildSectorMetrics({
          sectors,
          technicians,
          jobs,
          assignments,
          referenceNow,
          staleAfterMinutes,
        }),
      [
        assignments,
        jobs,
        referenceNow,
        sectors,
        staleAfterMinutes,
        technicians,
      ],
    );

  const summary =
    useMemo(
      () =>
        summarizeRegistry({
          sectors:
            enrichedSectors,
          technicians,
          assignments,
          jobs,
          referenceNow,
          staleAfterMinutes,
        }),
      [
        assignments,
        enrichedSectors,
        jobs,
        referenceNow,
        staleAfterMinutes,
        technicians,
      ],
    );

  const filteredSectors =
    useMemo(() => {
      const query =
        normalizeSearchText(
          searchQuery,
        );

      let result =
        enrichedSectors.filter(
          (sector) => {
            if (
              query &&
              ![
                sector.name,
                sector.description,
                sector.id,
              ].some((value) =>
                normalizeSearchText(
                  value,
                ).includes(query),
              )
            ) {
              return false;
            }

            if (
              statusFilter === 'active' &&
              sector.is_active === false
            ) {
              return false;
            }

            if (
              statusFilter === 'inactive' &&
              sector.is_active !== false
            ) {
              return false;
            }

            if (
              issueFilter === 'without-tech' &&
              sector.technicians.length > 0
            ) {
              return false;
            }

            if (
              issueFilter === 'gps' &&
              sector.gpsIssues === 0
            ) {
              return false;
            }

            if (
              issueFilter === 'with-jobs' &&
              sector.jobs.length === 0
            ) {
              return false;
            }

            if (
              kpiFilter === 'active' &&
              sector.is_active === false
            ) {
              return false;
            }

            if (
              kpiFilter === 'without-tech' &&
              sector.technicians.length > 0
            ) {
              return false;
            }

            if (
              kpiFilter === 'jobs' &&
              sector.jobs.length === 0
            ) {
              return false;
            }

            if (
              kpiFilter === 'gps' &&
              sector.gpsIssues === 0
            ) {
              return false;
            }

            return true;
          },
        );

      result = [...result].sort(
        (first, second) => {
          if (sortBy === 'technicians') {
            return (
              second.technicians.length -
              first.technicians.length
            );
          }

          if (sortBy === 'jobs') {
            return (
              second.jobs.length -
              first.jobs.length
            );
          }

          if (sortBy === 'gps') {
            return (
              second.gpsIssues -
              first.gpsIssues
            );
          }

          return text(first.name)
            .localeCompare(
              text(second.name),
              'fr',
              {
                sensitivity: 'base',
              },
            );
        },
      );

      return result;
    }, [
      enrichedSectors,
      issueFilter,
      kpiFilter,
      searchQuery,
      sortBy,
      statusFilter,
    ]);

  const selectedSector =
    useMemo(
      () =>
        enrichedSectors.find(
          (sector) =>
            sectorId(sector) ===
            selectedSectorId,
        ) || null,
      [
        enrichedSectors,
        selectedSectorId,
      ],
    );

  const openCreate =
    useCallback(() => {
      setEditorSector(null);
      setEditorError('');
      setEditorOpen(true);
    }, []);

  const openEdit =
    useCallback((sector) => {
      setEditorSector(sector);
      setEditorError('');
      setEditorOpen(true);
    }, []);

  const closeEditor =
    useCallback(() => {
      if (saving) {
        return;
      }

      setEditorOpen(false);
      setEditorSector(undefined);
      setEditorError('');
    }, [saving]);

  const handleSave =
    useCallback(
      async (document) => {
        setSaving(true);
        setEditorError('');

        try {
          const response =
            editorSector?.id
              ? await api.updateSector(
                  editorSector.id,
                  document,
                )
              : await api.createSector(
                  document,
                );

          const saved =
            response?.data;

          setEditorOpen(false);
          setEditorSector(undefined);

          if (saved?.id) {
            setSelectedSectorId(
              normalizeIdentifier(
                saved.id,
              ),
            );
          }

          toast(
            editorSector?.id
              ? 'Secteur mis à jour.'
              : 'Secteur créé.',
            'success',
          );

          await loadData({
            manual: true,
          });
        } catch (error) {
          setEditorError(
            errorMessage(
              error,
              'Impossible d’enregistrer le secteur.',
            ),
          );
        } finally {
          setSaving(false);
        }
      },
      [
        editorSector,
        loadData,
        toast,
      ],
    );

  const handleToggleActive =
    useCallback(
      async (sector) => {
        const activate =
          sector.is_active === false;

        const confirmed =
          window.confirm(
            activate
              ? `Réactiver le secteur « ${sector.name} » ?`
              : `Désactiver le secteur « ${sector.name} » ? Les affectations existantes seront conservées.`,
          );

        if (!confirmed) {
          return;
        }

        try {
          if (activate) {
            await api.updateSector(
              sector.id,
              {
                is_active: true,
              },
            );
          } else {
            await api.deleteSector(
              sector.id,
            );
          }

          toast(
            activate
              ? 'Secteur réactivé.'
              : 'Secteur désactivé.',
            'success',
          );

          await loadData({
            manual: true,
          });
        } catch (error) {
          toast(
            errorMessage(
              error,
              'Impossible de modifier l’état du secteur.',
            ),
            'error',
          );
        }
      },
      [
        loadData,
        toast,
      ],
    );

  return (
    <div className="sv3-page">
      <SectorHeader
        connected={realtimeConnected}
        sectorCount={summary.total}
        technicianCount={
          summary.linkedTechnicians
        }
        jobCount={summary.jobsToday}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRefresh={() =>
          loadData({
            manual: true,
          })
        }
        refreshing={refreshing}
        onExport={() =>
          setExportOpen(true)
        }
        onCreate={openCreate}
        canManage={canManage}
      />

      {loadError && (
        <div
          className="sv3-notice"
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

      <div className="sv3-content">
        <SectorKpiStrip
          summary={summary}
          activeFilter={kpiFilter}
          onFilter={setKpiFilter}
        />

        <main className="sv3-workspace">
          <SectorRegistry
            sectors={filteredSectors}
            selectedId={selectedSectorId}
            onSelect={setSelectedSectorId}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            issueFilter={issueFilter}
            onIssueFilter={setIssueFilter}
            sortBy={sortBy}
            onSortBy={setSortBy}
            totalCount={enrichedSectors.length}
          />

          <SectorInspector
            sector={selectedSector}
            canManage={canManage}
            onEdit={openEdit}
            onToggleActive={
              handleToggleActive
            }
            onNavigate={onNavigate}
          />
        </main>
      </div>

      {editorOpen && (
        <SectorEditorModal
          sector={editorSector}
          saving={saving}
          error={editorError}
          onClose={closeEditor}
          onSave={handleSave}
        />
      )}

      {exportOpen && (
        <ExportCenter
          onClose={() =>
            setExportOpen(false)
          }
        />
      )}

      <div className="toast-container">
        {toasts.map((item) => (
          <Toast
            key={item.id}
            message={item.message}
            type={item.type}
          />
        ))}
      </div>

      {loading && (
        <div className="sv3-loading">
          Chargement du référentiel secteurs…
        </div>
      )}
    </div>
  );
}
