import {
  formatLabel,
  getJobNumber,
  getStatusMeta,
  text,
} from './interventionDetailUtils';

function BackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function RefreshIcon({ spinning = false }) {
  return (
    <svg
      className={spinning ? 'is-spinning' : undefined}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M6.1 9a7 7 0 0 1 11.6-2.6L20 11M4 13l2.3 4.6A7 7 0 0 0 17.9 15" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13.5 6.5 17.5 10.5M4 20l4.3-1 10.5-10.5a2.8 2.8 0 0 0-4-4L4.3 15 4 20Z" />
    </svg>
  );
}

function AssignmentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8.5" cy="8" r="3" />
      <path d="M3.5 19c.6-3.4 2.5-5.2 5-5.2 1.3 0 2.4.4 3.3 1.2M15 9h6M18 6v6M14.5 19h6" />
    </svg>
  );
}

function ValidationIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export default function InterventionDetailHeader({
  job,
  refreshing = false,
  onBack,
  onRefresh,
  onEdit,
  onManageAssignment,
  onValidate,
}) {
  const statusMeta = getStatusMeta(job?.status);
  const jobNumber = getJobNumber(job);
  const dtli = text(job?.dtli);
  const title = dtli
    ? `DTLI ${dtli}`
    : `Intervention ${jobNumber}`;
  const jobType = formatLabel(job?.job_type, 'Type non renseigné');
  const priority = text(job?.priority);

  return (
    <header className="intervention-detail-header">
      <div className="intervention-detail-header-main">
        <button
          type="button"
          className="intervention-detail-back"
          onClick={onBack}
          aria-label="Retour au workspace des interventions"
        >
          <BackIcon />
        </button>

        <div className="intervention-detail-heading">
          <span className="intervention-detail-eyebrow">
            Fiche intervention
          </span>

          <div className="intervention-detail-title-row">
            <h1>{title}</h1>

            <span
              className={`intervention-detail-status intervention-detail-status--${statusMeta.tone}`}
            >
              <span aria-hidden="true" />
              {statusMeta.label}
            </span>

            {priority ? (
              <span
                className={[
                  'intervention-detail-priority',
                  priority.toUpperCase() === 'URGENT'
                    ? 'intervention-detail-priority--urgent'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {priority.toUpperCase() === 'URGENT'
                  ? 'Urgente'
                  : `Priorité ${priority}`}
              </span>
            ) : null}
          </div>

          <p>
            {jobType}
            <span aria-hidden="true">·</span>
            {text(job?.operator, 'Opérateur non renseigné')}
            <span aria-hidden="true">·</span>
            {text(
              job?.sector_name,
              text(
                job?.sector_raw,
                text(job?.route_criteria, 'Secteur non renseigné'),
              ),
            )}
          </p>
        </div>
      </div>

      <div className="intervention-detail-header-actions">
        <button
          type="button"
          className="intervention-detail-action intervention-detail-action--icon"
          onClick={onRefresh}
          disabled={refreshing || typeof onRefresh !== 'function'}
          aria-label={
            refreshing
              ? 'Actualisation en cours'
              : 'Actualiser la fiche intervention'
          }
          title="Actualiser"
        >
          <RefreshIcon spinning={refreshing} />
        </button>

        {typeof onValidate === 'function' ? (
          <button
            type="button"
            className="intervention-detail-action intervention-detail-action--success"
            onClick={() => onValidate(job)}
          >
            <ValidationIcon />
            Valider l’intervention
          </button>
        ) : null}

        {typeof onManageAssignment === 'function' ? (
          <button
            type="button"
            className="intervention-detail-action"
            onClick={() => onManageAssignment(job)}
          >
            <AssignmentIcon />
            Gérer l’affectation
          </button>
        ) : null}

        {typeof onEdit === 'function' ? (
          <button
            type="button"
            className="intervention-detail-action intervention-detail-action--primary"
            onClick={() => onEdit(job)}
          >
            <EditIcon />
            Modifier
          </button>
        ) : null}
      </div>
    </header>
  );
}
