import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

const VIEWPORT_MARGIN = 8;

const JOB_STATUS_LABELS = {
	pending: 'Non affectée',
	assigned: 'Affectée',
	en_route: 'En route',
	on_site: 'Sur site',
	work_in_progress: 'Travail en cours',
	in_progress: 'En cours',
	installation_done: 'Installation terminée',
	client_validation: 'Validation client',
	en_attente_validation: 'En attente de validation',
	completed: 'Terminée',
	cancelled: 'Annulée',
	failed: 'Échec',
	client_absent: 'Client absent',
	postponed: 'Reportée',
	suspended: 'Suspendue',
	on_hold: 'En attente',
};

const STOCK_STATUS_LABELS = {
	STOCK: 'En stock',
	ASSIGNED: 'Affecté',
	IN_USE: 'En utilisation',
	RETURNED: 'Retourné',
	FAULTY: 'Défectueux',
};

const STOCK_ACTIONS = [
	{
		status: 'STOCK',
		label: 'En stock',
		dot: 'success',
	},
	{
		status: 'ASSIGNED',
		label: 'Affecté',
		dot: 'info',
	},
	{
		status: 'IN_USE',
		label: 'En utilisation',
		dot: 'warning',
	},
	{
		status: 'RETURNED',
		label: 'Retourné',
		dot: 'muted',
	},
	{
		status: 'FAULTY',
		label: 'Défectueux',
		dot: 'danger',
	},
];

const TERMINAL_JOB_STATUSES = new Set([
	'completed',
	'cancelled',
	'failed',
	'client_absent',
]);

const UNASSIGNABLE_JOB_STATUSES = new Set([
	'assigned',
	'in_progress',
	'on_hold',
]);

const CANCELLABLE_JOB_STATUSES = new Set([
	'pending',
	'assigned',
	'in_progress',
	'on_hold',
]);

const HOLDABLE_JOB_STATUSES = new Set([
	'pending',
	'assigned',
	'in_progress',
]);

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

function normalizeIdentifier(value) {
	return normalizeText(value) || null;
}

function normalizeStatus(value) {
	return normalizeComparableText(value)
		.replace(/\s+/g, '_');
}

function toClassToken(value) {
	return normalizeComparableText(value)
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function normalizeSelection(value) {
	if (!Array.isArray(value)) {
		return [];
	}

	return [
		...new Set(
			value
				.map(normalizeIdentifier)
				.filter(Boolean),
		),
	];
}

function getPersonLabel(
	person,
	fallbackPrefix,
) {
	return (
		normalizeText(person?.name) ||
		normalizeText(person?.full_name) ||
		normalizeText(person?.username) ||
		(
			normalizeIdentifier(person?.id)
				? `${fallbackPrefix} #${normalizeIdentifier(
						person.id,
					)}`
				: '—'
		)
	);
}

function getTechnicianReference(
	technician,
) {
	return (
		normalizeText(technician?.employee_id) ||
		normalizeText(technician?.id) ||
		'—'
	);
}

function getJobStatusLabel(value) {
	const normalized = normalizeStatus(value);

	if (!normalized) {
		return 'Statut inconnu';
	}

	const knownLabel =
		JOB_STATUS_LABELS[normalized];

	if (knownLabel) {
		return knownLabel;
	}

	const fallback = normalizeText(value)
		.replace(/_/g, ' ')
		.replace(/\s+/g, ' ');

	return fallback
		? `${fallback.charAt(0).toUpperCase()}${fallback.slice(1)}`
		: 'Statut inconnu';
}

function getTechnicianStatusDot(value) {
	switch (normalizeStatus(value)) {
		case 'available':
		case 'disponible':
			return 'success';

		case 'on_job':
		case 'en_intervention':
		case 'en_tache':
		case 'in_progress':
			return 'purple';

		case 'en_route':
			return 'info';

		case 'off_duty':
		case 'hors_service':
		case 'disconnected':
		case 'deconnecte':
			return 'muted';

		default:
			return 'warning';
	}
}

function normalizeSkillEntry(value) {
	let label = '';

	if (
		typeof value === 'string' ||
		typeof value === 'number'
	) {
		label = normalizeText(value);
	} else if (isRecord(value)) {
		label =
			normalizeText(value.name) ||
			normalizeText(value.label) ||
			normalizeText(value.skill) ||
			normalizeText(value.code);
	}

	if (!label) {
		return null;
	}

	const separatorIndex =
		label.lastIndexOf(':');

	if (separatorIndex > 0) {
		label = normalizeText(
			label.slice(0, separatorIndex),
		);
	}

	if (!label) {
		return null;
	}

	return {
		label,
		key: normalizeComparableText(label),
	};
}

function normalizeSkillList(value) {
	const source = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value.split(',')
			: [];

	const result = [];
	const knownKeys = new Set();

	source.forEach((item) => {
		const entry =
			normalizeSkillEntry(item);

		if (
			!entry ||
			!entry.key ||
			knownKeys.has(entry.key)
		) {
			return;
		}

		knownKeys.add(entry.key);
		result.push(entry);
	});

	return result;
}

function uniquePeople(values) {
	const byId = new Map();

	(Array.isArray(values) ? values : [])
		.filter(isRecord)
		.forEach((person) => {
			const id = normalizeIdentifier(
				person.id,
			);

			if (!id || byId.has(id)) {
				return;
			}

			byId.set(id, person);
		});

	return Array.from(byId.values());
}

function getViewportSize() {
	return {
		width: Math.max(
			0,
			window.visualViewport?.width ??
				window.innerWidth ??
				0,
		),
		height: Math.max(
			0,
			window.visualViewport?.height ??
				window.innerHeight ??
				0,
		),
	};
}

function getRequestedCoordinate(
	value,
) {
	const parsed = Number(value);

	return Number.isFinite(parsed)
		? parsed
		: 0;
}

function clamp(value, minimum, maximum) {
	if (maximum < minimum) {
		return maximum;
	}

	return Math.min(
		Math.max(value, minimum),
		maximum,
	);
}

function getVisibleMenuButtons(
	container,
) {
	if (!container) {
		return [];
	}

	return [
		...container.querySelectorAll(
			'button[role="menuitem"]:not([disabled])',
		),
	].filter(
		(button) =>
			button.offsetParent !== null,
	);
}

function isElementInside(
	container,
	target,
) {
	return (
		container instanceof Element &&
		target instanceof Node &&
		container.contains(target)
	);
}

function MenuSeparator() {
	return (
		<div
			className="ctx-menu-sep"
			role="separator"
		/>
	);
}

function MenuLabel({ children }) {
	return (
		<div className="ctx-menu-label">
			{children}
		</div>
	);
}

function MenuItem({
	children,
	onClick,
	className = '',
	disabled = false,
	title,
	dot,
	submenuName,
	submenuOpen = false,
	onOpenSubmenu,
}) {
	const hasSubmenu =
		Boolean(submenuName);

	return (
		<button
			type="button"
			role="menuitem"
			className={[
				'ctx-menu-item',
				hasSubmenu
					? 'ctx-menu-item--parent'
					: '',
				className,
			]
				.filter(Boolean)
				.join(' ')}
			onClick={
				hasSubmenu
					? () =>
							onOpenSubmenu?.(
								submenuOpen
									? null
									: submenuName,
							)
					: onClick
			}
			onFocus={
				hasSubmenu
					? () =>
							onOpenSubmenu?.(
								submenuName,
							)
					: undefined
			}
			disabled={disabled}
			title={title}
			aria-haspopup={
				hasSubmenu
					? 'menu'
					: undefined
			}
			aria-expanded={
				hasSubmenu
					? submenuOpen
					: undefined
			}
			data-submenu={
				submenuName || undefined
			}
		>
			{dot && (
				<span
					className={`ctx-dot ctx-dot--${dot}`}
					aria-hidden="true"
				/>
			)}

			{children}

			{hasSubmenu && (
				<span
					className="ctx-arrow"
					aria-hidden="true"
				>
					▸
				</span>
			)}
		</button>
	);
}

function TechnicianMenuEntry({
	entry,
	requiredSkillsPresent,
	onSelect,
}) {
	const {
		technician,
		missingSkills,
		isQualified,
	} = entry;

	const technicianName =
		getPersonLabel(
			technician,
			'Technicien',
		);

	const technicianReference =
		getTechnicianReference(
			technician,
		);

	const missingLabel =
		missingSkills
			.map((skill) => skill.label)
			.join(', ');

	return (
		<MenuItem
			onClick={
				isQualified
					? onSelect
					: undefined
			}
			disabled={!isQualified}
			title={
				isQualified
					? technicianName
					: `Compétences manquantes : ${missingLabel}`
			}
		>
			{requiredSkillsPresent && (
				<span
					aria-hidden="true"
					style={{
						color: isQualified
							? 'var(--color-success)'
							: 'var(--color-danger)',
						marginRight: 2,
						fontSize: 10,
					}}
				>
					{isQualified ? '✓' : '✕'}
				</span>
			)}

			<span
				style={{
					fontFamily:
						'var(--font-mono)',
					fontSize:
						'var(--font-size-xs)',
					color:
						'var(--text-muted)',
					marginRight: 2,
				}}
			>
				{technicianReference}
			</span>

			<span
				style={{
					minWidth: 0,
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
				}}
			>
				{technicianName}
			</span>

			{isQualified && (
				<span
					className={`ctx-dot ctx-dot--${getTechnicianStatusDot(
						technician.live_status ??
							technician.status,
					)}`}
					style={{
						marginLeft: 'auto',
					}}
					aria-hidden="true"
				/>
			)}
		</MenuItem>
	);
}

export default function ContextMenu({
	x,
	y,
	type,
	data,
	technicians,
	orienteurs = [],
	selectedJobIds = [],
	selectedTechIds = [],
	onJobAction,
	onTechAction,
	onAssignToTech,
	onAssignTechToOrienteur,
	onStockAction,
}) {
	const [submenu, setSubmenu] =
		useState(null);
	const [dismissed, setDismissed] =
		useState(false);
	const [position, setPosition] =
		useState({
			left: getRequestedCoordinate(x),
			top: getRequestedCoordinate(y),
		});
	const [
		submenuPosition,
		setSubmenuPosition,
	] = useState({
		left: 'calc(100% - 2px)',
		right: 'auto',
		top: -5,
		maxHeight: undefined,
	});

	const menuRef = useRef(null);
	const submenuRef = useRef(null);
	const submenuTriggerRef =
		useRef(null);
	const actionLockedRef =
		useRef(false);

	const safeTechnicians = useMemo(
		() => uniquePeople(technicians),
		[technicians],
	);

	const safeOrienteurs = useMemo(
		() => uniquePeople(orienteurs),
		[orienteurs],
	);

	const safeSelectedJobIds = useMemo(
		() =>
			normalizeSelection(
				selectedJobIds,
			),
		[selectedJobIds],
	);

	const safeSelectedTechIds = useMemo(
		() =>
			normalizeSelection(
				selectedTechIds,
			),
		[selectedTechIds],
	);

	const canRunJobAction =
		typeof onJobAction === 'function';
	const canRunTechAction =
		typeof onTechAction === 'function';
	const canAssignToTechnician =
		typeof onAssignToTech === 'function';
	const canAssignToOrienteur =
		typeof onAssignTechToOrienteur ===
		'function';
	const canRunStockAction =
		typeof onStockAction === 'function';

	const menuInstanceKey = [
		normalizeText(type) || 'unknown',
		normalizeIdentifier(data?.id) ||
			'unknown',
		getRequestedCoordinate(x),
		getRequestedCoordinate(y),
	].join(':');

	const dismissMenu = useCallback(() => {
		setSubmenu(null);
		setDismissed(true);
	}, []);

	const runAction = useCallback(
		(callback, ...args) => {
			if (
				typeof callback !== 'function' ||
				actionLockedRef.current
			) {
				return;
			}

			actionLockedRef.current = true;
			setSubmenu(null);
			setDismissed(true);

			try {
				const result = callback(...args);

				Promise.resolve(result).catch(
					(error) => {
						console.error(
							'Erreur lors de l’action du menu contextuel :',
							error,
						);
					},
				);
			} catch (error) {
				actionLockedRef.current = false;
				setDismissed(false);

				console.error(
					'Erreur lors de l’action du menu contextuel :',
					error,
				);
			}
		},
		[],
	);

	const openSubmenu = useCallback(
		(nextSubmenu, trigger) => {
			submenuTriggerRef.current =
				trigger || null;
			setSubmenu(nextSubmenu);
		},
		[],
	);

	useEffect(() => {
		const frameId = window.requestAnimationFrame(() => {
			setDismissed(false);
			setSubmenu(null);
			actionLockedRef.current = false;
			submenuTriggerRef.current = null;
		});
		return () => window.cancelAnimationFrame(frameId);
	}, [menuInstanceKey]);

	useEffect(() => {
		const frameId = window.requestAnimationFrame(() => {
			setPosition({
				left: getRequestedCoordinate(x),
				top: getRequestedCoordinate(y),
			});
		});
		return () => window.cancelAnimationFrame(frameId);
	}, [x, y]);

	const fitMainMenu = useCallback(() => {
		const menuElement =
			menuRef.current;

		if (!menuElement) {
			return;
		}

		const rect =
			menuElement.getBoundingClientRect();
		const viewport =
			getViewportSize();

		const maxLeft = Math.max(
			VIEWPORT_MARGIN,
			viewport.width -
				rect.width -
				VIEWPORT_MARGIN,
		);

		const maxTop = Math.max(
			VIEWPORT_MARGIN,
			viewport.height -
				rect.height -
				VIEWPORT_MARGIN,
		);

		const nextPosition = {
			left: clamp(
				getRequestedCoordinate(x),
				VIEWPORT_MARGIN,
				maxLeft,
			),
			top: clamp(
				getRequestedCoordinate(y),
				VIEWPORT_MARGIN,
				maxTop,
			),
		};

		setPosition(
			(previousPosition) =>
				previousPosition.left ===
						nextPosition.left &&
					previousPosition.top ===
						nextPosition.top
					? previousPosition
					: nextPosition,
		);
	}, [x, y]);

	useLayoutEffect(() => {
		if (
			dismissed ||
			!isRecord(data)
		) {
			return;
		}

		fitMainMenu();
	}, [
		data,
		dismissed,
		fitMainMenu,
		submenu,
		type,
	]);

	const fitSubmenu = useCallback(() => {
		const rootElement =
			menuRef.current;
		const submenuElement =
			submenuRef.current;
		const triggerElement =
			submenuTriggerRef.current;

		if (
			!rootElement ||
			!submenuElement ||
			!triggerElement
		) {
			return;
		}

		const viewport =
			getViewportSize();
		const rootRect =
			rootElement.getBoundingClientRect();
		const triggerRect =
			triggerElement.getBoundingClientRect();
		const submenuRect =
			submenuElement.getBoundingClientRect();

		const openLeft =
			rootRect.right +
				submenuRect.width >
				viewport.width -
					VIEWPORT_MARGIN &&
			rootRect.left -
				submenuRect.width >=
				VIEWPORT_MARGIN;

		const defaultTop = -5;
		const desiredTop =
			triggerRect.top +
			defaultTop;

		const maximumTop =
			viewport.height -
			VIEWPORT_MARGIN -
			submenuRect.height;

		const clampedViewportTop =
			clamp(
				desiredTop,
				VIEWPORT_MARGIN,
				Math.max(
					VIEWPORT_MARGIN,
					maximumTop,
				),
			);

		setSubmenuPosition({
			left: openLeft
				? 'auto'
				: 'calc(100% - 2px)',
			right: openLeft
				? 'calc(100% - 2px)'
				: 'auto',
			top:
				clampedViewportTop -
				triggerRect.top,
			maxHeight: Math.max(
				120,
				viewport.height -
					VIEWPORT_MARGIN * 2,
			),
		});
	}, []);

	useLayoutEffect(() => {
		if (!submenu) {
			return;
		}

		fitSubmenu();
	}, [
		fitSubmenu,
		submenu,
		safeOrienteurs,
		safeTechnicians,
	]);

	useEffect(() => {
		if (dismissed) {
			return;
		}

		menuRef.current?.focus({
			preventScroll: true,
		});
	}, [
		dismissed,
		menuInstanceKey,
	]);

	useEffect(() => {
		if (dismissed) {
			return undefined;
		}

		const handleOutsidePointerDown = (
			event,
		) => {
			if (
				isElementInside(
					menuRef.current,
					event.target,
				)
			) {
				return;
			}

			dismissMenu();
		};

		document.addEventListener(
			'pointerdown',
			handleOutsidePointerDown,
			true,
		);

		return () => {
			document.removeEventListener(
				'pointerdown',
				handleOutsidePointerDown,
				true,
			);
		};
	}, [dismissMenu, dismissed]);

	useEffect(() => {
		if (dismissed) {
			return undefined;
		}

		const handleViewportChange = () => {
			fitMainMenu();

			if (submenu) {
				fitSubmenu();
			}
		};

		window.addEventListener(
			'resize',
			handleViewportChange,
		);
		window.visualViewport?.addEventListener(
			'resize',
			handleViewportChange,
		);

		return () => {
			window.removeEventListener(
				'resize',
				handleViewportChange,
			);
			window.visualViewport?.removeEventListener(
				'resize',
				handleViewportChange,
			);
		};
	}, [
		dismissed,
		fitMainMenu,
		fitSubmenu,
		submenu,
	]);

	const handleMenuKeyDown = useCallback(
		(event) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();

				if (submenu) {
					setSubmenu(null);
					submenuTriggerRef.current?.focus();
				} else {
					dismissMenu();
				}

				return;
			}

			if (
				event.key === 'ArrowRight'
			) {
				const activeElement =
					document.activeElement;

				if (
					activeElement instanceof
						HTMLButtonElement &&
					activeElement.dataset
						.submenu
				) {
					event.preventDefault();

					openSubmenu(
						activeElement.dataset
							.submenu,
						activeElement,
					);

					window.setTimeout(() => {
						getVisibleMenuButtons(
							submenuRef.current,
						)[0]?.focus();
					}, 0);
				}

				return;
			}

			if (
				event.key === 'ArrowLeft' &&
				submenu &&
				isElementInside(
					submenuRef.current,
					document.activeElement,
				)
			) {
				event.preventDefault();
				setSubmenu(null);
				submenuTriggerRef.current?.focus();
				return;
			}

			if (
				event.key !== 'ArrowDown' &&
				event.key !== 'ArrowUp' &&
				event.key !== 'Home' &&
				event.key !== 'End'
			) {
				return;
			}

			const buttons =
				getVisibleMenuButtons(
					menuRef.current,
				);

			if (buttons.length === 0) {
				return;
			}

			event.preventDefault();

			const currentIndex =
				buttons.indexOf(
					document.activeElement,
				);

			let nextIndex = 0;

			if (event.key === 'End') {
				nextIndex =
					buttons.length - 1;
			} else if (
				event.key === 'Home'
			) {
				nextIndex = 0;
			} else if (
				event.key === 'ArrowUp'
			) {
				nextIndex =
					currentIndex <= 0
						? buttons.length - 1
						: currentIndex - 1;
			} else {
				nextIndex =
					currentIndex < 0 ||
					currentIndex ===
						buttons.length - 1
						? 0
						: currentIndex + 1;
			}

			buttons[nextIndex]?.focus();
		},
		[
			dismissMenu,
			openSubmenu,
			submenu,
		],
	);

	const handleSubmenuBlur = useCallback(
		(event) => {
			if (
				isElementInside(
					event.currentTarget,
					event.relatedTarget,
				)
			) {
				return;
			}

			setSubmenu(null);
		},
		[],
	);

	if (
		dismissed ||
		!isRecord(data)
	) {
		return null;
	}

	const commonMenuProps = {
		ref: menuRef,
		className: 'ctx-menu',
		style: {
			left: position.left,
			top: position.top,
		},
		role: 'menu',
		tabIndex: -1,
		onClick: (event) =>
			event.stopPropagation(),
		onPointerDown: (event) =>
			event.stopPropagation(),
		onContextMenu: (event) => {
			event.preventDefault();
			event.stopPropagation();
		},
		onKeyDown: handleMenuKeyDown,
	};

	const submenuProps = {
		ref: submenuRef,
		className: 'ctx-submenu',
		role: 'menu',
		style: {
			left: submenuPosition.left,
			right: submenuPosition.right,
			top: submenuPosition.top,
			maxHeight:
				submenuPosition.maxHeight,
			overflowY: 'auto',
			overscrollBehavior: 'contain',
		},
	};

	if (type === 'tech') {
		const technicianId =
			normalizeIdentifier(data.id);

		const technicianName =
			getPersonLabel(
				data,
				'Technicien',
			);

		const hasMultiSelection =
			technicianId !== null &&
			safeSelectedTechIds.length > 1 &&
			safeSelectedTechIds.includes(
				technicianId,
			);

		const validOrienteurs =
			[...safeOrienteurs].sort(
				(first, second) =>
					getPersonLabel(
						first,
						'Orienteur',
					).localeCompare(
						getPersonLabel(
							second,
							'Orienteur',
						),
						'fr',
						{
							numeric: true,
							sensitivity: 'base',
						},
					),
			);

		const showStatusActions =
			canRunTechAction;

		const showOrienteurAssignment =
			!hasMultiSelection &&
			technicianId !== null &&
			canAssignToOrienteur;

		return (
			<div
				{...commonMenuProps}
				aria-label="Actions du technicien"
			>
				<div
					className="ctx-menu-header"
					title={technicianName}
				>
					{hasMultiSelection
						? `${safeSelectedTechIds.length} techniciens sélectionnés`
						: technicianId
							? `Technicien #${technicianId} — ${technicianName}`
							: technicianName}
				</div>

				{(
					showStatusActions ||
					showOrienteurAssignment
				) && <MenuSeparator />}

				{showStatusActions && (
					<>
						<MenuLabel>
							{hasMultiSelection
								? 'Définir le statut pour tous'
								: 'Définir le statut'}
						</MenuLabel>

						<MenuItem
							dot="success"
							onClick={() =>
								runAction(
									onTechAction,
									'set_available',
									data,
								)
							}
						>
							Disponible
						</MenuItem>

						<MenuItem
							dot="warning"
							onClick={() =>
								runAction(
									onTechAction,
									'set_on_break',
									data,
								)
							}
						>
							En pause
						</MenuItem>

						<MenuItem
							dot="muted"
							onClick={() =>
								runAction(
									onTechAction,
									'set_off_duty',
									data,
								)
							}
						>
							Hors service
						</MenuItem>
					</>
				)}

				{showStatusActions &&
					showOrienteurAssignment && (
						<MenuSeparator />
					)}

				{showOrienteurAssignment && (
					<>
						<MenuLabel>
							Affectation équipe
						</MenuLabel>

						<div
							className="ctx-menu-item--parent"
							onMouseEnter={(event) =>
								openSubmenu(
									'assign_orienteur',
									event.currentTarget.querySelector(
										'button',
									),
								)
							}
							onMouseLeave={() =>
								setSubmenu(null)
							}
							onBlur={
								handleSubmenuBlur
							}
						>
							<MenuItem
								submenuName="assign_orienteur"
								submenuOpen={
									submenu ===
									'assign_orienteur'
								}
								onOpenSubmenu={(
									nextSubmenu,
								) =>
									openSubmenu(
										nextSubmenu,
										document.activeElement,
									)
								}
							>
								Affecter à un orienteur
							</MenuItem>

							{submenu ===
								'assign_orienteur' && (
								<div
									{...submenuProps}
									aria-label="Choisir un orienteur"
								>
									{validOrienteurs.length ===
									0 ? (
										<div className="ctx-menu-empty">
											Aucun orienteur disponible
										</div>
									) : (
										validOrienteurs.map(
											(orienteur) => {
												const orienteurId =
													normalizeIdentifier(
														orienteur.id,
													);

												return (
													<MenuItem
														key={
															orienteurId
														}
														onClick={() =>
															runAction(
																onAssignTechToOrienteur,
																data.id,
																orienteur.id,
															)
														}
														title={getPersonLabel(
															orienteur,
															'Orienteur',
														)}
													>
														{getPersonLabel(
															orienteur,
															'Orienteur',
														)}
													</MenuItem>
												);
											},
										)
									)}
								</div>
							)}
						</div>
					</>
				)}
			</div>
		);
	}

	if (type === 'stock') {
		const normalizedStockStatus =
			normalizeText(data.status)
				.toUpperCase();

		const displayStatus =
			STOCK_STATUS_LABELS[
				normalizedStockStatus
			] ||
			normalizeText(data.status) ||
			'Statut inconnu';

		const statusClass =
			toClassToken(
				normalizedStockStatus,
			) || 'default';

		const equipmentIdentifier =
			normalizeIdentifier(data.id);

		const serialNumber =
			normalizeText(
				data.serial_number,
			) ||
			'Sans numéro de série';

		return (
			<div
				{...commonMenuProps}
				aria-label="Actions du matériel"
			>
				<div
					className="ctx-menu-header"
					title={serialNumber}
				>
					{equipmentIdentifier
						? `Matériel #${equipmentIdentifier} — ${serialNumber}`
						: `Matériel — ${serialNumber}`}
				</div>

				<div className="ctx-menu-status">
					<span
						className={`status-badge status-badge--${statusClass}`}
					>
						{displayStatus}
					</span>
				</div>

				{canRunStockAction && (
					<>
						<MenuSeparator />
						<MenuLabel>
							Changer le statut
						</MenuLabel>

						{STOCK_ACTIONS.map(
							(action) => (
								<MenuItem
									key={
										action.status
									}
									dot={action.dot}
									disabled={
										normalizedStockStatus ===
										action.status
									}
									onClick={() =>
										runAction(
											onStockAction,
											data,
											action.status,
										)
									}
								>
									{action.label}
								</MenuItem>
							),
						)}

						<MenuSeparator />

						<MenuItem
							className="ctx-menu-item--danger"
							onClick={() =>
								runAction(
									onStockAction,
									data,
									'DELETE',
								)
							}
						>
							Supprimer l’équipement
						</MenuItem>
					</>
				)}
			</div>
		);
	}

	if (type === 'job') {
		const status =
			normalizeStatus(data.status);

		const statusClass =
			toClassToken(status) ||
			'unknown';

		const jobId =
			normalizeIdentifier(data.id);

		const hasMultiSelection =
			jobId !== null &&
			safeSelectedJobIds.length > 1 &&
			safeSelectedJobIds.includes(
				jobId,
			);

		const isTerminal =
			TERMINAL_JOB_STATUSES.has(
				status,
			);

		const showAssignmentAction =
			jobId !== null &&
			!isTerminal &&
			canAssignToTechnician;

		const showUnassignAction =
			canRunJobAction &&
			(
				hasMultiSelection ||
				UNASSIGNABLE_JOB_STATUSES.has(
					status,
				)
			);

		const showStartAction =
			canRunJobAction &&
			!hasMultiSelection &&
			status === 'assigned';

		const showCompleteAction =
			canRunJobAction &&
			!hasMultiSelection &&
			status === 'in_progress';

		const showCancelAction =
			canRunJobAction &&
			!hasMultiSelection &&
			CANCELLABLE_JOB_STATUSES.has(
				status,
			);

		const showDeleteAction =
			canRunJobAction &&
			!hasMultiSelection &&
			status === 'cancelled';

		const showHoldAction =
			canRunJobAction &&
			!hasMultiSelection &&
			HOLDABLE_JOB_STATUSES.has(
				status,
			);

		const showLifecycleActions =
			showStartAction ||
			showCompleteAction ||
			showCancelAction ||
			showDeleteAction ||
			showHoldAction;

		const requiredSkills =
			hasMultiSelection
				? []
				: normalizeSkillList(
						data.required_skills,
					);

		const requiredSkillKeys =
			new Set(
				requiredSkills.map(
					(skill) => skill.key,
				),
			);

		const technicianEntries =
			safeTechnicians
				.filter((technician) => {
					const technicianId =
						normalizeIdentifier(
							technician.id,
						);

					if (!technicianId) {
						return false;
					}

					const liveStatus =
						normalizeStatus(
							technician.live_status,
						);

					const administrativeStatus =
						normalizeStatus(
							technician.status,
						);

					return (
						liveStatus !==
							'hors_service' &&
						liveStatus !==
							'deconnecte' &&
						liveStatus !==
							'disconnected' &&
						administrativeStatus !==
							'off_duty' &&
						administrativeStatus !==
							'hors_service'
					);
				})
				.map((technician) => {
					const technicianSkillKeys =
						new Set(
							normalizeSkillList(
								technician.skills,
							).map(
								(skill) =>
									skill.key,
							),
						);

					const missingSkills =
						requiredSkills.filter(
							(requiredSkill) =>
								requiredSkillKeys.has(
									requiredSkill.key,
								) &&
								!technicianSkillKeys.has(
									requiredSkill.key,
								),
						);

					return {
						technician,
						missingSkills,
						isQualified:
							missingSkills.length ===
							0,
					};
				})
				.sort((first, second) => {
					if (
						first.isQualified !==
						second.isQualified
					) {
						return first.isQualified
							? -1
							: 1;
					}

					return getPersonLabel(
						first.technician,
						'Technicien',
					).localeCompare(
						getPersonLabel(
							second.technician,
							'Technicien',
						),
						'fr',
						{
							numeric: true,
							sensitivity: 'base',
						},
					);
				});

		const qualifiedTechnicians =
			technicianEntries.filter(
				(entry) =>
					entry.isQualified,
			);

		const unqualifiedTechnicians =
			technicianEntries.filter(
				(entry) =>
					!entry.isQualified,
			);

		const hasPrimaryActions =
			showAssignmentAction ||
			showUnassignAction;

		const interventionIdentifier =
			normalizeText(
				data.job_number,
			) ||
			normalizeText(
				data.command_number,
			) ||
			jobId ||
			'—';

		const customerName =
			normalizeText(
				data.customer_name,
			) ||
			'Client non renseigné';

		return (
			<div
				{...commonMenuProps}
				aria-label="Actions de l’intervention"
			>
				<div
					className="ctx-menu-header"
					title={`Intervention #${interventionIdentifier} — ${customerName}`}
				>
					Intervention #
					{interventionIdentifier}
					{' — '}
					{customerName}
				</div>

				<div className="ctx-menu-status">
					<span
						className={`status-badge status-badge--${statusClass}`}
					>
						{getJobStatusLabel(
							status,
						)}
					</span>
				</div>

				{(
					hasPrimaryActions ||
					showLifecycleActions
				) && <MenuSeparator />}

				{showAssignmentAction && (
					<div
						className="ctx-menu-item--parent"
						onMouseEnter={(event) =>
							openSubmenu(
								'assign',
								event.currentTarget.querySelector(
									'button',
								),
							)
						}
						onMouseLeave={() =>
							setSubmenu(null)
						}
						onBlur={
							handleSubmenuBlur
						}
					>
						<MenuItem
							submenuName="assign"
							submenuOpen={
								submenu === 'assign'
							}
							onOpenSubmenu={(
								nextSubmenu,
							) =>
								openSubmenu(
									nextSubmenu,
									document.activeElement,
								)
							}
						>
							{hasMultiSelection
								? `Affecter ${safeSelectedJobIds.length} interventions à`
								: status ===
											'assigned' ||
										status ===
											'in_progress'
									? 'Réaffecter à'
									: 'Affecter à'}
						</MenuItem>

						{submenu === 'assign' && (
							<div
								{...submenuProps}
								aria-label="Choisir un technicien"
							>
								{technicianEntries.length ===
								0 ? (
									<div className="ctx-menu-empty">
										Aucun technicien disponible
									</div>
								) : (
									<>
										{qualifiedTechnicians.length >
											0 &&
											requiredSkills.length >
												0 && (
												<MenuLabel>
													Qualifiés
												</MenuLabel>
											)}

										{qualifiedTechnicians.map(
											(entry) => {
												const technicianId =
													normalizeIdentifier(
														entry
															.technician
															.id,
													);

												return (
													<TechnicianMenuEntry
														key={
															technicianId
														}
														entry={
															entry
														}
														requiredSkillsPresent={
															requiredSkills.length >
															0
														}
														onSelect={() =>
															runAction(
																onAssignToTech,
																data.id,
																entry
																	.technician
																	.id,
															)
														}
													/>
												);
											},
										)}

										{unqualifiedTechnicians.length >
											0 && (
											<>
												<MenuSeparator />
												<MenuLabel>
													Compétences manquantes
												</MenuLabel>
											</>
										)}

										{unqualifiedTechnicians.map(
											(entry) => (
												<TechnicianMenuEntry
													key={normalizeIdentifier(
														entry
															.technician
															.id,
													)}
													entry={
														entry
													}
													requiredSkillsPresent
												/>
											),
										)}
									</>
								)}
							</div>
						)}
					</div>
				)}

				{showUnassignAction && (
					<MenuItem
						onClick={() =>
							runAction(
								onJobAction,
								hasMultiSelection
									? 'batch_unassign'
									: 'unassign',
								data,
							)
						}
					>
						{hasMultiSelection
							? `Désaffecter ${safeSelectedJobIds.length} interventions`
							: 'Désaffecter'}
					</MenuItem>
				)}

				{hasPrimaryActions &&
					showLifecycleActions && (
						<MenuSeparator />
					)}

				{showStartAction && (
					<MenuItem
						onClick={() =>
							runAction(
								onJobAction,
								'start',
								data,
							)
						}
					>
						Démarrer l’intervention
					</MenuItem>
				)}

				{showCompleteAction && (
					<MenuItem
						onClick={() =>
							runAction(
								onJobAction,
								'complete',
								data,
							)
						}
					>
						Terminer l’intervention
					</MenuItem>
				)}

				{showCancelAction && (
					<MenuItem
						onClick={() =>
							runAction(
								onJobAction,
								'cancel',
								data,
							)
						}
					>
						Annuler l’intervention
					</MenuItem>
				)}

				{showDeleteAction && (
					<MenuItem
						className="ctx-menu-item--danger"
						onClick={() =>
							runAction(
								onJobAction,
								'delete',
								data,
							)
						}
					>
						Supprimer l’intervention
					</MenuItem>
				)}

				{showHoldAction && (
					<MenuItem
						onClick={() =>
							runAction(
								onJobAction,
								'hold',
								data,
							)
						}
					>
						Mettre en attente
					</MenuItem>
				)}
			</div>
		);
	}

	return null;
}
