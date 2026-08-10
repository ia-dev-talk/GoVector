import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { api } from '../../api/client';
import InterventionDetailHeader from './InterventionDetailHeader';
import InterventionEvidencePanel from './InterventionEvidencePanel';
import InterventionMapCard from './InterventionMapCard';
import InterventionOverview from './InterventionOverview';
import InterventionTimeline from './InterventionTimeline';
import {
  getApiErrorMessage,
  identifier,
  isRecord,
} from './interventionDetailUtils';
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

export default function InterventionDetailPage({
  initialJob,
  refreshRevision = 0,
  onBack,
  onEdit,
  onManageAssignment,
  onJobLoaded,
}) {
  const initialJobId = identifier(initialJob?.id);
  const [job, setJob] = useState(() =>
    isRecord(initialJob) ? initialJob : null,
  );
  const [timeline, setTimeline] = useState([]);
  const [equipment, setEquipment] = useState(null);
  const [stock, setStock] = useState(null);
  const [fieldRecord, setFieldRecord] = useState(null);
  const [initialLoading, setInitialLoading] = useState(Boolean(initialJobId));
  const [refreshing, setRefreshing] = useState(false);
  const [jobError, setJobError] = useState('');
  const [timelineError, setTimelineError] = useState('');
  const [equipmentError, setEquipmentError] = useState('');
  const [stockError, setStockError] = useState('');
  const [fieldRecordError, setFieldRecordError] = useState('');
  const requestSequenceRef = useRef(0);

  const jobId = initialJobId || identifier(job?.id);

  const refreshData = useCallback(
    async ({ manual = false } = {}) => {
      if (!jobId) {
        setJobError('Identifiant d’intervention indisponible.');
        setInitialLoading(false);
        return;
      }

      const requestSequence = requestSequenceRef.current + 1;
      requestSequenceRef.current = requestSequence;

      if (manual) {
        setRefreshing(true);
      }

      setJobError('');
      setTimelineError('');
      setEquipmentError('');
      setStockError('');
      setFieldRecordError('');
      setFieldRecord(null);

      const [jobResult, timelineResult, equipmentResult, stockResult, fieldRecordResult] =
        await Promise.allSettled([
          api.getJob(jobId),
          api.getJobTimeline(jobId),
          api.getJobEquipment(jobId),
          api.getJobStock(jobId),
          api.getJobFieldRecord(jobId),
        ]);

      if (requestSequence !== requestSequenceRef.current) {
        return;
      }

      if (
        jobResult.status === 'fulfilled' &&
        isRecord(jobResult.value?.data)
      ) {
        const loadedJob = jobResult.value.data;
        setJob(loadedJob);

        if (typeof onJobLoaded === 'function') {
          onJobLoaded(loadedJob);
        }
      } else {
        setJobError(
          getApiErrorMessage(
            jobResult.status === 'rejected' ? jobResult.reason : null,
            'Impossible de charger les dernières données de l’intervention.',
          ),
        );
      }

      if (
        timelineResult.status === 'fulfilled' &&
        Array.isArray(timelineResult.value?.data)
      ) {
        setTimeline(timelineResult.value.data);
      } else {
        setTimelineError(
          getApiErrorMessage(
            timelineResult.status === 'rejected'
              ? timelineResult.reason
              : null,
            'Impossible de charger la timeline de l’intervention.',
          ),
        );
      }

      if (equipmentResult.status === 'fulfilled') {
        setEquipment(equipmentResult.value?.data ?? null);
      } else {
        setEquipmentError(
          getApiErrorMessage(
            equipmentResult.reason,
            'Impossible de charger les équipements associés.',
          ),
        );
      }

      if (stockResult.status === 'fulfilled') {
        setStock(stockResult.value?.data ?? null);
      } else {
        setStockError(
          getApiErrorMessage(
            stockResult.reason,
            'Impossible de charger le stock associé.',
          ),
        );
      }

      if (
        fieldRecordResult.status === 'fulfilled' &&
        isRecord(fieldRecordResult.value?.data)
      ) {
        setFieldRecord(fieldRecordResult.value.data);
      } else {
        setFieldRecordError(
          getApiErrorMessage(
            fieldRecordResult.status === 'rejected'
              ? fieldRecordResult.reason
              : null,
            'Impossible de charger les actions et médias terrain.',
          ),
        );
      }

      setInitialLoading(false);
      setRefreshing(false);
    },
    [jobId, onJobLoaded],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshData();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      requestSequenceRef.current += 1;
    };
  }, [refreshData, refreshRevision]);

  if (initialLoading && !job) {
    return <LoadingScreen />;
  }

  if (!job) {
    return (
      <div className="intervention-detail-fatal-state">
        <strong>Intervention introuvable</strong>
        <span>
          {jobError || 'Aucune donnée exploitable n’a été reçue.'}
        </span>
        <button type="button" className="btn btn--primary" onClick={onBack}>
          Retour aux interventions
        </button>
      </div>
    );
  }

  return (
    <div className="intervention-detail-page">
      <InterventionDetailHeader
        job={job}
        refreshing={refreshing}
        onBack={onBack}
        onRefresh={() => refreshData({ manual: true })}
        onEdit={onEdit}
        onManageAssignment={onManageAssignment}
      />

      {jobError ? (
        <div className="intervention-detail-page-notice" role="alert">
          <div>
            <strong>Données partiellement actualisées</strong>
            <span>{jobError}</span>
          </div>

          <button
            type="button"
            className="intervention-detail-text-button"
            onClick={() => refreshData({ manual: true })}
            disabled={refreshing}
          >
            Réessayer
          </button>
        </div>
      ) : null}

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
          <InterventionOverview job={job} />
          <InterventionMapCard
            job={job}
            fieldReference={fieldRecord?.field_reference_location}
          />
        </div>

        <div className="intervention-detail-rail intervention-detail-evidence-rail">
          <InterventionEvidencePanel
            job={job}
            equipment={equipment}
            stock={stock}
            fieldRecord={fieldRecord}
            equipmentError={equipmentError}
            stockError={stockError}
            fieldRecordError={fieldRecordError}
            onRecordChanged={() => refreshData({ manual: true })}
          />
        </div>
      </main>
    </div>
  );
}
