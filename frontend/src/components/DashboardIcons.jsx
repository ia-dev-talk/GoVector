import {
  forwardRef,
  useId,
} from 'react';

const DEFAULT_SIZE = 16;

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

  return String(value).trim();
}

function normalizeClassName(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function normalizeSize(value) {
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0
  ) {
    return value;
  }

  if (
    typeof value === 'string' &&
    value.trim()
  ) {
    return value.trim();
  }

  return DEFAULT_SIZE;
}

const SvgIcon = forwardRef(
  function SvgIcon(
    {
      children,
      title,
      size = DEFAULT_SIZE,
      className = '',
      style,
      viewBox = '0 0 16 16',
      fill = 'none',
      stroke = 'currentColor',
      strokeWidth = 1.5,
      strokeLinecap = 'round',
      strokeLinejoin = 'round',
      role,
      focusable = false,
      'aria-label': ariaLabel,
      'aria-labelledby':
        explicitAriaLabelledBy,
      'aria-hidden': explicitAriaHidden,
      ...svgProps
    },
    ref,
  ) {
    const generatedTitleId = useId();

    const normalizedTitle =
      normalizeText(title);

    const normalizedAriaLabel =
      normalizeText(ariaLabel);

    const hasAccessibleName =
      Boolean(
        normalizedTitle ||
        normalizedAriaLabel ||
        explicitAriaLabelledBy,
      );

    const titleId =
      normalizedTitle &&
      !normalizedAriaLabel &&
      !explicitAriaLabelledBy
        ? `${generatedTitleId}-title`
        : undefined;

    const ariaLabelledBy =
      explicitAriaLabelledBy ||
      titleId;

    const ariaHidden =
      explicitAriaHidden !==
      undefined
        ? explicitAriaHidden
        : (
            hasAccessibleName
              ? undefined
              : true
          );

    return (
      <svg
        {...svgProps}
        ref={ref}
        width={normalizeSize(size)}
        height={normalizeSize(size)}
        viewBox={viewBox}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap={strokeLinecap}
        strokeLinejoin={strokeLinejoin}
        className={
          normalizeClassName(
            className,
          ) || undefined
        }
        style={{
          display: 'block',
          flexShrink: 0,
          ...(
            isRecord(style)
              ? style
              : {}
          ),
        }}
        role={
          role ??
          (
            hasAccessibleName
              ? 'img'
              : undefined
          )
        }
        aria-label={
          normalizedAriaLabel ||
          undefined
        }
        aria-labelledby={
          ariaLabelledBy ||
          undefined
        }
        aria-hidden={ariaHidden}
        focusable={focusable}
      >
        {titleId && (
          <title id={titleId}>
            {normalizedTitle}
          </title>
        )}

        {children}
      </svg>
    );
  },
);

SvgIcon.displayName = 'SvgIcon';

function createIcon(
  displayName,
  children,
  defaultProps = {},
) {
  const Icon = forwardRef(
    function DashboardIcon(
      props,
      ref,
    ) {
      return (
        <SvgIcon
          {...defaultProps}
          {...props}
          ref={ref}
        >
          {children}
        </SvgIcon>
      );
    },
  );

  Icon.displayName = displayName;

  return Icon;
}

const MAP_PATHS = (
  <>
    <path d="M1 3.5 5.5 1.5l5 2.5L15 2v11l-4.5 2-5-2.5L1 14.5v-11Z" />
    <path d="M5.5 1.5v11M10.5 4v11" />
  </>
);

const BOLT_PATHS = (
  <path d="M9.5 1 3 9h4.5l-1 6L13 7H8.5l1-6Z" />
);

const TIMELINE_PATHS = (
  <>
    <path d="M1 4h14M1 8h14M1 12h14" />

    <rect
      x="3"
      y="2.5"
      width="4"
      height="3"
      rx="0.5"
      fill="currentColor"
      stroke="none"
    />

    <rect
      x="8"
      y="6.5"
      width="5"
      height="3"
      rx="0.5"
      fill="currentColor"
      stroke="none"
    />

    <rect
      x="2"
      y="10.5"
      width="3"
      height="3"
      rx="0.5"
      fill="currentColor"
      stroke="none"
    />
  </>
);

const FILTER_PATHS = (
  <path d="M1.5 2.5h13L9.5 8v4l-3 1.5V8l-5-5.5Z" />
);

const PERSONNEL_PATHS = (
  <>
    <circle
      cx="8"
      cy="5"
      r="2.5"
    />

    <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" />
  </>
);

const SEARCH_PATHS = (
  <>
    <circle
      cx="6.5"
      cy="6.5"
      r="4"
    />

    <path d="m10 10 4 4" />
  </>
);

const CHART_PATHS = (
  <>
    <rect
      x="1"
      y="8"
      width="3.5"
      height="7"
      rx="0.5"
      fill="currentColor"
      stroke="none"
    />

    <rect
      x="6.25"
      y="5"
      width="3.5"
      height="10"
      rx="0.5"
      fill="currentColor"
      stroke="none"
    />

    <rect
      x="11.5"
      y="2"
      width="3.5"
      height="13"
      rx="0.5"
      fill="currentColor"
      stroke="none"
    />
  </>
);

const EXCEL_PATHS = (
  <>
    <path d="M3 1h8l3 3v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z" />
    <path d="M11 1v4h3M5.5 7.5l4 5M9.5 7.5l-4 5" />
  </>
);

const SUPERVISION_PATHS = (
  <>
    <rect
      x="1"
      y="1"
      width="6"
      height="6"
      rx="0.5"
    />

    <rect
      x="9"
      y="1"
      width="6"
      height="6"
      rx="0.5"
    />

    <rect
      x="1"
      y="9"
      width="6"
      height="6"
      rx="0.5"
    />

    <rect
      x="9"
      y="9"
      width="6"
      height="6"
      rx="0.5"
    />

    <circle
      cx="4"
      cy="4"
      r="1"
      fill="currentColor"
      stroke="none"
    />

    <circle
      cx="12"
      cy="4"
      r="1"
      fill="currentColor"
      stroke="none"
    />

    <circle
      cx="4"
      cy="12"
      r="1"
      fill="currentColor"
      stroke="none"
    />

    <circle
      cx="12"
      cy="12"
      r="1"
      fill="currentColor"
      stroke="none"
    />
  </>
);

const EXPORT_PATHS = (
  <>
    <path d="M8 1v9M4 6l4 4 4-4" />
    <path d="M2 11v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" />
  </>
);

export const MapIcon = createIcon(
  'MapIcon',
  MAP_PATHS,
);

export const BoltIcon = createIcon(
  'BoltIcon',
  BOLT_PATHS,
  {
    fill: 'currentColor',
    stroke: 'none',
  },
);

export const TimelineIcon = createIcon(
  'TimelineIcon',
  TIMELINE_PATHS,
);

export const FilterIcon = createIcon(
  'FilterIcon',
  FILTER_PATHS,
);

export const PersonnelIcon = createIcon(
  'PersonnelIcon',
  PERSONNEL_PATHS,
);

export const SearchIcon = createIcon(
  'SearchIcon',
  SEARCH_PATHS,
);

export const ChartIcon = createIcon(
  'ChartIcon',
  CHART_PATHS,
);

export const ExcelIcon = createIcon(
  'ExcelIcon',
  EXCEL_PATHS,
);

export const SupervisionIcon = createIcon(
  'SupervisionIcon',
  SUPERVISION_PATHS,
);

export const ExportIcon = createIcon(
  'ExportIcon',
  EXPORT_PATHS,
);

export const RefreshIcon = forwardRef(
  function RefreshIcon(
    {
      spinning = false,
      style,
      ...iconProps
    },
    ref,
  ) {
    return (
      <SvgIcon
        {...iconProps}
        ref={ref}
        data-spinning={
          spinning
            ? 'true'
            : 'false'
        }
        style={{
          transformOrigin: 'center',
          ...(
            spinning
              ? {
                  animation:
                    'spin 0.8s linear infinite',
                }
              : {}
          ),
          ...(
            isRecord(style)
              ? style
              : {}
          ),
        }}
      >
        <path d="M2.5 8a5.5 5.5 0 0 1 9.3-4" />
        <path d="M13.5 8a5.5 5.5 0 0 1-9.3 4" />
        <path d="M11.5 1v3h3M4.5 15v-3h-3" />
      </SvgIcon>
    );
  },
);

RefreshIcon.displayName =
  'RefreshIcon';
