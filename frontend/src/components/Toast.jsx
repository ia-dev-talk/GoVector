import { useEffect, useState } from 'react';

const TOAST_TYPES = {
	info: {
		icon: 'i',
		label: 'Information',
		role: 'status',
		live: 'polite',
	},
	success: {
		icon: '✓',
		label: 'Succès',
		role: 'status',
		live: 'polite',
	},
	warning: {
		icon: '!',
		label: 'Avertissement',
		role: 'alert',
		live: 'assertive',
	},
	error: {
		icon: '✕',
		label: 'Erreur',
		role: 'alert',
		live: 'assertive',
	},
};

const EXIT_DELAY_MS = 2600;

function normalizeType(value) {
	const type =
		typeof value === 'string'
			? value.trim().toLowerCase()
			: '';

	return Object.hasOwn(TOAST_TYPES, type)
		? type
		: 'info';
}

function normalizeMessage(value) {
	if (typeof value === 'string') {
		return value.trim();
	}

	if (
		typeof value === 'number' ||
		typeof value === 'bigint'
	) {
		return String(value);
	}

	if (value instanceof Error) {
		return value.message.trim();
	}

	return '';
}

export default function Toast({
	message,
	type = 'info',
}) {
	const [visible, setVisible] =
		useState(false);

	const safeType = normalizeType(type);
	const safeMessage =
		normalizeMessage(message);
	const config = TOAST_TYPES[safeType];

	useEffect(() => {
		if (!safeMessage) {
			return undefined;
		}

		let secondFrameId = null;
		const firstFrameId =
			window.requestAnimationFrame(() => {
				setVisible(false);
				secondFrameId =
					window.requestAnimationFrame(
						() => setVisible(true),
					);
			});

		const hideTimerId =
			window.setTimeout(
				() => setVisible(false),
				EXIT_DELAY_MS,
			);

		return () => {
			window.clearTimeout(hideTimerId);
			window.cancelAnimationFrame(
				firstFrameId,
			);

			if (secondFrameId !== null) {
				window.cancelAnimationFrame(
					secondFrameId,
				);
			}
		};
	}, [safeMessage, safeType]);

	if (!safeMessage) {
		return null;
	}

	return (
		<div
			className={`toast toast--${safeType}${
				visible ? ' toast--visible' : ''
			}`}
			role={config.role}
			aria-live={config.live}
			aria-atomic="true"
			aria-label={`${config.label} : ${safeMessage}`}
			style={{
				maxWidth:
					'min(420px, calc(100vw - 32px))',
				whiteSpace: 'normal',
				overflowWrap: 'anywhere',
			}}
		>
			<span
				className="toast-icon"
				aria-hidden="true"
			>
				{config.icon}
			</span>

			<span
				aria-hidden="true"
				style={{ minWidth: 0 }}
			>
				{safeMessage}
			</span>
		</div>
	);
}
