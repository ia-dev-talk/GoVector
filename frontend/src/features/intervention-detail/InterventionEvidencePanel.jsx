import { useMemo, useState } from 'react';

import { api } from '../../api/client';
import {
  buildFileUrl,
  extractEquipment,
  extractStockCounts,
  finiteNumber,
  text,
} from './interventionDetailUtils';

const PHOTO_FIELDS = [
  { field: 'before_photo', label: 'Avant' },
  { field: 'during_photo', label: 'Pendant' },
  { field: 'after_photo', label: 'Après' },
];

const DOCUMENT_FIELDS = [
  { field: 'client_signature', label: 'Signature client' },
  { field: 'report_document', label: 'Compte rendu' },
  { field: 'report_pdf', label: 'Rapport PDF' },
  { field: 'work_report', label: 'Rapport terrain' },
  { field: 'attachment', label: 'Pièce jointe' },
];

function FileIcon() {
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
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

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

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 8 4 4 4-4" />
    </svg>
  );
}

function ModuleSection({
  title,
  count,
  emptyLabel,
  hasContent,
  defaultOpen = false,
  children,
}) {
  if (!hasContent) {
    return (
      <section className="intervention-detail-evidence-section intervention-detail-evidence-section--empty">
        <div className="intervention-detail-evidence-summary">
          <div>
            <h3>{title}</h3>
            <small>{emptyLabel}</small>
          </div>

          <span>{count ?? 0}</span>
        </div>
      </section>
    );
  }

  return (
    <details
      className="intervention-detail-evidence-section intervention-detail-evidence-section--expandable"
      open={defaultOpen}
    >
      <summary className="intervention-detail-evidence-summary">
        <div>
          <h3>{title}</h3>
          <small>Données disponibles</small>
        </div>

        <span>{count ?? 0}</span>
        <ChevronIcon />
      </summary>

      <div className="intervention-detail-evidence-content">
        {children}
      </div>
    </details>
  );
}

export default function InterventionEvidencePanel({
  job,
  equipment,
  stock,
  fieldRecord,
  equipmentError = '',
  stockError = '',
  fieldRecordError = '',
  onRecordChanged,
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const photos = PHOTO_FIELDS
    .map((item) => ({
      ...item,
      url: buildFileUrl(job?.[item.field]),
    }))
    .filter((item) => item.url);

  const documents = DOCUMENT_FIELDS
    .map((item) => ({
      ...item,
      url: buildFileUrl(job?.[item.field]),
    }))
    .filter((item) => item.url);

  const equipmentEntries = extractEquipment(job, equipment);
  const stockCounts = extractStockCounts(stock);
  const fieldActions = useMemo(
    () => (Array.isArray(fieldRecord?.field_actions) ? fieldRecord.field_actions : []),
    [fieldRecord?.field_actions],
  );
  const technicianMedia = Array.isArray(fieldRecord?.technician_media)
    ? fieldRecord.technician_media
    : [];
  const officeAttachments = Array.isArray(fieldRecord?.office_attachments)
    ? fieldRecord.office_attachments
    : [];
  const siteObservations = Array.isArray(fieldRecord?.site_observations)
    ? fieldRecord.site_observations
    : [];
  const officeNotes = Array.isArray(fieldRecord?.office_notes)
    ? fieldRecord.office_notes
    : [];
  const communications = Array.isArray(fieldRecord?.communications)
    ? fieldRecord.communications
    : [];

  const actionMeasurements = useMemo(
    () => fieldActions.filter((item) =>
      ['field_measurement', 'otdr_measurement'].includes(item?.type),
    ),
    [fieldActions],
  );

  const actionNotes = useMemo(
    () => fieldActions.filter((item) =>
      [
        'intervention_comment',
        'custom_intervention_action',
        'incident_report',
        'installation_work',
        'network_reference',
        'material_used',
        'equipment_scan',
        'client_call',
      ].includes(item?.type),
    ),
    [fieldActions],
  );

  const measurements = [
    {
      label: 'Puissance optique',
      value:
        finiteNumber(job?.optical_power_dbm) !== null
          ? `${finiteNumber(job.optical_power_dbm)} dBm`
          : '',
    },
    {
      label: 'Longueur câble',
      value:
        finiteNumber(job?.cable_length_m) !== null
          ? `${finiteNumber(job.cable_length_m)} m`
          : '',
    },
    {
      label: 'État PTO',
      value: text(job?.etat_pto),
    },
    {
      label: 'État câble',
      value: text(job?.etat_cable),
    },
  ].filter((item) => item.value);

  const comments = [
    {
      label: 'Coordination',
      value: text(job?.coordinator_comments),
    },
    {
      label: 'Terrain',
      value:
        text(job?.technician_comments) ||
        text(job?.field_comments),
    },
    {
      label: 'Anomalies',
      value: text(job?.anomalies),
    },
  ].filter((item) => item.value);

  const totalEvidence =
    photos.length +
    measurements.length +
    documents.length +
    equipmentEntries.length +
    stockCounts.length +
    comments.length +
    fieldActions.length +
    technicianMedia.length +
    officeAttachments.length +
    siteObservations.length +
    communications.length;

  const openBlob = async (request) => {
    const response = await request();
    const url = window.URL.createObjectURL(response.data);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  };

  const handleAttachmentUpload = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.namedItem('file')?.files?.[0];
    if (!file) return;
    const data = new FormData();
    data.append('kind', form.elements.namedItem('kind')?.value || 'document');
    data.append('title', form.elements.namedItem('title')?.value || file.name);
    data.append('comment', form.elements.namedItem('comment')?.value || '');
    data.append('file', file);
    setUploading(true);
    setUploadError('');
    try {
      await api.uploadJobAttachment(job.id, data);
      form.reset();
      if (typeof onRecordChanged === 'function') onRecordChanged();
    } catch (error) {
      setUploadError(
        error?.response?.data?.detail ||
          error?.message ||
          'Téléversement impossible.',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleOfficeNote = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = form.elements.namedItem('office_note')?.value?.trim();
    if (!value) return;
    setUploading(true);
    setUploadError('');
    try {
      await api.addJobCommunication(job.id, {
        type: form.elements.namedItem('message_type')?.value || 'instruction',
        body: value,
        audience: 'field',
        requires_action:
          form.elements.namedItem('message_type')?.value === 'correction_request',
      });
      form.reset();
      if (typeof onRecordChanged === 'function') onRecordChanged();
    } catch (error) {
      setUploadError(
        error?.response?.data?.detail || error?.message || 'Commentaire impossible.',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleResolveCommunication = async (communicationId) => {
    setUploading(true);
    setUploadError('');
    try {
      await api.resolveJobCommunication(job.id, communicationId);
      if (typeof onRecordChanged === 'function') onRecordChanged();
    } catch (error) {
      setUploadError(
        error?.response?.data?.detail || error?.message || 'Résolution impossible.',
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <aside className="intervention-detail-card intervention-detail-evidence-card">
      <header className="intervention-detail-card-header">
        <div>
          <span>Exécution terrain</span>
          <h2>Preuves et données</h2>
        </div>

        <span className="intervention-detail-card-count">
          {totalEvidence}
        </span>
      </header>

      <div className="intervention-detail-card-body intervention-detail-evidence-body">
        <ModuleSection
          title="Photos"
          count={photos.length}
          emptyLabel="Aucune preuve enregistrée"
          hasContent={photos.length > 0}
        >
          <div className="intervention-detail-file-list">
            {photos.map((photo) => (
              <a
                key={photo.field}
                className="intervention-detail-file-link"
                href={photo.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="intervention-detail-file-icon">
                  <PhotoIcon />
                </span>
                <span>
                  <strong>Photo {photo.label}</strong>
                  <small>Ouvrir la preuve</small>
                </span>
              </a>
            ))}
          </div>
        </ModuleSection>

        <ModuleSection
          title="Mesures"
          count={measurements.length + actionMeasurements.length}
          emptyLabel="Aucune mesure terrain"
          hasContent={measurements.length + actionMeasurements.length > 0}
        >
          <div className="intervention-detail-measure-grid">
            {measurements.map((measurement) => (
              <div key={measurement.label}>
                <span>{measurement.label}</span>
                <strong>{measurement.value}</strong>
              </div>
            ))}
            {actionMeasurements.map((item) => (
              <div key={`action-measure-${item.id}`}>
                <span>{item.payload?.measurement_type || item.payload?.type || 'Mesure'}</span>
                <strong>{item.payload?.value ?? '—'} {item.payload?.unit || ''}</strong>
              </div>
            ))}
          </div>
        </ModuleSection>

        <ModuleSection
          title="Documents"
          count={documents.length + officeAttachments.length}
          emptyLabel="Aucun document"
          hasContent={documents.length + officeAttachments.length > 0}
        >
          <div className="intervention-detail-file-list">
            {documents.map((document) => (
              <a
                key={document.field}
                className="intervention-detail-file-link"
                href={document.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="intervention-detail-file-icon">
                  <FileIcon />
                </span>
                <span>
                  <strong>{document.label}</strong>
                  <small>Ouvrir le document</small>
                </span>
              </a>
            ))}
            {officeAttachments.map((document) => (
              <button
                key={document.attachment_id}
                type="button"
                className="intervention-detail-file-link"
                onClick={() => openBlob(() =>
                  api.downloadJobAttachment(job.id, document.attachment_id),
                )}
              >
                <span className="intervention-detail-file-icon"><FileIcon /></span>
                <span>
                  <strong>{document.title || document.filename || 'Pièce bureau'}</strong>
                  <small>{document.comment || 'Ouvrir la pièce jointe'}</small>
                </span>
              </button>
            ))}
          </div>
        </ModuleSection>

        <ModuleSection
          title="Médias terrain"
          count={technicianMedia.length}
          emptyLabel="Aucun média terrain"
          hasContent={technicianMedia.length > 0}
        >
          <div className="intervention-detail-file-list">
            {technicianMedia.map((media) => (
              <button
                key={media.media_id}
                type="button"
                className="intervention-detail-file-link"
                onClick={() => openBlob(() =>
                  api.downloadTechnicianMedia(job.id, media.media_id),
                )}
              >
                <span className="intervention-detail-file-icon">
                  {media.kind === 'photo' ? <PhotoIcon /> : <FileIcon />}
                </span>
                <span>
                  <strong>{media.filename || media.kind}</strong>
                  <small>{media.technician_name || 'Technicien terrain'}</small>
                </span>
              </button>
            ))}
          </div>
        </ModuleSection>

        <ModuleSection
          title="Repères terrain"
          count={siteObservations.length}
          emptyLabel="Aucun repère terrain confirmé"
          hasContent={siteObservations.length > 0}
        >
          <div className="intervention-detail-comment-list">
            {siteObservations.map((item) => (
              <article key={`site-${item.id}`}>
                <span>{item.type === 'site_location' ? 'Position du site' : item.type === 'cable_entry' ? 'Entrée câble' : 'Sortie câble'}</span>
                <p>{item.latitude}, {item.longitude}{item.accuracy_m != null ? ` · ±${Math.round(item.accuracy_m)} m` : ''}</p>
                {item.note ? <small>{item.note}</small> : null}
              </article>
            ))}
          </div>
        </ModuleSection>

        <ModuleSection
          title="Équipements"
          count={equipmentEntries.length}
          emptyLabel={
            equipmentError ||
            'Aucun équipement'
          }
          hasContent={
            equipmentEntries.length > 0 ||
            Boolean(equipmentError)
          }
          defaultOpen={Boolean(equipmentError)}
        >
          {equipmentError ? (
            <p className="intervention-detail-evidence-error">
              {equipmentError}
            </p>
          ) : null}

          {equipmentEntries.length > 0 ? (
            <div className="intervention-detail-equipment-list">
              {equipmentEntries.map((item) => (
                <div key={`${item.label}-${item.value}`}>
                  <span>{item.label}</span>
                  <strong className={item.mono ? 'is-mono' : undefined}>
                    {item.value}
                  </strong>
                </div>
              ))}
            </div>
          ) : null}
        </ModuleSection>

        <ModuleSection
          title="Stock associé"
          count={stockCounts.length}
          emptyLabel={
            stockError ||
            'Aucun mouvement associé'
          }
          hasContent={
            stockCounts.length > 0 ||
            Boolean(stockError)
          }
          defaultOpen={Boolean(stockError)}
        >
          {stockError ? (
            <p className="intervention-detail-evidence-error">
              {stockError}
            </p>
          ) : null}

          {stockCounts.length > 0 ? (
            <div className="intervention-detail-stock-list">
              {stockCounts.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </ModuleSection>

        <ModuleSection
          title="Échanges bureau ↔ terrain"
          count={communications.length}
          emptyLabel="Aucun échange opérationnel"
          hasContent={communications.length > 0}
          defaultOpen={communications.some((item) => item.requires_action && item.status === 'open')}
        >
          <div className="intervention-detail-comment-list">
            {communications.map((item) => (
              <article key={`communication-${item.id}`}>
                <span>
                  {item.type === 'correction_request'
                    ? 'Correction demandée'
                    : item.type === 'instruction'
                      ? 'Instruction bureau'
                      : item.type === 'reply'
                        ? 'Réponse terrain'
                        : item.type === 'acknowledgement'
                          ? 'Pris en compte'
                          : 'Message'}
                  {' · '}{item.author_name || item.author_role}
                </span>
                <p>{item.body || 'Message pris en compte'}</p>
                <small>
                  {item.requires_action && item.status === 'open'
                    ? 'Action attendue du terrain'
                    : item.status === 'acknowledged'
                      ? 'Pris en compte'
                      : 'Information enregistrée'}
                </small>
                {item.requires_action && item.status !== 'resolved' ? (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={uploading}
                    onClick={() => handleResolveCommunication(item.id)}
                  >
                    Marquer comme résolue
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </ModuleSection>

        <ModuleSection
          title="Commentaires"
          count={comments.length + actionNotes.length + officeNotes.length}
          emptyLabel="Aucun commentaire"
          hasContent={comments.length + actionNotes.length + officeNotes.length > 0}
        >
          <div className="intervention-detail-comment-list">
            {officeNotes.map((note) => (
              <article key={`office-note-${note.id}`}>
                <span>Instruction bureau</span>
                <p>{note.text}</p>
              </article>
            ))}
            {comments.map((comment) => (
              <article key={comment.label}>
                <span>{comment.label}</span>
                <p>{comment.value}</p>
              </article>
            ))}
            {actionNotes.map((item) => (
              <article key={`field-action-${item.id}`}>
                <span>{item.type.replaceAll('_', ' ')}</span>
                <p>{item.payload?.value || item.payload?.comment || item.payload?.note || item.payload?.reference || item.payload?.code || 'Action enregistrée'}</p>
                <small>{item.technician_name || 'Technicien terrain'}</small>
              </article>
            ))}
          </div>
        </ModuleSection>

        <ModuleSection
          title="Préparation bureau"
          count={officeAttachments.length}
          emptyLabel="Ajouter un plan, une photo ou un document"
          hasContent
          defaultOpen
        >
          <form className="intervention-detail-upload-form" onSubmit={handleOfficeNote}>
            <select name="message_type" defaultValue="instruction" aria-label="Type de message">
              <option value="instruction">Instruction</option>
              <option value="correction_request">Demande de correction</option>
              <option value="message">Message</option>
            </select>
            <input
              name="office_note"
              type="text"
              required
              placeholder="Information à transmettre au technicien"
            />
            <button type="submit" className="btn btn--primary" disabled={uploading}>
              Ajouter le commentaire
            </button>
          </form>
          <form className="intervention-detail-upload-form" onSubmit={handleAttachmentUpload}>
            <select name="kind" defaultValue="plan" aria-label="Type de pièce">
              <option value="plan">Plan</option>
              <option value="photo">Photo</option>
              <option value="document">Document</option>
              <option value="instruction">Instruction</option>
            </select>
            <input name="title" type="text" placeholder="Titre (optionnel)" />
            <input name="comment" type="text" placeholder="Commentaire pour le technicien" />
            <input name="file" type="file" required accept="image/*,.pdf,.txt,.doc,.docx" />
            <button type="submit" className="btn btn--primary" disabled={uploading}>
              {uploading ? 'Envoi…' : 'Partager avec le terrain'}
            </button>
            {uploadError ? <p className="intervention-detail-evidence-error">{uploadError}</p> : null}
            {fieldRecordError ? <p className="intervention-detail-evidence-error">{fieldRecordError}</p> : null}
          </form>
        </ModuleSection>
      </div>
    </aside>
  );
}
