import {
  formatDate,
  formatDateTime,
  formatLabel,
  getAssignedTechnician,
  getCoordinates,
  text,
} from './interventionDetailUtils';

function DetailField({
  label,
  value,
  mono = false,
  fullWidth = false,
}) {
  return (
    <div
      className={[
        'intervention-detail-field',
        mono ? 'intervention-detail-field--mono' : '',
        fullWidth ? 'intervention-detail-field--full' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span>{label}</span>
      <strong>{text(value, '—')}</strong>
    </div>
  );
}

function SectionCard({
  eyebrow,
  title,
  children,
  className = '',
}) {
  return (
    <section
      className={[
        'intervention-detail-card',
        'intervention-detail-overview-card',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="intervention-detail-card-header">
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
      </header>

      <div className="intervention-detail-card-body">
        {children}
      </div>
    </section>
  );
}

export default function InterventionOverview({ job }) {
  const coordinates = getCoordinates(job);
  const slot =
    job?.time_slot_start || job?.time_slot_end
      ? `${text(job?.time_slot_start, '—')} – ${text(job?.time_slot_end, '—')}`
      : '—';

  return (
    <div className="intervention-detail-overview-grid">
      <SectionCard
        eyebrow="Données intervention"
        title="Vue d’ensemble"
        className="intervention-detail-overview-card--wide"
      >
        <div className="intervention-detail-fields intervention-detail-fields--three">
          <DetailField
            label="Type"
            value={formatLabel(job?.job_type, '—')}
          />
          <DetailField
            label="Opérateur"
            value={job?.operator}
          />
          <DetailField
            label="Secteur"
            value={job?.route_criteria}
          />
          <DetailField
            label="Créneau"
            value={slot}
          />
          <DetailField
            label="Durée estimée"
            value={
              job?.estimated_duration
                ? `${job.estimated_duration} min`
                : '—'
            }
          />
          <DetailField
            label="Date planifiée"
            value={formatDate(
              job?.scheduled_date ||
                job?.appointment_date ||
                job?.date,
            )}
          />
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Client"
        title="Coordonnées client"
      >
        <div className="intervention-detail-fields">
          <DetailField
            label="Nom"
            value={job?.customer_name}
            fullWidth
          />
          <DetailField
            label="Téléphone"
            value={job?.customer_phone}
            mono
          />
          <DetailField
            label="Ville"
            value={job?.service_city}
          />
          <DetailField
            label="Adresse"
            value={job?.service_address}
            fullWidth
          />
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Réseau FTTH"
        title="Infrastructure"
      >
        <div className="intervention-detail-fields intervention-detail-fields--three">
          <DetailField label="NRO" value={job?.nro} mono />
          <DetailField label="SRO" value={job?.sro} mono />
          <DetailField label="PBO" value={job?.pbo} mono />
          <DetailField label="PTO" value={job?.pto} mono />
          <DetailField
            label="Splitter"
            value={job?.splitter}
            mono
          />
          <DetailField
            label="Port"
            value={job?.splitter_port}
            mono
          />
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Ressource terrain"
        title="Affectation"
      >
        <div className="intervention-detail-assignment">
          <div className="intervention-detail-assignment-avatar" aria-hidden="true">
            {getAssignedTechnician(job)
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join('')
              .toUpperCase() || '—'}
          </div>

          <div className="intervention-detail-assignment-copy">
            <strong>{getAssignedTechnician(job)}</strong>
            <span>
              {text(job?.team, 'Équipe non renseignée')}
              {' · '}
              {text(job?.orienteur_name, 'Orienteur non renseigné')}
            </span>
          </div>
        </div>

        <div className="intervention-detail-fields intervention-detail-fields--three intervention-detail-fields--spaced">
          <DetailField
            label="Affectée le"
            value={formatDateTime(job?.assigned_at)}
          />
          <DetailField
            label="Démarrée le"
            value={formatDateTime(job?.started_at)}
          />
          <DetailField
            label="Terminée le"
            value={formatDateTime(job?.completed_at)}
          />
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Localisation"
        title="Coordonnées terrain"
      >
        <div className="intervention-detail-fields">
          <DetailField
            label="Latitude"
            value={
              coordinates
                ? coordinates.latitude.toFixed(6)
                : '—'
            }
            mono
          />
          <DetailField
            label="Longitude"
            value={
              coordinates
                ? coordinates.longitude.toFixed(6)
                : '—'
            }
            mono
          />
          <DetailField
            label="Référence adresse"
            value={job?.address_reference || job?.address_code}
            fullWidth
          />
        </div>
      </SectionCard>
    </div>
  );
}
