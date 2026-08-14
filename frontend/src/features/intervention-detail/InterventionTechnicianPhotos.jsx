import { useMemo, useState } from 'react';

import { api } from '../../api/client';
import ImageAnnotationDialog from './ImageAnnotationDialog';
import { classifyTechnicianMedia } from './interventionEvidenceClassification';
import './intervention-technician-photos.css';

const GROUPS = Object.freeze([
  ['photos', 'Photos'],
  ['sketches', 'Croquis terrain'],
  ['videos', 'Vidéos'],
  ['documents', 'Documents'],
  ['signatures', 'Signature client'],
  ['other', 'Autres preuves'],
]);

function EvidenceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="15" rx="2.5" />
      <path d="M7 10h10M7 14h7" />
    </svg>
  );
}

function formatCapturedAt(media) {
  const value = media?.captured_at ?? media?.created_at ?? media?.uploaded_at;
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export default function InterventionTechnicianPhotos({ job, media = [], onRecordChanged }) {
  const buckets = useMemo(
    () => classifyTechnicianMedia(Array.isArray(media) ? media : []),
    [media],
  );
  const groups = useMemo(
    () => GROUPS.map(([key, label]) => ({ key, label, items: buckets[key] ?? [] }))
      .filter((group) => group.items.length > 0),
    [buckets],
  );
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [annotationTarget, setAnnotationTarget] = useState(null);

  if (groups.length === 0) return null;

  const openMedia = async (item) => {
    setBusyId(item.media_id);
    setError('');
    try {
      const response = await api.downloadTechnicianMedia(job.id, item.media_id);
      const url = window.URL.createObjectURL(response.data);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || requestError?.message || 'Preuve terrain indisponible.');
    } finally {
      setBusyId(null);
    }
  };

  const beginAnnotation = async (photo) => {
    setBusyId(photo.media_id);
    setError('');
    try {
      const response = await api.downloadTechnicianMedia(job.id, photo.media_id);
      setAnnotationTarget({ ...photo, blob: response.data });
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || requestError?.message || 'Image indisponible pour annotation.');
    } finally {
      setBusyId(null);
    }
  };

  const saveAnnotation = async (blob) => {
    const origin = annotationTarget;
    if (!origin) return;
    setBusyId(origin.media_id);
    setError('');
    try {
      const originLabel = origin.filename || `photo-${origin.media_id}`;
      const annotationOf = { asset_type: 'technician_media', asset_id: origin.media_id };
      const form = new FormData();
      form.append('kind', 'photo');
      form.append('title', `Annotation — ${originLabel}`);
      form.append('comment', 'Annotation bureau conservant la photo terrain originale.');
      form.append('metadata', JSON.stringify({ is_annotation: true, editor: 'bluevector_web_freehand_v1', annotation_of: annotationOf }));
      form.append('file', blob, `annotation-${Date.now()}.png`);
      const uploaded = await api.uploadJobAttachment(job.id, form);
      await api.addJobCommunication(job.id, {
        type: 'message',
        body: `Annotation ajoutée sur ${originLabel}`,
        audience: 'field',
        attachments: [{ asset_type: 'office_attachment', asset_id: uploaded.data?.attachment_id, role: 'annotation', annotation_of: annotationOf }],
      });
      setAnnotationTarget(null);
      onRecordChanged?.();
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || requestError?.message || 'Annotation impossible.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {error ? <div className="intervention-tech-photos__error">{error}</div> : null}
      {groups.map((group) => (
        <section
          className={`intervention-detail-card intervention-tech-evidence-card intervention-tech-evidence-card--${group.key}`}
          key={group.key}
        >
          <header className="intervention-detail-card-header">
            <div>
              <span>Preuves synchronisées</span>
              <h2>{group.label}</h2>
            </div>
            <span className="intervention-detail-card-count">{group.items.length}</span>
          </header>
          <div className="intervention-tech-photos__body">
            <div className="intervention-tech-photos__grid">
              {group.items.map((item) => {
                const busy = busyId === item.media_id;
                const capturedAt = formatCapturedAt(item);
                const canAnnotate = group.key === 'photos' && item.mime_type?.startsWith('image/');
                return (
                  <article key={item.media_id} className="intervention-tech-photo">
                    <span className={`intervention-tech-photo__icon intervention-tech-photo__icon--${group.key}`}><EvidenceIcon /></span>
                    <div className="intervention-tech-photo__copy">
                      <strong>{item.title || item.filename || `${group.label} #${item.media_id}`}</strong>
                      <small>{[item.technician_name || 'Technicien terrain', capturedAt].filter(Boolean).join(' · ')}</small>
                    </div>
                    <div className="intervention-tech-photo__actions">
                      <button type="button" disabled={busy} onClick={() => openMedia(item)}>{busy ? 'Chargement…' : 'Ouvrir'}</button>
                      {canAnnotate ? <button type="button" disabled={busy} onClick={() => beginAnnotation(item)}>Annoter</button> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ))}
      {annotationTarget ? (
        <ImageAnnotationDialog blob={annotationTarget.blob} title={annotationTarget.filename || 'Photo terrain'} onCancel={() => setAnnotationTarget(null)} onSave={saveAnnotation} />
      ) : null}
    </>
  );
}
