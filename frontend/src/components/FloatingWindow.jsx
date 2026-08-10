import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from 'react';

const DEFAULT_POSITION = { x: 120, y: 80 };
const DEFAULT_SIZE = { w: 500, h: 400 };
const DEFAULT_MIN_SIZE = { w: 300, h: 200 };
const MOBILE_QUERY = '(max-width: 768px)';

let mountSequence = 0;
const windowRegistry = new Map();

function finiteNumber(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value, fallback) {
	const number = finiteNumber(value, fallback);
	return number > 0 ? number : fallback;
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), Math.max(min, max));
}

function viewportSize() {
	if (typeof window === 'undefined') {
		return {
			width: Number.POSITIVE_INFINITY,
			height: Number.POSITIVE_INFINITY,
		};
	}

	return {
		width: Math.max(
			1,
			window.visualViewport?.width ?? window.innerWidth ?? 1,
		),
		height: Math.max(
			1,
			window.visualViewport?.height ?? window.innerHeight ?? 1,
		),
	};
}

function normalizedMinSize(value) {
	return {
		w: positiveNumber(value?.w, DEFAULT_MIN_SIZE.w),
		h: positiveNumber(value?.h, DEFAULT_MIN_SIZE.h),
	};
}

function fitToViewport(geometry, minSize) {
	const viewport = viewportSize();

	if (
		!Number.isFinite(viewport.width) ||
		!Number.isFinite(viewport.height)
	) {
		return geometry;
	}

	const width = clamp(
		geometry.w,
		Math.min(minSize.w, viewport.width),
		viewport.width,
	);
	const height = clamp(
		geometry.h,
		Math.min(minSize.h, viewport.height),
		viewport.height,
	);

	return {
		x: clamp(geometry.x, 0, viewport.width - width),
		y: clamp(geometry.y, 0, viewport.height - height),
		w: width,
		h: height,
	};
}

function initialGeometry(defaultPos, defaultSize, minSize) {
	const minimum = normalizedMinSize(minSize);

	return fitToViewport(
		{
			x: Math.max(
				0,
				finiteNumber(defaultPos?.x, DEFAULT_POSITION.x),
			),
			y: Math.max(
				0,
				finiteNumber(defaultPos?.y, DEFAULT_POSITION.y),
			),
			w: Math.max(
				minimum.w,
				positiveNumber(defaultSize?.w, DEFAULT_SIZE.w),
			),
			h: Math.max(
				minimum.h,
				positiveNumber(defaultSize?.h, DEFAULT_SIZE.h),
			),
		},
		minimum,
	);
}

function topWindowId() {
	let topId = null;
	let topZIndex = Number.NEGATIVE_INFINITY;
	let topMountOrder = Number.NEGATIVE_INFINITY;

	windowRegistry.forEach(({ zIndex, mountOrder }, id) => {
		if (
			zIndex > topZIndex ||
			(zIndex === topZIndex && mountOrder > topMountOrder)
		) {
			topId = id;
			topZIndex = zIndex;
			topMountOrder = mountOrder;
		}
	});

	return topId;
}

function isPrimaryPointer(event) {
	return (
		event.isPrimary !== false &&
		(event.pointerType !== 'mouse' || event.button === 0)
	);
}

function isInteractiveTarget(target) {
	if (!(target instanceof Element)) return false;

	return Boolean(
		target.closest(
			'button, a, input, select, textarea, [role="button"], ' +
				'[contenteditable="true"], [data-fw-no-drag]',
		),
	);
}

function isMobileLayout() {
	return Boolean(
		typeof window !== 'undefined' &&
			window.matchMedia?.(MOBILE_QUERY).matches,
	);
}

/**
 * Fenêtre flottante réutilisable, déplaçable et redimensionnable.
 */
export default function FloatingWindow({
	title,
	onClose,
	defaultPos = DEFAULT_POSITION,
	defaultSize = DEFAULT_SIZE,
	minSize = DEFAULT_MIN_SIZE,
	children,
	className = '',
	zIndex = 1500,
	resizable = true,
}) {
	const reactId = useId();
	const windowRef = useRef(null);
	const geometryRef = useRef(null);
	const interactionCleanupRef = useRef(null);
	const bodyStylesRef = useRef(null);

	const registryId = `floating-window-${reactId.replace(/:/g, '')}`;
	const titleId = `floating-window-title-${reactId.replace(/:/g, '')}`;
	const minimum = useMemo(
		() => normalizedMinSize(minSize),
		[minSize],
	);
	const safeZIndex = useMemo(
		() => finiteNumber(zIndex, 1500),
		[zIndex],
	);

	const [geometry, setGeometry] = useState(() =>
		initialGeometry(defaultPos, defaultSize, minSize),
	);

	useEffect(() => {
		geometryRef.current = geometry;
	}, [geometry]);

	const applyGeometry = useCallback(
		(nextGeometry) => {
			const fitted = fitToViewport(nextGeometry, minimum);

			geometryRef.current = fitted;
			setGeometry((current) =>
				current.x === fitted.x &&
				current.y === fitted.y &&
				current.w === fitted.w &&
				current.h === fitted.h
					? current
					: fitted,
			);
		},
		[minimum],
	);

	const restoreBodyStyles = useCallback(() => {
		if (
			typeof document === 'undefined' ||
			!bodyStylesRef.current
		) {
			return;
		}

		document.body.style.cursor = bodyStylesRef.current.cursor;
		document.body.style.userSelect =
			bodyStylesRef.current.userSelect;
		document.body.style.webkitUserSelect =
			bodyStylesRef.current.webkitUserSelect;
		bodyStylesRef.current = null;
	}, []);

	const stopInteraction = useCallback(() => {
		const cleanup = interactionCleanupRef.current;
		interactionCleanupRef.current = null;
		cleanup?.();
		restoreBodyStyles();
	}, [restoreBodyStyles]);

	const focusWindow = useCallback(() => {
		windowRef.current?.focus({ preventScroll: true });
	}, []);

	const beginInteraction = useCallback(
		(event, cursor, onMove) => {
			if (
				typeof document === 'undefined' ||
				!isPrimaryPointer(event)
			) {
				return;
			}

			stopInteraction();
			focusWindow();
			event.preventDefault();

			bodyStylesRef.current = {
				cursor: document.body.style.cursor,
				userSelect: document.body.style.userSelect,
				webkitUserSelect:
					document.body.style.webkitUserSelect,
			};

			document.body.style.cursor = cursor;
			document.body.style.userSelect = 'none';
			document.body.style.webkitUserSelect = 'none';

			const pointerId = event.pointerId;

			const handleMove = (moveEvent) => {
				if (moveEvent.pointerId !== pointerId) return;
				moveEvent.preventDefault();
				onMove(moveEvent);
			};

			const handleEnd = (endEvent) => {
				if (endEvent.pointerId === pointerId) {
					stopInteraction();
				}
			};

			document.addEventListener('pointermove', handleMove, {
				passive: false,
			});
			document.addEventListener('pointerup', handleEnd);
			document.addEventListener('pointercancel', handleEnd);
			window.addEventListener('blur', stopInteraction);

			interactionCleanupRef.current = () => {
				document.removeEventListener(
					'pointermove',
					handleMove,
				);
				document.removeEventListener(
					'pointerup',
					handleEnd,
				);
				document.removeEventListener(
					'pointercancel',
					handleEnd,
				);
				window.removeEventListener(
					'blur',
					stopInteraction,
				);
			};
		},
		[focusWindow, stopInteraction],
	);

	const handleTitlePointerDown = useCallback(
		(event) => {
			if (
				isMobileLayout() ||
				isInteractiveTarget(event.target)
			) {
				return;
			}

			const start = geometryRef.current;
			const pointerStart = {
				x: event.clientX,
				y: event.clientY,
			};

			beginInteraction(event, 'move', (moveEvent) => {
				applyGeometry({
					...start,
					x: start.x + moveEvent.clientX - pointerStart.x,
					y: start.y + moveEvent.clientY - pointerStart.y,
				});
			});
		},
		[applyGeometry, beginInteraction],
	);

	const handleResizePointerDown = useCallback(
		(event) => {
			if (!resizable || isMobileLayout()) return;

			event.stopPropagation();

			const start = geometryRef.current;
			const pointerStart = {
				x: event.clientX,
				y: event.clientY,
			};

			beginInteraction(event, 'nwse-resize', (moveEvent) => {
				applyGeometry({
					...start,
					w: start.w + moveEvent.clientX - pointerStart.x,
					h: start.h + moveEvent.clientY - pointerStart.y,
				});
			});
		},
		[applyGeometry, beginInteraction, resizable],
	);

	const handleResizeKeyDown = useCallback(
		(event) => {
			const step = event.shiftKey ? 25 : 10;
			const changes = {
				ArrowLeft: { w: -step, h: 0 },
				ArrowRight: { w: step, h: 0 },
				ArrowUp: { w: 0, h: -step },
				ArrowDown: { w: 0, h: step },
			};
			const change = changes[event.key];

			if (!change) return;

			event.preventDefault();
			applyGeometry({
				...geometryRef.current,
				w: geometryRef.current.w + change.w,
				h: geometryRef.current.h + change.h,
			});
		},
		[applyGeometry],
	);

	const handleClose = useCallback(
		(event) => {
			event?.stopPropagation();
			stopInteraction();
			onClose?.();
		},
		[onClose, stopInteraction],
	);

	useEffect(() => {
		mountSequence += 1;
		windowRegistry.set(registryId, {
			zIndex: safeZIndex,
			mountOrder: mountSequence,
		});

		return () => {
			windowRegistry.delete(registryId);
		};
	}, [registryId, safeZIndex]);

	useEffect(() => {
		const registered = windowRegistry.get(registryId);

		if (registered) {
			windowRegistry.set(registryId, {
				...registered,
				zIndex: safeZIndex,
			});
		}
	}, [registryId, safeZIndex]);

	useEffect(() => {
		const handleEscape = (event) => {
			if (
				event.defaultPrevented ||
				event.isComposing ||
				event.key !== 'Escape' ||
				topWindowId() !== registryId ||
				typeof onClose !== 'function'
			) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			handleClose();
		};

		document.addEventListener('keydown', handleEscape);
		return () =>
			document.removeEventListener('keydown', handleEscape);
	}, [handleClose, onClose, registryId]);

	useEffect(() => {
		const handleViewportResize = () => {
			if (!isMobileLayout()) {
				applyGeometry(geometryRef.current);
			}
		};

		window.addEventListener('resize', handleViewportResize);
		window.visualViewport?.addEventListener(
			'resize',
			handleViewportResize,
		);

		return () => {
			window.removeEventListener(
				'resize',
				handleViewportResize,
			);
			window.visualViewport?.removeEventListener(
				'resize',
				handleViewportResize,
			);
		};
	}, [applyGeometry]);

	useEffect(() => {
		applyGeometry(geometryRef.current);
	}, [applyGeometry]);

	useEffect(
		() => () => {
			stopInteraction();
		},
		[stopInteraction],
	);

	return (
		<div
			ref={windowRef}
			className={[
				'fw-window',
				typeof className === 'string'
					? className.trim()
					: '',
			]
				.filter(Boolean)
				.join(' ')}
			role="dialog"
			aria-labelledby={titleId}
			tabIndex={-1}
			onPointerDownCapture={focusWindow}
			style={{
				left: geometry.x,
				top: geometry.y,
				width: geometry.w,
				height: geometry.h,
				zIndex: safeZIndex,
			}}
		>
			<div
				className="fw-titlebar"
				onPointerDown={handleTitlePointerDown}
				style={{ touchAction: 'none' }}
			>
				<span
					id={titleId}
					className="fw-title"
					title={
						typeof title === 'string'
							? title
							: undefined
					}
				>
					{title}
				</span>

				{typeof onClose === 'function' && (
					<button
						type="button"
						className="fw-close"
						onClick={handleClose}
						onPointerDown={(event) =>
							event.stopPropagation()
						}
						title="Fermer"
						aria-label="Fermer la fenêtre"
					>
						×
					</button>
				)}
			</div>

			<div className="fw-body">{children}</div>

			{resizable && (
				<button
					type="button"
					className="fw-resize"
					onPointerDown={handleResizePointerDown}
					onKeyDown={handleResizeKeyDown}
					title="Redimensionner"
					aria-label="Redimensionner la fenêtre"
					style={{
						padding: 0,
						border: 'none',
						background: 'transparent',
						touchAction: 'none',
					}}
				/>
			)}
		</div>
	);
}
