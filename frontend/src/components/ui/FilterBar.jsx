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

function normalizeGap(value) {
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0
  ) {
    return value;
  }

  if (
    typeof value === 'string' &&
    value.trim()
  ) {
    return value.trim();
  }

  return 'var(--space-sm)';
}

const FilterBar = forwardRef(
  function FilterBar(
    {
      children,
      className = '',
      style,
      wrap = true,
      scrollable = false,
      gap = 'var(--space-sm)',
      align = 'center',
      role = 'group',
      'aria-label': ariaLabel = 'Filtres',
      ...filterBarProps
    },
    ref,
  ) {
    const normalizedClassName =
      normalizeClassName(
        className,
      );

    const shouldWrap =
      wrap !== false &&
      scrollable !== true;

    const mergedStyle = {
      display: 'flex',
      alignItems:
        typeof align === 'string' &&
        align.trim()
          ? align.trim()
          : 'center',
      gap: normalizeGap(gap),
      flexWrap:
        shouldWrap
          ? 'wrap'
          : 'nowrap',
      width: '100%',
      minWidth: 0,
      ...(scrollable
        ? {
            overflowX: 'auto',
            overflowY: 'hidden',
            overscrollBehaviorX:
              'contain',
            WebkitOverflowScrolling:
              'touch',
          }
        : {}),
      ...(isRecord(style)
        ? style
        : {}),
    };

    return (
      <div
        {...filterBarProps}
        ref={ref}
        className={[
          'filter-bar',
          normalizedClassName,
        ]
          .filter(Boolean)
          .join(' ')}
        role={role || undefined}
        aria-label={
          ariaLabel || undefined
        }
        style={mergedStyle}
        data-wrap={
          shouldWrap
            ? 'true'
            : 'false'
        }
        data-scrollable={
          scrollable
            ? 'true'
            : 'false'
        }
      >
        {children}
      </div>
    );
  },
);

FilterBar.displayName =
  'FilterBar';

export default FilterBar;
