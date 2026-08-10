import { forwardRef } from 'react';

const MAX_ITEMS = 100;
const MAX_LINES = 20;
const MAX_COLUMNS = 12;

const LINE_WIDTHS = [92, 76, 84, 68, 96, 73];
const CELL_WIDTHS = [88, 72, 94, 66, 82, 100];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function classNames(...values) {
  return values
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim())
    .join(' ');
}

function integer(value, fallback, min = 0, max = MAX_ITEMS) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function statusProps(announce, ariaLabel) {
  if (!announce) {
    return {};
  }

  return {
    role: 'status',
    'aria-live': 'polite',
    'aria-busy': true,
    'aria-label': ariaLabel || 'Chargement en cours',
  };
}

function SkeletonBlock({
  className = '',
  style,
  animated = true,
  ...props
}) {
  return (
    <div
      {...props}
      className={classNames('skeleton', className)}
      aria-hidden="true"
      style={{
        ...(animated ? {} : { animation: 'none' }),
        ...(isRecord(style) ? style : {}),
      }}
    />
  );
}

export const SkeletonCard = forwardRef(function SkeletonCard(
  {
    lines = 3,
    animated = true,
    announce = true,
    ariaLabel = 'Chargement de la carte',
    className = '',
    lineWidths,
    style,
    ...props
  },
  ref,
) {
  const safeLines = integer(lines, 3, 0, MAX_LINES);
  const widths = Array.isArray(lineWidths)
    ? lineWidths.map(Number).filter((width) => Number.isFinite(width) && width > 0)
    : [];

  return (
    <div
      {...props}
      {...statusProps(announce, ariaLabel)}
      ref={ref}
      className={classNames('skeleton-card', className)}
      data-skeleton-type="card"
      style={{ minWidth: 0, ...(isRecord(style) ? style : {}) }}
    >
      <SkeletonBlock
        className="skeleton-header"
        animated={animated}
      />

      {Array.from({ length: safeLines }, (_, index) => {
        const requestedWidth = widths.length
          ? widths[index % widths.length]
          : LINE_WIDTHS[index % LINE_WIDTHS.length];

        const width = Math.min(100, Math.max(10, requestedWidth));

        return (
          <SkeletonBlock
            key={`line-${index}`}
            className="skeleton-line"
            animated={animated}
            style={{ width: `${width}%` }}
          />
        );
      })}
    </div>
  );
});

SkeletonCard.displayName = 'SkeletonCard';

export const SkeletonGrid = forwardRef(function SkeletonGrid(
  {
    count = 6,
    columns = 3,
    cardLines = 3,
    animated = true,
    announce = true,
    ariaLabel = 'Chargement de la grille',
    className = '',
    cardClassName = '',
    cardProps,
    style,
    ...props
  },
  ref,
) {
  const safeCount = integer(count, 6);
  const safeColumns = integer(columns, 3, 1, MAX_COLUMNS);
  const safeCardProps = isRecord(cardProps) ? cardProps : {};

  return (
    <div
      {...props}
      {...statusProps(announce, ariaLabel)}
      ref={ref}
      className={classNames('skeleton-grid', className)}
      data-skeleton-type="grid"
      data-skeleton-count={safeCount}
      data-skeleton-columns={safeColumns}
      style={{
        gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))`,
        minWidth: 0,
        ...(isRecord(style) ? style : {}),
      }}
    >
      {Array.from({ length: safeCount }, (_, index) => (
        <SkeletonCard
          {...safeCardProps}
          key={`card-${index}`}
          lines={cardLines}
          animated={animated}
          announce={false}
          className={classNames(cardClassName, safeCardProps.className)}
        />
      ))}
    </div>
  );
});

SkeletonGrid.displayName = 'SkeletonGrid';

function TableRow({
  columns,
  rowIndex,
  header = false,
  animated = true,
}) {
  return (
    <div
      className={header ? 'skeleton-table-header' : 'skeleton-table-row'}
      aria-hidden="true"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        alignItems: 'center',
        gap: 'var(--space-md)',
        width: '100%',
      }}
    >
      {Array.from({ length: columns }, (_, columnIndex) => (
        <SkeletonBlock
          key={`cell-${columnIndex}`}
          className="skeleton-table-cell"
          animated={animated}
          style={{
            width: `${CELL_WIDTHS[
              (rowIndex + columnIndex) % CELL_WIDTHS.length
            ]}%`,
            height: header ? 14 : 12,
          }}
        />
      ))}
    </div>
  );
}

export const SkeletonTable = forwardRef(function SkeletonTable(
  {
    rows = 5,
    columns = 4,
    animated = true,
    announce = true,
    ariaLabel = 'Chargement du tableau',
    className = '',
    style,
    ...props
  },
  ref,
) {
  const safeRows = integer(rows, 5);
  const safeColumns = integer(columns, 4, 1, MAX_COLUMNS);

  return (
    <div
      {...props}
      {...statusProps(announce, ariaLabel)}
      ref={ref}
      className={classNames('skeleton-table', className)}
      data-skeleton-type="table"
      data-skeleton-rows={safeRows}
      data-skeleton-columns={safeColumns}
      style={{
        width: '100%',
        minWidth: 0,
        padding: 'var(--space-xl)',
        ...(isRecord(style) ? style : {}),
      }}
    >
      <TableRow
        columns={safeColumns}
        rowIndex={0}
        header
        animated={animated}
      />

      {Array.from({ length: safeRows }, (_, rowIndex) => (
        <TableRow
          key={`row-${rowIndex}`}
          columns={safeColumns}
          rowIndex={rowIndex + 1}
          animated={animated}
        />
      ))}
    </div>
  );
});

SkeletonTable.displayName = 'SkeletonTable';

const SkeletonLoader = forwardRef(function SkeletonLoader(
  {
    type = 'card',
    count = 3,
    columns,
    lines = 3,
    animated = true,
    ariaLabel = 'Chargement du contenu',
    className = '',
    itemClassName = '',
    itemProps,
    style,
    ...props
  },
  ref,
) {
  const normalizedType =
    typeof type === 'string' ? type.trim().toLowerCase() : 'card';

  if (normalizedType === 'table') {
    return (
      <SkeletonTable
        {...props}
        ref={ref}
        rows={count}
        columns={columns ?? 4}
        animated={animated}
        ariaLabel={ariaLabel}
        className={className}
        style={style}
      />
    );
  }

  if (normalizedType === 'grid') {
    return (
      <SkeletonGrid
        {...props}
        ref={ref}
        count={count}
        columns={columns ?? 3}
        cardLines={lines}
        animated={animated}
        ariaLabel={ariaLabel}
        className={className}
        cardClassName={itemClassName}
        cardProps={itemProps}
        style={style}
      />
    );
  }

  const safeCount = integer(count, 3);
  const safeItemProps = isRecord(itemProps) ? itemProps : {};

  return (
    <div
      {...props}
      ref={ref}
      className={classNames('skeleton-stack', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={ariaLabel}
      data-skeleton-type="card"
      data-skeleton-count={safeCount}
      style={{ minWidth: 0, ...(isRecord(style) ? style : {}) }}
    >
      {Array.from({ length: safeCount }, (_, index) => (
        <SkeletonCard
          {...safeItemProps}
          key={`card-${index}`}
          lines={lines}
          animated={animated}
          announce={false}
          className={classNames(itemClassName, safeItemProps.className)}
        />
      ))}
    </div>
  );
});

SkeletonLoader.displayName = 'SkeletonLoader';

export default SkeletonLoader;
