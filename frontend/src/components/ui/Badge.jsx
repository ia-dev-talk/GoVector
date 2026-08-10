import {
  forwardRef,
} from 'react';

const BADGE_VARIANTS = new Set([
  'gray',
  'info',
  'success',
  'warning',
  'danger',
]);

const VARIANT_ALIASES = Object.freeze({
  default: 'gray',
  neutral: 'gray',
  grey: 'gray',
  error: 'danger',
});

function normalizeClassName(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function normalizeVariant(value) {
  if (typeof value !== 'string') {
    return 'gray';
  }

  const normalized =
    value.trim().toLowerCase();

  const resolved =
    VARIANT_ALIASES[normalized] ||
    normalized;

  return BADGE_VARIANTS.has(resolved)
    ? resolved
    : 'gray';
}

const Badge = forwardRef(
  function Badge(
    {
      children,
      variant = 'gray',
      className = '',
      ...badgeProps
    },
    ref,
  ) {
    const normalizedVariant =
      normalizeVariant(variant);

    const normalizedClassName =
      normalizeClassName(className);

    const classes = [
      'badge',
      `badge--${normalizedVariant}`,
      normalizedClassName,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <span
        {...badgeProps}
        ref={ref}
        className={classes}
        data-badge-variant={
          normalizedVariant
        }
      >
        {children}
      </span>
    );
  },
);

Badge.displayName = 'Badge';

export default Badge;