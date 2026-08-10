import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import {
	AgGridReact,
} from 'ag-grid-react';
import {
	AllCommunityModule,
	ModuleRegistry,
} from 'ag-grid-community';

import { api } from '../api/client';
import FloatingWindow from './FloatingWindow';

ModuleRegistry.registerModules([
	AllCommunityModule,
]);

const STATUS_OPTIONS = [
	{ value: '', label: 'Tous' },
	{ value: 'pending', label: 'En attente' },
	{ value: 'assigned', label: 'Affectée' },
	{ value: 'en_route', label: 'En route' },
	{ value: 'on_site', label: 'Sur site' },
	{
		value: 'work_in_progress',
		label: 'Travail en cours',
	},
	{ value: 'in_progress', label: 'En cours' },
	{
		value: 'installation_done',
		label: 'Installation terminée',
	},
	{
		value: 'client_validation',
		label: 'Validation client',
	},
	{
		value: 'en_attente_validation',
		label: 'En attente de validation',
	},
	{ value: 'completed', label: 'Terminée' },
	{ value: 'failed', label: 'Échec' },
	{
		value: 'client_absent',
		label: 'Client absent',
	},
	{ value: 'postponed', label: 'Reportée' },
	{ value: 'suspended', label: 'Suspendue' },
	{ value: 'on_hold', label: 'En attente' },
	{ value: 'cancelled', label: 'Annulée' },
];

const JOB_TYPE_OPTIONS = [
	{ value: '', label: 'Tous' },
	{
		value: 'INSTALLATION',
		label: 'Installation',
	},
	{ value: 'DEPANNAGE', label: 'Dépannage' },
	{ value: 'MAINTENANCE', label: 'Maintenance' },
	{ value: 'SAV', label: 'SAV' },
	{
		value: 'DISCONNECT',
		label: 'Déconnexion',
	},
	{ value: 'INSPECTION', label: 'Inspection' },
	{ value: 'INCIDENT', label: 'Incident' },
	{ value: 'URGENCE', label: 'Urgence' },
	{ value: 'MIGRATION', label: 'Migration' },
	{
		value: 'RACCORDEMENT',
		label: 'Raccordement',
	},
	{ value: 'AUDIT', label: 'Audit' },
	{ value: 'TUBAGE', label: 'Tubage' },
	{
		value: 'NON_JOIGNABLE',
		label: 'Non joignable',
	},
	{ value: 'ANNULATION', label: 'Annulation' },
	{ value: 'SPLITTER', label: 'Splitter' },
	{
		value: 'CROQUIS_RESEAU',
		label: 'Croquis réseau',
	},
];

const STATUS_LABELS = new Map(
	STATUS_OPTIONS.map((option) => [
		option.value,
		option.label,
	]),
);

const JOB_TYPE_LABELS = new Map(
	JOB_TYPE_OPTIONS.map((option) => [
		option.value,
		option.label,
	]),
);

const SEARCH_ERROR_STYLE = {
	padding: '6px 12px',
	borderBottom:
		'1px solid var(--color-danger)',
	background: 'var(--color-danger-dim)',
	color: 'var(--color-danger)',
	fontSize: 11,
};

const RESULT_HEADER_ERROR_STYLE = {
	color: 'var(--color-danger)',
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

function normalizeComparableText(value) {
	return normalizeText(value)
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLocaleLowerCase('fr');
}

function normalizeStatus(value) {
	return normalizeComparableText(value)
		.replace(/\s+/g, '_');
}

function normalizeJobType(value) {
	return normalizeText(value)
		.replace(/\s+/g, '_')
		.toUpperCase();
}

function parsePositiveInteger(value) {
	const text = normalizeText(value);

	if (!/^\d+$/.test(text)) {
		return null;
	}

	const parsed = Number(text);

	if (
		!Number.isSafeInteger(parsed) ||
		parsed < 1
	) {
		return null;
	}

	return parsed;
}

function parseFiniteNumber(value) {
	if (
		value === null ||
		value === undefined ||
		value === '' ||
		typeof value === 'boolean'
	) {
		return null;
	}

	const parsed = Number(value);

	return Number.isFinite(parsed)
		? parsed
		: null;
}

function padDatePart(value) {
	return String(value).padStart(2, '0');
}

function formatDateInput(value) {
	let date = null;

	if (value instanceof Date) {
		date = value;
	} else if (
		typeof value === 'string' ||
		typeof value === 'number'
	) {
		const candidate = new Date(value);

		if (!Number.isNaN(candidate.getTime())) {
			date = candidate;
		}
	}

	if (
		!date ||
		Number.isNaN(date.getTime())
	) {
		return '';
	}

	return [
		date.getFullYear(),
		padDatePart(date.getMonth() + 1),
		padDatePart(date.getDate()),
	].join('-');
}

function isValidDateInput(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}

	const [
		year,
		month,
		day,
	] = value.split('-').map(Number);

	const date = new Date(
		year,
		month - 1,
		day,
	);

	return (
		date.getFullYear() === year &&
		date.getMonth() === month - 1 &&
		date.getDate() === day
	);
}

function compareDateInputs(first, second) {
	if (
		!isValidDateInput(first) ||
		!isValidDateInput(second)
	) {
		return 0;
	}

	return first.localeCompare(second);
}

function formatStatus(value) {
	const normalized = normalizeStatus(value);

	if (!normalized) {
		return '—';
	}

	const knownLabel =
		STATUS_LABELS.get(normalized);

	if (knownLabel) {
		return knownLabel;
	}

	const fallback = normalizeText(value)
		.replace(/_/g, ' ')
		.replace(/\s+/g, ' ');

	return fallback
		? `${fallback.charAt(0).toUpperCase()}${fallback.slice(1)}`
		: '—';
}

function formatJobType(value) {
	const normalized = normalizeJobType(value);

	if (!normalized) {
		return '—';
	}

	const knownLabel =
		JOB_TYPE_LABELS.get(normalized);

	if (knownLabel) {
		return knownLabel;
	}

	const fallback = normalized
		.replace(/_/g, ' ')
		.toLocaleLowerCase('fr');

	return (
		fallback.charAt(0).toUpperCase() +
		fallback.slice(1)
	);
}

function formatDuration(value) {
	const parsed = parseFiniteNumber(value);

	if (parsed === null || parsed < 0) {
		return '—';
	}

	const totalMinutes = Math.round(parsed);
	const hours = Math.floor(
		totalMinutes / 60,
	);
	const minutes = totalMinutes % 60;

	if (hours === 0) {
		return `${minutes} min`;
	}

	if (minutes === 0) {
		return `${hours} h`;
	}

	return `${hours} h ${minutes} min`;
}

function formatTimeSlot(start, end) {
	const startText = normalizeText(start);
	const endText = normalizeText(end);

	if (startText && endText) {
		return `${startText}–${endText}`;
	}

	return startText || endText || '—';
}

function normalizeDisplayList(value) {
	const source = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value.split(',')
			: [];

	const result = [];
	const knownValues = new Set();

	source.forEach((item) => {
		let text = '';

		if (
			typeof item === 'string' ||
			typeof item === 'number'
		) {
			text = normalizeText(item);
		} else if (isRecord(item)) {
			text =
				normalizeText(item.name) ||
				normalizeText(item.label) ||
				normalizeText(item.skill) ||
				normalizeText(item.code);
		}

		if (!text) {
			return;
		}

		const normalized =
			normalizeComparableText(text);

		if (
			!normalized ||
			knownValues.has(normalized)
		) {
			return;
		}

		knownValues.add(normalized);
		result.push(text);
	});

	return result;
}

function getApiErrorMessage(error) {
	const detail =
		error?.response?.data?.detail;

	if (
		typeof detail === 'string' &&
		detail.trim()
	) {
		return detail.trim();
	}

	const message =
		error?.response?.data?.message;

	if (
		typeof message === 'string' &&
		message.trim()
	) {
		return message.trim();
	}

	return 'La recherche des interventions a échoué.';
}

function getStatusColor(value) {
	switch (normalizeStatus(value)) {
		case 'pending':
		case 'on_hold':
		case 'postponed':
		case 'suspended':
		case 'en_attente_validation':
			return 'var(--color-warning)';

		case 'completed':
		case 'installation_done':
		case 'client_validation':
			return 'var(--color-success)';

		case 'cancelled':
		case 'failed':
		case 'client_absent':
			return 'var(--color-danger)';

		case 'in_progress':
		case 'work_in_progress':
			return 'var(--color-purple)';

		case 'assigned':
		case 'en_route':
		case 'on_site':
			return 'var(--color-accent)';

		default:
			return 'var(--text-primary)';
	}
}

function getPriorityColor(value) {
	const normalized =
		normalizeComparableText(value);

	if (
		normalized === '1' ||
		normalized === 'urgent'
	) {
		return 'var(--color-danger)';
	}

	if (
		normalized === '2' ||
		normalized === 'haute'
	) {
		return 'var(--color-warning)';
	}

	return 'var(--text-muted)';
}

function formatPriority(value) {
	const text = normalizeText(value);

	if (!text) {
		return '—';
	}

	switch (
		normalizeComparableText(value)
	) {
		case '1':
		case 'urgent':
			return 'Urgente';

		case '2':
		case 'haute':
			return 'Haute';

		case '3':
		case 'normale':
			return 'Normale';

		case '4':
		case 'faible':
			return 'Faible';

		default:
			return text;
	}
}

function getResultReference(job) {
	return (
		normalizeText(job?.job_number) ||
		normalizeText(job?.id) ||
		'—'
	);
}

function getStableBusinessRowId(job) {
	const id = normalizeText(job?.id);

	if (id) {
		return `id:${id}`;
	}

	const jobNumber = normalizeText(
		job?.job_number,
	);

	if (jobNumber) {
		return `number:${jobNumber}`;
	}

	return null;
}

function getRowFromElement(
	gridApi,
	rowElement,
) {
	const rowIndex = Number(
		rowElement?.getAttribute('row-index'),
	);

	if (
		!Number.isInteger(rowIndex) ||
		rowIndex < 0
	) {
		return null;
	}

	return (
		gridApi?.getDisplayedRowAtIndex(
			rowIndex,
		)?.data || null
	);
}

function isIgnoredDragTarget(target) {
	if (!(target instanceof Element)) {
		return true;
	}

	return Boolean(
		target.closest(
			[
				'.ag-header',
				'.ag-horizontal-right-spacer',
				'button',
				'a',
				'input',
				'select',
				'textarea',
			].join(','),
		),
	);
}

export default function JobSearchWindow({
	viewDate,
	onClose,
	onJobDetail,
	onDragStart,
	onContextMenu,
}) {
	const initialDate = useMemo(
		() => formatDateInput(viewDate),
		[viewDate],
	);

	const [dateFrom, setDateFrom] =
		useState(initialDate);
	const [dateTo, setDateTo] =
		useState(initialDate);
	const [jobId, setJobId] = useState('');
	const [techId, setTechId] =
		useState('');
	const [
		customerName,
		setCustomerName,
	] = useState('');
	const [status, setStatus] = useState('');
	const [jobType, setJobType] =
		useState('');
	const [
		routeCriteria,
		setRouteCriteria,
	] = useState('');

	const [results, setResults] =
		useState(null);
	const [searching, setSearching] =
		useState(false);
	const [searchError, setSearchError] =
		useState(null);

	const gridRef = useRef(null);
	const requestSequenceRef = useRef(0);
	const activeDragCleanupRef = useRef(null);
	const fallbackRowIdsRef = useRef(
		new WeakMap(),
	);
	const fallbackRowSequenceRef =
		useRef(0);

	const dateError = useMemo(() => {
		if (
			dateFrom &&
			!isValidDateInput(dateFrom)
		) {
			return 'La date de début est invalide.';
		}

		if (
			dateTo &&
			!isValidDateInput(dateTo)
		) {
			return 'La date de fin est invalide.';
		}

		if (
			dateFrom &&
			dateTo &&
			compareDateInputs(
				dateFrom,
				dateTo,
			) > 0
		) {
			return 'La date de début doit précéder la date de fin.';
		}

		return null;
	}, [dateFrom, dateTo]);

	const identifierError = useMemo(() => {
		if (
			normalizeText(jobId) &&
			parsePositiveInteger(jobId) === null
		) {
			return 'L’identifiant de l’intervention doit être un entier positif.';
		}

		if (
			normalizeText(techId) &&
			parsePositiveInteger(techId) === null
		) {
			return 'L’identifiant du technicien doit être un entier positif.';
		}

		return null;
	}, [jobId, techId]);

	const validationError =
		dateError || identifierError;

	const resultCount = Array.isArray(results)
		? results.length
		: 0;

	const getRowId = useCallback((params) => {
		const businessId =
			getStableBusinessRowId(
				params.data,
			);

		if (businessId) {
			return businessId;
		}

		if (
			!isRecord(params.data)
		) {
			fallbackRowSequenceRef.current += 1;

			return `fallback:${fallbackRowSequenceRef.current}`;
		}

		const existing =
			fallbackRowIdsRef.current.get(
				params.data,
			);

		if (existing) {
			return existing;
		}

		fallbackRowSequenceRef.current += 1;

		const fallbackId =
			`fallback:${fallbackRowSequenceRef.current}`;

		fallbackRowIdsRef.current.set(
			params.data,
			fallbackId,
		);

		return fallbackId;
	}, []);

	const stopPendingDrag = useCallback(() => {
		const cleanup =
			activeDragCleanupRef.current;

		activeDragCleanupRef.current = null;

		if (typeof cleanup === 'function') {
			cleanup();
		}
	}, []);

	useEffect(
		() => () => {
			requestSequenceRef.current += 1;
			stopPendingDrag();
		},
		[stopPendingDrag],
	);

	const handleSearch = useCallback(
		async (event) => {
			event?.preventDefault();

			if (
				searching ||
				validationError
			) {
				if (validationError) {
					setSearchError(
						validationError,
					);
				}

				return;
			}

			const params = {};

			if (dateFrom) {
				params.date_from = dateFrom;
			}

			if (dateTo) {
				params.date_to = dateTo;
			}

			const parsedJobId =
				parsePositiveInteger(jobId);

			if (parsedJobId !== null) {
				params.job_id = parsedJobId;
			}

			const parsedTechId =
				parsePositiveInteger(techId);

			if (parsedTechId !== null) {
				params.tech_id = parsedTechId;
			}

			const normalizedCustomerName =
				normalizeText(customerName);

			if (normalizedCustomerName) {
				params.customer_name =
					normalizedCustomerName;
			}

			if (status) {
				params.status = status;
			}

			if (jobType) {
				params.job_type = jobType;
			}

			const normalizedRouteCriteria =
				normalizeText(routeCriteria);

			if (normalizedRouteCriteria) {
				params.route_criteria =
					normalizedRouteCriteria;
			}

			const requestSequence =
				requestSequenceRef.current + 1;

			requestSequenceRef.current =
				requestSequence;

			setSearching(true);
			setSearchError(null);

			try {
				const response =
					await api.searchJobs(params);

				if (
					requestSequence !==
					requestSequenceRef.current
				) {
					return;
				}

				if (
					!Array.isArray(response?.data)
				) {
					setResults([]);
					setSearchError(
						'La réponse reçue pour la recherche est invalide.',
					);
					return;
				}

				const validResults =
					response.data.filter(
						isRecord,
					);

				fallbackRowIdsRef.current =
					new WeakMap();
				fallbackRowSequenceRef.current =
					0;

				setResults(validResults);
			} catch (error) {
				if (
					requestSequence !==
					requestSequenceRef.current
				) {
					return;
				}

				console.error(
					'Erreur de recherche des interventions :',
					error,
				);

				setResults([]);
				setSearchError(
					getApiErrorMessage(error),
				);
			} finally {
				if (
					requestSequence ===
					requestSequenceRef.current
				) {
					setSearching(false);
				}
			}
		},
		[
			customerName,
			dateFrom,
			dateTo,
			jobId,
			jobType,
			routeCriteria,
			searching,
			status,
			techId,
			validationError,
		],
	);

	const handleClear = useCallback(() => {
		requestSequenceRef.current += 1;
		setSearching(false);

		const currentViewDate =
			formatDateInput(viewDate);

		setDateFrom(currentViewDate);
		setDateTo(currentViewDate);
		setJobId('');
		setTechId('');
		setCustomerName('');
		setStatus('');
		setJobType('');
		setRouteCriteria('');
		setResults(null);
		setSearchError(null);

		fallbackRowIdsRef.current =
			new WeakMap();
		fallbackRowSequenceRef.current = 0;
	}, [viewDate]);

	const handleRowDoubleClicked =
		useCallback(
			(params) => {
				if (
					!params.data ||
					typeof onJobDetail !==
						'function'
				) {
					return;
				}

				onJobDetail(params.data);
			},
			[onJobDetail],
		);

	const handleCellKeyDown = useCallback(
		(params) => {
			const event = params.event;

			if (
				!event ||
				event.key !== 'Enter' ||
				!params.data ||
				typeof onJobDetail !==
					'function'
			) {
				return;
			}

			event.preventDefault();
			onJobDetail(params.data);
		},
		[onJobDetail],
	);

	const handleCellContextMenu =
		useCallback(
			(params) => {
				if (
					!params.event ||
					!params.data ||
					typeof onContextMenu !==
						'function'
				) {
					return;
				}

				params.event.preventDefault();
				onContextMenu(
					params.event,
					params.data,
				);
			},
			[onContextMenu],
		);

	const handleMouseDown = useCallback(
		(event) => {
			if (
				event.button !== 0 ||
				typeof onDragStart !==
					'function' ||
				isIgnoredDragTarget(event.target)
			) {
				return;
			}

			const rowElement =
				event.target.closest('.ag-row');

			if (!rowElement) {
				return;
			}

			const startX = event.clientX;
			const startY = event.clientY;
			let fired = false;

			const cleanup = () => {
				document.removeEventListener(
					'mousemove',
					handleMove,
				);
				document.removeEventListener(
					'mouseup',
					handleEnd,
				);
				window.removeEventListener(
					'blur',
					handleEnd,
				);

				if (
					activeDragCleanupRef.current ===
					cleanup
				) {
					activeDragCleanupRef.current =
						null;
				}
			};

			const handleMove = (
				moveEvent,
			) => {
				if (fired) {
					return;
				}

				const distance =
					Math.abs(
						moveEvent.clientX -
							startX,
					) +
					Math.abs(
						moveEvent.clientY -
							startY,
					);

				if (distance <= 8) {
					return;
				}

				fired = true;

				const job = getRowFromElement(
					gridRef.current?.api,
					rowElement,
				);

				if (job) {
					document.body.style.userSelect =
						'none';
					document.body.style.cursor =
						'grabbing';

					try {
						onDragStart(job);
					} catch (error) {
						document.body.style.userSelect =
							'';
						document.body.style.cursor = '';
						console.error(
							'Erreur au démarrage du déplacement :',
							error,
						);
					}
				}

				cleanup();
			};

			const handleEnd = () => {
				cleanup();
			};

			stopPendingDrag();
			activeDragCleanupRef.current =
				cleanup;

			document.addEventListener(
				'mousemove',
				handleMove,
			);
			document.addEventListener(
				'mouseup',
				handleEnd,
			);
			window.addEventListener(
				'blur',
				handleEnd,
			);
		},
		[onDragStart, stopPendingDrag],
	);

	const handleTouchStart =
		useCallback(
			(event) => {
				if (
					typeof onDragStart !==
						'function' ||
					isIgnoredDragTarget(
						event.target,
					)
				) {
					return;
				}

				const rowElement =
					event.target.closest(
						'.ag-row',
					);

				const initialTouch =
					event.touches?.[0];

				if (
					!rowElement ||
					!initialTouch
				) {
					return;
				}

				const startX =
					initialTouch.clientX;
				const startY =
					initialTouch.clientY;

				let timerId = null;
				let fired = false;

				const cleanup = () => {
					if (timerId !== null) {
						window.clearTimeout(
							timerId,
						);
						timerId = null;
					}

					rowElement.removeEventListener(
						'touchmove',
						handleTouchMove,
					);
					rowElement.removeEventListener(
						'touchend',
						handleTouchEnd,
					);
					rowElement.removeEventListener(
						'touchcancel',
						handleTouchEnd,
					);

					if (
						activeDragCleanupRef.current ===
						cleanup
					) {
						activeDragCleanupRef.current =
							null;
					}
				};

				const handleTouchMove = (
					moveEvent,
				) => {
					const touch =
						moveEvent.touches?.[0];

					if (!touch) {
						cleanup();
						return;
					}

					const distance =
						Math.abs(
							touch.clientX - startX,
						) +
						Math.abs(
							touch.clientY - startY,
						);

					if (distance > 10) {
						cleanup();
					}
				};

				const handleTouchEnd = () => {
					cleanup();
				};

				timerId = window.setTimeout(
					() => {
						if (fired) {
							return;
						}

						fired = true;

						const job =
							getRowFromElement(
								gridRef.current?.api,
								rowElement,
							);

						if (job) {
							navigator.vibrate?.(30);

							try {
								onDragStart(job);
							} catch (error) {
								console.error(
									'Erreur au démarrage du déplacement tactile :',
									error,
								);
							}
						}

						cleanup();
					},
					200,
				);

				stopPendingDrag();
				activeDragCleanupRef.current =
					cleanup;

				rowElement.addEventListener(
					'touchmove',
					handleTouchMove,
					{
						passive: true,
					},
				);
				rowElement.addEventListener(
					'touchend',
					handleTouchEnd,
					{
						once: true,
					},
				);
				rowElement.addEventListener(
					'touchcancel',
					handleTouchEnd,
					{
						once: true,
					},
				);
			},
			[
				onDragStart,
				stopPendingDrag,
			],
		);

	const columnDefs = useMemo(
		() => [
			{
				headerName: 'Intervention',
				width: 105,
				valueGetter: (params) =>
					getResultReference(
						params.data,
					),
				tooltipValueGetter: (params) =>
					getResultReference(
						params.data,
					),
				cellStyle: {
					fontFamily:
						'var(--font-mono)',
					fontSize:
						'var(--font-size-xs)',
				},
			},
			{
				field: 'job_type',
				headerName: 'Type',
				width: 120,
				valueFormatter: (params) =>
					formatJobType(params.value),
				tooltipValueGetter: (params) =>
					formatJobType(params.value),
				cellStyle: {
					fontSize:
						'var(--font-size-xs)',
				},
			},
			{
				field: 'status',
				headerName: 'Statut',
				width: 135,
				valueFormatter: (params) =>
					formatStatus(params.value),
				tooltipValueGetter: (params) =>
					formatStatus(params.value),
				cellStyle: (params) => ({
					fontSize:
						'var(--font-size-xs)',
					fontWeight: 500,
					color: getStatusColor(
						params.value,
					),
				}),
			},
			{
				field: 'assigned_tech_name',
				headerName: 'Technicien',
				width: 130,
				valueFormatter: (params) =>
					normalizeText(
						params.value,
					) || '—',
				tooltipValueGetter: (params) =>
					normalizeText(
						params.value,
					) || '—',
				cellStyle: {
					fontSize:
						'var(--font-size-xs)',
					color:
						'var(--text-secondary)',
				},
			},
			{
				field: 'priority',
				headerName: 'Priorité',
				width: 85,
				valueFormatter: (params) =>
					formatPriority(
						params.value,
					),
				tooltipValueGetter: (params) =>
					formatPriority(
						params.value,
					),
				cellStyle: (params) => ({
					fontSize:
						'var(--font-size-xs)',
					fontWeight: 600,
					color: getPriorityColor(
						params.value,
					),
				}),
			},
			{
				field: 'customer_name',
				headerName: 'Client',
				minWidth: 140,
				flex: 1,
				valueFormatter: (params) =>
					normalizeText(
						params.value,
					) || '—',
				tooltipField: 'customer_name',
			},
			{
				field: 'route_criteria',
				headerName: 'Secteur',
				width: 105,
				valueFormatter: (params) =>
					normalizeText(
						params.value,
					) || '—',
				tooltipField: 'route_criteria',
				cellStyle: {
					fontFamily:
						'var(--font-mono)',
					fontSize:
						'var(--font-size-xs)',
					color:
						'var(--text-secondary)',
				},
			},
			{
				field: 'service_address',
				headerName: 'Adresse',
				minWidth: 170,
				flex: 1,
				valueFormatter: (params) =>
					normalizeText(
						params.value,
					) || '—',
				tooltipField: 'service_address',
				cellStyle: {
					fontSize:
						'var(--font-size-xs)',
					color:
						'var(--text-secondary)',
				},
			},
			{
				field: 'service_city',
				headerName: 'Ville',
				width: 105,
				valueFormatter: (params) =>
					normalizeText(
						params.value,
					) || '—',
				tooltipField: 'service_city',
				cellStyle: {
					fontSize:
						'var(--font-size-xs)',
					color:
						'var(--text-secondary)',
				},
			},
			{
				field: 'service_zip',
				headerName: 'Code postal',
				width: 90,
				valueFormatter: (params) =>
					normalizeText(
						params.value,
					) || '—',
				cellStyle: {
					fontFamily:
						'var(--font-mono)',
					fontSize:
						'var(--font-size-xs)',
					color:
						'var(--text-muted)',
				},
			},
			{
				headerName: 'Créneau',
				width: 115,
				valueGetter: (params) =>
					formatTimeSlot(
						params.data
							?.time_slot_start,
						params.data
							?.time_slot_end,
					),
				tooltipValueGetter: (params) =>
					formatTimeSlot(
						params.data
							?.time_slot_start,
						params.data
							?.time_slot_end,
					),
				cellStyle: {
					fontFamily:
						'var(--font-mono)',
					fontSize:
						'var(--font-size-xs)',
				},
			},
			{
				field: 'estimated_duration',
				headerName: 'Durée',
				width: 90,
				valueFormatter: (params) =>
					formatDuration(
						params.value,
					),
				tooltipValueGetter: (params) =>
					formatDuration(
						params.value,
					),
				cellStyle: {
					fontFamily:
						'var(--font-mono)',
					fontSize:
						'var(--font-size-xs)',
					color:
						'var(--text-secondary)',
				},
			},
			{
				field: 'required_skills',
				headerName: 'Compétences',
				minWidth: 150,
				flex: 1,
				valueFormatter: (params) =>
					normalizeDisplayList(
						params.value,
					).join(', ') || '—',
				tooltipValueGetter: (params) =>
					normalizeDisplayList(
						params.value,
					).join(', ') || '—',
				cellStyle: {
					fontSize:
						'var(--font-size-xs)',
					color:
						'var(--text-muted)',
				},
			},
		],
		[],
	);

	const defaultColDef = useMemo(
		() => ({
			sortable: true,
			resizable: true,
			suppressMovable: false,
		}),
		[],
	);

	const handleClose = useCallback(() => {
		requestSequenceRef.current += 1;
		stopPendingDrag();

		if (typeof onClose === 'function') {
			onClose();
		}
	}, [onClose, stopPendingDrag]);

	return (
		<FloatingWindow
			title="Recherche d’interventions"
			onClose={handleClose}
			defaultPos={{
				x: 100,
				y: 50,
			}}
			defaultSize={{
				w: 740,
				h: 520,
			}}
			minSize={{
				w: 560,
				h: 380,
			}}
			className="fw-job-search"
			zIndex={1600}
		>
			<form
				className="js-criteria"
				onSubmit={handleSearch}
				noValidate
			>
				<div className="js-row">
					<label
						className="js-label"
						htmlFor="job-search-date-from"
					>
						Du
					</label>

					<input
						id="job-search-date-from"
						type="date"
						className="js-input"
						value={dateFrom}
						onChange={(event) => {
							setDateFrom(
								event.target.value,
							);
							setSearchError(null);
						}}
						disabled={searching}
					/>

					<label
						className="js-label"
						htmlFor="job-search-date-to"
					>
						Au
					</label>

					<input
						id="job-search-date-to"
						type="date"
						className="js-input"
						value={dateTo}
						onChange={(event) => {
							setDateTo(
								event.target.value,
							);
							setSearchError(null);
						}}
						disabled={searching}
					/>

					<label
						className="js-label"
						htmlFor="job-search-id"
					>
						ID
					</label>

					<input
						id="job-search-id"
						type="text"
						inputMode="numeric"
						className="js-input js-input--sm"
						value={jobId}
						onChange={(event) => {
							setJobId(
								event.target.value,
							);
							setSearchError(null);
						}}
						placeholder="#"
						autoComplete="off"
						disabled={searching}
						aria-invalid={Boolean(
							normalizeText(jobId) &&
								parsePositiveInteger(
									jobId,
								) === null,
						)}
					/>
				</div>

				<div className="js-row">
					<label
						className="js-label"
						htmlFor="job-search-customer"
					>
						Client
					</label>

					<input
						id="job-search-customer"
						type="search"
						className="js-input js-input--lg"
						value={customerName}
						onChange={(event) => {
							setCustomerName(
								event.target.value,
							);
							setSearchError(null);
						}}
						placeholder="Nom du client…"
						autoComplete="off"
						disabled={searching}
					/>

					<label
						className="js-label"
						htmlFor="job-search-tech-id"
					>
						Tech.
					</label>

					<input
						id="job-search-tech-id"
						type="text"
						inputMode="numeric"
						className="js-input js-input--sm"
						value={techId}
						onChange={(event) => {
							setTechId(
								event.target.value,
							);
							setSearchError(null);
						}}
						placeholder="#"
						autoComplete="off"
						disabled={searching}
						aria-invalid={Boolean(
							normalizeText(techId) &&
								parsePositiveInteger(
									techId,
								) === null,
						)}
					/>

					<label
						className="js-label"
						htmlFor="job-search-route"
					>
						Secteur
					</label>

					<input
						id="job-search-route"
						type="search"
						className="js-input"
						value={routeCriteria}
						onChange={(event) => {
							setRouteCriteria(
								event.target.value,
							);
							setSearchError(null);
						}}
						placeholder="Zone…"
						autoComplete="off"
						disabled={searching}
					/>
				</div>

				<div className="js-row">
					<label
						className="js-label"
						htmlFor="job-search-status"
					>
						Statut
					</label>

					<select
						id="job-search-status"
						className="js-select"
						value={status}
						onChange={(event) => {
							setStatus(
								event.target.value,
							);
							setSearchError(null);
						}}
						disabled={searching}
					>
						{STATUS_OPTIONS.map(
							(option) => (
								<option
									key={
										option.value ||
										'all-statuses'
									}
									value={option.value}
								>
									{option.label}
								</option>
							),
						)}
					</select>

					<label
						className="js-label"
						htmlFor="job-search-type"
					>
						Type
					</label>

					<select
						id="job-search-type"
						className="js-select"
						value={jobType}
						onChange={(event) => {
							setJobType(
								event.target.value,
							);
							setSearchError(null);
						}}
						disabled={searching}
					>
						{JOB_TYPE_OPTIONS.map(
							(option) => (
								<option
									key={
										option.value ||
										'all-job-types'
									}
									value={option.value}
								>
									{option.label}
								</option>
							),
						)}
					</select>

					<div style={{ flex: 1 }} />

					<button
						type="button"
						className="btn btn--sm"
						onClick={handleClear}
						disabled={searching}
					>
						Effacer
					</button>

					<button
						type="submit"
						className="btn btn--sm btn--primary"
						disabled={
							searching ||
							Boolean(validationError)
						}
						title={
							validationError ||
							'Rechercher les interventions'
						}
					>
						{searching
							? 'Recherche…'
							: 'Rechercher'}
					</button>
				</div>
			</form>

			{(searchError ||
				validationError) && (
				<div
					role="alert"
					style={SEARCH_ERROR_STYLE}
				>
					{searchError ||
						validationError}
				</div>
			)}

			{results === null ? (
				<div className="js-placeholder">
					Renseignez les critères puis lancez la
					recherche.
				</div>
			) : (
				<>
					<div className="js-result-header">
						<span
							className="js-result-count"
							style={
								searchError
									? RESULT_HEADER_ERROR_STYLE
									: undefined
							}
							aria-live="polite"
						>
							{searching
								? 'Recherche en cours…'
								: `${resultCount} intervention${
										resultCount !== 1
											? 's'
											: ''
									} trouvée${
										resultCount !== 1
											? 's'
											: ''
									}`}
						</span>

						<span className="js-result-hint">
							Double-clic ou Entrée pour les
							détails · Glisser pour affecter
						</span>
					</div>

					<div
						className="ag-theme-fieldopt js-grid"
						style={{
							flex: 1,
							minHeight: 0,
						}}
						onMouseDown={handleMouseDown}
						onTouchStart={
							handleTouchStart
						}
						aria-label="Résultats de la recherche d’interventions"
					>
						<AgGridReact
							ref={gridRef}
							rowData={results}
							columnDefs={columnDefs}
							defaultColDef={
								defaultColDef
							}
							getRowId={getRowId}
							animateRows={false}
							headerHeight={26}
							rowHeight={24}
							suppressCellFocus={false}
							onRowDoubleClicked={
								handleRowDoubleClicked
							}
							onCellKeyDown={
								handleCellKeyDown
							}
							onCellContextMenu={
								handleCellContextMenu
							}
							preventDefaultOnContextMenu
							overlayNoRowsTemplate="Aucune intervention trouvée"
						/>
					</div>
				</>
			)}
		</FloatingWindow>
	);
}
