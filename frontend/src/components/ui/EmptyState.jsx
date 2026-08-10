import {
  createElement,
  forwardRef,
  useId,
} from 'react';

const TITLE_ELEMENTS = new Set([
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'div',
  'p',
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

function normalizeId(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
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

  if (Array.isArray(value)) {
    return value.some(
      hasRenderableContent,
    );
  }

  return true;
}

function normalizeTitleElement(value) {
  if (typeof value !== 'string') {
    return 'h3';
  }

  const normalized =
    value.trim().toLowerCase();

  return TITLE_ELEMENTS.has(normalized)
    ? normalized
    : 'h3';
}

const EmptyState = forwardRef(
  function EmptyState(
    {
      icon = '📋',
      title,
      description,
      action,
      titleAs = 'h3',
      iconLabel,
      className = '',
      iconClassName = '',
      titleClassName = '',
      descriptionClassName = '',
      actionClassName = '',
      iconProps,
      titleProps,
      descriptionProps,
      actionProps,
      'aria-label': ariaLabel,
      'aria-labelledby':
        explicitAriaLabelledBy,
      'aria-describedby':
        explicitAriaDescribedBy,
      ...emptyStateProps
    },
    ref,
  ) {
    const generatedId = useId();

    const safeIconProps =
      isRecord(iconProps)
        ? iconProps
        : {};

    const safeTitleProps =
      isRecord(titleProps)
        ? titleProps
        : {};

    const safeDescriptionProps =
      isRecord(descriptionProps)
        ? descriptionProps
        : {};

    const safeActionProps =
      isRecord(actionProps)
        ? actionProps
        : {};

    const hasIcon =
      hasRenderableContent(icon);

    const hasTitle =
      hasRenderableContent(title);

    const hasDescription =
      hasRenderableContent(
        description,
      );

    const hasAction =
      hasRenderableContent(action);

    const {
      className:
        iconPropsClassName,
      'aria-label':
        iconPropsAriaLabel,
      'aria-hidden':
        iconPropsAriaHidden,
      ...remainingIconProps
    } = safeIconProps;

    const {
      className:
        titlePropsClassName,
      id: explicitTitleId,
      ...remainingTitleProps
    } = safeTitleProps;

    const {
      className:
        descriptionPropsClassName,
      id: explicitDescriptionId,
      ...remainingDescriptionProps
    } = safeDescriptionProps;

    const {
      className:
        actionPropsClassName,
      ...remainingActionProps
    } = safeActionProps;

    const titleId = hasTitle
      ? (
          normalizeId(
            explicitTitleId,
          ) ||
          `${generatedId}-title`
        )
      : undefined;

    const descriptionId =
      hasDescription
        ? (
            normalizeId(
              explicitDescriptionId,
            ) ||
            `${generatedId}-description`
          )
        : undefined;

    const ariaLabelledBy =
      ariaLabel
        ? explicitAriaLabelledBy
        : (
            explicitAriaLabelledBy ||
            titleId
          );

    const ariaDescribedBy =
      explicitAriaDescribedBy ||
      descriptionId;

    const resolvedIconLabel =
      normalizeId(
        iconPropsAriaLabel ||
        iconLabel,
      );

    const TitleElement =
      normalizeTitleElement(
        titleAs,
      );

    return (
      <div
        {...emptyStateProps}
        ref={ref}
        className={mergeClassNames(
          'empty-state',
          className,
        )}
        aria-label={ariaLabel}
        aria-labelledby={
          ariaLabelledBy
        }
        aria-describedby={
          ariaDescribedBy
        }
      >
        {hasIcon && (
          <div
            {...remainingIconProps}
            className={mergeClassNames(
              'empty-state-icon',
              iconClassName,
              iconPropsClassName,
            )}
            aria-label={
              resolvedIconLabel ||
              undefined
            }
            aria-hidden={
              resolvedIconLabel
                ? undefined
                : (
                    iconPropsAriaHidden ??
                    true
                  )
            }
          >
            {icon}
          </div>
        )}

        {hasTitle && createElement(
          TitleElement,
          {
            ...remainingTitleProps,
            id: titleId,
            className: mergeClassNames(
              'empty-state-title',
              titleClassName,
              titlePropsClassName,
            ),
          },
          title,
        )}

        {hasDescription && (
          <p
            {...remainingDescriptionProps}
            id={descriptionId}
            className={mergeClassNames(
              'empty-state-description',
              descriptionClassName,
              descriptionPropsClassName,
            )}
            style={{
              overflowWrap: 'anywhere',
              ...(
                isRecord(
                  safeDescriptionProps.style,
                )
                  ? safeDescriptionProps.style
                  : {}
              ),
            }}
          >
            {description}
          </p>
        )}

        {hasAction && (
          <div
            {...remainingActionProps}
            className={mergeClassNames(
              'empty-state-action',
              actionClassName,
              actionPropsClassName,
            )}
          >
            {action}
          </div>
        )}
      </div>
    );
  },
);

EmptyState.displayName =
  'EmptyState';

export default EmptyState;
