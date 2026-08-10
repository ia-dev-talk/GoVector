import {
  forwardRef,
  useId,
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

function mergeClassNames(
  baseClassName,
  customClassName,
) {
  return [
    baseClassName,
    normalizeClassName(
      customClassName,
    ),
  ]
    .filter(Boolean)
    .join(' ');
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

function normalizeId(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}

const Card = forwardRef(
  function Card(
    {
      title,
      children,
      footer,
      className = '',
      headerClassName = '',
      titleClassName = '',
      bodyClassName = '',
      footerClassName = '',
      headerProps,
      titleProps,
      bodyProps,
      footerProps,
      ...cardProps
    },
    ref,
  ) {
    const generatedTitleId =
      useId();

    const safeHeaderProps =
      isRecord(headerProps)
        ? headerProps
        : {};

    const safeTitleProps =
      isRecord(titleProps)
        ? titleProps
        : {};

    const safeBodyProps =
      isRecord(bodyProps)
        ? bodyProps
        : {};

    const safeFooterProps =
      isRecord(footerProps)
        ? footerProps
        : {};

    const hasTitle =
      hasRenderableContent(title);

    const hasFooter =
      hasRenderableContent(footer);

    const explicitTitleId =
      normalizeId(
        safeTitleProps.id,
      );

    const titleId = hasTitle
      ? (
          explicitTitleId ||
          `${generatedTitleId}-title`
        )
      : undefined;

    const explicitAriaLabel =
      cardProps['aria-label'];

    const explicitAriaLabelledBy =
      cardProps['aria-labelledby'];

    const cardAriaLabelledBy =
      explicitAriaLabel ||
      explicitAriaLabelledBy ||
      !hasTitle
        ? explicitAriaLabelledBy
        : titleId;

    const simpleTitle =
      typeof title === 'string' ||
      typeof title === 'number';

    const {
      className:
        headerPropsClassName,
      ...remainingHeaderProps
    } = safeHeaderProps;

    const {
      className:
        titlePropsClassName,
      role: titleRole,
      'aria-level': titleAriaLevel,
      ...remainingTitleProps
    } = safeTitleProps;

    const {
      className:
        bodyPropsClassName,
      ...remainingBodyProps
    } = safeBodyProps;

    const {
      className:
        footerPropsClassName,
      ...remainingFooterProps
    } = safeFooterProps;

    return (
      <div
        {...cardProps}
        ref={ref}
        className={mergeClassNames(
          'card',
          className,
        )}
        aria-labelledby={
          cardAriaLabelledBy
        }
      >
        {hasTitle && (
          <div
            {...remainingHeaderProps}
            className={mergeClassNames(
              'card-header',
              [
                headerClassName,
                headerPropsClassName,
              ]
                .filter(Boolean)
                .join(' '),
            )}
          >
            <div
              {...remainingTitleProps}
              id={titleId}
              className={mergeClassNames(
                'card-title',
                [
                  titleClassName,
                  titlePropsClassName,
                ]
                  .filter(Boolean)
                  .join(' '),
              )}
              role={
                titleRole ??
                (
                  simpleTitle
                    ? 'heading'
                    : undefined
                )
              }
              aria-level={
                titleAriaLevel ??
                (
                  simpleTitle
                    ? 2
                    : undefined
                )
              }
            >
              {title}
            </div>
          </div>
        )}

        <div
          {...remainingBodyProps}
          className={mergeClassNames(
            'card-body',
            [
              bodyClassName,
              bodyPropsClassName,
            ]
              .filter(Boolean)
              .join(' '),
          )}
        >
          {children}
        </div>

        {hasFooter && (
          <div
            {...remainingFooterProps}
            className={mergeClassNames(
              'card-footer',
              [
                footerClassName,
                footerPropsClassName,
              ]
                .filter(Boolean)
                .join(' '),
            )}
          >
            {footer}
          </div>
        )}
      </div>
    );
  },
);

Card.displayName = 'Card';

export default Card;
