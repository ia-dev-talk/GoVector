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

function normalizeOptionValue(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    return value;
  }

  return String(value);
}

function renderOption(
  option,
  index,
  parentKey = 'option',
) {
  if (
    option === null ||
    option === undefined ||
    option === false
  ) {
    return null;
  }

  if (!isRecord(option)) {
    const value =
      normalizeOptionValue(option);

    return (
      <option
        key={`${parentKey}-${String(value)}-${index}`}
        value={value}
      >
        {String(option)}
      </option>
    );
  }

  const nestedOptions =
    Array.isArray(option.options)
      ? option.options
      : null;

  if (nestedOptions) {
    const groupLabel =
      hasRenderableContent(
        option.label,
      )
        ? option.label
        : '';

    const groupKey =
      normalizeId(option.key) ||
      normalizeId(option.value) ||
      normalizeId(groupLabel) ||
      `${parentKey}-group-${index}`;

    return (
      <optgroup
        key={groupKey}
        label={String(groupLabel)}
        disabled={
          option.disabled === true
        }
      >
        {nestedOptions.map(
          (nestedOption, nestedIndex) =>
            renderOption(
              nestedOption,
              nestedIndex,
              groupKey,
            ),
        )}
      </optgroup>
    );
  }

  const value =
    normalizeOptionValue(
      option.value,
    );

  const label =
    hasRenderableContent(
      option.label,
    )
      ? option.label
      : String(value);

  const optionKey =
    normalizeId(option.key) ||
    `${parentKey}-${String(value)}-${index}`;

  const safeOptionProps =
    isRecord(option.optionProps)
      ? option.optionProps
      : {};

  return (
    <option
      {...safeOptionProps}
      key={optionKey}
      value={value}
      disabled={
        option.disabled === true ||
        safeOptionProps.disabled === true
      }
      hidden={
        option.hidden === true ||
        safeOptionProps.hidden === true
      }
    >
      {label}
    </option>
  );
}

const Select = forwardRef(
  function Select(
    {
      label,
      error,
      hint,
      options,
      children,
      value,
      defaultValue,
      onChange,
      onNativeChange,
      className = '',
      selectClassName = '',
      labelClassName = '',
      errorClassName = '',
      hintClassName = '',
      groupProps,
      labelProps,
      errorProps,
      hintProps,
      id,
      style,
      multiple = false,
      'aria-describedby':
        explicitAriaDescribedBy,
      'aria-errormessage':
        explicitAriaErrorMessage,
      'aria-invalid':
        explicitAriaInvalid,
      ...selectProps
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

    const hasChildren =
      hasRenderableContent(children);

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

    const selectId =
      normalizeId(id) ||
      `${generatedId}-select`;

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

    const controlled =
      value !== undefined;

    const selectionProps =
      controlled
        ? {
            value:
              value === null
                ? (
                    multiple
                      ? []
                      : ''
                  )
                : value,
          }
        : (
            defaultValue !== undefined
              ? {
                  defaultValue:
                    defaultValue === null
                      ? (
                          multiple
                            ? []
                            : ''
                        )
                      : defaultValue,
                }
              : {}
          );

    const selectStyle = {
      ...(hasError
        ? {
            borderColor:
              'var(--color-danger)',
          }
        : {}),
      ...(
        !multiple
          ? {
              paddingRight: 30,
            }
          : {}
      ),
      ...(isRecord(style)
        ? style
        : {}),
    };

    const handleChange = (event) => {
      const nextValue = multiple
        ? Array.from(
            event.currentTarget
              .selectedOptions,
            (option) => option.value,
          )
        : event.currentTarget.value;

      if (
        typeof onChange === 'function'
      ) {
        onChange(
          nextValue,
          event,
        );
      }

      if (
        typeof onNativeChange ===
        'function'
      ) {
        onNativeChange(event);
      }
    };

    const renderedOptions =
      hasChildren
        ? children
        : (
            Array.isArray(options)
              ? options.map(
                  (option, index) =>
                    renderOption(
                      option,
                      index,
                    ),
                )
              : null
          );

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
            htmlFor={selectId}
          >
            {label}
          </label>
        )}

        <div
          style={{
            position: 'relative',
            minWidth: 0,
          }}
        >
          <select
            {...selectProps}
            {...selectionProps}
            ref={ref}
            id={selectId}
            className={mergeClassNames(
              'form-select',
              hasError
                ? 'form-input--error'
                : '',
              selectClassName,
            )}
            style={selectStyle}
            multiple={multiple}
            onChange={handleChange}
            aria-invalid={ariaInvalid}
            aria-describedby={
              describedBy || undefined
            }
            aria-errormessage={
              errorMessageId || undefined
            }
          >
            {renderedOptions}
          </select>

          {!multiple && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: '50%',
                right: 10,
                transform:
                  'translateY(-50%)',
                color:
                  'var(--text-muted)',
                pointerEvents: 'none',
                fontSize: 12,
                lineHeight: 1,
              }}
            >
              ▾
            </span>
          )}
        </div>

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

Select.displayName = 'Select';

export default Select;
