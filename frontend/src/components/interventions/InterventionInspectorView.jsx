function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeIdentifier(value) {
  if (value == null) {
    return null;
  }

  const identifier = String(value).trim();

  return identifier || null;
}

function isUrgentPriority(value) {
  return (
    typeof value === 'string' &&
    value.trim().toUpperCase() === 'URGENT'
  );
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return `${String(date.getDate()).padStart(2, '0')}/${String(
    date.getMonth() + 1,
  ).padStart(2, '0')}/${date.getFullYear()} ${String(
    date.getHours(),
  ).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

function parseCoordinate(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value
      : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  const coordinate = Number(normalizedValue);

  return Number.isFinite(coordinate)
    ? coordinate
    : null;
}

function formatCoordinatePair(job) {
  const coordinatePairs = [
    [
      job?.gps_latitude,
      job?.gps_longitude,
    ],
    [
      job?.latitude,
      job?.longitude,
    ],
  ];

  for (const [
    latitudeValue,
    longitudeValue,
  ] of coordinatePairs) {
    const latitude =
      parseCoordinate(latitudeValue);

    const longitude =
      parseCoordinate(longitudeValue);

    if (
      latitude === null ||
      longitude === null ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180 ||
      (
        latitude === 0 &&
        longitude === 0
      )
    ) {
      continue;
    }

    return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  }

  return '—';
}

const STATUS_COLORS = {
  pending: '#f6b84b',
  assigned: '#4b8dff',
  in_progress: '#a78bfa',
  completed: '#39d98a',
  cancelled: '#ff6877',
  on_hold: '#8290a5',
};

function ClipboardIcon() {
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
      <rect x="5" y="4.5" width="14" height="17" rx="2.5" />
      <path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" />
    </svg>
  );
}

function CloseIcon() {
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
      <path d="m6 6 8 8M14 6l-8 8" />
    </svg>
  );
}

export default function InterventionInspector({
	job,
	onClose,
	onOpen,
	onEdit,
	onDelete,
}) {
	if (!job) {
		return null;
	}

	const statusLabels = {
		pending: 'Non affecté',
		assigned: 'Affecté',
		in_progress: 'En cours',
		on_hold: 'En attente',
		completed: 'Terminé',
		cancelled: 'Annulé',
	};

	const normalizedStatus =
		normalizeStatus(job.status);

	const statusLabel =
		statusLabels[normalizedStatus] ||
		(
			normalizedStatus
				? normalizedStatus.replace(
					/_/g,
					' '
				)
				: 'Statut inconnu'
		);

	const assignedTechnician =
		job.assigned_technician_name ||
		job.assigned_tech_name ||
		(
			normalizeIdentifier(
				job.assigned_tech_id
			) !== null
				? `#${normalizeIdentifier(
					job.assigned_tech_id
				)}`
				: 'Non affecté'
		);

	const statusColor =
		STATUS_COLORS[
			normalizedStatus
		] ||
		'#6b7280';

	const awaitsValidation =
		normalizedStatus ===
		'en_attente_validation';

	return (
		<div className="ie-detail">
			<div className="ie-detail-header">
				<span
					className="intervention-inspector-status-icon"
					style={{
						'--inspector-status-color':
							statusColor,
					}}
					aria-hidden="true"
				>
					<ClipboardIcon />
				</span>

				<div>
					<strong>
						#
						{job.job_number ||
							job.id}
					</strong>
					<span
						style={{
							fontSize: 11,
							color:
								'var(--text-muted)',
						}}
					>
						{job.customer_name ||
							'Client non renseigné'}
					</span>
				</div>

				<button
					type="button"
					className="ie-detail-close"
					onClick={onClose}
					aria-label="Fermer le détail de l’intervention"
				>
					<CloseIcon />
				</button>
			</div>

			<div className="ie-detail-body">
				<div className="ie-detail-badges">
					<span
						className={`status-badge status-badge--${
							normalizedStatus ||
							'unknown'
						}`}
					>
						{statusLabel}
					</span>

					<span className="ie-detail-badge ie-detail-badge--type">
						{String(
							job.job_type ||
								'Type non renseigné'
						).replace(
							/_/g,
							' '
						)}
					</span>

					{job.priority && (
						<span className="ie-detail-badge ie-detail-badge--prio">
							{isUrgentPriority(
								job.priority
							)
								? 'URGENT'
								: `P${job.priority}`}
						</span>
					)}
				</div>

				<div className="ie-detail-section">
					<div className="ie-detail-section-title">
						Client
					</div>
					<div className="ie-detail-grid">
						<div>
							<span>Nom</span>
							<strong>
								{job.customer_name ||
									'—'}
							</strong>
						</div>
						<div>
							<span>
								Téléphone
							</span>
							<strong>
								{job.customer_phone ||
									'—'}
							</strong>
						</div>
						<div>
							<span>
								Adresse
							</span>
							<strong>
								{job.service_address ||
									'—'}
							</strong>
						</div>
						<div>
							<span>Ville</span>
							<strong>
								{job.service_city ||
									'—'}
							</strong>
						</div>
					</div>
				</div>

				<div className="ie-detail-section">
					<div className="ie-detail-section-title">
						Localisation
					</div>
					<div className="ie-detail-grid">
						<div>
							<span>GPS</span>
							<strong className="ie-detail-mono">
								{
									formatCoordinatePair(
										job
									)
								}
							</strong>
						</div>
						<div>
							<span>
								Critère tournée
							</span>
							<strong>
								{job.route_criteria ||
									'—'}
							</strong>
						</div>
					</div>
				</div>

				<div className="ie-detail-section">
					<div className="ie-detail-section-title">
						Réseau FTTH
					</div>
					<div className="ie-detail-grid">
						<div>
							<span>
								Opérateur
							</span>
							<strong>
								{job.operator ||
									'—'}
							</strong>
						</div>
						<div>
							<span>NRO</span>
							<strong className="ie-detail-mono">
								{job.nro ||
									'—'}
							</strong>
						</div>
						<div>
							<span>PBO</span>
							<strong className="ie-detail-mono">
								{job.pbo ||
									'—'}
							</strong>
						</div>
						<div>
							<span>PTO</span>
							<strong className="ie-detail-mono">
								{job.pto ||
									'—'}
							</strong>
						</div>
						<div>
							<span>ONT</span>
							<strong className="ie-detail-mono">
								{job.ont_serial ||
									'—'}
							</strong>
						</div>
						<div>
							<span>
								Splitter
							</span>
							<strong>
								{job.splitter ||
									'—'}
							</strong>
						</div>

						{job.optical_power_dbm !=
							null && (
							<div>
								<span>
									Puissance
								</span>
								<strong>
									{
										job.optical_power_dbm
									}{' '}
									dBm
								</strong>
							</div>
						)}

						{job.cable_length_m !=
							null && (
							<div>
								<span>
									Câble
								</span>
								<strong>
									{
										job.cable_length_m
									}{' '}
									m
								</strong>
							</div>
						)}
					</div>
				</div>

				<div className="ie-detail-section">
					<div className="ie-detail-section-title">
						Affectation
					</div>
					<div className="ie-detail-grid">
						<div>
							<span>
								Technicien
							</span>
							<strong>
								{
									assignedTechnician
								}
							</strong>
						</div>
						<div>
							<span>
								Durée estimée
							</span>
							<strong>
								{job.estimated_duration
									? `${job.estimated_duration} min`
									: '—'}
							</strong>
						</div>

						{job.time_slot_start && (
							<div>
								<span>
									Créneau
								</span>
								<strong>
									{
										job.time_slot_start
									}{' '}
									–{' '}
									{job.time_slot_end ||
										'—'}
								</strong>
							</div>
						)}
					</div>
				</div>

				<div className="ie-detail-section">
					<div className="ie-detail-section-title">
						Chronologie
					</div>
					<div className="ie-detail-grid">
						<div>
							<span>Créée</span>
							<strong className="ie-detail-mono">
								{formatDateTime(
									job.created_at
								)}
							</strong>
						</div>

						{job.started_at && (
							<div>
								<span>
									Débutée
								</span>
								<strong className="ie-detail-mono">
									{formatDateTime(
										job.started_at
									)}
								</strong>
							</div>
						)}

						{job.completed_at && (
							<div>
								<span>
									Terminée
								</span>
								<strong className="ie-detail-mono">
									{formatDateTime(
										job.completed_at
									)}
								</strong>
							</div>
						)}
					</div>
				</div>

				{job.coordinator_comments && (
					<div className="ie-detail-section">
						<div className="ie-detail-section-title">
							Commentaire
						</div>
						<p className="ie-detail-text">
							{
								job.coordinator_comments
							}
						</p>
					</div>
				)}

				{(
					job.before_photo ||
					job.after_photo
				) && (
					<div className="ie-detail-section">
						<div className="ie-detail-section-title">
							Photos
						</div>

						<div className="ie-detail-photos">
							{job.before_photo && (
								<a
									href={`${import.meta.env.VITE_FILES_URL || 'http://localhost:8080'}/${job.before_photo}`}
									target="_blank"
									rel="noreferrer"
									className="ie-detail-photo-link"
								>
									Avant
								</a>
							)}

							{job.after_photo && (
								<a
									href={`${import.meta.env.VITE_FILES_URL || 'http://localhost:8080'}/${job.after_photo}`}
									target="_blank"
									rel="noreferrer"
									className="ie-detail-photo-link"
								>
									Après
								</a>
							)}
						</div>
					</div>
				)}

				<div className="ie-detail-actions">
					{typeof onOpen ===
						'function' && (
						<button
							type="button"
							className="btn btn--sm btn--primary"
							onClick={() =>
								onOpen(job)
							}
						>
							{awaitsValidation
								? 'Vérifier et valider'
								: 'Ouvrir la fiche'}
						</button>
					)}

					{typeof onEdit ===
						'function' && (
						<button
							type="button"
							className="btn btn--sm"
							onClick={() =>
								onEdit(job)
							}
						>
							Modifier
						</button>
					)}

					{typeof onDelete ===
						'function' && (
						<button
							type="button"
							className="btn btn--sm btn--danger"
							onClick={() =>
								onDelete(job)
							}
						>
							Supprimer
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
