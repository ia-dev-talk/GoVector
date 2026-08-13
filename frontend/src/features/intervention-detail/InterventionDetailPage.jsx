import { useCallback, useEffect, useRef, useState } from 'react';

import { api, apiClient } from '../../api/client';
import ValidationPanel from '../../components/ValidationPanel';
import { jobAllowsCommand } from '../../lib/workflow-capabilities';
import InterventionDetailHeader from './InterventionDetailHeader';
import InterventionEvidencePanel from './InterventionEvidencePanel';
import InterventionFieldSummary from './InterventionFieldSummary';
import InterventionGraphicalTools from './InterventionGraphicalTools';
import InterventionMapCard from './InterventionMapCard';
import InterventionOverview from './InterventionOverview';
import InterventionTechnicianPhotos from './InterventionTechnicianPhotos';
import InterventionTimeline from './InterventionTimeline';
import { getApiErrorMessage, identifier, isRecord } from './interventionDetailUtils';
import '../../styles/intervention-detail.css';

function LoadingScreen() {
  return (
    <div className="intervention-detail-loading-screen" role="status">
      <span className="intervention-detail-spinner" aria-hidden="true" />
      <strong>Chargement de la fiche intervention</strong>
      <span>Récupération des données métier et de la traçabilité…</span>
    </div>
  );
}

function friendlyApiError(error, fallback) {
  const resolved = getApiErrorMessage(error, fallback);
  if (/^request failed with status code\s+\d+/i.test(resolved)) return fallback;
  if (/^network error$/i.test(resolved) || /^failed to fetch$/i.test(resolved)) return fallback;
  return resolved || fallback;
}

export default function InterventionDetailPage({
  initialJob,
  refreshRevision = 0,
  onBack,
  onEdit,
  onManageAssignment,
  onJobLoaded,
}) {
  const initialJobId = identifier(initialJob?.id);
  const [job, setJob] = useState(() => (isRecord(initialJob) ? initialJob : null));
  const [timeline, setTimeline] = useState([]);
  const [equipment, setEquipment] = useState(null);
  const [stock, setStock] = useState(null);
  const [fieldRecord, setFieldRecord] = useState(null);
  const [workflowCapabilities, setWorkflowCapabilities] = useState(null);
  const [validationOpen, setValidationOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(Boolean(initialJobId));
  const [refreshing, setRefreshing] = useState(false);
  const [jobError, setJobError] = useState('');
  const [timelineError, setTimelineError] = useState('');
  const [equipmentError, setEquipmentError] = useState('');
  const [stockError, setStockError] = useState('');
  const [fieldRecordError, setFieldRecordError] = useState('');
  const requestSequenceRef = useRef(0);

  const jobId = initialJobId || identifier(job?.id);

  const refreshData = useCallback(async ({ manual = false } = {}) => {
    if (!jobId) {
      setJobError('Identifiant d’intervention indisponible.');
      setInitialLoading(false);
      return;
    }

    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    if (manual) setRefreshing(true);
    setJobError('');
    setTimelineError('');
    setEquipmentError('');
    setStockError('');
    setFieldRecordError('');
    setFieldRecord(null);

    const results = await Promise.allSettled([
      api.getJob(jobId),
      api.getJobTimeline(jobId),
      api.getJobEquipment(jobId),
      apiClient.get(`/stock-ftth/job-context/${encodeURIComponent(jobId)}`),
      api.getJobFieldRecord(jobId),
      api.getJobWorkflowCapabilities(jobId),
    ]);
    if (requestSequence !== requestSequenceRef.current) return;

    const [jobResult, timelineResult, equipmentResult, stockResult, fieldResult, workflowResult] = results;

    if (jobResult.status === 'fulfilled' && isRecord(jobResult.value?.data)) {
      const loadedJob = jobResult.value.data;
      setJob(loadedJob);
      onJobLoaded?.(loadedJob);
    } else {
      setJobError(friendlyApiError(
        jobResult.status === 'rejected' ? jobResult.reason : null,
        'Impossible de charger les dernières données de l’intervention.',
      ));
    }

    if (timelineResult.status === 'fulfilled' && Array.isArray(timelineResult.value?.data)) {
      setTimeline(timelineResult.value.data);
    } else {
      setTimelineError(friendlyApiError(
        timelineResult.status === 'rejected' ? timelineResult.reason : null,
        'Historique serveur temporairement indisponible.',
      ));
    }

    if (equipmentResult.status === 'fulfilled') setEquipment(equipmentResult.value?.data ?? null);
    else setEquipmentError(friendlyApiError(equipmentResult.reason, 'Équipements associés temporairement indisponibles.'));

    if (stockResult.status === 'fulfilled') setStock(stockResult.value?.data ?? null);
    else setStockError(friendlyApiError(stockResult.reason, 'Stock du technicien temporairement indisponible.'));

    if (fieldResult.status === 'fulfilled' && isRecord(fieldResult.value?.data)) {
      setFieldRecord(fieldResult.value.data);
    } else {
      setFieldRecordError(friendlyApiError(
        fieldResult.status === 'rejected' ? fieldResult.reason : null,
        'Actions et médias terrain temporairement indisponibles.',
      ));
    }

    setWorkflowCapabilities(
      workflowResult.status === 'fulfilled' && isRecord(workflowResult.value?.data)
        ? workflowResult.value.data
        : null,
    );
    setInitialLoading(false);
    setRefreshing(false);
  }, [jobId, onJobLoaded]);

  useEffect(() => {
    const timer = window.setTimeout(() => refreshData(), 0);
    return () => {
      window.clearTimeout(timer);
      requestSequenceRef.current += 1;
    };
  }, [refreshData, refreshRevision]);

  if (initialLoading && !job) return <LoadingScreen />;

  if (!job) {
    return (
      <div className="intervention-detail-fatal-state">
        <strong>Intervention introuvable</strong>
        <span>{jobError || 'Aucune donnée exploitable n’a été reçue.'}</span>
        <button type="button" className="btn btn--primary" onClick={onBack}>Retour aux interventions</button>
      </div>
    );
  }

  const technicianMedia = Array.isArray(fieldRecord?.technician_media)
    ? fieldRecord.technician_media
    : [];
  const evidenceFieldRecord = isRecord(fieldRecord)
    ? { ...fieldRecord, technician_media: [] }
    : fieldRecord;
  const canValidate = jobAllowsCommand(workflowCapabilities, 'validate');
  const relatedErrors = [timelineError, equipmentError, stockError, fieldRecordError].filter(Boolean);

  return (
    <>
      <div className="intervention-detail-page">
        <InterventionDetailHeader
          job={job}
          refreshing={refreshing}
          onBack={onBack}
          onRefresh={() => refreshData({ manual: true })}
          onEdit={onEdit}
          onManageAssignment={onManageAssignment}
          onValidate={canValidate ? () => setValidationOpen(true) : undefined}
        />

        {jobError ? (
          <div className="intervention-detail-page-notice" role="alert">
            <div><strong>Données principales partiellement actualisées</strong><span>{jobError}</span></div>
            <button type="button" className="intervention-detail-text-button" onClick={() => refreshData({ manual: true })} disabled={refreshing}>Réessayer</button>
          </div>
        ) : relatedErrors.length > 0 ? (
          <div className="intervention-detail-page-notice" role="status">
            <div>
              <strong>Fiche utilisable · {relatedErrors.length} source{relatedErrors.length > 1 ? 's' : ''} liée{relatedErrors.length > 1 ? 's' : ''} à actualiser</strong>
              <span>Les données disponibles restent affichées. Relancez l’actualisation pour récupérer les blocs manquants.</span>
            </div>
            <button type="button" className="intervention-detail-text-button" onClick={() => refreshData({ manual: true })} disabled={refreshing}>{refreshing ? 'Actualisation…' : 'Réessayer'}</button>
          </div>
        ) : null}

        <InterventionGraphicalTools job={job} onSaved={() => refreshData({ manual: true })} />
        <InterventionFieldSummary job={job} fieldRecord={fieldRecord} />

        <main className="intervention-detail-layout">
          <div className="intervention-detail-rail intervention-detail-timeline-rail">
            <InterventionTimeline
              job={job}
              activities={timeline}
              loading={initialLoading || refreshing}
              error={timelineError}
              onRetry={() => refreshData({ manual: true })}
            />
          </div>

          <div className="intervention-detail-center">
            <InterventionOverview job={job} assignmentContext={stock} />
            <InterventionMapCard job={job} fieldReference={fieldRecord?.field_reference_location} />
          </div>

          <div className="intervention-detail-rail intervention-detail-evidence-rail">
            <InterventionTechnicianPhotos
              job={job}
              media={technicianMedia}
              onRecordChanged={() => refreshData({ manual: true })}
            />
            <InterventionEvidencePanel
              job={job}
              equipment={equipment}
              stock={stock}
              fieldRecord={evidenceFieldRecord}
              equipmentError={equipmentError}
              stockError={stockError}
              fieldRecordError={fieldRecordError}
              onRecordChanged={() => refreshData({ manual: true })}
            />
          </div>
        </main>
      </div>

      {validationOpen ? (
        <ValidationPanel
          job={job}
          onClose={() => setValidationOpen(false)}
          onValidated={async () => {
            setValidationOpen(false);
            await refreshData({ manual: true });
          }}
        />
      ) : null}
    </>
  );
}
