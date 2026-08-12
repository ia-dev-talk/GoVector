import { useState } from 'react';

import { api } from '../../api/client';
import SketchDialog from './SketchDialog';
import '../../styles/intervention-graphical-v2.css';

function DrawIcon() {
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
      <path d="m4 20 4.8-1.1L19 8.7 15.3 5 5.1 15.2 4 20Z" />
      <path d="m13.8 6.5 3.7 3.7" />
      <path d="M4 20h6" />
    </svg>
  );
}

function ImageIcon() {
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
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m5 18 5-5 3 3 2-2 4 4" />
    </svg>
  );
}

export default function InterventionGraphicalTools({
  job,
  onSaved,
}) {
  const [sketchOpen, setSketchOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const saveSketch = async (blob, options = {}) => {
    if (!job?.id || !blob || saving) return;
    setSaving(true);
    setError('');

    try {
      const metadata = {
        evidence_role: 'field_sketch',
        editor: 'bluevector_web_sketch_v1',
        canvas: options.withGrid ? 'blank_grid' : 'blank',
      };
      const data = new FormData();
      data.append('kind', 'plan');
      data.append('title', `Croquis — intervention ${job.job_number || job.id}`);
      data.append('comment', 'Croquis BlueVector créé depuis la fiche intervention.');
      data.append('metadata', JSON.stringify(metadata));
      data.append('file', blob, `croquis-${job.id}-${Date.now()}.png`);

      const uploaded = await api.uploadJobAttachment(job.id, data);
      const attachmentId = uploaded.data?.attachment_id;

      await api.addJobCommunication(job.id, {
        type: 'message',
        body: 'Nouveau croquis ajouté à la fiche intervention.',
        audience: 'field',
        attachments: attachmentId
          ? [
              {
                asset_type: 'office_attachment',
                asset_id: attachmentId,
                role: 'sketch',
              },
            ]
          : [],
      });

      setSketchOpen(false);
      if (typeof onSaved === 'function') await onSaved();
    } catch (caught) {
      setError(
        caught?.response?.data?.detail ||
          caught?.response?.data?.message ||
          caught?.message ||
          'Impossible d’enregistrer le croquis.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="intervention-graphical-tools" aria-label="Outils graphiques">
        <div className="intervention-graphical-tools-copy">
          <span>Preuves graphiques</span>
          <strong>Croquis, plans et photos annotées</strong>
          <small>
            Créez un croquis ici. Pour une photo ou un plan déjà présent,
            utilisez « Annoter » dans Preuves et données : l’original reste conservé.
          </small>
        </div>
        <div className="intervention-graphical-tools-actions">
          <span className="intervention-graphical-tools-capability">
            <ImageIcon /> Annotation image
          </span>
          <button
            type="button"
            className="btn btn--secondary intervention-graphical-tools-button"
            onClick={() => {
              setError('');
              setSketchOpen(true);
            }}
          >
            <DrawIcon />
            Nouveau croquis
          </button>
        </div>
        {error ? (
          <p className="intervention-graphical-tools-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {sketchOpen ? (
        <SketchDialog
          title={`Croquis — ${job?.job_number || `#${job?.id}`}`}
          onCancel={() => {
            if (!saving) setSketchOpen(false);
          }}
          onSave={saveSketch}
        />
      ) : null}
    </>
  );
}