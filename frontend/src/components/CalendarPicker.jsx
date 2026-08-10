import {
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { createPortal } from 'react-dom';

const DAYS = [
	{
		key: 'monday',
		label: 'L',
		fullLabel: 'Lundi',
	},
	{
		key: 'tuesday',
		label: 'M',
		fullLabel: 'Mardi',
	},
	{
		key: 'wednesday',
		label: 'M',
		fullLabel: 'Mercredi',
	},
	{
		key: 'thursday',
		label: 'J',
		fullLabel: 'Jeudi',
	},
	{
		key: 'friday',
		label: 'V',
		fullLabel: 'Vendredi',
	},
	{
		key: 'saturday',
		label: 'S',
		fullLabel: 'Samedi',
	},
	{
		key: 'sunday',
		label: 'D',
		fullLabel: 'Dimanche',
	},
];

const MONTHS = [
	'Janvier',
	'Février',
	'Mars',
	'Avril',
	'Mai',
	'Juin',
	'Juillet',
	'Août',
	'Septembre',
	'Octobre',
	'Novembre',
	'Décembre',
];

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;

function isValidDate(value) {
	return (
		value instanceof Date &&
		!Number.isNaN(value.getTime())
	);
}

function cloneDay(value) {
	if (!isValidDate(value)) {
		return null;
	}

	return new Date(
		value.getFullYear(),
		value.getMonth(),
		value.getDate(),
	);
}

function getSafeDate(value) {
	return cloneDay(value) || cloneDay(new Date());
}

function sameDay(first, second) {
	return (
		isValidDate(first) &&
		isValidDate(second) &&
		first.getFullYear() ===
			second.getFullYear() &&
		first.getMonth() ===
			second.getMonth() &&
		first.getDate() ===
			second.getDate()
	);
}

function startOfMonth(value) {
	return new Date(
		value.getFullYear(),
		value.getMonth(),
		1,
	);
}

function getDaysInMonth(year, month) {
	return new Date(
		year,
		month + 1,
		0,
	).getDate();
}

function clampDayToMonth(
	year,
	month,
	day,
) {
	return Math.min(
		Math.max(1, day),
		getDaysInMonth(year, month),
	);
}

function moveMonth(value, amount) {
	const targetMonth = new Date(
		value.getFullYear(),
		value.getMonth() + amount,
		1,
	);

	const day = clampDayToMonth(
		targetMonth.getFullYear(),
		targetMonth.getMonth(),
		value.getDate(),
	);

	return new Date(
		targetMonth.getFullYear(),
		targetMonth.getMonth(),
		day,
	);
}

function addDays(value, amount) {
	const result = cloneDay(value);

	result.setDate(result.getDate() + amount);

	return result;
}

function getMondayIndex(value) {
	return (value.getDay() + 6) % 7;
}

function getDateKey(value) {
	if (!isValidDate(value)) {
		return '';
	}

	return [
		value.getFullYear(),
		String(value.getMonth() + 1).padStart(
			2,
			'0',
		),
		String(value.getDate()).padStart(
			2,
			'0',
		),
	].join('-');
}

function formatAccessibleDate(value) {
	if (!isValidDate(value)) {
		return '';
	}

	return new Intl.DateTimeFormat('fr-FR', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	}).format(value);
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

function clamp(value, minimum, maximum) {
	if (maximum < minimum) {
		return minimum;
	}

	return Math.min(
		Math.max(value, minimum),
		maximum,
	);
}

function isNodeInside(element, target) {
	return (
		element instanceof Element &&
		target instanceof Node &&
		element.contains(target)
	);
}

function getCalendarCells(cursor) {
	const year = cursor.getFullYear();
	const month = cursor.getMonth();
	const leadingBlankCount =
		getMondayIndex(cursor);

	const daysInMonth =
		getDaysInMonth(year, month);

	const cells = [];

	for (
		let index = 0;
		index < leadingBlankCount;
		index += 1
	) {
		cells.push({
			key: `blank-before-${index}`,
			date: null,
		});
	}

	for (
		let day = 1;
		day <= daysInMonth;
		day += 1
	) {
		const date = new Date(
			year,
			month,
			day,
		);

		cells.push({
			key: getDateKey(date),
			date,
		});
	}

	while (cells.length % 7 !== 0) {
		cells.push({
			key: `blank-after-${cells.length}`,
			date: null,
		});
	}

	return cells;
}

export default function CalendarPicker({
	value,
	onChange,
	onClose,
	anchorRef,
}) {
	const labelId = useId();
	const calendarRef = useRef(null);
	const dayButtonRefs = useRef(
		new Map(),
	);

	const selectedDate = useMemo(
		() => getSafeDate(value),
		[value],
	);

	const [cursor, setCursor] = useState(
		() => startOfMonth(selectedDate),
	);

	const [
		focusedDate,
		setFocusedDate,
	] = useState(selectedDate);

	const [position, setPosition] =
		useState({
			top: 0,
			left: 0,
			ready: false,
		});

	const today = useMemo(
		() => getSafeDate(new Date()),
		[],
	);

	const cells = useMemo(
		() => getCalendarCells(cursor),
		[cursor],
	);

	const closeCalendar = useCallback(
		({
			restoreFocus = false,
		} = {}) => {
			if (typeof onClose === 'function') {
				onClose();
			}

			if (restoreFocus) {
				window.requestAnimationFrame(() => {
					anchorRef?.current?.focus?.({
						preventScroll: true,
					});
				});
			}
		},
		[anchorRef, onClose],
	);

	const selectDate = useCallback(
		(date) => {
			const normalizedDate =
				cloneDay(date);

			if (!normalizedDate) {
				return;
			}

			if (
				typeof onChange === 'function'
			) {
				onChange(normalizedDate);
			}

			closeCalendar({
				restoreFocus: true,
			});
		},
		[closeCalendar, onChange],
	);

	const updatePosition = useCallback(() => {
		const calendarElement =
			calendarRef.current;

		if (!calendarElement) {
			return;
		}

		const anchorElement =
			anchorRef?.current;

		const viewport =
			getViewportSize();

		const calendarRect =
			calendarElement.getBoundingClientRect();

		const anchorRect =
			anchorElement?.getBoundingClientRect?.();

		const calendarWidth =
			calendarRect.width;

		const calendarHeight =
			calendarRect.height;

		const preferredLeft = anchorRect
			? anchorRect.left +
				anchorRect.width / 2 -
				calendarWidth / 2
			: (
					viewport.width -
					calendarWidth
				) / 2;

		const maximumLeft = Math.max(
			VIEWPORT_MARGIN,
			viewport.width -
				calendarWidth -
				VIEWPORT_MARGIN,
		);

		const left = clamp(
			preferredLeft,
			VIEWPORT_MARGIN,
			maximumLeft,
		);

		const belowTop = anchorRect
			? anchorRect.bottom + ANCHOR_GAP
			: VIEWPORT_MARGIN;

		const aboveTop = anchorRect
			? anchorRect.top -
				calendarHeight -
				ANCHOR_GAP
			: VIEWPORT_MARGIN;

		const fitsBelow =
			belowTop + calendarHeight <=
			viewport.height -
				VIEWPORT_MARGIN;

		const preferredTop =
			fitsBelow || !anchorRect
				? belowTop
				: aboveTop;

		const maximumTop = Math.max(
			VIEWPORT_MARGIN,
			viewport.height -
				calendarHeight -
				VIEWPORT_MARGIN,
		);

		const top = clamp(
			preferredTop,
			VIEWPORT_MARGIN,
			maximumTop,
		);

		setPosition((current) => {
			if (
				current.ready &&
				current.left === left &&
				current.top === top
			) {
				return current;
			}

			return {
				left,
				top,
				ready: true,
			};
		});
	}, [anchorRef]);

	useEffect(() => {
		const normalizedSelectedDate =
			getSafeDate(value);
		const frameId = window.requestAnimationFrame(() => {
			setCursor(startOfMonth(normalizedSelectedDate));
			setFocusedDate(normalizedSelectedDate);
		});

		return () => window.cancelAnimationFrame(frameId);
	}, [value]);

	useLayoutEffect(() => {
		updatePosition();
	}, [
		cells.length,
		cursor,
		updatePosition,
	]);

	useEffect(() => {
		const handleViewportChange = () => {
			updatePosition();
		};

		window.addEventListener(
			'resize',
			handleViewportChange,
		);

		window.addEventListener(
			'scroll',
			handleViewportChange,
			true,
		);

		window.visualViewport?.addEventListener(
			'resize',
			handleViewportChange,
		);

		window.visualViewport?.addEventListener(
			'scroll',
			handleViewportChange,
		);

		return () => {
			window.removeEventListener(
				'resize',
				handleViewportChange,
			);

			window.removeEventListener(
				'scroll',
				handleViewportChange,
				true,
			);

			window.visualViewport?.removeEventListener(
				'resize',
				handleViewportChange,
			);

			window.visualViewport?.removeEventListener(
				'scroll',
				handleViewportChange,
			);
		};
	}, [updatePosition]);

	useEffect(() => {
		const handleOutsidePointerDown = (
			event,
		) => {
			if (
				isNodeInside(
					calendarRef.current,
					event.target,
				) ||
				isNodeInside(
					anchorRef?.current,
					event.target,
				)
			) {
				return;
			}

			closeCalendar();
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
	}, [
		anchorRef,
		closeCalendar,
	]);

	useEffect(() => {
		const focusedKey =
			getDateKey(focusedDate);

		if (!focusedKey) {
			return;
		}

		const button =
			dayButtonRefs.current.get(
				focusedKey,
			);

		button?.focus({
			preventScroll: true,
		});
	}, [
		cursor,
		focusedDate,
	]);

	const moveFocusToDate = useCallback(
		(nextDate) => {
			const normalizedDate =
				cloneDay(nextDate);

			if (!normalizedDate) {
				return;
			}

			setFocusedDate(normalizedDate);

			if (
				normalizedDate.getFullYear() !==
					cursor.getFullYear() ||
				normalizedDate.getMonth() !==
					cursor.getMonth()
			) {
				setCursor(
					startOfMonth(
						normalizedDate,
					),
				);
			}
		},
		[cursor],
	);

	const handleCalendarKeyDown =
		useCallback(
			(event) => {
				if (event.key === 'Escape') {
					event.preventDefault();
					event.stopPropagation();

					closeCalendar({
						restoreFocus: true,
					});
					return;
				}

				const currentFocusedDate =
					cloneDay(focusedDate) ||
					selectedDate;

				let nextDate = null;

				switch (event.key) {
					case 'ArrowLeft':
						nextDate = addDays(
							currentFocusedDate,
							-1,
						);
						break;

					case 'ArrowRight':
						nextDate = addDays(
							currentFocusedDate,
							1,
						);
						break;

					case 'ArrowUp':
						nextDate = addDays(
							currentFocusedDate,
							-7,
						);
						break;

					case 'ArrowDown':
						nextDate = addDays(
							currentFocusedDate,
							7,
						);
						break;

					case 'Home':
						nextDate = addDays(
							currentFocusedDate,
							-getMondayIndex(
								currentFocusedDate,
							),
						);
						break;

					case 'End':
						nextDate = addDays(
							currentFocusedDate,
							6 -
								getMondayIndex(
									currentFocusedDate,
								),
						);
						break;

					case 'PageUp':
						nextDate = moveMonth(
							currentFocusedDate,
							event.shiftKey
								? -12
								: -1,
						);
						break;

					case 'PageDown':
						nextDate = moveMonth(
							currentFocusedDate,
							event.shiftKey
								? 12
								: 1,
						);
						break;

					default:
						return;
				}

				event.preventDefault();

				moveFocusToDate(nextDate);
			},
			[
				closeCalendar,
				focusedDate,
				moveFocusToDate,
				selectedDate,
			],
		);

	const changeMonth = useCallback(
		(amount) => {
			const referenceDate =
				focusedDate.getFullYear() ===
						cursor.getFullYear() &&
					focusedDate.getMonth() ===
						cursor.getMonth()
					? focusedDate
					: new Date(
							cursor.getFullYear(),
							cursor.getMonth(),
							1,
						);

			const nextDate = moveMonth(
				referenceDate,
				amount,
			);

			setCursor(
				startOfMonth(nextDate),
			);

			setFocusedDate(nextDate);
		},
		[cursor, focusedDate],
	);

	if (
		typeof document === 'undefined' ||
		!document.body
	) {
		return null;
	}

	return createPortal(
		<div
			ref={calendarRef}
			className="cal-picker"
			role="dialog"
			aria-modal="false"
			aria-labelledby={labelId}
			onKeyDown={
				handleCalendarKeyDown
			}
			style={{
				position: 'fixed',
				top: position.top,
				left: position.left,
				maxWidth:
					'calc(100vw - 16px)',
				visibility: position.ready
					? 'visible'
					: 'hidden',
			}}
		>
			<div className="cal-header">
				<button
					type="button"
					className="cal-nav"
					onClick={() =>
						changeMonth(-1)
					}
					aria-label="Mois précédent"
					title="Mois précédent"
				>
					◂
				</button>

				<span
					id={labelId}
					className="cal-month-label"
					aria-live="polite"
				>
					{MONTHS[cursor.getMonth()]}{' '}
					{cursor.getFullYear()}
				</span>

				<button
					type="button"
					className="cal-nav"
					onClick={() =>
						changeMonth(1)
					}
					aria-label="Mois suivant"
					title="Mois suivant"
				>
					▸
				</button>
			</div>

			<div
				className="cal-grid"
				role="grid"
				aria-label={`Calendrier de ${
					MONTHS[
						cursor.getMonth()
					]
				} ${cursor.getFullYear()}`}
			>
				{DAYS.map((day) => (
					<span
						key={day.key}
						className="cal-dow"
						role="columnheader"
						title={day.fullLabel}
						aria-label={day.fullLabel}
					>
						{day.label}
					</span>
				))}

				{cells.map((cell) => {
					if (!cell.date) {
						return (
							<span
								key={cell.key}
								role="gridcell"
								aria-hidden="true"
							/>
						);
					}

					const dateKey =
						getDateKey(cell.date);

					const isSelected =
						sameDay(
							cell.date,
							selectedDate,
						);

					const isToday =
						sameDay(
							cell.date,
							today,
						);

					const isFocused =
						sameDay(
							cell.date,
							focusedDate,
						);

					return (
						<button
							key={cell.key}
							ref={(element) => {
								if (element) {
									dayButtonRefs.current.set(
										dateKey,
										element,
									);
								} else {
									dayButtonRefs.current.delete(
										dateKey,
									);
								}
							}}
							type="button"
							role="gridcell"
							className={[
								'cal-day',
								isSelected
									? 'cal-day--selected'
									: '',
								isToday
									? 'cal-day--today'
									: '',
							]
								.filter(Boolean)
								.join(' ')}
							tabIndex={
								isFocused
									? 0
									: -1
							}
							aria-selected={
								isSelected
							}
							aria-current={
								isToday
									? 'date'
									: undefined
							}
							aria-label={
								formatAccessibleDate(
									cell.date,
								)
							}
							title={
								formatAccessibleDate(
									cell.date,
								)
							}
							onFocus={() =>
								setFocusedDate(
									cell.date,
								)
							}
							onClick={() =>
								selectDate(
									cell.date,
								)
							}
						>
							{cell.date.getDate()}
						</button>
					);
				})}
			</div>

			<div className="cal-footer">
				<button
					type="button"
					className="cal-today-btn"
					onClick={() =>
						selectDate(
							getSafeDate(
								new Date(),
							),
						)
					}
				>
					Aujourd’hui
				</button>
			</div>
		</div>,
		document.body,
	);
}
