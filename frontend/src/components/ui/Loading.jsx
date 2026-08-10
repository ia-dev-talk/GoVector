import {
  forwardRef,
} from 'react';

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

function hasRenderableContent(value) {
  if (
    value === null ||
    value === undefined ||
    value === false ||
    value === true
  ) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some(
      hasRenderableContent,
    );
  }

  return true;
}

function normalizeSize(value) {
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0
  ) {
    return `${value}px`;
  }

  if (
    typeof value === 'string' &&
    value.trim()
  ) {
    return value.trim();
  }

  return '';
}

const Loading = forwardRef(
  function Loading(
    {
      text = 'Chargement…',
      className = '',
      spinnerClassName = '',
      textClassName = '',
      spinnerSize,
      spinnerProps,
      textProps,
      role = 'status',
      'aria-live': ariaLive = 'polite',
      'aria-atomic': ariaAtomic = true,
      'aria-busy': ariaBusy = true,
      'aria-label': ariaLabel,
      ...loadingProps
    },
    ref,
  ) {
    const safeSpinnerProps =
      isRecord(spinnerProps)
        ? spinnerProps
        : {};

    const safeTextProps =
      isRecord(textProps)
        ? textProps
        : {};

    const hasText =
      hasRenderableContent(text);

    const normalizedSize =
      normalizeSize(spinnerSize);

    const {
      className:
        spinnerPropsClassName,
      style: spinnerStyle,
      'aria-hidden':
        _ignoredSpinnerAriaHidden,
      ...remainingSpinnerProps
    } = safeSpinnerProps;

    const {
      className:
        textPropsClassName,
      style: textStyle,
      ...remainingTextProps
    } = safeTextProps;

    const resolvedAriaLabel =
      ariaLabel ||
      (
        hasText &&
        typeof text === 'string'
          ? text.trim()
          : (
              hasText
                ? undefined
                : 'Chargement en cours'
            )
      );

    return (
      <div
        {...loadingProps}
        ref={ref}
        className={mergeClassNames(
          'loading-screen',
          className,
        )}
        role={role || undefined}
        aria-live={
          ariaLive || undefined
        }
        aria-atomic={ariaAtomic}
        aria-busy={ariaBusy}
        aria-label={
          resolvedAriaLabel ||
          undefined
        }
      >
        <div
          {...remainingSpinnerProps}
          className={mergeClassNames(
            'loading-spinner',
            spinnerClassName,
            spinnerPropsClassName,
          )}
          aria-hidden="true"
          style={{
            flexShrink: 0,
            ...(
              normalizedSize
                ? {
                    width:
                      normalizedSize,
                    height:
                      normalizedSize,
                  }
                : {}
            ),
            ...(
              isRecord(spinnerStyle)
                ? spinnerStyle
                : {}
            ),
          }}
        />

        {hasText && (
          <div
            {...remainingTextProps}
            className={mergeClassNames(
              'loading-text',
              textClassName,
              textPropsClassName,
            )}
            style={{
              minWidth: 0,
              overflowWrap: 'anywhere',
              ...(
                isRecord(textStyle)
                  ? textStyle
                  : {}
              ),
            }}
          >
            {text}
          </div>
        )}
      </div>
    );
  },
);

Loading.displayName = 'Loading';

export default Loading;
