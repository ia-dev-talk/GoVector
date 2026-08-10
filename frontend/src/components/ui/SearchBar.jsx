import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value);
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

const SearchBar = forwardRef(
  function SearchBar(
    {
      value,
      defaultValue = '',
      onChange,
      onNativeChange,
      onSubmit,
      onClear,
      placeholder = 'Rechercher…',
      disabled = false,
      readOnly = false,
      loading = false,
      clearable = true,
      clearOnEscape = true,
      className = '',
      inputClassName = '',
      iconClassName = '',
      clearButtonClassName = '',
      style,
      inputStyle,
      icon,
      inputProps,
      clearButtonProps,
      'aria-label': ariaLabel = 'Recherche',
      ...containerProps
    },
    forwardedRef,
  ) {
    const inputRef = useRef(null);

    useImperativeHandle(
      forwardedRef,
      () => inputRef.current,
      [],
    );

    const controlled =
      value !== undefined;

    const [internalValue, setInternalValue] =
      useState(() =>
        normalizeText(defaultValue),
      );

    const currentValue = controlled
      ? normalizeText(value)
      : internalValue;

    const safeInputProps =
      isRecord(inputProps)
        ? inputProps
        : {};

    const safeClearButtonProps =
      isRecord(clearButtonProps)
        ? clearButtonProps
        : {};

    const {
      className:
        inputPropsClassName,
      style:
        inputPropsStyle,
      onChange:
        inputPropsOnChange,
      onKeyDown:
        inputPropsOnKeyDown,
      'aria-label':
        inputAriaLabel,
      ...remainingInputProps
    } = safeInputProps;

    const {
      className:
        clearButtonPropsClassName,
      style:
        clearButtonPropsStyle,
      onClick:
        clearButtonPropsOnClick,
      type:
        _ignoredClearButtonType,
      ...remainingClearButtonProps
    } = safeClearButtonProps;

    const emitChange = useCallback(
      (nextValue, event) => {
        if (!controlled) {
          setInternalValue(nextValue);
        }

        if (
          typeof onChange === 'function'
        ) {
          onChange(nextValue, event);
        }
      },
      [controlled, onChange],
    );

    const handleInputChange =
      useCallback(
        (event) => {
          const nextValue =
            event.currentTarget.value;

          emitChange(
            nextValue,
            event,
          );

          if (
            typeof inputPropsOnChange ===
            'function'
          ) {
            inputPropsOnChange(event);
          }

          if (
            typeof onNativeChange ===
            'function'
          ) {
            onNativeChange(event);
          }
        },
        [
          emitChange,
          inputPropsOnChange,
          onNativeChange,
        ],
      );

    const clearSearch = useCallback(
      (event) => {
        if (
          disabled ||
          readOnly ||
          loading ||
          !currentValue
        ) {
          return;
        }

        emitChange('', event);

        if (
          typeof onClear === 'function'
        ) {
          onClear(event);
        }

        window.requestAnimationFrame(
          () => {
            inputRef.current?.focus();
          },
        );
      },
      [
        currentValue,
        disabled,
        emitChange,
        loading,
        onClear,
        readOnly,
      ],
    );

    const handleClearClick =
      useCallback(
        (event) => {
          if (
            typeof clearButtonPropsOnClick ===
            'function'
          ) {
            clearButtonPropsOnClick(
              event,
            );
          }

          if (event.defaultPrevented) {
            return;
          }

          clearSearch(event);
        },
        [
          clearButtonPropsOnClick,
          clearSearch,
        ],
      );

    const handleKeyDown =
      useCallback(
        (event) => {
          if (
            typeof inputPropsOnKeyDown ===
            'function'
          ) {
            inputPropsOnKeyDown(event);
          }

          if (event.defaultPrevented) {
            return;
          }

          if (
            event.key === 'Escape' &&
            clearOnEscape &&
            currentValue
          ) {
            event.preventDefault();
            clearSearch(event);
            return;
          }

          if (
            event.key === 'Enter' &&
            typeof onSubmit === 'function'
          ) {
            event.preventDefault();

            onSubmit(
              currentValue,
              event,
            );
          }
        },
        [
          clearOnEscape,
          clearSearch,
          currentValue,
          inputPropsOnKeyDown,
          onSubmit,
        ],
      );

    const showClearButton =
      clearable &&
      Boolean(currentValue) &&
      !disabled &&
      !readOnly &&
      !loading;

    const resolvedIcon =
      icon === undefined
        ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              focusable="false"
            >
              <circle
                cx="7"
                cy="7"
                r="4.5"
                stroke="currentColor"
                strokeWidth="1.5"
              />

              <path
                d="m10.5 10.5 3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          )
        : icon;

    return (
      <div
        {...containerProps}
        className={mergeClassNames(
          'search-bar',
          className,
        )}
        role="search"
        aria-label={
          ariaLabel || undefined
        }
        aria-busy={
          loading || undefined
        }
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          minWidth: 0,
          ...(isRecord(style)
            ? style
            : {}),
        }}
      >
        <span
          className={mergeClassNames(
            'search-bar-icon',
            iconClassName,
          )}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 8,
            zIndex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color:
              'var(--text-muted)',
            pointerEvents: 'none',
          }}
        >
          {loading ? (
            <span
              className="loading-spinner"
              style={{
                width: 12,
                height: 12,
                borderWidth: 1.5,
              }}
            />
          ) : (
            resolvedIcon
          )}
        </span>

        <input
          {...remainingInputProps}
          ref={inputRef}
          type="search"
          value={currentValue}
          onChange={
            handleInputChange
          }
          onKeyDown={
            handleKeyDown
          }
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          className={mergeClassNames(
            'form-input',
            'search-bar-input',
            inputClassName,
            inputPropsClassName,
          )}
          aria-label={
            inputAriaLabel ||
            ariaLabel ||
            'Rechercher'
          }
          style={{
            width: '100%',
            minWidth: 0,
            height: 24,
            paddingLeft: 28,
            paddingRight:
              showClearButton
                ? 28
                : 10,
            fontSize:
              'var(--font-size-xs)',
            ...(isRecord(inputStyle)
              ? inputStyle
              : {}),
            ...(isRecord(
              inputPropsStyle,
            )
              ? inputPropsStyle
              : {}),
          }}
        />

        {showClearButton && (
          <button
            {...remainingClearButtonProps}
            type="button"
            className={mergeClassNames(
              'search-bar-clear',
              clearButtonClassName,
              clearButtonPropsClassName,
            )}
            onClick={
              handleClearClick
            }
            aria-label="Effacer la recherche"
            title="Effacer"
            style={{
              position: 'absolute',
              right: 4,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 20,
              padding: 0,
              border: 0,
              borderRadius:
                'var(--radius-sm)',
              background:
                'transparent',
              color:
                'var(--text-muted)',
              fontFamily:
                'var(--font-family)',
              fontSize: 16,
              lineHeight: 1,
              cursor: 'pointer',
              ...(isRecord(
                clearButtonPropsStyle,
              )
                ? clearButtonPropsStyle
                : {}),
            }}
          >
            <span aria-hidden="true">
              ×
            </span>
          </button>
        )}
      </div>
    );
  },
);

SearchBar.displayName =
  'SearchBar';

export default SearchBar;
