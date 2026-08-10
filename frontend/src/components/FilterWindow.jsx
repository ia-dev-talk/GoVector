import {
	useCallback,
	useEffect,
	useMemo,
	useState,
} from 'react';

import FloatingWindow from './FloatingWindow';

const FILTER_FIELDS = {
	timeSlots: 'timeSlots',
	jobTypes: 'jobTypes',
	routeCriteria: 'routeCriteria',
	techIds: 'techIds',
};

function isRecord(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value)
	);
}

function normalizeText(value) {
	if (
		value === null ||
		value === undefined ||
		typeof value === 'boolean'
	) {
		return '';
	}

	if (
		typeof value !== 'string' &&
		typeof value !== 'number'
	) {
		return '';
	}

	return String(value).trim();
}

function normalizeIdentifier(value) {
	return normalizeText(value);
}

function uniqueStrings(values) {
	const result = [];
	const knownValues = new Set();

	(Array.isArray(values) ? values : []).forEach(
		(value) => {
			const normalizedValue = normalizeText(value);

			if (
				!normalizedValue ||
				knownValues.has(normalizedValue)
			) {
				return;
			}

			knownValues.add(normalizedValue);
			result.push(normalizedValue);
		},
	);

	return result;
}

function sortLabels(values) {
	return [...values].sort((first, second) =>
		first.localeCompare(second, 'fr', {
			numeric: true,
			sensitivity: 'base',
		}),
	);
}

function normalizeSelection(
	value,
	availableValues,
	{
		selectAllWhenMissing = true,
	} = {},
) {
	const available = uniqueStrings(availableValues);
	const availableSet = new Set(available);

	if (!Array.isArray(value)) {
		return selectAllWhenMissing ? available : [];
	}

	const normalizedSelection = uniqueStrings(
		value,
	).filter((item) => availableSet.has(item));

	/*
	 * Dashboard considère actuellement un tableau vide comme
	 * « aucune restriction ». Une ancienne sélection vide doit donc
	 * être restaurée comme « tout sélectionné » pour ne pas afficher
	 * un état différent de celui réellement appliqué.
	 */
	if (
		normalizedSelection.length === 0 &&
		available.length > 0
	) {
		return available;
	}

	return normalizedSelection;
}

function areSameSelection(first, second) {
	const firstValues = uniqueStrings(first);
	const secondValues = uniqueStrings(second);

	if (firstValues.length !== secondValues.length) {
		return false;
	}

	const secondSet = new Set(secondValues);

	return firstValues.every((value) =>
		secondSet.has(value),
	);
}

function formatJobType(value) {
	const label = normalizeText(value)
		.replace(/_/g, ' ')
		.replace(/\s+/g, ' ');

	if (!label) {
		return '—';
	}

	return (
		label.charAt(0).toUpperCase() +
		label.slice(1).toLocaleLowerCase('fr')
	);
}

function getTechnicianLabel(technician) {
	const employeeId =
		normalizeText(technician.employeeId) ||
		technician.id;

	const name =
		normalizeText(technician.name) ||
		'Technicien sans nom';

	return `${employeeId} — ${name}`;
}

function getSelectionsFromFilter(
	activeFilter,
	options,
) {
	const safeFilter = isRecord(activeFilter)
		? activeFilter
		: null;

	return {
		timeSlots: normalizeSelection(
			safeFilter?.[FILTER_FIELDS.timeSlots],
			options.timeSlots,
		),
		jobTypes: normalizeSelection(
			safeFilter?.[FILTER_FIELDS.jobTypes],
			options.jobTypes,
		),
		routeCriteria: normalizeSelection(
			safeFilter?.[
				FILTER_FIELDS.routeCriteria
			],
			options.routeCriteria,
		),
		techIds: normalizeSelection(
			safeFilter?.[FILTER_FIELDS.techIds],
			options.techIds,
		),
	};
}

function hasEmptyRequiredSelection(
	selectedValues,
	availableValues,
) {
	return (
		availableValues.length > 0 &&
		selectedValues.length === 0
	);
}

/**
 * Fenêtre de filtrage des grilles interventions et techniciens.
 *
 * Props :
 * - jobs : interventions chargées
 * - technicians : techniciens chargés
 * - activeFilter : { timeSlots, jobTypes, routeCriteria, techIds }
 * - onApply : callback recevant le nouveau filtre ou null
 * - onClose : fermeture de la fenêtre
 */
export default function FilterWindow({
	jobs,
	technicians,
	activeFilter,
	onApply,
	onClose,
}) {
	const options = useMemo(() => {
		const timeSlots = new Set();
		const jobTypes = new Set();
		const routeCriteria = new Set();

		const safeJobs = Array.isArray(jobs)
			? jobs.filter(isRecord)
			: [];

		safeJobs.forEach((job) => {
			const start = normalizeText(
				job.time_slot_start,
			);
			const end = normalizeText(
				job.time_slot_end,
			);
			const jobType = normalizeText(
				job.job_type,
			);
			const route = normalizeText(
				job.route_criteria,
			);

			if (start && end) {
				timeSlots.add(`${start}–${end}`);
			}

			if (jobType) {
				jobTypes.add(jobType);
			}

			if (route) {
				routeCriteria.add(route);
			}
		});

		const safeTechnicians = Array.isArray(
			technicians,
		)
			? technicians.filter(isRecord)
			: [];

		const technicianById = new Map();

		safeTechnicians.forEach((technician) => {
			const id = normalizeIdentifier(
				technician.id,
			);

			if (!id || technicianById.has(id)) {
				return;
			}

			technicianById.set(id, {
				id,
				name: normalizeText(technician.name),
				employeeId: normalizeText(
					technician.employee_id,
				),
			});
		});

		const techs = Array.from(
			technicianById.values(),
		).sort((first, second) =>
			getTechnicianLabel(first).localeCompare(
				getTechnicianLabel(second),
				'fr',
				{
					numeric: true,
					sensitivity: 'base',
				},
			),
		);

		return {
			timeSlots: sortLabels(
				Array.from(timeSlots),
			),
			jobTypes: sortLabels(
				Array.from(jobTypes),
			),
			routeCriteria: sortLabels(
				Array.from(routeCriteria),
			),
			techs,
			techIds: techs.map(
				(technician) => technician.id,
			),
		};
	}, [jobs, technicians]);

	const initialSelections = useMemo(
		() =>
			getSelectionsFromFilter(
				activeFilter,
				options,
			),
		[activeFilter, options],
	);

	const [selectedTimeSlots, setSelectedTimeSlots] =
		useState(initialSelections.timeSlots);
	const [selectedJobTypes, setSelectedJobTypes] =
		useState(initialSelections.jobTypes);
	const [
		selectedRouteCriteria,
		setSelectedRouteCriteria,
	] = useState(initialSelections.routeCriteria);
	const [selectedTechIds, setSelectedTechIds] =
		useState(initialSelections.techIds);
	const [validationMessage, setValidationMessage] =
		useState('');

	useEffect(() => {
		const frameId = window.requestAnimationFrame(() => {
			setSelectedTimeSlots(initialSelections.timeSlots);
			setSelectedJobTypes(initialSelections.jobTypes);
			setSelectedRouteCriteria(initialSelections.routeCriteria);
			setSelectedTechIds(initialSelections.techIds);
			setValidationMessage('');
		});
		return () => window.cancelAnimationFrame(frameId);
	}, [initialSelections]);

	const toggleSelection = useCallback(
		(setter, item) => {
			setter((previous) => {
				const normalizedItem =
					normalizeText(item);

				if (!normalizedItem) {
					return previous;
				}

				if (
					previous.includes(normalizedItem)
				) {
					return previous.filter(
						(value) =>
							value !== normalizedItem,
					);
				}

				return [
					...previous,
					normalizedItem,
				];
			});

			setValidationMessage('');
		},
		[],
	);

	const selectAll = useCallback(
		(items, setter) => {
			setter([...items]);
			setValidationMessage('');
		},
		[],
	);

	const selectNone = useCallback((setter) => {
		setter([]);
		setValidationMessage('');
	}, []);

	const invalidSelection = useMemo(
		() =>
			hasEmptyRequiredSelection(
				selectedTimeSlots,
				options.timeSlots,
			) ||
			hasEmptyRequiredSelection(
				selectedJobTypes,
				options.jobTypes,
			) ||
			hasEmptyRequiredSelection(
				selectedRouteCriteria,
				options.routeCriteria,
			) ||
			hasEmptyRequiredSelection(
				selectedTechIds,
				options.techIds,
			),
		[
			options,
			selectedJobTypes,
			selectedRouteCriteria,
			selectedTechIds,
			selectedTimeSlots,
		],
	);

	const noEffectiveFilter = useMemo(
		() =>
			areSameSelection(
				selectedTimeSlots,
				options.timeSlots,
			) &&
			areSameSelection(
				selectedJobTypes,
				options.jobTypes,
			) &&
			areSameSelection(
				selectedRouteCriteria,
				options.routeCriteria,
			) &&
			areSameSelection(
				selectedTechIds,
				options.techIds,
			),
		[
			options,
			selectedJobTypes,
			selectedRouteCriteria,
			selectedTechIds,
			selectedTimeSlots,
		],
	);

	const handleApply = useCallback(() => {
		if (invalidSelection) {
			setValidationMessage(
				'Sélectionnez au moins une valeur dans chaque catégorie disponible.',
			);
			return;
		}

		if (typeof onApply !== 'function') {
			return;
		}

		if (noEffectiveFilter) {
			onApply(null);
			return;
		}

		onApply({
			timeSlots: [...selectedTimeSlots],
			jobTypes: [...selectedJobTypes],
			routeCriteria: [
				...selectedRouteCriteria,
			],
			techIds: [...selectedTechIds],
		});
	}, [
		invalidSelection,
		noEffectiveFilter,
		onApply,
		selectedJobTypes,
		selectedRouteCriteria,
		selectedTechIds,
		selectedTimeSlots,
	]);

	const handleReset = useCallback(() => {
		setSelectedTimeSlots([...options.timeSlots]);
		setSelectedJobTypes([...options.jobTypes]);
		setSelectedRouteCriteria([
			...options.routeCriteria,
		]);
		setSelectedTechIds([...options.techIds]);
		setValidationMessage('');

		if (typeof onApply === 'function') {
			onApply(null);
		}
	}, [onApply, options]);

	const handleClose = useCallback(() => {
		if (typeof onClose === 'function') {
			onClose();
		}
	}, [onClose]);

	const technicianLabels = useMemo(() => {
		const labels = new Map();

		options.techs.forEach((technician) => {
			labels.set(
				technician.id,
				getTechnicianLabel(technician),
			);
		});

		return labels;
	}, [options.techs]);

	return (
		<FloatingWindow
			title="Filtres d’affichage"
			onClose={handleClose}
			defaultPos={{
				x: 160,
				y: 100,
			}}
			defaultSize={{
				w: 560,
				h: 420,
			}}
			minSize={{
				w: 440,
				h: 300,
			}}
			className="fw-filter"
		>
			<div className="filter-grid">
				<FilterList
					label="Créneaux"
					items={options.timeSlots}
					selected={selectedTimeSlots}
					onToggle={(item) =>
						toggleSelection(
							setSelectedTimeSlots,
							item,
						)
					}
					onSelectAll={() =>
						selectAll(
							options.timeSlots,
							setSelectedTimeSlots,
						)
					}
					onSelectNone={() =>
						selectNone(
							setSelectedTimeSlots,
						)
					}
				/>

				<FilterList
					label="Types"
					items={options.jobTypes}
					selected={selectedJobTypes}
					onToggle={(item) =>
						toggleSelection(
							setSelectedJobTypes,
							item,
						)
					}
					onSelectAll={() =>
						selectAll(
							options.jobTypes,
							setSelectedJobTypes,
						)
					}
					onSelectNone={() =>
						selectNone(
							setSelectedJobTypes,
						)
					}
					formatItem={formatJobType}
				/>

				<FilterList
					label="Secteurs"
					items={options.routeCriteria}
					selected={selectedRouteCriteria}
					onToggle={(item) =>
						toggleSelection(
							setSelectedRouteCriteria,
							item,
						)
					}
					onSelectAll={() =>
						selectAll(
							options.routeCriteria,
							setSelectedRouteCriteria,
						)
					}
					onSelectNone={() =>
						selectNone(
							setSelectedRouteCriteria,
						)
					}
				/>

				<FilterList
					label="Techniciens"
					items={options.techIds}
					selected={selectedTechIds}
					onToggle={(item) =>
						toggleSelection(
							setSelectedTechIds,
							item,
						)
					}
					onSelectAll={() =>
						selectAll(
							options.techIds,
							setSelectedTechIds,
						)
					}
					onSelectNone={() =>
						selectNone(setSelectedTechIds)
					}
					formatItem={(id) =>
						technicianLabels.get(id) ||
						String(id)
					}
				/>
			</div>

			<div className="filter-actions">
				<button
					type="button"
					className="btn btn--sm"
					onClick={handleReset}
				>
					Réinitialiser
				</button>

				{validationMessage && (
					<span
						role="alert"
						style={{
							flex: 1,
							minWidth: 0,
							color: 'var(--color-warning)',
							fontSize: 10,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
						title={validationMessage}
					>
						{validationMessage}
					</span>
				)}

				{!validationMessage && (
					<div style={{ flex: 1 }} />
				)}

				<button
					type="button"
					className="btn btn--sm"
					onClick={handleClose}
				>
					Annuler
				</button>

				<button
					type="button"
					className="btn btn--sm btn--primary"
					onClick={handleApply}
					disabled={invalidSelection}
					title={
						invalidSelection
							? 'Sélectionnez au moins une valeur dans chaque catégorie disponible'
							: noEffectiveFilter
								? 'Effacer le filtre actif'
								: 'Appliquer le filtre'
					}
				>
					{noEffectiveFilter
						? 'Effacer le filtre'
						: 'Appliquer'}
				</button>
			</div>
		</FloatingWindow>
	);
}

function FilterList({
	label,
	items,
	selected,
	onToggle,
	onSelectAll,
	onSelectNone,
	formatItem,
}) {
	const safeItems = Array.isArray(items)
		? items
		: [];
	const selectedSet = useMemo(
		() => new Set(uniqueStrings(selected)),
		[selected],
	);
	const format =
		typeof formatItem === 'function'
			? formatItem
			: (value) => String(value);

	return (
		<div
			className="filter-col"
			aria-label={label}
		>
			<div className="filter-col-header">
				<span className="filter-col-label">
					{label}
				</span>
				<span className="filter-col-count">
					{selectedSet.size}/{safeItems.length}
				</span>
			</div>

			<div
				className="filter-col-list"
				role="group"
				aria-label={`Valeurs du filtre ${label}`}
			>
				{safeItems.length === 0 ? (
					<div
						style={{
							padding: '12px 8px',
							color: 'var(--text-muted)',
							fontSize: 10,
							textAlign: 'center',
						}}
					>
						Aucune valeur
					</div>
				) : (
					safeItems.map((item) => {
						const itemKey =
							normalizeText(item);
						const isSelected =
							selectedSet.has(itemKey);
						const formattedItem =
							normalizeText(
								format(item),
							) || itemKey;

						return (
							<button
								key={itemKey}
								type="button"
								className={`filter-item${
									isSelected
										? ' filter-item--selected'
										: ''
								}`}
								onClick={() => onToggle(itemKey)}
								aria-pressed={isSelected}
								title={formattedItem}
							>
								<span
									className={`filter-check${
										isSelected
											? ' filter-check--on'
											: ''
									}`}
									aria-hidden="true"
								>
									{isSelected ? '✓' : ''}
								</span>
								<span className="filter-item-label">
									{formattedItem}
								</span>
							</button>
						);
					})
				)}
			</div>

			<div className="filter-col-actions">
				<button
					type="button"
					className="filter-link"
					onClick={onSelectAll}
					disabled={safeItems.length === 0}
				>
					Tout
				</button>
				<button
					type="button"
					className="filter-link"
					onClick={onSelectNone}
					disabled={safeItems.length === 0}
				>
					Aucun
				</button>
			</div>
		</div>
	);
}
