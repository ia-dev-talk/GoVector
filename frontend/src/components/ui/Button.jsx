import {
  forwardRef,
} from 'react';

const BUTTON_TYPES = new Set([
  'button',
  'submit',
  'reset',
]);

function normalizeModifier(
  value,
  fallback,
) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized =
    value.trim().toLowerCase();

  if (
    !normalized ||
    !/^[a-z0-9_-]+$/.test(
      normalized,
    )
  ) {
    return fallback;
  }

  return normalized;
}

function normalizeClassName(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

const Button = forwardRef(
  function Button(
    {
      children,
      variant = 'primary',
      size = 'md',
      disabled = false,
      loading = false,
      className = '',
      type = 'button',
      title,
      onClick,
      'aria-busy': ariaBusy,
      ...buttonProps
    },
    ref,
  ) {
    const normalizedVariant =
      normalizeModifier(
        variant,
        'primary',
      );

    const normalizedSize =
      normalizeModifier(
        size,
        'md',
      );

    const normalizedClassName =
      normalizeClassName(
        className,
      );

    const normalizedType =
      BUTTON_TYPES.has(type)
        ? type
        : 'button';

    const isLoading =
      loading === true;

    const isDisabled =
      disabled === true ||
      isLoading;

    const classes = [
      'btn',
      `btn--${normalizedVariant}`,
      `btn--${normalizedSize}`,
      isLoading
        ? 'btn--loading'
        : '',
      normalizedClassName,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        {...buttonProps}
        ref={ref}
        type={normalizedType}
        className={classes}
        disabled={isDisabled}
        onClick={onClick}
        title={title}
        aria-busy={
          isLoading
            ? true
            : ariaBusy
        }
        data-loading={
          isLoading
            ? 'true'
            : undefined
        }
      >
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;