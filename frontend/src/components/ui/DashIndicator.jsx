import {
  forwardRef,
} from 'react';

const COUNT_COLORS = new Set([
  'danger',
  'warning',
  'info',
  'success',
  'muted',
]);

const COLOR_ALIASES = Object.freeze({
  gray: 'muted',
  grey: 'muted',
  neutral: 'muted',
  default: 'muted',
  error: 'danger',
});

const BUTTON_TYPES = new Set([
  'button',
  'submit',
  'reset',
]);

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeClassName(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function mergeClassNames(...values) {
  return values
    .map(normalizeClassName)
    .filter(Boolean)
    .join(' ');
}

function normalizeColor(value) {
  if (typeof value !== 'string') {
    return 'muted';
  }

  const normalized =
    value.trim().toLowerCase();

  const resolved =
    COLOR_ALIASES[normalized] ||
    normalized;

  return COUNT_COLORS.has(resolved)
    ? resolved
    : 'muted';
}

function normalizeButtonType(value) {
  return BUTTON_TYPES.has(value)
    ? value
    : 'button';
}

const DashIndicator = forwardRef(
  function DashIndicator(
    {
      active = false,
      onClick,
      count,
      color = 'gray',
      label,
      disabled = false,
      type = 'button',
      className = '',
      countClassName = '',
      labelClassName = '',
      countProps,
      labelProps,
      'aria-pressed': ariaPressed,
      ...buttonProps
    },
    ref,
  ) {
    const normalizedColor =
      normalizeColor(color);

    const safeCountProps =
      isRecord(countProps)
        ? countProps
        : {};

    const safeLabelProps =
      isRecord(labelProps)
        ? labelProps
        : {};

    const {
      className:
        countPropsClassName,
      ...remainingCountProps
    } = safeCountProps;

    const {
      className:
        labelPropsClassName,
      ...remainingLabelProps
    } = safeLabelProps;

    return (
      <button
        {...buttonProps}
        ref={ref}
        type={normalizeButtonType(type)}
        className={mergeClassNames(
          'dash-indicator',
          active
            ? 'dash-indicator--active'
            : '',
          className,
        )}
        onClick={onClick}
        disabled={disabled}
        aria-pressed={
          ariaPressed ??
          Boolean(active)
        }
        data-indicator-color={
          normalizedColor
        }
      >
        <span
          {...remainingCountProps}
          className={mergeClassNames(
            'dash-count',
            `dash-count--${normalizedColor}`,
            countClassName,
            countPropsClassName,
          )}
        >
          {count}
        </span>

        <span
          {...remainingLabelProps}
          className={mergeClassNames(
            'dash-label',
            labelClassName,
            labelPropsClassName,
          )}
        >
          {label}
        </span>
      </button>
    );
  },
);

DashIndicator.displayName =
  'DashIndicator';

export default DashIndicator;
