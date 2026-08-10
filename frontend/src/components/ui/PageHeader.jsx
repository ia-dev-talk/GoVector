import {
  createElement,
  forwardRef,
  useId,
} from 'react';

const HEADING_ELEMENTS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'div',
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

function normalizeHeadingElement(value) {
  if (typeof value !== 'string') {
    return 'h1';
  }

  const normalized =
    value.trim().toLowerCase();

  return HEADING_ELEMENTS.has(
    normalized,
  )
    ? normalized
    : 'h1';
}

const PageHeader = forwardRef(
  function PageHeader(
    {
      title,
      subtitle,
      actions,
      titleAs = 'h1',
      className = '',
      contentClassName = '',
      titleClassName = '',
      subtitleClassName = '',
      actionsClassName = '',
      contentProps,
      titleProps,
      subtitleProps,
      actionsProps,
      'aria-label': ariaLabel,
      'aria-labelledby':
        explicitAriaLabelledBy,
      'aria-describedby':
        explicitAriaDescribedBy,
      ...headerProps
    },
    ref,
  ) {
    const generatedId = useId();

    const safeContentProps =
      isRecord(contentProps)
        ? contentProps
        : {};

    const safeTitleProps =
      isRecord(titleProps)
        ? titleProps
        : {};

    const safeSubtitleProps =
      isRecord(subtitleProps)
        ? subtitleProps
        : {};

    const safeActionsProps =
      isRecord(actionsProps)
        ? actionsProps
        : {};

    const hasTitle =
      hasRenderableContent(title);

    const hasSubtitle =
      hasRenderableContent(
        subtitle,
      );

    const hasActions =
      hasRenderableContent(actions);

    const {
      className:
        contentPropsClassName,
      style: contentStyle,
      ...remainingContentProps
    } = safeContentProps;

    const {
      className:
        titlePropsClassName,
      style: titleStyle,
      id: explicitTitleId,
      role: titleRole,
      'aria-level':
        titleAriaLevel,
      ...remainingTitleProps
    } = safeTitleProps;

    const {
      className:
        subtitlePropsClassName,
      style: subtitleStyle,
      id: explicitSubtitleId,
      ...remainingSubtitleProps
    } = safeSubtitleProps;

    const {
      className:
        actionsPropsClassName,
      style: actionsStyle,
      ...remainingActionsProps
    } = safeActionsProps;

    const titleId = hasTitle
      ? (
          normalizeId(
            explicitTitleId,
          ) ||
          `${generatedId}-title`
        )
      : '';

    const subtitleId = hasSubtitle
      ? (
          normalizeId(
            explicitSubtitleId,
          ) ||
          `${generatedId}-subtitle`
        )
      : '';

    const ariaLabelledBy =
      ariaLabel
        ? (
            explicitAriaLabelledBy ||
            undefined
          )
        : (
            explicitAriaLabelledBy ||
            titleId ||
            undefined
          );

    const ariaDescribedBy =
      explicitAriaDescribedBy ||
      subtitleId ||
      undefined;

    const TitleElement =
      normalizeHeadingElement(
        titleAs,
      );

    const simpleTitle =
      typeof title === 'string' ||
      typeof title === 'number';

    const titleIsNativeHeading =
      /^h[1-6]$/.test(
        TitleElement,
      );

    return (
      <header
        {...headerProps}
        ref={ref}
        className={mergeClassNames(
          'page-header',
          className,
        )}
        aria-label={
          ariaLabel || undefined
        }
        aria-labelledby={
          ariaLabelledBy
        }
        aria-describedby={
          ariaDescribedBy
        }
      >
        <div
          {...remainingContentProps}
          className={mergeClassNames(
            'page-header-content',
            contentClassName,
            contentPropsClassName,
          )}
          style={{
            minWidth: 0,
            flex: '1 1 auto',
            ...(
              isRecord(contentStyle)
                ? contentStyle
                : {}
            ),
          }}
        >
          {hasTitle && createElement(
            TitleElement,
            {
              ...remainingTitleProps,
              id: titleId,
              className: mergeClassNames(
                'page-title',
                titleClassName,
                titlePropsClassName,
              ),
              role: titleRole ?? (!titleIsNativeHeading && simpleTitle ? 'heading' : undefined),
              'aria-level': titleAriaLevel ?? (!titleIsNativeHeading && simpleTitle ? 1 : undefined),
              style: {
                margin: 0,
                minWidth: 0,
                color: 'var(--text-primary)',
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                lineHeight: 1.3,
                overflowWrap: 'anywhere',
                ...(isRecord(titleStyle) ? titleStyle : {}),
              },
            },
            title,
          )}

          {hasSubtitle && (
            <div
              {...remainingSubtitleProps}
              id={subtitleId}
              className={mergeClassNames(
                'page-subtitle',
                subtitleClassName,
                subtitlePropsClassName,
              )}
              style={{
                marginTop:
                  hasTitle
                    ? 'var(--space-xs)'
                    : 0,
                minWidth: 0,
                color:
                  'var(--text-secondary)',
                fontSize:
                  'var(--font-size-xs)',
                lineHeight: 1.4,
                overflowWrap: 'anywhere',
                ...(
                  isRecord(subtitleStyle)
                    ? subtitleStyle
                    : {}
                ),
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {hasActions && (
          <div
            {...remainingActionsProps}
            className={mergeClassNames(
              'page-header-actions',
              'page-actions',
              actionsClassName,
              actionsPropsClassName,
            )}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                'flex-end',
              gap: 'var(--space-sm)',
              flexWrap: 'wrap',
              flex: '0 0 auto',
              ...(
                isRecord(actionsStyle)
                  ? actionsStyle
                  : {}
              ),
            }}
          >
            {actions}
          </div>
        )}
      </header>
    );
  },
);

PageHeader.displayName =
  'PageHeader';

export default PageHeader;
