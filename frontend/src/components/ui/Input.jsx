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

function mergeIds(...values) {
  const ids = values
    .flatMap((value) =>
      normalizeId(value).split(/\s+/),
    )
    .filter(Boolean);

  return [
    ...new Set(ids),
  ].join(' ');
}

const Input = forwardRef(
  function Input(
    {
      label,
      error,
      hint,
      className = '',
      inputClassName = '',
      labelClassName = '',
      errorClassName = '',
      hintClassName = '',
      groupProps,
      labelProps,
      errorProps,
      hintProps,
      id,
      style,
      'aria-describedby':
        explicitAriaDescribedBy,
      'aria-errormessage':
        explicitAriaErrorMessage,
      'aria-invalid':
        explicitAriaInvalid,
      ...inputProps
    },
    ref,
  ) {
    const generatedId = useId();

    const safeGroupProps =
      isRecord(groupProps)
        ? groupProps
        : {};

    const safeLabelProps =
      isRecord(labelProps)
        ? labelProps
        : {};

    const safeErrorProps =
      isRecord(errorProps)
        ? errorProps
        : {};

    const safeHintProps =
      isRecord(hintProps)
        ? hintProps
        : {};

    const hasLabel =
      hasRenderableContent(label);

    const hasError =
      hasRenderableContent(error);

    const hasHint =
      hasRenderableContent(hint);

    const {
      className:
        groupPropsClassName,
      ...remainingGroupProps
    } = safeGroupProps;

    const {
      className:
        labelPropsClassName,
      htmlFor:
        _ignoredLabelHtmlFor,
      ...remainingLabelProps
    } = safeLabelProps;

    const {
      className:
        errorPropsClassName,
      id: explicitErrorId,
      role: errorRole,
      'aria-live':
        errorAriaLive,
      style: errorStyle,
      ...remainingErrorProps
    } = safeErrorProps;

    const {
      className:
        hintPropsClassName,
      id: explicitHintId,
      style: hintStyle,
      ...remainingHintProps
    } = safeHintProps;

    const inputId =
      normalizeId(id) ||
      `${generatedId}-input`;

    const errorId = hasError
      ? (
          normalizeId(
            explicitErrorId,
          ) ||
          `${generatedId}-error`
        )
      : '';

    const hintId = hasHint
      ? (
          normalizeId(
            explicitHintId,
          ) ||
          `${generatedId}-hint`
        )
      : '';

    const describedBy = mergeIds(
      explicitAriaDescribedBy,
      hintId,
      errorId,
    );

    const errorMessageId =
      hasError
        ? mergeIds(
            explicitAriaErrorMessage,
            errorId,
          )
        : normalizeId(
            explicitAriaErrorMessage,
          );

    const ariaInvalid =
      hasError
        ? true
        : explicitAriaInvalid;

    const inputStyle = {
      ...(hasError
        ? {
            borderColor:
              'var(--color-danger)',
          }
        : {}),
      ...(isRecord(style)
        ? style
        : {}),
    };

    return (
      <div
        {...remainingGroupProps}
        className={mergeClassNames(
          'form-group',
          className,
          groupPropsClassName,
        )}
      >
        {hasLabel && (
          <label
            {...remainingLabelProps}
            className={mergeClassNames(
              'form-label',
              labelClassName,
              labelPropsClassName,
            )}
            htmlFor={inputId}
          >
            {label}
          </label>
        )}

        <input
          {...inputProps}
          ref={ref}
          id={inputId}
          className={mergeClassNames(
            'form-input',
            hasError
              ? 'form-input--error'
              : '',
            inputClassName,
          )}
          style={inputStyle}
          aria-invalid={ariaInvalid}
          aria-describedby={
            describedBy || undefined
          }
          aria-errormessage={
            errorMessageId || undefined
          }
        />

        {hasError && (
          <div
            {...remainingErrorProps}
            id={errorId}
            className={mergeClassNames(
              'form-error',
              errorClassName,
              errorPropsClassName,
            )}
            role={errorRole ?? 'alert'}
            aria-live={
              errorAriaLive ??
              'polite'
            }
            style={{
              overflowWrap: 'anywhere',
              ...(isRecord(errorStyle)
                ? errorStyle
                : {}),
            }}
          >
            {error}
          </div>
        )}

        {hasHint && (
          <div
            {...remainingHintProps}
            id={hintId}
            className={mergeClassNames(
              'form-hint',
              hintClassName,
              hintPropsClassName,
            )}
            style={{
              overflowWrap: 'anywhere',
              ...(isRecord(hintStyle)
                ? hintStyle
                : {}),
            }}
          >
            {hint}
          </div>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

export default Input;
