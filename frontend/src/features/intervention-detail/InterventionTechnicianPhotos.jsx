import { useMemo, useState } from 'react';

import { api } from '../../api/client';
import ImageAnnotationDialog from './ImageAnnotationDialog';
import { technicianMediaBucket } from './interventionEvidenceClassification';
import './intervention-technician-photos.css';

function PhotoIcon() {
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
      <rect x="3" y="5" width="18" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="2" />
      <path d="m5.5 18 4.8-4.8 3.2 3.2 2.2-2.2 2.8 3.8" />
    </svg>
  );
}

function formatCapturedAt(media) {
  const value = media?.captured_at ?? media?.created_at ?? media?.uploaded_at;
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export default function InterventionTechnicianPhotos({
  job,
  media = [],
  onRecordChanged,
}) {
  const photos = useMemo(
    () => (Array.isArray(media) ? media : []).filter(
      (item) => technicianMediaBucket(item) === 'photos',
    ),
    [media],
  );
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [annotationTarget, setAnnotationTarget] = useState(null);

  if (photos.length === 0) return null;

  const openPhoto = async (photo) => {
    setBusyId(photo.media_id);
    setError('');
    try {
      const response = await api.downloadTechnicianMedia(job.id, photo.media_id);
      const url = window.URL.createObjectURL(response.data);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.detail ||
          requestError?.message ||
          'Photo terrain indisponible.',
      );
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
      setError(
        requestError?.response?.data?.detail ||
          requestError?.message ||
          'Image indisponible pour annotation.',
      );
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
      const annotationOf = {
        asset_type: 'technician_media',
        asset_id: origin.media_id,
      };
      const form = new FormData();
      form.append('kind', 'photo');
      form.append('title', `Annotation — ${originLabel}`);
      form.append('comment', 'Annotation bureau conservant la photo terrain originale.');
      form.append('metadata', JSON.stringify({
        is_annotation: true,
        editor: 'bluevector_web_freehand_v1',
        annotation_of: annotationOf,
      }));
      form.append('file', blob, `annotation-${Date.now()}.png`);

      const uploaded = await api.uploadJobAttachment(job.id, form);
      const attachmentId = uploaded.data?.attachment_id;
      await api.addJobCommunication(job.id, {
        type: 'message',
        body: `Annotation ajoutée sur ${originLabel}`,
        audience: 'field',
        attachments: [{
          asset_type: 'office_attachment',
          asset_id: attachmentId,
          role: 'annotation',
          annotation_of: annotationOf,
        }],
      });

      setAnnotationTarget(null);
      if (typeof onRecordChanged === 'function') onRecordChanged();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.detail ||
          requestError?.message ||
          'Annotation impossible.',
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="intervention-detail-card intervention-tech-photos">
      <header className="intervention-detail-card-header">
        <div>
          <span>Preuves synchronisées</span>
          <h2>Photos terrain</h2>
        </div>
        <span className="intervention-detail-card-count">{photos.length}</span>
      </header>

      <div className="intervention-tech-photos__body">
        {error ? <div className="intervention-tech-photos__error">{error}</div> : null}
        <div className="intervention-tech-photos__grid">
          {photos.map((photo) => {
            const busy = busyId === photo.media_id;
            const capturedAt = formatCapturedAt(photo);
            return (
              <article key={photo.media_id} className="intervention-tech-photo">
                <span className="intervention-tech-photo__icon"><PhotoIcon /></span>
                <div className="intervention-tech-photo__copy">
                  <strong>{photo.title || photo.filename || `Photo #${photo.media_id}`}</strong>
                  <small>
                    {[photo.technician_name || 'Technicien terrain', capturedAt]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </div>
                <div className="intervention-tech-photo__actions">
                  <button type="button" disabled={busy} onClick={() => openPhoto(photo)}>
                    {busy ? 'Chargement…' : 'Ouvrir'}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !photo.mime_type?.startsWith('image/')}
                    onClick={() => beginAnnotation(photo)}
                  >
                    Annoter
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {annotationTarget ? (
        <ImageAnnotationDialog
          blob={annotationTarget.blob}
          title={annotationTarget.filename || 'Photo terrain'}
          onCancel={() => setAnnotationTarget(null)}
          onSave={saveAnnotation}
        />
      ) : null}
    </section>
  );
}
