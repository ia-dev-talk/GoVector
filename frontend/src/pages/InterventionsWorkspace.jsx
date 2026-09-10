/**
 * InterventionsPage — orchestration du workspace d'exploitation FTTH.
 *
 * La page conserve les contrats API, le temps réel, l'affectation,
 * l'import/export et les fenêtres métier. Les surfaces principales sont
 * déléguées aux composants du domaine interventions.
 */
import {
	useState,
	useEffect,
	useCallback,
	useMemo,
	useRef,
} from 'react';
import { api } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import { useSimEvents } from '../hooks/useSimEvents';
import JobGrid from '../components/JobGrid';
import MapWindow from '../components/MapWindow';
import TechTimeline from '../components/TechTimeline';
import ContextMenu from '../components/ContextMenu';
import Toast from '../components/Toast';
import SimBar from '../components/SimBar';
import CalendarPicker from '../components/CalendarPicker';
import FilterWindow from '../components/FilterWindow';
import JobSearchWindow from '../components/JobSearchWindow';
import NewJobWindow from '../components/NewJobWindow';
import EditJobWindow from '../components/EditJobWindow';
import ImportCenter from '../components/import/ImportCenter';
import ExportCenter from '../components/export/ExportCenter';
import { BoltIcon } from '../components/DashboardIcons';
import InterventionWorkspaceHeader from '../components/interventions/InterventionWorkspaceHeader';
import InterventionKpiStrip from '../components/interventions/InterventionKpiStrip';
import InterventionToolbar from '../components/interventions/InterventionToolbar';
import InterventionFilterPanel from '../components/interventions/InterventionFilterPanel';
import InterventionTechnicianRail from '../components/interventions/InterventionTechnicianRail';
import InterventionInspector from '../components/interventions/InterventionInspector';
import InterventionEmptyState from '../components/interventions/InterventionEmptyState';
import InterventionWorkspaceEmptyState from '../components/interventions/InterventionWorkspaceEmptyState';
import InterventionDetailPage from '../features/intervention-detail/InterventionDetailPage';
import {
	filterTechniciansForInterventionScope,
	jobOperationalSector,
} from '../lib/job-sector.js';
import '../styles/interventions-v3.css';

/* ── Helpers ─────────────────────────────────────────── */
function fmtDate(date) {
	return `${date.getFullYear()}-${String(
		date.getMonth() + 1
	).padStart(2, '0')}-${String(
		date.getDate()
	).padStart(2, '0')}`;
}

function fmtTime(date) {
	const hours = String(
		date.getHours()
	).padStart(2, '0');

	const minutes = String(
		date.getMinutes()
	).padStart(2, '0');

	return `${hours}:${minutes}`;
}

function sameDay(leftDate, rightDate) {
	return (
		leftDate.getFullYear() ===
			rightDate.getFullYear() &&
		leftDate.getMonth() ===
			rightDate.getMonth() &&
		leftDate.getDate() ===
			rightDate.getDate()
	);
}

const OFFLINE_TECH_STATUSES = new Set([
	'hors_service',
	'deconnecte',
]);

function normalizeStatus(value) {
	return String(value || '')
		.trim()
		.toLowerCase();
}

function normalizeIdentifier(value) {
	if (value == null) {
		return null;
	}

	const identifier = String(
		value
	).trim();

	return identifier || null;
}

const getPositiveJobId = (value) => (
	Number.isInteger(value) &&
	value > 0
		? value
		: null
);

const createEmptyAdvFilters = () => ({
	operator: null,
	sector: null,
	team: null,
	techId: null,
	status: null,
	priority: null,
	type: null,
	urgent: null,
	_search: '',
});

const OVERDUE_FILTER_UNAVAILABLE_MESSAGE =
	'Filtre « En retard » indisponible : règle métier en cours de définition.';

function isUrgentPriority(value) {
	return (
		typeof value === 'string' &&
		value.trim().toUpperCase() ===
			'URGENT'
	);
}

function getCockpitIntent(value) {
	if (
		value === null ||
		typeof value !== 'object' ||
		Array.isArray(value)
	) {
		return null;
	}

	const jobId = getPositiveJobId(
		value.id
	);

	if (jobId !== null) {
		return {
			type: 'id',
			id: jobId,
			key: `id:${jobId}`,
		};
	}

	const filterKeys = [
		'status',
		'priority',
		'unassigned',
	].filter((key) =>
		Object.prototype.hasOwnProperty.call(
			value,
			key
		)
	);

	if (filterKeys.length !== 1) {
		return null;
	}

	if (
		filterKeys[0] === 'status' &&
		typeof value.status === 'string'
	) {
		const status = value.status
			.trim()
			.toLowerCase();

		if (status === 'in_progress') {
			return {
				type: 'filter',
				filter: 'in_progress',
				key: 'status:in_progress',
			};
		}

		if (status === 'overdue') {
			return {
				type: 'unavailable',
				filter: 'overdue',
				key: 'unavailable:overdue',
			};
		}
	}

	if (
		filterKeys[0] === 'priority' &&
		isUrgentPriority(
			value.priority
		)
	) {
		return {
			type: 'filter',
			filter: 'urgent',
			key: 'priority:URGENT',
		};
	}

	if (
		filterKeys[0] === 'unassigned' &&
		value.unassigned === true
	) {
		return {
			type: 'filter',
			filter: 'unassigned',
			key: 'unassigned:true',
		};
	}

	return null;
}

function hasAssignedTechnician(job) {
	return normalizeIdentifier(
		job?.assigned_tech_id
	) !== null;
}

function normalizePriority(value) {
	return String(value ?? '')
		.trim()
		.toUpperCase();
}

function normalizeSearchText(value) {
	return String(value ?? '')
		.trim()
		.toLocaleLowerCase('fr');
}

/* ── Activity Timeline ───────────────────────────────── */
function ActivityTimeline({
	activities,
}) {
	if (
		!Array.isArray(activities) ||
		activities.length === 0
	) {
		return (
			<div className="ie-tl-empty">
				Aucune activité récente
			</div>
		);
	}

	return (
		<div className="ie-tl-list">
			{activities.map(
				(activity, index) => (
					<div
						key={
							activity.ts ||
							`${activity.time}-${index}`
						}
						className={`ie-tl-item ie-tl-item--${
							activity.type ||
							'info'
						}`}
					>
						<div className="ie-tl-dot" />
						<div className="ie-tl-line" />
						<div className="ie-tl-time">
							{activity.time}
						</div>
						<div className="ie-tl-content">
							<span className="ie-tl-msg">
								{
									activity.message
								}
							</span>
						</div>
					</div>
				)
			)}
		</div>
	);
}

/* ── Main Page ───────────────────────────────────────── */
export default function InterventionsPage({
	userRole,
	navigationPayload,
}) {
	const isAdmin =
		userRole === 'ADMIN';

	const isChef =
		userRole === 'CHEF_ORIENTEUR';

	const isOrienteur =
		userRole === 'ORIENTEUR';

	const canManageInterventions =
		isAdmin ||
		isChef ||
		isOrienteur;

	const canAssign =
		canManageInterventions;

	const canEdit =
		canManageInterventions;

	const canDelete =
		canManageInterventions;

	const canAutoAssign =
		isAdmin ||
		isOrienteur;

	// ── Data ──
	const [techs, setTechs] =
		useState([]);

	const [jobs, setJobs] =
		useState([]);

	const [, setSummary] =
		useState(null);

	const [loading, setLoading] =
		useState(true);

	const [
		orienteurs,
		setOrienteurs,
	] = useState([]);

	const [, setSectors] =
		useState([]);

	// ── View date ──
	const [viewDate, setViewDate] =
		useState(() => new Date());

	const [calOpen, setCalOpen] =
		useState(false);

	const calAnchorRef =
		useRef(null);

	const isToday = sameDay(
		viewDate,
		new Date()
	);

	// ── UI state ──
	const [
		refreshing,
		setRefreshing,
	] = useState(false);

	const [isDemo, setIsDemo] =
		useState(false);

	const [
		demoLocked,
		setDemoLocked,
	] = useState(false);

	const [
		simElapsed,
		setSimElapsed,
	] = useState(null);

	const [showMap, setShowMap] =
		useState(false);

	const [
		showTimeline,
		setShowTimeline,
	] = useState(false);

	const [
		filtersExpanded,
		setFiltersExpanded,
	] = useState(false);

	const [showTechs, setShowTechs] =
		useState(true);

	// ── Windows ──
	const [
		filterOpen,
		setFilterOpen,
	] = useState(false);

	const [
		jobSearchOpen,
		setJobSearchOpen,
	] = useState(false);

	const [
		newJobOpen,
		setNewJobOpen,
	] = useState(false);

	useEffect(() => {
		if (
			navigationPayload?.action === 'new' &&
			canManageInterventions
		) {
			setNewJobOpen(true);
		}
	}, [canManageInterventions, navigationPayload]);

	const [
		importOpen,
		setImportOpen,
	] = useState(false);

	const [
		exportOpen,
		setExportOpen,
	] = useState(false);

	const [
		detailJob,
		setDetailJob,
	] = useState(null);

	const [
		fullDetailJob,
		setFullDetailJob,
	] = useState(null);

	const [
		detailRefreshRevision,
		setDetailRefreshRevision,
	] = useState(0);

	const [
		editJob,
		setEditJob,
	] = useState(null);

	const [
		pendingCockpitJobId,
		setPendingCockpitJobId,
	] = useState(null);

	const [
		displayFilter,
		setDisplayFilter,
	] = useState(null);

	const [
		jobFilter,
		setJobFilter,
	] = useState(null);

	const [
		techFilter,
		setTechFilter,
	] = useState(null);

	// ── Advanced filters ──
	const [
		advFilters,
		setAdvFilters,
	] = useState(
		createEmptyAdvFilters
	);

	// ── Selection & context ──
	const [
		selJobs,
		setSelJobs,
	] = useState([]);

	const [
		selTechs,
		setSelTechs,
	] = useState([]);

	const [
		ctxMenu,
		setCtxMenu,
	] = useState(null);

	const [
		dragJob,
		setDragJob,
	] = useState(null);

	const [overrunMap] =
		useState(() => new Map());

	const [
		overrideWarning,
		setOverrideWarning,
	] = useState(null);

	const [
		autoRouteConfirm,
		setAutoRouteConfirm,
	] = useState(false);

	const [
		autoRouting,
		setAutoRouting,
	] = useState(false);

	// ── Activity timeline ──
	const [
		activities,
		setActivities,
	] = useState([]);

	// ── Refs ──
	const techPaneRef =
		useRef(null);

	const techGridRef =
		useRef(null);

	const jobGridRef =
		useRef(null);

	const dragGhostRef =
		useRef(null);

	const selJobsRef =
		useRef(selJobs);

	const loadDataRef =
		useRef(null);

	const demoLockedRef =
		useRef(false);

	const dragJobRef =
		useRef(null);

	const lastNavigationPayloadJobIdRef =
		useRef(null);

	const hasValidNavigationPayloadJobIdRef =
		useRef(false);

	const lastNavigationPayloadFilterKeyRef =
		useRef(null);

	const hasValidNavigationPayloadFilterRef =
		useRef(false);

	useEffect(() => {
		dragJobRef.current = dragJob;
	}, [dragJob]);

	useEffect(() => {
		selJobsRef.current = selJobs;
	}, [selJobs]);

	useEffect(() => {
		demoLockedRef.current =
			demoLocked;
	}, [demoLocked]);

	// ── Filtered techs ──
	const fTechs = useMemo(() => {
		let result = techs;

		if (
			displayFilter?.techIds
				?.length > 0
		) {
			result = result.filter(
				(technician) =>
					displayFilter.techIds.includes(
						technician.id
					)
			);
		}

		if (techFilter === 'active') {
			result = result.filter(
				(technician) =>
					normalizeStatus(
						technician.live_status
					) === 'disponible'
			);
		} else if (
			techFilter === 'off_duty'
		) {
			result = result.filter(
				(technician) =>
					OFFLINE_TECH_STATUSES.has(
						normalizeStatus(
							technician.live_status
						)
					)
			);
		}

		return filterTechniciansForInterventionScope(
			result,
			advFilters
		);
	}, [
		techs,
		displayFilter,
		techFilter,
		advFilters,
	]);

	// ── Filtered jobs ──
	const fJobs = useMemo(() => {
		let result = jobs;

		if (displayFilter) {
			result = result.filter(
				(job) => {
					const slot =
						job.time_slot_start &&
						job.time_slot_end
							? `${job.time_slot_start}–${job.time_slot_end}`
							: null;

					if (
						slot &&
						displayFilter.timeSlots
							?.length > 0 &&
						!displayFilter.timeSlots.includes(
							slot
						)
					) {
						return false;
					}

					if (
						job.job_type &&
						displayFilter.jobTypes
							?.length > 0 &&
						!displayFilter.jobTypes.includes(
							job.job_type
						)
					) {
						return false;
					}

					if (
						displayFilter.routeCriteria
							?.length > 0 &&
						!displayFilter.routeCriteria.includes(
							jobOperationalSector(job)
						)
					) {
						return false;
					}

					return true;
				}
			);
		}

		if (jobFilter === 'pending') {
			result = result.filter(
				(job) =>
					normalizeStatus(
						job.status
					) === 'pending' &&
					!hasAssignedTechnician(
						job
					)
			);
		} else if (
			jobFilter === 'assigned'
		) {
			result = result.filter(
				(job) =>
					normalizeStatus(
						job.status
					) === 'assigned' &&
					hasAssignedTechnician(
						job
					)
			);
		} else if (
			jobFilter === 'unassigned'
		) {
			result = result.filter(
				(job) =>
					job.assigned_tech_id ==
					null
			);
		} else if (
			jobFilter &&
			jobFilter !== 'overdue'
		) {
			result = result.filter(
				(job) =>
					normalizeStatus(
						job.status
					) ===
					normalizeStatus(
						jobFilter
					)
			);
		}

		if (advFilters.operator) {
			result = result.filter(
				(job) =>
					job.operator ===
					advFilters.operator
			);
		}

		if (advFilters.sector) {
			result = result.filter(
				(job) =>
					jobOperationalSector(job) ===
					advFilters.sector
			);
		}

		if (advFilters.team) {
			const teamTechIds = new Set(
				techs
					.filter(
						(technician) =>
							technician.team ===
							advFilters.team
					)
					.map(
						(technician) =>
							normalizeIdentifier(
								technician.id
							)
					)
					.filter(Boolean)
			);

			result = result.filter(
				(job) =>
					teamTechIds.has(
						normalizeIdentifier(
							job.assigned_tech_id
						)
					)
			);
		}

		if (advFilters.techId) {
			const selectedTechId =
				normalizeIdentifier(
					advFilters.techId
				);

			result = result.filter(
				(job) =>
					normalizeIdentifier(
						job.assigned_tech_id
					) === selectedTechId
			);
		}

		if (advFilters.status) {
			result = result.filter(
				(job) =>
					normalizeStatus(
						job.status
					) ===
					normalizeStatus(
						advFilters.status
					)
			);
		}

		if (advFilters.priority) {
			result = result.filter(
				(job) =>
					normalizePriority(
						job.priority
					) ===
					normalizePriority(
						advFilters.priority
					)
			);
		}

		if (advFilters.type) {
			result = result.filter(
				(job) =>
					job.job_type ===
					advFilters.type
			);
		}

		if (advFilters.urgent) {
			result = result.filter(
				(job) =>
					isUrgentPriority(
						job.priority
					)
			);
		}

		const searchQuery =
			normalizeSearchText(
				advFilters._search
			);

		if (searchQuery.length >= 2) {
			result = result.filter(
				(job) =>
					[
						job.job_number,
						job.command_number,
						job.id,
						job.customer_name,
						job.customer_phone,
						job.service_address,
						job.service_city,
						job.operator,
						job.job_type,
						job.assigned_technician_name,
						job.assigned_tech_name,
					].some((value) =>
						normalizeSearchText(
							value
						).includes(
							searchQuery
						)
					)
			);
		}

		return result;
	}, [
		jobs,
		techs,
		displayFilter,
		jobFilter,
		advFilters,
	]);


	const activeFilterCount = useMemo(() => {
		const configuredFilterCount = [
			advFilters.operator,
			advFilters.sector,
			advFilters.team,
			advFilters.techId,
			advFilters.status,
			advFilters.priority,
			advFilters.type,
			advFilters.urgent,
		].filter(Boolean).length;

		return (
			configuredFilterCount +
			(displayFilter ? 1 : 0)
		);
	}, [
		advFilters,
		displayFilter,
	]);


	// ── Toasts ──
	const [toasts, setToasts] =
		useState([]);

	const toastIdRef =
		useRef(0);

	const toast = useCallback(
		(message, type = 'info') => {
			const id =
				++toastIdRef.current;

			setToasts(
				(previousToasts) => [
					...previousToasts,
					{
						id,
						msg: message,
						type,
					},
				]
			);

			setTimeout(() => {
				setToasts(
					(previousToasts) =>
						previousToasts.filter(
							(item) =>
								item.id !== id
						)
				);
			}, 3000);
		},
		[]
	);

	const applyCockpitFilter =
		useCallback((intent) => {
			setDisplayFilter(null);
			setTechFilter(null);
			setJobFilter(null);

			const emptyFilters =
				createEmptyAdvFilters();

			if (
				intent.filter ===
				'urgent'
			) {
				setAdvFilters({
					...emptyFilters,
					priority: 'URGENT',
				});
				return;
			}

			setAdvFilters(emptyFilters);

			if (
				intent.filter ===
				'in_progress'
			) {
				setJobFilter(
					'in_progress'
				);
			} else if (
				intent.filter ===
				'unassigned'
			) {
				setJobFilter(
					'unassigned'
				);
			}
		}, []);

	useEffect(() => {
		const jobId = getPositiveJobId(
			navigationPayload?.id
		);

		if (jobId === null) {
			hasValidNavigationPayloadJobIdRef.current =
				false;
			lastNavigationPayloadJobIdRef.current =
				null;
			return;
		}

		hasValidNavigationPayloadJobIdRef.current =
			true;

		if (
			lastNavigationPayloadJobIdRef.current ===
			jobId
		) {
			return;
		}

		lastNavigationPayloadJobIdRef.current =
			jobId;

		setPendingCockpitJobId(
			jobId
		);
	}, [navigationPayload]);

	useEffect(() => {
		const intent =
			getCockpitIntent(
				navigationPayload
			);

		if (
			intent === null ||
			intent.type === 'id'
		) {
			hasValidNavigationPayloadFilterRef.current =
				false;
			lastNavigationPayloadFilterKeyRef.current =
				null;
			return;
		}

		hasValidNavigationPayloadFilterRef.current =
			true;

		if (
			lastNavigationPayloadFilterKeyRef.current ===
			intent.key
		) {
			return;
		}

		lastNavigationPayloadFilterKeyRef.current =
			intent.key;

		if (intent.type === 'filter') {
			applyCockpitFilter(
				intent
			);
		} else {
			toast(
				OVERDUE_FILTER_UNAVAILABLE_MESSAGE,
				'warning'
			);
		}
	}, [
		navigationPayload,
		applyCockpitFilter,
		toast,
	]);

	useEffect(() => {
		try {
			const storedFilter =
				sessionStorage.getItem(
					'cockpit_filter'
				);

			if (!storedFilter) {
				return;
			}

			let parsedFilter;

			try {
				parsedFilter =
					JSON.parse(
						storedFilter
					);
			} catch {
				sessionStorage.removeItem(
					'cockpit_filter'
				);
				return;
			}

			const intent =
				getCockpitIntent(
					parsedFilter
				);

			if (intent === null) {
				return;
			}

			sessionStorage.removeItem(
				'cockpit_filter'
			);

			if (
				hasValidNavigationPayloadJobIdRef.current ||
				hasValidNavigationPayloadFilterRef.current
			) {
				return;
			}

			if (intent.type === 'id') {
				setPendingCockpitJobId(
					(previousJobId) =>
						hasValidNavigationPayloadJobIdRef
							.current ||
						hasValidNavigationPayloadFilterRef
							.current ||
						previousJobId !== null
							? previousJobId
							: intent.id
				);
			} else if (
				intent.type === 'filter'
			) {
				applyCockpitFilter(
					intent
				);
			} else {
				toast(
					OVERDUE_FILTER_UNAVAILABLE_MESSAGE,
					'warning'
				);
			}
		} catch {
			// sessionStorage indisponible.
		}
	}, [
		applyCockpitFilter,
		toast,
	]);

	useEffect(() => {
		if (
			loading ||
			pendingCockpitJobId ===
				null ||
			!Array.isArray(jobs)
		) {
			return;
		}

		const job = jobs.find(
			(item) =>
				item &&
				item.id ===
					pendingCockpitJobId
		);

		if (job) {
			setSelJobs([
				job.id,
			]);
			setDetailJob(job);
		} else {
			toast(
				`Intervention #${pendingCockpitJobId} introuvable dans les interventions chargées pour cette date.`,
				'warning'
			);
		}

		setPendingCockpitJobId(
			null
		);
	}, [
		pendingCockpitJobId,
		jobs,
		loading,
		toast,
	]);

	// ── Initial data ──
	useEffect(() => {
		api.getOrienteurs()
			.then((response) =>
				setOrienteurs(
					Array.isArray(
						response.data
					)
						? response.data
						: []
				)
			)
			.catch(() => {});

		api.getSectors()
			.then((response) =>
				setSectors(
					Array.isArray(
						response.data
					)
						? response.data
						: []
				)
			)
			.catch(() => {});
	}, []);

	useEffect(() => {
		api.simStatus()
			.then((response) => {
				if (
					response.data?.is_demo
				) {
					setIsDemo(true);
					setViewDate(
						new Date()
					);
				}
			})
			.catch(() => {});
	}, []);

	// ── Add activity ──
	const addActivity =
		useCallback(
			(
				message,
				type = 'info'
			) => {
				const now =
					new Date();

				setActivities(
					(previousActivities) => [
						{
							time:
								fmtTime(now),
							message,
							type,
							ts:
								now.getTime(),
						},
						...previousActivities,
					].slice(0, 50)
				);
			},
			[]
		);

	// ── Data loading ──
	const loadData = useCallback(
		async (
			showRefresh = false
		) => {
			if (showRefresh) {
				setRefreshing(true);
			}

			const targetDate =
				isDemo
					? fmtDate(
						new Date()
					)
					: fmtDate(viewDate);

			try {
				const [
					techniciansResponse,
					jobsResponse,
					summaryResponse,
				] = await Promise.all([
					api.getTechnicians(),
					api.getJobs({
						scheduled_date:
							targetDate,
					}),
					api.getJobsSummary({
						target_date:
							targetDate,
					}),
				]);

				setTechs(
					Array.isArray(
						techniciansResponse.data
					)
						? techniciansResponse.data
						: []
				);

				setJobs(
					Array.isArray(
						jobsResponse.data
					)
						? jobsResponse.data
						: []
				);

				setSummary(
					summaryResponse.data ||
						{}
				);
			} catch (error) {
				console.error(
					'[Interventions] Load error:',
					error
				);

				toast(
					'Échec du chargement des données',
					'error'
				);
			} finally {
				setLoading(false);
				setRefreshing(false);
			}
		},
		[
			viewDate,
			toast,
			isDemo,
		]
	);

	useEffect(() => {
		setLoading(true);
		loadData();
	}, [
		viewDate,
		loadData,
	]);

	useEffect(() => {
		loadDataRef.current =
			loadData;
	}, [loadData]);

	const goDay = useCallback(
		(offset) => {
			setSelJobs([]);
			setSelTechs([]);
			setDetailJob(null);
			setViewDate(
				(previousDate) => {
					const date =
						new Date(
							previousDate
						);

					date.setDate(
						date.getDate() +
							offset
					);

					return date;
				}
			);
		},
		[]
	);

	// ── WebSocket events ──
	const handleJobEvent =
		useCallback(
			(eventType, data) => {
				if (
					eventType ===
					'job:assigned'
				) {
					addActivity(
						`Intervention #${data?.job_id} affectée`,
						'info'
					);
					loadDataRef.current?.();
				} else if (
					eventType ===
					'job:started'
				) {
					addActivity(
						`Intervention #${data?.job_id} commencée`,
						'info'
					);
					loadDataRef.current?.();
				} else if (
					eventType ===
					'job:completed'
				) {
					addActivity(
						`Intervention #${data?.job_id} terminée`,
						'success'
					);
					loadDataRef.current?.();
				} else if (
					eventType ===
					'job:cancelled'
				) {
					addActivity(
						`Intervention #${data?.job_id} annulée`,
						'danger'
					);
					loadDataRef.current?.();
				}
			},
			[addActivity]
		);

	const handleTechEvent =
		useCallback(
			(eventType, data) => {
				if (
					eventType !==
					'tech:status_changed'
				) {
					return;
				}

				const technicianLabel =
					data?.name ||
					(
						data?.id != null
							? `#${data.id}`
							: 'inconnu'
					);

				addActivity(
					`Technicien ${technicianLabel} : ${String(
						data?.status ||
							''
					).replace(
						/_/g,
						' '
					)}`,
					'warning'
				);

				loadDataRef.current?.();
			},
			[addActivity]
		);

	useWebSocket('dispatch', {
		onJobEvent:
			handleJobEvent,
		onTechEvent:
			handleTechEvent,
	});

	// ── Simulation events ──
	const handleSimEvent =
		useCallback(
			(event) => {
				if (
					event.event_type ===
					'clock_tick'
				) {
					setSimElapsed(
						event.details
							?.elapsed_minutes ??
							null
					);
					return;
				}

				if (
					![
						'job_assigned',
						'job_started',
						'job_completed',
						'scripted_beat',
						'day_complete',
					].includes(
						event.event_type
					)
				) {
					return;
				}

				if (
					event.event_type ===
					'scripted_beat'
				) {
					addActivity(
						event.details
							?.description ??
							'Événement scénarisé',
						'info'
					);
				} else {
					addActivity(
						`Intervention #${event.job_id} ${event.event_type.replace(
							'job_',
							''
						)} (simulation)`,
						'info'
					);
				}

				loadDataRef.current?.();
			},
			[addActivity]
		);

	useSimEvents(handleSimEvent);

	// ── Close context menu ──
	useEffect(() => {
		const closeContextMenu =
			() =>
				setCtxMenu(null);

		document.addEventListener(
			'click',
			closeContextMenu
		);

		return () =>
			document.removeEventListener(
				'click',
				closeContextMenu
			);
	}, []);

	// ── Keyboard shortcuts ──
	useEffect(() => {
		const handleKeyDown = (
			event
		) => {
			if (
				event.target.tagName ===
					'INPUT' ||
				event.target.tagName ===
					'TEXTAREA' ||
				event.target.tagName ===
					'SELECT'
			) {
				return;
			}

			if (
				event.key === 'Escape'
			) {
				setCtxMenu(null);
				setDetailJob(null);
				setFilterOpen(false);
				setJobSearchOpen(false);
			}

			if (
				event.key === 'r' &&
				!event.ctrlKey &&
				!event.metaKey
			) {
				loadData(true);
			}

			if (
				event.key === 'm' &&
				!event.ctrlKey &&
				!event.metaKey
			) {
				setShowMap(
					(previous) =>
						!previous
				);
			}

			if (
				event.key === 't' &&
				!event.ctrlKey &&
				!event.metaKey
			) {
				setShowTimeline(
					(previous) =>
						!previous
				);
			}
		};

		document.addEventListener(
			'keydown',
			handleKeyDown
		);

		return () =>
			document.removeEventListener(
				'keydown',
				handleKeyDown
			);
	}, [loadData]);

	// ── Delete job ──
	const deleteJob = useCallback(
		async (job) => {
			if (!canDelete) {
				toast(
					'Action non autorisée pour ce rôle.',
					'error'
				);
				return;
			}

			if (
				!window.confirm(
					`Supprimer l'intervention #${
						job.job_number ||
						job.id
					} ?`
				)
			) {
				return;
			}

			try {
				await api.deleteJob(
					job.id
				);

				setDetailJob(null);
				await loadData();

				toast(
					'Intervention supprimée',
					'success'
				);
			} catch {
				toast(
					'Échec de la suppression',
					'error'
				);
			}
		},
		[
			canDelete,
			loadData,
			toast,
		]
	);

	// ── Batch assign ──
	const doBatchAssign =
		useCallback(
			async (
				jobIds,
				techId
			) => {
				if (!canAssign) {
					toast(
						'Action non autorisée pour ce rôle.',
						'error'
					);
					return;
				}

				const technician =
					techs.find(
						(item) =>
							item.id ===
							techId
					);

				if (!technician) {
					return;
				}

				try {
					const response =
						await api.batchAssign(
							jobIds,
							techId
						);

					const assignedCount =
						response.data
							?.assigned ??
						0;
					const assignmentErrors =
						Array.isArray(
							response.data
								?.errors
						)
							? response.data.errors.filter(
									Boolean
								)
							: [];

					if (assignedCount === 0) {
						toast(
							assignmentErrors[0] ||
								'Aucune intervention n’a pu être affectée.',
							'error'
						);
						return;
					}

					toast(
						`${assignedCount} intervention${
							assignedCount !== 1
								? 's'
								: ''
						} → ${technician.name}${
							assignmentErrors.length > 0
								? ` · ${assignmentErrors.length} non affectée(s)`
								: ''
						}`,
						assignmentErrors.length > 0
							? 'warning'
							: 'success'
					);

					addActivity(
						`${assignedCount} intervention(s) → ${technician.name}`,
						'info'
					);

					await loadData(true);
				} catch {
					toast(
						"Échec de l'affectation",
						'error'
					);
				}
			},
			[
				canAssign,
				techs,
				loadData,
				toast,
				addActivity,
			]
		);

	const doAssignWithCheck =
		useCallback(
			async (
				jobIds,
				techId
			) => {
				if (!canAssign) {
					toast(
						'Action non autorisée pour ce rôle.',
						'error'
					);
					return;
				}

				if (
					demoLockedRef.current
				) {
					toast(
						'Arrêtez la démo pour affecter',
						'warning'
					);
					return;
				}

				const technician =
					techs.find(
						(item) =>
							item.id ===
							techId
					);

				if (!technician) {
					return;
				}

				if (jobIds.length === 1) {
					const job = jobs.find(
						(item) =>
							item.id ===
							jobIds[0]
					);

					if (job) {
						const issues = [];

						const missingSkills = (
							job.required_skills ||
							[]
						).filter(
							(skill) =>
								!technician.skills?.includes(
									skill
								)
						);

						issues.push({
							label: `Compétence${
								missingSkills.length >
								0
									? ` (manquante(s) : ${missingSkills.join(', ')})`
									: ''
							}`,
							pass:
								missingSkills.length ===
								0,
						});

						const routeMatch =
							!job.route_criteria ||
							(
								technician.assigned_routes ||
								[]
							).includes(
								job.route_criteria
							);

						issues.push({
							label: `Tournée${
								!routeMatch
									? ` (interv : ${job.route_criteria}, tech : ${
										(
											technician.assigned_routes ||
											[]
										).join(', ') ||
										'aucune'
									})`
									: ''
							}`,
							pass:
								routeMatch,
						});

						if (
							issues.some(
								(issue) =>
									!issue.pass
							)
						) {
							setOverrideWarning({
								jobIds,
								techId,
								techName:
									technician.name,
								issues,
							});
							return;
						}
					}
				}

				await doBatchAssign(
					jobIds,
					techId
				);
			},
			[
				canAssign,
				techs,
				jobs,
				doBatchAssign,
				toast,
			]
		);

	const handleOverrideConfirm =
		useCallback(async () => {
			if (!canAssign) {
				toast(
					'Action non autorisée pour ce rôle.',
					'error'
				);
				return;
			}

			if (!overrideWarning) {
				return;
			}

			const {
				jobIds,
				techId,
			} = overrideWarning;

			setOverrideWarning(null);

			await doBatchAssign(
				jobIds,
				techId
			);
		}, [
			canAssign,
			overrideWarning,
			doBatchAssign,
			toast,
		]);

	const doBatchUnassign =
		useCallback(
			async (jobIds) => {
				if (!canAssign) {
					toast(
						'Action non autorisée pour ce rôle.',
						'error'
					);
					return;
				}

				try {
					const response =
						await api.batchUnassign(
							jobIds
						);

					const unassignedCount =
						response.data
							?.unassigned ??
						0;

					toast(
						`${unassignedCount} intervention${
							unassignedCount !==
							1
								? 's'
								: ''
						} désaffectée${
							unassignedCount !==
							1
								? 's'
								: ''
						}`,
						unassignedCount > 0
							? 'success'
							: 'warning'
					);

					addActivity(
						`${unassignedCount} intervention(s) désaffectée(s)`,
						'warning'
					);

					setSelJobs([]);
					await loadData(true);
				} catch {
					toast(
						'Échec de la désaffectation',
						'error'
					);
				}
			},
			[
				canAssign,
				loadData,
				toast,
				addActivity,
			]
		);

	const handleAutoRoute =
		useCallback(async () => {
			if (!canAutoAssign) {
				toast(
					'Action non autorisée pour ce rôle.',
					'error'
				);
				return;
			}

			setAutoRouting(true);

			try {
				const response =
					await api.autoRoute({
						target_date:
							fmtDate(
								viewDate
							),
					});

				const assignedCount =
					response.data
						?.jobs_assigned ??
					0;

				const unassignedCount =
					response.data
						?.jobs_unassigned ??
					0;

				toast(
					`${assignedCount} affectée${
						assignedCount !== 1
							? 's'
							: ''
					}${
						unassignedCount > 0
							? ` · ${unassignedCount} non affectée${
								unassignedCount !==
								1
									? 's'
									: ''
							}`
							: ''
					}`,
					assignedCount > 0
						? 'success'
						: 'warning'
				);

				addActivity(
					`Auto-affectation : ${assignedCount} intervention(s)`,
					'info'
				);

				await loadData(true);
			} catch {
				toast(
					"Échec de l'affectation automatique",
					'error'
				);
			} finally {
				setAutoRouting(false);
			}
		}, [
			canAutoAssign,
			loadData,
			toast,
			viewDate,
			addActivity,
		]);

	// ── Job actions ──
	const handleJobAction =
		useCallback(
			async (
				action,
				job
			) => {
				setCtxMenu(null);

				if (
					(
						action ===
							'unassign' ||
						action ===
							'batch_unassign'
					) &&
					!canAssign
				) {
					toast(
						'Action non autorisée pour ce rôle.',
						'error'
					);
					return;
				}

				if (
					action ===
						'delete' &&
					!canDelete
				) {
					toast(
						'Action non autorisée pour ce rôle.',
						'error'
					);
					return;
				}

				const labels = {
					cancel: 'Annulé',
					unassign: 'Désaffecté',
					hold:
						'Mis en attente',
				};

				try {
					if (
						action ===
						'cancel'
					) {
						await api.cancelJob(
							job.id
						);
					} else if (
						action ===
						'unassign'
					) {
						await api.unassignJob(
							job.id
						);
					} else if (
						action === 'hold'
					) {
						await api.updateJobStatus(
							job.id,
							'on_hold'
						);
					} else if (
						action ===
						'batch_unassign'
					) {
						await doBatchUnassign(
							selJobs
						);
						return;
					} else if (
						action ===
						'delete'
					) {
						await deleteJob(
							job
						);
						return;
					} else {
						return;
					}

					addActivity(
						`Intervention #${job.id} — ${labels[action]}`,
						'info'
					);

					toast(
						`Intervention #${job.id} — ${labels[action]}`,
						'success'
					);

					await loadData(true);
				} catch {
					toast(
						`Échec de l'action ${action}`,
						'error'
					);
				}
			},
			[
				canAssign,
				canDelete,
				loadData,
				toast,
				doBatchUnassign,
				selJobs,
				addActivity,
				deleteJob,
			]
		);

	const handleTechAction =
		useCallback(
			async (
				action,
				technician
			) => {
				setCtxMenu(null);

				const actionStatuses = {
					set_available:
						'disponible',
					set_on_break:
						'pause',
					set_off_duty:
						'hors_service',
				};

				const status =
					actionStatuses[action];

				if (!status) {
					return;
				}

				const techIds =
					selTechs.length > 1 &&
					selTechs.includes(
						technician.id
					)
						? selTechs
						: [
							technician.id,
						];

				let successCount = 0;

				for (
					const technicianId of
					techIds
				) {
					try {
						await api.updateTechStatus(
							technicianId,
							status
						);
						successCount += 1;
					} catch {
						// Les autres mises à jour continuent.
					}
				}

				if (successCount > 0) {
					const label =
						status.replace(
							/_/g,
							' '
						);

					toast(
						techIds.length > 1
							? `${successCount} techniciens → ${label}`
							: `${technician.name} → ${label}`,
						'success'
					);

					await loadData(true);
				} else {
					toast(
						'Échec de la mise à jour',
						'error'
					);
				}
			},
			[
				loadData,
				toast,
				selTechs,
			]
		);

	const handleAssignToTech =
		useCallback(
			async (
				jobId,
				techId
			) => {
				setCtxMenu(null);

				if (!canAssign) {
					toast(
						'Action non autorisée pour ce rôle.',
						'error'
					);
					return;
				}

				const jobIds =
					selJobs.length > 0 &&
					selJobs.includes(
						jobId
					)
						? selJobs
						: [jobId];

				await doAssignWithCheck(
					jobIds,
					techId
				);
			},
			[
				canAssign,
				selJobs,
				doAssignWithCheck,
				toast,
			]
		);

	const handleAssignTechToOrienteur =
		useCallback(
			async (
				techId,
				orienteurId
			) => {
				setCtxMenu(null);

				if (!canAssign) {
					toast(
						'Action non autorisée pour ce rôle.',
						'error'
					);
					return;
				}

				try {
					await api.assignTechnicianToOrienteur(
						orienteurId,
						techId
					);

					toast(
						"Technicien affecté à l'orienteur",
						'success'
					);

					await loadData(true);
				} catch {
					toast(
						"Échec de l'affectation",
						'error'
					);
				}
			},
			[
				canAssign,
				loadData,
				toast,
			]
		);

	const handleEditJob =
		useCallback(
			(job) => {
				if (!canEdit) {
					toast(
						'Action non autorisée pour ce rôle.',
						'error'
					);
					return;
				}

				setEditJob(job);
			},
			[
				canEdit,
				toast,
			]
		);

	// ── Selection ──
	const handleJobClick =
		useCallback(
			(
				id,
				event,
				displayedIds
			) => {
				setSelJobs(
					(previousIds) => {
						if (
							event.metaKey ||
							event.ctrlKey
						) {
							return previousIds.includes(
								id
							)
								? previousIds.filter(
									(item) =>
										item !==
										id
								)
								: [
									...previousIds,
									id,
								];
						}

						if (
							event.shiftKey &&
							previousIds.length >
								0 &&
							displayedIds
						) {
							const startIndex =
								displayedIds.indexOf(
									previousIds[
										previousIds.length -
											1
									]
								);

							const endIndex =
								displayedIds.indexOf(
									id
								);

							if (
								startIndex ===
									-1 ||
								endIndex ===
									-1
							) {
								return [id];
							}

							const [
								start,
								end,
							] =
								startIndex <
								endIndex
									? [
										startIndex,
										endIndex,
									]
									: [
										endIndex,
										startIndex,
									];

							return [
								...new Set([
									...previousIds,
									...displayedIds.slice(
										start,
										end + 1
									),
								]),
							];
						}

						return (
							previousIds.length ===
								1 &&
							previousIds[0] ===
								id
								? []
								: [id]
						);
					}
				);
			},
			[]
		);

	const handleTechClick =
		useCallback(
			(
				id,
				event,
				displayedIds
			) => {
				setSelTechs(
					(previousIds) => {
						if (
							event.metaKey ||
							event.ctrlKey
						) {
							return previousIds.includes(
								id
							)
								? previousIds.filter(
									(item) =>
										item !==
										id
								)
								: [
									...previousIds,
									id,
								];
						}

						if (
							event.shiftKey &&
							previousIds.length >
								0 &&
							displayedIds
						) {
							const startIndex =
								displayedIds.indexOf(
									previousIds[
										previousIds.length -
											1
									]
								);

							const endIndex =
								displayedIds.indexOf(
									id
								);

							if (
								startIndex ===
									-1 ||
								endIndex ===
									-1
							) {
								return [id];
							}

							const [
								start,
								end,
							] =
								startIndex <
								endIndex
									? [
										startIndex,
										endIndex,
									]
									: [
										endIndex,
										startIndex,
									];

							return [
								...new Set([
									...previousIds,
									...displayedIds.slice(
										start,
										end + 1
									),
								]),
							];
						}

						return (
							previousIds.length ===
								1 &&
							previousIds[0] ===
								id
								? []
								: [id]
						);
					}
				);
			},
			[]
		);

	const handleOpenFullDetail =
		useCallback((job) => {
			if (!job) {
				return;
			}

			setDetailJob(job);
			setFullDetailJob(job);
		}, []);

	const handleCloseFullDetail =
		useCallback(() => {
			setFullDetailJob(null);
		}, []);

	const handleDetailLoaded =
		useCallback((loadedJob) => {
			if (!loadedJob?.id) {
				return;
			}

			setFullDetailJob(loadedJob);
			setDetailJob(loadedJob);
			setJobs((previousJobs) =>
				previousJobs.map((job) =>
					job.id === loadedJob.id
						? { ...job, ...loadedJob }
						: job
				)
			);
		}, []);

	const handleManageDetailAssignment =
		useCallback(
			(job) => {
				if (!job?.id) {
					return;
				}

				setSelJobs([job.id]);
				setSelTechs([]);
				setDetailJob(job);
				setFullDetailJob(null);
				setShowTechs(true);
				toast(
					'Sélectionnez un technicien puis utilisez Affecter.',
					'info'
				);
			},
			[toast]
		);

	const handleJobDoubleClick =
		handleOpenFullDetail;

	// ── Filters ──
	const handleDisplayFilterApply =
		useCallback(
			(filter) => {
				setDisplayFilter(
					filter
				);

				toast(
					filter
						? 'Filtre appliqué'
						: 'Filtre effacé',
					'info'
				);
			},
			[toast]
		);

	const toggleJobFilter =
		useCallback((status) => {
			setJobFilter(
				(previous) =>
					previous === status
						? null
						: status
			);

			setTechFilter(null);
		}, []);


	const handleAdvFilter =
		useCallback(
			(key, value) => {
				setAdvFilters(
					(previous) => ({
						...previous,
						[key]: value,
					})
				);
			},
			[]
		);

	const clearAdvFilters =
		useCallback(() => {
			setAdvFilters(
				createEmptyAdvFilters()
			);
		}, []);

	const resetTodayFilters =
		useCallback(() => {
			setJobFilter(null);
			setTechFilter(null);
			setDisplayFilter(null);
			clearAdvFilters();
			setCalOpen(false);
			setViewDate(
				new Date()
			);
		}, [clearAdvFilters]);

	// ── Computed ──
	const jobMetrics = useMemo(() => {
		const metrics = {
			pending: 0,
			assigned: 0,
			inProgress: 0,
			completed: 0,
		};

		jobs.forEach((job) => {
			const status =
				normalizeStatus(
					job.status
				);

			if (
				status === 'pending' &&
				!hasAssignedTechnician(
					job
				)
			) {
				metrics.pending += 1;
			}

			if (
				status === 'assigned' &&
				hasAssignedTechnician(
					job
				)
			) {
				metrics.assigned += 1;
			}

			if (
				status ===
				'in_progress'
			) {
				metrics.inProgress += 1;
			}

			if (
				status ===
				'completed'
			) {
				metrics.completed += 1;
			}
		});

		return metrics;
	}, [jobs]);

	const available = useMemo(
		() =>
			techs.filter(
				(technician) =>
					normalizeStatus(
						technician.live_status
					) === 'disponible'
			).length,
		[techs]
	);

	const offDuty = useMemo(
		() =>
			techs.filter(
				(technician) =>
					OFFLINE_TECH_STATUSES.has(
						normalizeStatus(
							technician.live_status
						)
					)
			).length,
		[techs]
	);

	const timelineTechs = useMemo(
		() =>
			selTechs.length > 0
				? techs.filter(
					(technician) =>
						selTechs.includes(
							technician.id
						)
				)
				: [],
		[
			selTechs,
			techs,
		]
	);

	const pending =
		jobMetrics.pending;

	const handleAssignSelected =
		useCallback(() => {
			if (
				selJobs.length === 0 ||
				selTechs.length !== 1
			) {
				return;
			}

			doAssignWithCheck(
				selJobs,
				selTechs[0]
			);
		}, [
			doAssignWithCheck,
			selJobs,
			selTechs,
		]);

	// ── Map click handlers ──
	const handleTechClickMap =
		useCallback((technician) => {
			setSelTechs([
				technician.id,
			]);
		}, []);

	const handleJobClickMap =
		useCallback((job) => {
			setSelJobs([
				job.id,
			]);
		}, []);

	const handleDoubleClickTechMap =
		useCallback((technician) => {
			setSelTechs([
				technician.id,
			]);
		}, []);

	const handleDoubleClickJobMap =
		handleOpenFullDetail;

	// ── Drag system ──
	useEffect(() => {
		if (
			!canAssign ||
			!dragJob
		) {
			return undefined;
		}

		const ghost =
			dragGhostRef.current;

		const updateGhost = (
			clientX,
			clientY
		) => {
			if (!ghost) {
				return;
			}

			const currentJob =
				dragJobRef.current;

			const currentSelection =
				selJobsRef.current;

			ghost.style.left =
				`${clientX + 12}px`;

			ghost.style.top =
				`${clientY - 10}px`;

			ghost.style.display =
				'block';

			ghost.textContent =
				currentSelection.length >
					1 &&
				currentJob &&
				currentSelection.includes(
					currentJob.id
				)
					? `${currentSelection.length} interventions`
					: currentJob
						? `Intervention #${
							currentJob.job_number ||
							currentJob.id
						} — ${
							currentJob.customer_name ||
							''
						}`
						: '';
		};

		const dropAt = (
			clientX,
			clientY
		) => {
			const job =
				dragJobRef.current;

			if (
				job &&
				techGridRef.current
			) {
				const pane =
					techPaneRef.current;

				const element =
					document.elementFromPoint(
						clientX,
						clientY
					);

				if (
					pane?.contains(
						element
					)
				) {
					const technicianId =
						techGridRef.current.getTechIdAtPoint(
							clientX,
							clientY
						);

					if (
						technicianId !=
						null
					) {
						const currentSelection =
							selJobsRef.current;

						doAssignWithCheck(
							currentSelection.length >
								0 &&
								currentSelection.includes(
									job.id
								)
								? currentSelection
								: [job.id],
							technicianId
						);
					}
				}
			}

			if (ghost) {
				ghost.style.display =
					'none';
			}

			setDragJob(null);
			document.body.style.userSelect =
				'';
			document.body.style.cursor =
				'';
		};

		const handleMouseMove = (
			event
		) =>
			updateGhost(
				event.clientX,
				event.clientY
			);

		const handleMouseUp = (
			event
		) =>
			dropAt(
				event.clientX,
				event.clientY
			);

		const handleTouchMove = (
			event
		) => {
			event.preventDefault();

			const touch =
				event.touches[0];

			if (touch) {
				updateGhost(
					touch.clientX,
					touch.clientY
				);
			}
		};

		const handleTouchEnd = (
			event
		) => {
			const touch =
				event.changedTouches[0];

			if (touch) {
				dropAt(
					touch.clientX,
					touch.clientY
				);
			}
		};

		document.addEventListener(
			'mousemove',
			handleMouseMove
		);

		document.addEventListener(
			'mouseup',
			handleMouseUp
		);

		document.addEventListener(
			'touchmove',
			handleTouchMove,
			{
				passive: false,
			}
		);

		document.addEventListener(
			'touchend',
			handleTouchEnd
		);

		return () => {
			document.removeEventListener(
				'mousemove',
				handleMouseMove
			);

			document.removeEventListener(
				'mouseup',
				handleMouseUp
			);

			document.removeEventListener(
				'touchmove',
				handleTouchMove
			);

			document.removeEventListener(
				'touchend',
				handleTouchEnd
			);

			if (ghost) {
				ghost.style.display =
					'none';
			}

			document.body.style.userSelect =
				'';
			document.body.style.cursor =
				'';
		};
	}, [
		canAssign,
		dragJob,
		doAssignWithCheck,
	]);

	if (fullDetailJob) {
		return (
			<div className="ie-page intervention-detail-host">
				<InterventionDetailPage
					key={fullDetailJob.id}
					initialJob={fullDetailJob}
					refreshRevision={detailRefreshRevision}
					onBack={handleCloseFullDetail}
					onEdit={
						canEdit
							? handleEditJob
							: undefined
					}
					onManageAssignment={
						canAssign
							? handleManageDetailAssignment
							: undefined
					}
					onJobLoaded={handleDetailLoaded}
				/>

				{canEdit && editJob && (
					<EditJobWindow
						job={editJob}
						onClose={() =>
							setEditJob(null)
						}
						onSaved={() => {
							setEditJob(null);
							setDetailRefreshRevision(
								(previous) => previous + 1
							);
							loadData(true);
						}}
					/>
				)}

				<div className="toast-container">
					{toasts.map((item) => (
						<Toast
							key={item.id}
							message={item.msg}
							type={item.type}
						/>
					))}
				</div>
			</div>
		);
	}

	if (
		loading &&
		techs.length === 0
	) {
		return (
			<div className="loading-screen">
				<div className="loading-spinner" />
				Chargement du centre
				d'exploitation...
			</div>
		);
	}

	return (
		<div className="ie-page">
			<InterventionWorkspaceHeader
				viewDate={viewDate}
				isToday={isToday}
				isDemo={isDemo}
				dateButtonRef={calAnchorRef}
				onPreviousDay={() =>
					goDay(-1)
				}
				onNextDay={() =>
					goDay(1)
				}
				onToggleCalendar={() =>
					setCalOpen(
						(previous) =>
							!previous
					)
				}
				technicianCount={
					techs.length
				}
				interventionCount={
					jobs.length
				}
			/>

			{!isDemo &&
				calOpen && (
				<CalendarPicker
					value={viewDate}
					onChange={(date) => {
						setSelJobs([]);
						setSelTechs([]);
						setDetailJob(null);
						setViewDate(date);
						setCalOpen(false);
					}}
					onClose={() =>
						setCalOpen(false)
					}
					anchorRef={
						calAnchorRef
					}
				/>
			)}

			<SimBar
				elapsedMinutes={
					simElapsed
				}
				onToast={toast}
				onRunningChange={
					setDemoLocked
				}
			/>

			<InterventionKpiStrip
				total={jobs.length}
				metrics={jobMetrics}
				activeJobFilter={
					jobFilter
				}
				onReset={
					resetTodayFilters
				}
				onToggleJobFilter={
					toggleJobFilter
				}
				availableTechnicians={
					available
				}
				offlineTechnicians={
					offDuty
				}
				technicianCount={
					techs.length
				}
			/>

			<InterventionToolbar
				searchValue={
					advFilters._search ||
					''
				}
				onSearchChange={(
					value
				) =>
					setAdvFilters(
						(previous) => ({
							...previous,
							_search:
								value,
						})
					)
				}
				filtersExpanded={
					filtersExpanded
				}
				activeFilterCount={
					activeFilterCount
				}
				onToggleFilters={() =>
					setFiltersExpanded(
						(previous) =>
							!previous
					)
				}
				onOpenSearch={() =>
					setJobSearchOpen(
						(previous) =>
							!previous
					)
				}
				showMap={showMap}
				onToggleMap={() =>
					setShowMap(
						(previous) =>
							!previous
					)
				}
				showTimeline={
					showTimeline
				}
				onToggleTimeline={() =>
					setShowTimeline(
						(previous) =>
							!previous
					)
				}
				refreshing={
					refreshing
				}
				onRefresh={() =>
					loadData(true)
				}
				canAssign={canAssign}
				canAssignSelected={
					canAssign &&
					selJobs.length > 0 &&
					selTechs.length === 1
				}
				selectedJobCount={
					selJobs.length
				}
				selectedTechnicianCount={
					selTechs.length
				}
				onAssignSelected={
					handleAssignSelected
				}
				canCreate={
					canManageInterventions
				}
				onCreate={() =>
					setNewJobOpen(true)
				}
				canImport={isAdmin}
				onImport={() =>
					setImportOpen(true)
				}
				canExport={
					canManageInterventions
				}
				onExport={() =>
					setExportOpen(true)
				}
				demoLocked={demoLocked}
				canAutoAssign={
					canAutoAssign
				}
				pendingCount={pending}
				autoRouting={
					autoRouting
				}
				onAutoAssign={() =>
					setAutoRouteConfirm(
						true
					)
				}
			/>

			<InterventionFilterPanel
				expanded={
					filtersExpanded
				}
				filters={advFilters}
				onChange={
					handleAdvFilter
				}
				onClear={() => {
					clearAdvFilters();
					setJobFilter(null);
					setTechFilter(null);
					setDisplayFilter(null);
				}}
				technicians={techs}
				jobs={jobs}
				resultCount={
					fJobs.length
				}
				totalCount={
					jobs.length
				}
				selectedCount={
					selJobs.length
				}
				activeFilterCount={
					activeFilterCount
				}
				onOpenAdvanced={() =>
					setFilterOpen(true)
				}
			/>

			<div
				className={[
					'ie-main intervention-workspace-main',
					!showTechs
						? 'intervention-workspace-main--rail-collapsed'
						: '',
				]
					.filter(Boolean)
					.join(' ')}
			>
				<InterventionTechnicianRail
						technicians={fTechs}
						totalCount={
							techs.length
						}
						availableCount={
							available
						}
						offlineCount={
							offDuty
						}
						selectedIds={
							selTechs
						}
						bodyRef={
							techPaneRef
						}
						gridRef={
							techGridRef
						}
						onRowClicked={
							handleTechClick
						}
						onRowDoubleClicked={(
							technician
						) =>
							toast(
								`Technicien #${technician.id}`,
								'info'
							)
						}
						onContextMenu={(
							event,
							technician
						) => {
							event.preventDefault();
							setCtxMenu({
								x:
									event.clientX,
								y:
									event.clientY,
								type: 'tech',
								data:
									technician,
							});
						}}
					isDragTarget={
						canAssign &&
						Boolean(dragJob)
					}
					collapsed={!showTechs}
					onToggle={() => {
						if (showTechs) {
							setSelTechs([]);
						}

						setShowTechs(
							(previous) =>
								!previous
						);
					}}
				/>

				<div
					className={[
						'ie-center intervention-planning-panel',
						showMap
							? 'intervention-planning-panel--map'
							: '',
						showTimeline
							? 'intervention-planning-panel--activity'
							: '',
					]
						.filter(Boolean)
						.join(' ')}
				>
					<header className="intervention-planning-header">
						<div className="intervention-panel-title">
							<span
								className="intervention-panel-icon intervention-panel-icon--planning"
								aria-hidden="true"
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.7"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									{showMap ? (
										<>
											<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
											<path d="M9 3v15M15 6v15" />
										</>
									) : showTimeline ? (
										<>
											<path d="M4 19V9M10 19V5M16 19v-7M21 19H3" />
										</>
									) : (
										<>
											<rect x="5" y="4.5" width="14" height="17" rx="2.5" />
											<path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" />
										</>
									)}
								</svg>
							</span>

							<div>
								<span>
									{showMap
										? 'Vue géographique'
										: showTimeline
											? 'Historique opérationnel'
											: 'Planning opérationnel'}
								</span>
								<strong>
									{showMap
										? 'Carte des interventions'
										: showTimeline
											? 'Activité terrain'
											: 'Interventions'}
								</strong>
							</div>
						</div>

						<div className="intervention-planning-summary">
							<span className="intervention-planning-count">
								<strong>{fJobs.length}</strong>
								{fJobs.length === jobs.length
									? ` intervention${jobs.length !== 1 ? 's' : ''}`
									: ` affichée${fJobs.length !== 1 ? 's' : ''} sur ${jobs.length}`}
							</span>

							{selJobs.length > 0 && (
								<span className="intervention-planning-selection">
									{selJobs.length} sélectionnée
									{selJobs.length > 1
										? 's'
										: ''}
								</span>
							)}
						</div>
					</header>

					{showTimeline ? (
						<div className="intervention-activity-view">
							<section className="intervention-activity-feed">
								<header>
									<span>Journal temps réel</span>
									<strong>
										Événements de la journée
									</strong>
								</header>

								<div className="intervention-activity-scroll">
									<ActivityTimeline
										activities={activities}
									/>
								</div>
							</section>

							<section className="intervention-timeline-view">
								<header>
									<span>Planning technicien</span>
									<strong>
										{timelineTechs.length > 0
											? `${timelineTechs.length} technicien${timelineTechs.length > 1 ? 's' : ''} sélectionné${timelineTechs.length > 1 ? 's' : ''}`
											: 'Sélectionnez un technicien'}
									</strong>
								</header>

								{timelineTechs.length > 0 ? (
									<TechTimeline
										technicians={timelineTechs}
										jobs={jobs}
									/>
								) : (
									<div className="intervention-timeline-hint">
										Sélectionnez un technicien dans le rail
										gauche pour afficher son planning.
									</div>
								)}
							</section>
						</div>
					) : showMap ? (
						<div className="intervention-map-view">
							<MapWindow
								technicians={fTechs}
								jobs={fJobs}
								onTechClick={handleTechClickMap}
								onJobClick={handleJobClickMap}
								onDoubleClickTech={
									handleDoubleClickTechMap
								}
								onDoubleClickJob={
									handleDoubleClickJobMap
								}
								showFullscreenBtn
							/>
						</div>
					) : (
						<div className="ie-panel-body ie-grid-body">
							{fJobs.length > 0 ? (
								<JobGrid
									ref={jobGridRef}
									jobs={fJobs}
									selectedIds={selJobs}
									onRowClicked={handleJobClick}
									onContextMenu={(event, job) => {
										event.preventDefault();
										setCtxMenu({
											x: event.clientX,
											y: event.clientY,
											type: 'job',
											data: job,
										});
									}}
									onDragStart={
										canAssign
											? (job) =>
												setDragJob(job)
											: undefined
									}
									onRowDoubleClicked={
										handleJobDoubleClick
									}
									overrunMap={overrunMap}
									simElapsed={simElapsed}
								/>
							) : (
								<InterventionWorkspaceEmptyState
									isToday={isToday}
									hasFilters={
										activeFilterCount > 0 ||
										Boolean(jobFilter)
									}
									canCreate={
										canManageInterventions
									}
									canImport={isAdmin}
									onChangeDate={() =>
										setCalOpen(true)
									}
									onResetFilters={() => {
										clearAdvFilters();
										setJobFilter(null);
										setTechFilter(null);
										setDisplayFilter(null);
									}}
									onCreate={() =>
										setNewJobOpen(true)
									}
									onImport={() =>
										setImportOpen(true)
									}
								/>
							)}
						</div>
					)}
				</div>
				<aside className="ie-right intervention-inspector-panel">
					{detailJob ? (
						<InterventionInspector
							job={detailJob}
							onOpen={handleOpenFullDetail}
							onClose={() =>
								setDetailJob(
									null
								)
							}
							onEdit={
								canEdit
									? handleEditJob
									: undefined
							}
							onDelete={
								canDelete
									? deleteJob
									: undefined
							}
						/>
					) : (
						<InterventionEmptyState />
					)}
				</aside>
			</div>

			<div
				ref={dragGhostRef}
				className="drag-ghost"
				style={{
					display: 'none',
				}}
			/>

			{filterOpen && (
				<FilterWindow
					jobs={jobs}
					technicians={
						techs
					}
					activeFilter={
						displayFilter
					}
					onApply={(filter) => {
						handleDisplayFilterApply(
							filter
						);
						setFilterOpen(
							false
						);
					}}
					onClose={() =>
						setFilterOpen(
							false
						)
					}
				/>
			)}

			{jobSearchOpen && (
				<JobSearchWindow
					viewDate={viewDate}
					onClose={() =>
						setJobSearchOpen(
							false
						)
					}
					onJobDetail={(
						job
					) =>
						setDetailJob(
							job
						)
					}
					onDragStart={
						canAssign
							? (job) =>
								setDragJob(
									job
								)
							: undefined
					}
					onContextMenu={(
						event,
						job
					) => {
						event.preventDefault();
						setCtxMenu({
							x:
								event.clientX,
							y:
								event.clientY,
							type:
								'job',
							data: job,
						});
					}}
				/>
			)}

			{canEdit &&
				editJob && (
				<EditJobWindow
					job={editJob}
					onClose={() =>
						setEditJob(null)
					}
					onSaved={() => {
						setEditJob(null);
						loadData(true);
					}}
				/>
			)}

			{canManageInterventions &&
				newJobOpen && (
				<NewJobWindow
					onClose={() =>
						setNewJobOpen(
							false
						)
					}
					onCreated={() =>
						loadData(true)
					}
				/>
			)}

			{isAdmin &&
				importOpen && (
				<div className="import-overlay">
					<div className="import-window">
						<div className="import-header">
							<h2>
								Import Excel
							</h2>
							<button
								type="button"
								className="import-close"
								onClick={() =>
									setImportOpen(
										false
									)
								}
								aria-label="Fermer l’import"
							>
								✕
							</button>
						</div>

						<div className="import-body">
							<ImportCenter
								onClose={() =>
									setImportOpen(
										false
									)
								}
								onImported={(
									created,
									result
								) => {
									const firstScheduledDate =
										result?.planning?.first_scheduled_date;

									if (firstScheduledDate) {
										setViewDate(new Date(`${firstScheduledDate}T12:00:00`));
									} else {
										loadData(true);
									}

									toast(
										created
											? `${created} intervention(s) importée(s)${firstScheduledDate ? ` · planning du ${firstScheduledDate} ouvert` : ''}.`
											: 'Aucune intervention créée ou mise à jour.',
										created ? 'success' : 'warning'
									);
								}}
							/>
						</div>
					</div>
				</div>
			)}

			{canManageInterventions &&
				exportOpen && (
				<ExportCenter
					onClose={() =>
						setExportOpen(
							false
						)
					}
				/>
			)}

			{ctxMenu && (
				<ContextMenu
					x={ctxMenu.x}
					y={ctxMenu.y}
					type={ctxMenu.type}
					data={ctxMenu.data}
					technicians={
						techs
					}
					orienteurs={
						orienteurs
					}
					selectedJobIds={
						selJobs
					}
					selectedTechIds={
						selTechs
					}
					onJobAction={
						handleJobAction
					}
					onTechAction={
						handleTechAction
					}
					onAssignToTech={
						canAssign
							? handleAssignToTech
							: undefined
					}
					onAssignTechToOrienteur={
						canAssign
							? handleAssignTechToOrienteur
							: undefined
					}
				/>
			)}

			{canAutoAssign &&
				autoRouteConfirm && (
				<div
					className="override-overlay"
					onClick={() =>
						setAutoRouteConfirm(
							false
						)
					}
				>
					<div
						className="override-modal"
						onClick={(
							event
						) =>
							event.stopPropagation()
						}
					>
						<div className="override-title">
							Confirmation
						</div>

						<div className="override-body">
							Affectation
							automatique de{' '}
							<strong>
								{pending}{' '}
								intervention
								{pending !==
								1
									? 's'
									: ''}
							</strong>
						</div>

						<div className="override-actions">
							<button
								type="button"
								className="btn btn--sm"
								onClick={() =>
									setAutoRouteConfirm(
										false
									)
								}
							>
								Annuler
							</button>

							<button
								type="button"
								className="btn btn--sm btn--warning"
								onClick={() => {
									setAutoRouteConfirm(
										false
									);
									handleAutoRoute();
								}}
							>
								<BoltIcon />
								Affecter{' '}
								{pending}
							</button>
						</div>
					</div>
				</div>
			)}

			{canAssign &&
				overrideWarning && (
				<div
					className="override-overlay"
					onClick={() =>
						setOverrideWarning(
							null
						)
					}
				>
					<div
						className="override-modal"
						onClick={(
							event
						) =>
							event.stopPropagation()
						}
					>
						<div className="override-title">
							Avertissement
						</div>

						<div className="override-body">
							<strong>
								{
									overrideWarning.techName
								}
							</strong>
							{' : '}

							{overrideWarning.issues.map(
								(
									issue,
									index
								) => (
									<div
										key={`${issue.label}-${index}`}
										className="override-issue"
									>
										<span
											className={
												issue.pass
													? 'override-check'
													: 'override-x'
											}
										>
											{issue.pass
												? '✓'
												: '✕'}
										</span>
										{
											issue.label
										}
									</div>
								)
							)}
						</div>

						<div className="override-actions">
							<button
								type="button"
								className="btn btn--sm"
								onClick={() =>
									setOverrideWarning(
										null
									)
								}
							>
								Annuler
							</button>

							<button
								type="button"
								className="btn btn--sm btn--warning"
								onClick={
									handleOverrideConfirm
								}
							>
								Forcer
							</button>
						</div>
					</div>
				</div>
			)}

			<div className="toast-container">
				{toasts.map(
					(item) => (
						<Toast
							key={
								item.id
							}
							message={
								item.msg
							}
							type={
								item.type
							}
						/>
					)
				)}
			</div>
		</div>
	);
}
