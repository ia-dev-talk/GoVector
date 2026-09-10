import { memo } from 'react';
import {
  ClipboardIcon,
  CloseIcon,
  ExternalIcon,
  LocationIcon,
  RouteIcon,
  UsersIcon,
} from './LiveMapIcons';
import {
  GPS_LABELS,
  GPS_TONES,
  assignedTechnicianName,
  formatAge,
  formatTime,
  getLocationAgeMinutes,
  getTechGpsState,
  jobId,
  jobSector,
  jobStatus,
  jobTitle,
  jobType,
  primaryTechnicianSector,
  statusLabel,
  technicianInitials,
  technicianName,
  technicianSectorNames,
  text,
} from './liveMapUtils';


function Field({
  label,
  value,
  mono = false,
  wide = false,
}) {
  return (
    <div
      className={[
        'lm-detail-field',
        wide ? 'lm-detail-field--wide' : '',
      ].join(' ')}
    >
      <span>{label}</span>
      <strong className={mono ? 'lm-mono' : ''}>
        {text(value, '—')}
      </strong>
    </div>
  );
}


function EmptyInspector() {
  return (
    <aside className="lm-inspector lm-inspector--empty">
      <LocationIcon />
      <strong>Sélectionnez un élément</strong>
      <span>
        Cliquez sur un technicien, une intervention
        ou un marqueur pour afficher ses données.
      </span>
    </aside>
  );
}


const LiveMapInspector = memo(function LiveMapInspector({
  selected,
  referenceNow,
  staleAfterMinutes,
  onClose,
  onNavigate,
}) {
  if (!selected?.data) {
    return <EmptyInspector />;
  }

  if (selected.type === 'technician') {
    const technician = selected.data;
    const gpsState = getTechGpsState(
      technician,
      referenceNow,
      staleAfterMinutes,
    );

    const age = getLocationAgeMinutes(
      technician,
      referenceNow,
    );

    const sectors = technicianSectorNames(
      technician,
    );
    const accuracy = Number(technician?.current_accuracy);
    const accuracyLabel =
      technician?.current_accuracy !== null &&
      technician?.current_accuracy !== undefined &&
      technician?.current_accuracy !== '' &&
      Number.isFinite(accuracy) &&
      accuracy >= 0
        ? `${accuracy.toFixed(1)} m`
        : '—';

    return (
      <aside className="lm-inspector">
        <header className="lm-inspector-header">
          <span className="lm-inspector-avatar">
            {technicianInitials(technician)}
          </span>

          <div>
            <span>Technicien</span>
            <strong>
              {technicianName(technician)}
            </strong>
            <small>
              {text(
                technician?.employee_id ??
                  technician?.matricule,
                'Matricule non renseigné',
              )}
            </small>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer l’inspecteur"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="lm-inspector-state">
          <span className="lm-status-pill">
            {statusLabel(
              technician?.live_status ??
                technician?.status,
            )}
          </span>

          <span
            className={`lm-gps-pill lm-gps-pill--${GPS_TONES[gpsState]}`}
          >
            <span aria-hidden="true" />
            {GPS_LABELS[gpsState]}
          </span>
        </div>

        <div className="lm-inspector-body">
          <section>
            <div className="lm-section-title">
              <UsersIcon />
              Organisation
            </div>

            <div className="lm-detail-grid">
              <Field
                label="Secteur principal"
                value={primaryTechnicianSector(technician)}
              />
              <Field
                label="Équipe"
                value={technician?.team}
              />
              <Field
                label="Orienteur"
                value={
                  technician?.orienteur_name ??
                  technician?.orienteur
                }
              />
              <Field
                label="Véhicule"
                value={technician?.vehicle}
              />
              <Field
                label="Secteurs affectés"
                value={sectors.join(', ')}
                wide
              />
            </div>
          </section>

          <section>
            <div className="lm-section-title">
              <LocationIcon />
              Position terrain
            </div>

            <div className="lm-detail-grid">
              <Field
                label="Latitude"
                value={technician?.current_latitude}
                mono
              />
              <Field
                label="Longitude"
                value={technician?.current_longitude}
                mono
              />
              <Field
                label="Ancienneté"
                value={
                  age !== null
                    ? formatAge(age)
                    : '—'
                }
              />
              <Field
                label="Dernière mise à jour"
                value={formatTime(
                  technician?.last_location_update,
                )}
              />
              <Field
                label="Précision"
                value={accuracyLabel}
              />
            </div>
          </section>

          <section>
            <div className="lm-section-title">
              <RouteIcon />
              Activité
            </div>

            <div className="lm-detail-grid">
              <Field
                label="Intervention actuelle"
                value={
                  technician?.current_job_id
                    ? `#${technician.current_job_id}`
                    : 'Aucune'
                }
              />
              <Field
                label="Client actuel"
                value={technician?.current_job_customer}
              />
            </div>
          </section>
        </div>

        <footer className="lm-inspector-footer">
          <button
            type="button"
            className="lm-secondary-button"
            onClick={() =>
              onNavigate?.('personnel', {
                id: technician?.id,
              })
            }
          >
            <ExternalIcon />
            Ouvrir Personnel
          </button>
        </footer>
      </aside>
    );
  }

  const job = selected.data;
  const status = jobStatus(job);
  const id = jobId(job);

  return (
    <aside className="lm-inspector">
      <header className="lm-inspector-header">
        <span className="lm-inspector-avatar lm-inspector-avatar--job">
          <ClipboardIcon />
        </span>

        <div>
          <span>Intervention</span>
          <strong>{jobTitle(job)}</strong>
          <small>{jobType(job)}</small>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer l’inspecteur"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="lm-inspector-state">
        <span className={`lm-status-pill lm-status-pill--${status.value}`}>
          {status.label}
        </span>

        <span className="lm-priority-pill">
          {text(job?.priority, 'Priorité non renseignée')}
        </span>
      </div>

      <div className="lm-inspector-body">
        <section>
          <div className="lm-section-title">
            <ClipboardIcon />
            Intervention
          </div>

          <div className="lm-detail-grid">
            <Field
              label="Type"
              value={jobType(job)}
            />
            <Field
              label="Technicien"
              value={assignedTechnicianName(job)}
            />
            <Field
              label="Opérateur"
              value={job?.operator}
            />
            <Field
              label="Secteur"
              value={jobSector(job)}
            />
          </div>
        </section>

        <section>
          <div className="lm-section-title">
            <UsersIcon />
            Client
          </div>

          <div className="lm-detail-grid">
            <Field
              label="Nom"
              value={job?.customer_name}
            />
            <Field
              label="Téléphone"
              value={job?.customer_phone}
            />
            <Field
              label="Adresse"
              value={job?.service_address}
              wide
            />
          </div>
        </section>

        <section>
          <div className="lm-section-title">
            <RouteIcon />
            Réseau FTTH
          </div>

          <div className="lm-detail-grid">
            <Field label="PTO" value={job?.pto} />
          </div>
        </section>

        <section>
          <div className="lm-section-title">
            <LocationIcon />
            Coordonnées
          </div>

          <div className="lm-detail-grid">
            <Field
              label="Latitude site"
              value={job?.latitude}
              mono
            />
            <Field
              label="Longitude site"
              value={job?.longitude}
              mono
            />
          </div>
        </section>
      </div>

      <footer className="lm-inspector-footer">
        <button
          type="button"
          className="lm-primary-button"
          onClick={() =>
            onNavigate?.('interventions', {
              id: Number(id) || id,
            })
          }
          disabled={!id}
        >
          <ExternalIcon />
          Ouvrir dans Interventions
        </button>
      </footer>
    </aside>
  );
});


export default LiveMapInspector;
