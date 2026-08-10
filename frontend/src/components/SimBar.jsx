import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { api } from '../api/client';

const SPEEDS = [
	10,
	50,
	100,
	200,
	500,
];

const DEFAULT_SPEED = 500;
const MAX_SPEED = 1000;
const BASE_HOUR_UTC = 8;
const STATUS_REFRESH_MS = 5000;
const CLOCK_REFRESH_MS = 100;

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
		value === undefined
	) {
		return '';
	}

	return String(value).trim();
}

function normalizeComparableText(value) {
	return normalizeText(value)
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
}

function toFiniteNumber(value) {
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

function getValidSpeed(
	value,
	fallback = DEFAULT_SPEED,
) {
	const parsed = toFiniteNumber(value);

	if (
		parsed === null ||
		parsed <= 0 ||
		parsed > MAX_SPEED
	) {
		return fallback;
	}

	return parsed;
}

function getValidElapsed(value) {
	const parsed = toFiniteNumber(value);

	if (
		parsed === null ||
		parsed < 0
	) {
		return null;
	}

	return parsed;
}

function formatClock(elapsedMinutes) {
	const parsedElapsed =
		getValidElapsed(elapsedMinutes);

	if (parsedElapsed === null) {
		return '--:--:--';
	}

	const totalSeconds = Math.floor(
		(
			BASE_HOUR_UTC * 60 +
			parsedElapsed
		) * 60,
	);

	const secondsInDay = 24 * 60 * 60;

	const normalizedSeconds =
		(
			(totalSeconds % secondsInDay) +
			secondsInDay
		) % secondsInDay;

	const hours = Math.floor(
		normalizedSeconds / 3600,
	);

	const minutes = Math.floor(
		normalizedSeconds / 60,
	) % 60;

	const seconds =
		normalizedSeconds % 60;

	return [
		String(hours).padStart(2, '0'),
		String(minutes).padStart(2, '0'),
		String(seconds).padStart(2, '0'),
	].join(':');
}

function elapsedFromVirtualTime(value) {
	if (
		typeof value !== 'string' ||
		!value.trim()
	) {
		return null;
	}

	const virtualDate = new Date(value);

	if (
		Number.isNaN(
			virtualDate.getTime(),
		)
	) {
		return null;
	}

	let baseTimestamp = Date.UTC(
		virtualDate.getUTCFullYear(),
		virtualDate.getUTCMonth(),
		virtualDate.getUTCDate(),
		BASE_HOUR_UTC,
		0,
		0,
		0,
	);

	/*
	 * La démonstration démarre à 08:00 UTC.
	 * Si l'heure virtuelle a franchi minuit mais reste
	 * avant 08:00, son point de départ appartient à la
	 * veille.
	 */
	if (
		virtualDate.getUTCHours() <
		BASE_HOUR_UTC
	) {
		baseTimestamp -=
			24 * 60 * 60 * 1000;
	}

	const elapsed =
		(
			virtualDate.getTime() -
			baseTimestamp
		) /
		60000;

	return getValidElapsed(elapsed);
}

function normalizeMode(value) {
	const normalized =
		normalizeComparableText(value);

	if (
		normalized === 'simulated' ||
		normalized.endsWith('.simulated')
	) {
		return 'simulated';
	}

	if (
		normalized === 'real' ||
		normalized.endsWith('.real')
	) {
		return 'real';
	}

	return '';
}

function normalizeStatusPayload(value) {
	if (!isRecord(value)) {
		return null;
	}

	const isDemo =
		value.is_demo === true;

	if (!isDemo) {
		return {
			is_demo: false,
			mode: normalizeMode(value.mode),
			speed: getValidSpeed(
				value.speed,
				1,
			),
			is_paused:
				value.is_paused === true,
			loop_running:
				value.loop_running === true,
			virtual_time:
				normalizeText(
					value.virtual_time,
				),
			ws_clients:
				toFiniteNumber(
					value.ws_clients,
				),
		};
	}

	const mode = normalizeMode(value.mode);

	if (!mode) {
		return null;
	}

	const virtualTime =
		normalizeText(
			value.virtual_time,
		);

	if (
		virtualTime &&
		Number.isNaN(
			new Date(
				virtualTime,
			).getTime(),
		)
	) {
		return null;
	}

	return {
		is_demo: true,
		mode,
		speed: getValidSpeed(
			value.speed,
			mode === 'simulated'
				? DEFAULT_SPEED
				: 1,
		),
		is_paused:
			value.is_paused === true,
		loop_running:
			value.loop_running === true,
		virtual_time: virtualTime,
		ws_clients:
			toFiniteNumber(
				value.ws_clients,
			),
	};
}

function getErrorMessage(
	error,
	fallback,
) {
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

	if (
		typeof error?.message === 'string' &&
		error.message.trim()
	) {
		return error.message.trim();
	}

	return fallback;
}

function getSimulationState(status) {
	const simulated =
		status?.mode === 'simulated';

	const paused =
		simulated &&
		status?.is_paused === true;

	const running =
		simulated &&
		!paused;

	return {
		simulated,
		running,
		paused,
		stopped: !simulated,
		loopInterrupted:
			simulated &&
			status?.loop_running !== true,
	};
}

export default function SimBar({
	elapsedMinutes,
	onToast,
	onRunningChange,
}) {
	const [status, setStatus] =
		useState(null);

	const [
		statusError,
		setStatusError,
	] = useState(null);

	const [busy, setBusy] =
		useState(false);

	const [
		preferredSpeed,
		setPreferredSpeed,
	] = useState(DEFAULT_SPEED);

	const [, setTick] =
		useState(0);

	const mountedRef =
		useRef(false);

	const anchorRef =
		useRef(null);

	const statusRequestRef =
		useRef(0);

	const actionSequenceRef =
		useRef(0);

	const actionBusyRef =
		useRef(false);

	const externalAnchorUpdatedAtRef =
		useRef(0);

	const onToastRef =
		useRef(onToast);

	const onRunningChangeRef =
		useRef(onRunningChange);

	useEffect(() => {
		onToastRef.current =
			onToast;
	}, [onToast]);

	useEffect(() => {
		onRunningChangeRef.current =
			onRunningChange;
	}, [onRunningChange]);

	const notify = useCallback(
		(message, type = 'info') => {
			const normalizedMessage =
				normalizeText(message);

			if (
				!normalizedMessage ||
				typeof onToastRef.current !==
					'function'
			) {
				return;
			}

			onToastRef.current(
				normalizedMessage,
				type,
			);
		},
		[],
	);

	const applyStatusAnchor =
		useCallback(
			(
				nextStatus,
				requestStartedAt,
			) => {
				const elapsed =
					elapsedFromVirtualTime(
						nextStatus.virtual_time,
					);

				if (elapsed === null) {
					return;
				}

				/*
				 * Un clock_tick WebSocket arrivé après le départ
				 * de cette requête est plus récent que la réponse
				 * HTTP et ne doit pas être écrasé.
				 */
				if (
					externalAnchorUpdatedAtRef.current >
					requestStartedAt
				) {
					return;
				}

				anchorRef.current = {
					elapsed,
					receivedAt: Date.now(),
				};
			},
			[],
		);

	const fetchStatus = useCallback(
		async ({
			showError = true,
		} = {}) => {
			const requestId =
				statusRequestRef.current + 1;

			statusRequestRef.current =
				requestId;

			const requestStartedAt =
				Date.now();

			try {
				const response =
					await api.simStatus();

				if (
					!mountedRef.current ||
					requestId !==
						statusRequestRef.current
				) {
					return null;
				}

				const nextStatus =
					normalizeStatusPayload(
						response?.data,
					);

				if (!nextStatus) {
					throw new Error(
						'Réponse de simulation invalide',
					);
				}

				setStatus(nextStatus);
				setStatusError(null);

				if (
					nextStatus.mode ===
					'simulated'
				) {
					setPreferredSpeed(
						getValidSpeed(
							nextStatus.speed,
							DEFAULT_SPEED,
						),
					);
				}

				applyStatusAnchor(
					nextStatus,
					requestStartedAt,
				);

				return nextStatus;
			} catch (error) {
				if (
					!mountedRef.current ||
					requestId !==
						statusRequestRef.current
				) {
					return null;
				}

				const responseStatus =
					error?.response?.status;

				/*
				 * En dehors du mode démo, la route peut ne pas
				 * être montée. Dans ce cas la barre reste cachée.
				 */
				if (
					responseStatus === 404
				) {
					setStatus({
						is_demo: false,
						mode: '',
						speed: 1,
						is_paused: false,
						loop_running: false,
						virtual_time: '',
						ws_clients: null,
					});

					setStatusError(null);
					return null;
				}

				if (showError) {
					setStatusError(
						getErrorMessage(
							error,
							'Statut de simulation non synchronisé',
						),
					);
				}

				return null;
			}
		},
		[applyStatusAnchor],
	);

	useEffect(() => {
		mountedRef.current = true;

		fetchStatus();

		const intervalId =
			window.setInterval(
				() => {
					if (
						!actionBusyRef.current
					) {
						fetchStatus();
					}
				},
				STATUS_REFRESH_MS,
			);

		return () => {
			mountedRef.current = false;
			statusRequestRef.current += 1;
			actionSequenceRef.current += 1;
			actionBusyRef.current = false;

			window.clearInterval(
				intervalId,
			);

			if (
				typeof onRunningChangeRef.current ===
					'function'
			) {
				onRunningChangeRef.current(
					false,
				);
			}
		};
	}, [fetchStatus]);

	useEffect(() => {
		const elapsed =
			getValidElapsed(
				elapsedMinutes,
			);

		if (elapsed === null) {
			return;
		}

		const receivedAt = Date.now();

		externalAnchorUpdatedAtRef.current =
			receivedAt;

		anchorRef.current = {
			elapsed,
			receivedAt,
		};
	}, [elapsedMinutes]);

	const simulationState =
		useMemo(
			() =>
				getSimulationState(
					status,
				),
			[status],
		);

	useEffect(() => {
		if (
			typeof onRunningChangeRef.current ===
				'function'
		) {
			onRunningChangeRef.current(
				simulationState.running,
			);
		}
	}, [simulationState.running]);

	useEffect(() => {
		if (!simulationState.running) {
			return undefined;
		}

		const intervalId =
			window.setInterval(
				() => {
					setTick(
						(previousTick) =>
							previousTick + 1,
					);
				},
				CLOCK_REFRESH_MS,
			);

		return () => {
			window.clearInterval(
				intervalId,
			);
		};
	}, [simulationState.running]);

	let displayElapsed = null;

	if (anchorRef.current) {
		if (simulationState.running) {
			const realSecondsSinceAnchor =
				Math.max(
					0,
					(
						Date.now() -
						anchorRef.current
							.receivedAt
					) / 1000,
				);

			const speed =
				getValidSpeed(
					status?.speed,
					1,
				);

			displayElapsed =
				anchorRef.current.elapsed +
				(
					realSecondsSinceAnchor *
						speed
				) /
					60;
		} else {
			displayElapsed =
				anchorRef.current.elapsed;
		}
	}

	const executeAction = useCallback(
		async (
			action,
			actionLabel,
		) => {
			if (
				actionBusyRef.current ||
				typeof action !==
					'function'
			) {
				return;
			}

			actionBusyRef.current = true;
			setBusy(true);
			setStatusError(null);

			const actionSequence =
				actionSequenceRef.current + 1;

			actionSequenceRef.current =
				actionSequence;

			try {
				await action();

				if (
					!mountedRef.current ||
					actionSequence !==
						actionSequenceRef.current
				) {
					return;
				}

				const synchronized =
					await fetchStatus({
						showError: false,
					});

				if (
					!mountedRef.current ||
					actionSequence !==
						actionSequenceRef.current
				) {
					return;
				}

				if (!synchronized) {
					const message =
						`${actionLabel} effectuée, mais le statut n’a pas pu être resynchronisé.`;

					setStatusError(message);
					notify(
						message,
						'warning',
					);
				}
			} catch (error) {
				if (
					!mountedRef.current ||
					actionSequence !==
						actionSequenceRef.current
				) {
					return;
				}

				notify(
					`Échec de l’action « ${actionLabel} » : ${getErrorMessage(
						error,
						'Erreur inconnue',
					)}`,
					'error',
				);
			} finally {
				if (
					mountedRef.current &&
					actionSequence ===
						actionSequenceRef.current
				) {
					actionBusyRef.current =
						false;
					setBusy(false);
				}
			}
		},
		[fetchStatus, notify],
	);

	const handleStart = useCallback(() => {
		executeAction(
			async () => {
				anchorRef.current = null;
				externalAnchorUpdatedAtRef.current =
					0;

				await api.simStart(
					getValidSpeed(
						preferredSpeed,
						DEFAULT_SPEED,
					),
				);
			},
			'Démarrer la simulation',
		);
	}, [
		executeAction,
		preferredSpeed,
	]);

	const handlePause = useCallback(() => {
		executeAction(
			() => api.simPause(),
			'Mettre la simulation en pause',
		);
	}, [executeAction]);

	const handleResume =
		useCallback(() => {
			executeAction(
				() => api.simResume(),
				'Reprendre la simulation',
			);
		}, [executeAction]);

	const handleStop = useCallback(() => {
		executeAction(
			async () => {
				await api.simStop();
				anchorRef.current = null;
				externalAnchorUpdatedAtRef.current =
					0;
			},
			'Arrêter la simulation',
		);
	}, [executeAction]);

	const handleSpeed =
		useCallback(
			(event) => {
				const speed =
					getValidSpeed(
						event.target.value,
						null,
					);

				if (speed === null) {
					return;
				}

				setPreferredSpeed(speed);

				if (
					simulationState.stopped
				) {
					return;
				}

				executeAction(
					() =>
						api.simSetSpeed(
							speed,
						),
					'Modifier la vitesse',
				);
			},
			[
				executeAction,
				simulationState.stopped,
			],
		);

	const speedOptions = useMemo(() => {
		const values =
			new Set(SPEEDS);

		const currentSpeed =
			getValidSpeed(
				status?.speed,
				null,
			);

		if (currentSpeed !== null) {
			values.add(currentSpeed);
		}

		const preferred =
			getValidSpeed(
				preferredSpeed,
				null,
			);

		if (preferred !== null) {
			values.add(preferred);
		}

		return Array.from(values).sort(
			(first, second) =>
				first - second,
		);
	}, [
		preferredSpeed,
		status?.speed,
	]);

	if (
		status?.is_demo !== true
	) {
		return null;
	}

	const statusLabel =
		simulationState.running
			? 'Simulation en cours'
			: simulationState.paused
				? 'Simulation en pause'
				: 'Simulation arrêtée';

	const visibleSpeed =
		simulationState.stopped
			? getValidSpeed(
					preferredSpeed,
					DEFAULT_SPEED,
				)
			: getValidSpeed(
					status?.speed,
					preferredSpeed,
				);

	const synchronizationMessage =
		simulationState.loopInterrupted
			? 'La boucle de dispatch est interrompue alors que l’horloge simulée reste active.'
			: statusError;

	return (
		<div
			className="sim-bar"
			aria-label="Contrôles de simulation"
			aria-busy={busy}
		>
			<span
				className="sim-demo-badge"
				title="Les données affichées proviennent du mode simulation"
			>
				SIMULATION
			</span>

			<span
				className={`sim-status sim-status--${
					simulationState.running
						? 'running'
						: simulationState.paused
							? 'paused'
							: 'stopped'
				}`}
				role="status"
				aria-live="polite"
			>
				{simulationState.running
					? '● EN COURS'
					: simulationState.paused
						? '⏸ EN PAUSE'
						: '◼ ARRÊTÉE'}
			</span>

			<span
				className="sim-clock"
				aria-label={`${statusLabel}. Heure virtuelle ${formatClock(
					displayElapsed,
				)}`}
			>
				{formatClock(
					displayElapsed,
				)}
			</span>

			{synchronizationMessage && (
				<span
					className="sim-status"
					role="status"
					aria-live="polite"
					title={
						synchronizationMessage
					}
					style={{
						color:
							simulationState
								.loopInterrupted
								? 'var(--color-warning)'
								: 'var(--color-danger)',
						background:
							simulationState
								.loopInterrupted
								? 'var(--color-warning-dim)'
								: 'var(--color-danger-dim)',
						maxWidth: 220,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{simulationState
						.loopInterrupted
						? 'Dispatch interrompu'
						: 'Synchronisation indisponible'}
				</span>
			)}

			<div
				className="sim-controls"
				aria-label="Actions de simulation"
			>
				{simulationState.stopped && (
					<button
						type="button"
						className="btn btn--sm btn--success"
						onClick={handleStart}
						disabled={busy}
						aria-label="Démarrer la simulation"
					>
						▶ Démarrer
					</button>
				)}

				{simulationState.running && (
					<button
						type="button"
						className="btn btn--sm"
						onClick={handlePause}
						disabled={busy}
						aria-label="Mettre la simulation en pause"
					>
						⏸ Pause
					</button>
				)}

				{simulationState.paused && (
					<button
						type="button"
						className="btn btn--sm btn--success"
						onClick={handleResume}
						disabled={busy}
						aria-label="Reprendre la simulation"
					>
						▶ Reprendre
					</button>
				)}

				{simulationState.simulated && (
					<button
						type="button"
						className="btn btn--sm btn--danger"
						onClick={handleStop}
						disabled={busy}
						aria-label="Arrêter la simulation"
					>
						◼ Arrêter
					</button>
				)}
			</div>

			<label className="sim-speed">
				<span className="sim-speed-label">
					Vitesse
				</span>

				<select
					className="sim-speed-select"
					value={visibleSpeed}
					onChange={handleSpeed}
					disabled={busy}
					aria-label="Vitesse de la simulation"
				>
					{speedOptions.map(
						(speed) => (
							<option
								key={speed}
								value={speed}
							>
								{speed}×
							</option>
						),
					)}
				</select>
			</label>
		</div>
	);
}
