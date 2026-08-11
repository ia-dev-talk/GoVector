import { useMemo, useState } from 'react';

import { api } from '../../api/client';
import {
  buildFileUrl,
  extractEquipment,
  extractStockCounts,
  finiteNumber,
  text,
} from './interventionDetailUtils';
import ImageAnnotationDialog from './ImageAnnotationDialog';

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

function formatVisitDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

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
  const [annotationTarget, setAnnotationTarget] = useState(null);
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
  const visits = Array.isArray(fieldRecord?.visits) ? fieldRecord.visits : [];
  const assignmentHistory = Array.isArray(fieldRecord?.assignment_history)
    ? fieldRecord.assignment_history
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

  const downloadAsset = (asset) => (
    asset.asset_type === 'technician_media'
      ? api.downloadTechnicianMedia(job.id, asset.asset_id)
      : api.downloadJobAttachment(job.id, asset.asset_id)
  );

  const beginAnnotation = async (asset) => {
    if (!asset?.mime_type?.startsWith('image/')) return;
    setUploading(true);
    setUploadError('');
    try {
      const response = await downloadAsset(asset);
      setAnnotationTarget({ ...asset, blob: response.data });
    } catch (error) {
      setUploadError(
        error?.response?.data?.detail || error?.message || 'Image indisponible.',
      );
    } finally {
      setUploading(false);
    }
  };

  const saveAnnotation = async (blob) => {
    const origin = annotationTarget;
    if (!origin) return;
    setUploading(true);
    setUploadError('');
    try {
      const originLabel = origin.title || origin.filename || 'pièce terrain';
      const metadata = {
        is_annotation: true,
        editor: 'bluevector_web_freehand_v1',
        annotation_of: {
          asset_type: origin.asset_type,
          asset_id: origin.asset_id,
        },
      };
      const data = new FormData();
      data.append('kind', 'photo');
      data.append('title', `Annotation — ${originLabel}`);
      data.append('comment', 'Annotation bureau conservant la pièce originale.');
      data.append('metadata', JSON.stringify(metadata));
      data.append('file', blob, `annotation-${Date.now()}.png`);
      const uploaded = await api.uploadJobAttachment(job.id, data);
      const attachmentId = uploaded.data?.attachment_id;
      await api.addJobCommunication(job.id, {
        type: 'message',
        body: `Annotation ajoutée sur ${originLabel}`,
        audience: 'field',
        attachments: [{
          asset_type: 'office_attachment',
          asset_id: attachmentId,
          role: 'annotation',
          annotation_of: metadata.annotation_of,
        }],
      });
      setAnnotationTarget(null);
      if (typeof onRecordChanged === 'function') onRecordChanged();
    } catch (error) {
      setUploadError(
        error?.response?.data?.detail || error?.message || 'Annotation impossible.',
      );
    } finally {
      setUploading(false);
    }
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
      const metadata = {};
      data.append('metadata', JSON.stringify(metadata));
      const uploaded = await api.uploadJobAttachment(job.id, data);
      const attachmentId = uploaded.data?.attachment_id;
      const messageType = form.elements.namedItem('message_type')?.value || 'instruction';
      const comment = form.elements.namedItem('comment')?.value?.trim();
      const title = form.elements.namedItem('title')?.value?.trim() || file.name;
      await api.addJobCommunication(job.id, {
        type: messageType,
        body: comment || `Pièce partagée : ${title}`,
        audience: 'field',
        requires_action: messageType === 'correction_request',
        attachments: [{
          asset_type: 'office_attachment',
          asset_id: attachmentId,
          role: 'attachment',
        }],
      });
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
          title="Passages terrain"
          count={visits.length}
          emptyLabel="Aucun passage terrain enregistré"
          hasContent={visits.length > 0}
          defaultOpen={visits.length > 1}
        >
          <div className="intervention-detail-comment-list">
            {visits.map((visit) => {
              const assignments = assignmentHistory.filter(
                (assignment) => assignment.visit_id === visit.id,
              );
              return (
                <article key={`visit-${visit.id}`}>
                  <span>
                    Passage {visit.attempt_number} · {' '}
                    {visit.status_label
                      || visit.outcome
                      || visit.status}
                  </span>
                  <p>
                    {visit.primary_technician_name || 'Technicien non renseigné'}
                    {' · '}{formatVisitDate(visit.assigned_at || visit.scheduled_at)}
                    {visit.ended_at ? ` → ${formatVisitDate(visit.ended_at)}` : ' · en cours'}
                  </p>
                  {assignments.length > 1 ? (
                    <small>
                      Affectations : {assignments.map((assignment) => (
                        assignment.technician_name || `Technicien #${assignment.technician_id}`
                      )).join(' → ')}
                    </small>
                  ) : null}
                </article>
              );
            })}
          </div>
        </ModuleSection>

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
              <div key={document.attachment_id} className="intervention-detail-asset-row">
                <button
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
                {document.mime_type?.startsWith('image/') ? (
                  <button
                    type="button"
                    className="intervention-detail-annotate-button"
                    disabled={uploading}
                    onClick={() => beginAnnotation({
                      ...document,
                      asset_type: 'office_attachment',
                      asset_id: document.attachment_id,
                    })}
                  >
                    Annoter
                  </button>
                ) : null}
              </div>
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
              <div key={media.media_id} className="intervention-detail-asset-row">
                <button
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
                {media.mime_type?.startsWith('image/') ? (
                  <button
                    type="button"
                    className="intervention-detail-annotate-button"
                    disabled={uploading}
                    onClick={() => beginAnnotation({
                      ...media,
                      asset_type: 'technician_media',
                      asset_id: media.media_id,
                    })}
                  >
                    Annoter
                  </button>
                ) : null}
              </div>
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
                {item.attachments?.length ? (
                  <div className="intervention-detail-communication-assets">
                    {item.attachments.map((asset) => (
                      <div key={`${item.id}-${asset.asset_type}-${asset.asset_id}`}>
                        <button
                          type="button"
                          className="intervention-detail-file-link"
                          onClick={() => openBlob(() => downloadAsset(asset))}
                        >
                          <span className="intervention-detail-file-icon">
                            {asset.mime_type?.startsWith('image/') ? <PhotoIcon /> : <FileIcon />}
                          </span>
                          <span>
                            <strong>{asset.title || asset.filename || 'Pièce jointe'}</strong>
                            <small>{asset.role === 'annotation' ? 'Annotation · original conservé' : 'Ouvrir la pièce'}</small>
                          </span>
                        </button>
                        {asset.mime_type?.startsWith('image/') ? (
                          <button
                            type="button"
                            className="intervention-detail-annotate-button"
                            disabled={uploading}
                            onClick={() => beginAnnotation(asset)}
                          >
                            Annoter cette image
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
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
            <select name="message_type" defaultValue="instruction" aria-label="Nature du partage">
              <option value="instruction">Plan ou consigne</option>
              <option value="correction_request">Pièce avec correction attendue</option>
              <option value="message">Information</option>
            </select>
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
      {annotationTarget ? (
        <ImageAnnotationDialog
          blob={annotationTarget.blob}
          title={annotationTarget.title || annotationTarget.filename}
          onCancel={() => setAnnotationTarget(null)}
          onSave={saveAnnotation}
        />
      ) : null}
    </aside>
  );
}
