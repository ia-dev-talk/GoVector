import {
  createElement,
  forwardRef,
  useId,
} from 'react';

const TITLE_ELEMENTS = new Set([
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

function normalizeTitleElement(value) {
  if (typeof value !== 'string') {
    return 'h2';
  }

  const normalized =
    value.trim().toLowerCase();

  return TITLE_ELEMENTS.has(normalized)
    ? normalized
    : 'h2';
}

const Section = forwardRef(
  function Section(
    {
      title,
      subtitle,
      children,
      actions,
      titleAs = 'h2',
      className = '',
      headerClassName = '',
      headingClassName = '',
      titleClassName = '',
      subtitleClassName = '',
      actionsClassName = '',
      bodyClassName = '',
      headerProps,
      headingProps,
      titleProps,
      subtitleProps,
      actionsProps,
      bodyProps,
      'aria-label': ariaLabel,
      'aria-labelledby':
        explicitAriaLabelledBy,
      'aria-describedby':
        explicitAriaDescribedBy,
      ...sectionProps
    },
    ref,
  ) {
    const generatedId = useId();

    const safeHeaderProps =
      isRecord(headerProps)
        ? headerProps
        : {};

    const safeHeadingProps =
      isRecord(headingProps)
        ? headingProps
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

    const safeBodyProps =
      isRecord(bodyProps)
        ? bodyProps
        : {};

    const hasTitle =
      hasRenderableContent(title);

    const hasSubtitle =
      hasRenderableContent(
        subtitle,
      );

    const hasActions =
      hasRenderableContent(actions);

    const hasHeader =
      hasTitle ||
      hasSubtitle ||
      hasActions;

    const {
      className:
        headerPropsClassName,
      style: headerStyle,
      ...remainingHeaderProps
    } = safeHeaderProps;

    const {
      className:
        headingPropsClassName,
      style: headingStyle,
      ...remainingHeadingProps
    } = safeHeadingProps;

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
      role: actionsRole,
      'aria-label':
        actionsAriaLabel,
      ...remainingActionsProps
    } = safeActionsProps;

    const {
      className:
        bodyPropsClassName,
      style: bodyStyle,
      ...remainingBodyProps
    } = safeBodyProps;

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
      normalizeTitleElement(
        titleAs,
      );

    const titleIsNativeHeading =
      /^h[1-6]$/.test(
        TitleElement,
      );

    const simpleTitle =
      typeof title === 'string' ||
      typeof title === 'number';

    return (
      <section
        {...sectionProps}
        ref={ref}
        className={mergeClassNames(
          'card',
          'section',
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
        {hasHeader && (
          <div
            {...remainingHeaderProps}
            className={mergeClassNames(
              'card-header',
              'section-header',
              headerClassName,
              headerPropsClassName,
            )}
            style={{
              alignItems: 'center',
              gap: 'var(--space-md)',
              minWidth: 0,
              ...(
                isRecord(headerStyle)
                  ? headerStyle
                  : {}
              ),
            }}
          >
            {(hasTitle ||
              hasSubtitle) && (
              <div
                {...remainingHeadingProps}
                className={mergeClassNames(
                  'section-heading',
                  headingClassName,
                  headingPropsClassName,
                )}
                style={{
                  minWidth: 0,
                  flex: '1 1 auto',
                  ...(
                    isRecord(
                      headingStyle,
                    )
                      ? headingStyle
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
                      'card-title',
                      'section-title',
                      titleClassName,
                      titlePropsClassName,
                    ),
                    role: titleRole ?? (!titleIsNativeHeading && simpleTitle ? 'heading' : undefined),
                    'aria-level': titleAriaLevel ?? (!titleIsNativeHeading && simpleTitle ? 2 : undefined),
                    style: {
                      margin: 0,
                      minWidth: 0,
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
                      'section-subtitle',
                      subtitleClassName,
                      subtitlePropsClassName,
                    )}
                    style={{
                      marginTop:
                        hasTitle
                          ? 'var(--space-xs)'
                          : 0,
                      color:
                        'var(--text-muted)',
                      fontSize:
                        'var(--font-size-xs)',
                      fontWeight: 400,
                      lineHeight: 1.4,
                      textTransform: 'none',
                      letterSpacing:
                        'normal',
                      overflowWrap:
                        'anywhere',
                      ...(
                        isRecord(
                          subtitleStyle,
                        )
                          ? subtitleStyle
                          : {}
                      ),
                    }}
                  >
                    {subtitle}
                  </div>
                )}
              </div>
            )}

            {hasActions && (
              <div
                {...remainingActionsProps}
                className={mergeClassNames(
                  'page-header-actions',
                  'page-actions',
                  'section-actions',
                  actionsClassName,
                  actionsPropsClassName,
                )}
                role={
                  actionsRole ??
                  'group'
                }
                aria-label={
                  actionsAriaLabel ??
                  (
                    hasTitle &&
                    typeof title ===
                      'string'
                      ? `Actions — ${title.trim()}`
                      : 'Actions de la section'
                  )
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent:
                    'flex-end',
                  gap: 'var(--space-sm)',
                  flexWrap: 'wrap',
                  flex: '0 0 auto',
                  minWidth: 0,
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
          </div>
        )}

        <div
          {...remainingBodyProps}
          className={mergeClassNames(
            'card-body',
            'section-body',
            bodyClassName,
            bodyPropsClassName,
          )}
          style={{
            minWidth: 0,
            overflowWrap: 'anywhere',
            ...(
              isRecord(bodyStyle)
                ? bodyStyle
                : {}
            ),
          }}
        >
          {children}
        </div>
      </section>
    );
  },
);

Section.displayName = 'Section';

export default Section;
