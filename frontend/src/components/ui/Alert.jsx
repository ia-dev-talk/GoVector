import {
  forwardRef,
  useId,
} from 'react';

const ALERT_CONFIG = Object.freeze({
  info: {
    role: 'status',
    live: 'polite',
  },
  success: {
    role: 'status',
    live: 'polite',
  },
  warning: {
    role: 'alert',
    live: 'assertive',
  },
  danger: {
    role: 'alert',
    live: 'assertive',
  },
});

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

function mergeClassNames(
  ...classNames
) {
  return classNames
    .map(normalizeClassName)
    .filter(Boolean)
    .join(' ');
}

function normalizeType(value) {
  if (typeof value !== 'string') {
    return 'info';
  }

  const normalized =
    value.trim().toLowerCase();

  if (normalized === 'error') {
    return 'danger';
  }

  return Object.hasOwn(
    ALERT_CONFIG,
    normalized,
  )
    ? normalized
    : 'info';
}

function hasRenderableContent(value) {
  if (
    value === null ||
    value === undefined ||
    value === false
  ) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return true;
}

const Alert = forwardRef(
  function Alert(
    {
      type = 'info',
      title,
      children,
      className = '',
      titleClassName = '',
      contentClassName = '',
      titleProps,
      contentProps,
      role,
      'aria-live': ariaLive,
      'aria-atomic': ariaAtomic,
      ...alertProps
    },
    ref,
  ) {
    const generatedId = useId();

    const normalizedType =
      normalizeType(type);

    const config =
      ALERT_CONFIG[normalizedType];

    const hasTitle =
      hasRenderableContent(title);

    const hasContent =
      hasRenderableContent(children);

    const safeTitleProps =
      isRecord(titleProps)
        ? titleProps
        : {};

    const safeContentProps =
      isRecord(contentProps)
        ? contentProps
        : {};

    const {
      className:
        titlePropsClassName,
      style: titleStyle,
      id: explicitTitleId,
      role: titleRole,
      'aria-level': titleAriaLevel,
      ...remainingTitleProps
    } = safeTitleProps;

    const {
      className:
        contentPropsClassName,
      id: explicitContentId,
      ...remainingContentProps
    } = safeContentProps;

    const titleId = hasTitle
      ? (
          String(
            explicitTitleId ?? '',
          ).trim() ||
          `${generatedId}-title`
        )
      : undefined;

    const contentId = hasContent
      ? (
          String(
            explicitContentId ?? '',
          ).trim() ||
          `${generatedId}-content`
        )
      : undefined;

    const explicitAriaLabel =
      alertProps['aria-label'];

    const explicitAriaLabelledBy =
      alertProps['aria-labelledby'];

    const explicitAriaDescribedBy =
      alertProps['aria-describedby'];

    const ariaLabelledBy =
      explicitAriaLabel ||
      explicitAriaLabelledBy ||
      !hasTitle
        ? explicitAriaLabelledBy
        : titleId;

    const ariaDescribedBy =
      explicitAriaDescribedBy ||
      (
        hasContent
          ? contentId
          : undefined
      );

    return (
      <div
        {...alertProps}
        ref={ref}
        className={mergeClassNames(
          'alert',
          `alert--${normalizedType}`,
          className,
        )}
        role={role ?? config.role}
        aria-live={
          ariaLive ?? config.live
        }
        aria-atomic={
          ariaAtomic ?? true
        }
        aria-labelledby={
          ariaLabelledBy
        }
        aria-describedby={
          ariaDescribedBy
        }
        data-alert-type={
          normalizedType
        }
      >
        <div
          className="alert-content"
          style={{
            minWidth: 0,
          }}
        >
          {hasTitle && (
            <div
              {...remainingTitleProps}
              id={titleId}
              className={mergeClassNames(
                'alert-title',
                titleClassName,
                titlePropsClassName,
              )}
              role={
                titleRole ??
                'heading'
              }
              aria-level={
                titleAriaLevel ?? 3
              }
              style={{
                fontWeight: 600,
                ...(
                  isRecord(titleStyle)
                    ? titleStyle
                    : {}
                ),
              }}
            >
              {title}
            </div>
          )}

          {hasContent && (
            <div
              {...remainingContentProps}
              id={contentId}
              className={mergeClassNames(
                'alert-body',
                contentClassName,
                contentPropsClassName,
              )}
              style={{
                minWidth: 0,
                overflowWrap: 'anywhere',
                ...(
                  isRecord(
                    safeContentProps.style,
                  )
                    ? safeContentProps.style
                    : {}
                ),
              }}
            >
              {children}
            </div>
          )}
        </div>
      </div>
    );
  },
);

Alert.displayName = 'Alert';

export default Alert;
