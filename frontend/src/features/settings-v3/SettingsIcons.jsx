import { memo } from 'react';


function IconBase({
  children,
  size = 20,
  className = '',
  ...props
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}


export const SettingsIcon = memo(
  function SettingsIcon(props) {
    return (
      <IconBase {...props}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H1.8V9.6h.1A1.7 1.7 0 0 0 3.6 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.06 3.2l.06.06A1.7 1.7 0 0 0 8 3.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V1.8h4v.1A1.7 1.7 0 0 0 15 3.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8c.16.4.38.74.6 1 .3.34.7.54 1.1.6h.1v4h-.1A1.7 1.7 0 0 0 19.4 15Z" />
      </IconBase>
    );
  },
);


export const OverviewIcon = memo(
  function OverviewIcon(props) {
    return (
      <IconBase {...props}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </IconBase>
    );
  },
);


export const LocationIcon = memo(
  function LocationIcon(props) {
    return (
      <IconBase {...props}>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </IconBase>
    );
  },
);


export const ModulesIcon = memo(
  function ModulesIcon(props) {
    return (
      <IconBase {...props}>
        <path d="m12 2 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5" />
        <path d="m3 17 9 5 9-5" />
      </IconBase>
    );
  },
);


export const PlugIcon = memo(
  function PlugIcon(props) {
    return (
      <IconBase {...props}>
        <path d="M8 12h8M9 3v5M15 3v5" />
        <path d="M6 8h12v3a6 6 0 0 1-12 0V8Z" />
        <path d="M12 17v4" />
      </IconBase>
    );
  },
);


export const RoadmapIcon = memo(
  function RoadmapIcon(props) {
    return (
      <IconBase {...props}>
        <circle cx="6" cy="5" r="2" />
        <circle cx="18" cy="12" r="2" />
        <circle cx="6" cy="19" r="2" />
        <path d="M8 5h3a4 4 0 0 1 4 4v1M16 14v1a4 4 0 0 1-4 4H8" />
      </IconBase>
    );
  },
);


export const InfoIcon = memo(
  function InfoIcon(props) {
    return (
      <IconBase {...props}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 10v6M12 7h.01" />
      </IconBase>
    );
  },
);


export const RefreshIcon = memo(
  function RefreshIcon({
    spinning = false,
    ...props
  }) {
    return (
      <IconBase
        {...props}
        className={spinning ? 'sv3-spin' : ''}
      >
        <path d="M20 7v5h-5" />
        <path d="M4 17v-5h5" />
        <path d="M18.2 9A7 7 0 0 0 6.4 6.4L4 9M6 15a7 7 0 0 0 11.6 2.6L20 15" />
      </IconBase>
    );
  },
);


export const SearchIcon = memo(
  function SearchIcon(props) {
    return (
      <IconBase {...props}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </IconBase>
    );
  },
);


export const ArrowIcon = memo(
  function ArrowIcon(props) {
    return (
      <IconBase {...props}>
        <path d="M5 12h14M14 7l5 5-5 5" />
      </IconBase>
    );
  },
);


export const CheckIcon = memo(
  function CheckIcon(props) {
    return (
      <IconBase {...props}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16 9" />
      </IconBase>
    );
  },
);


export const ClockIcon = memo(
  function ClockIcon(props) {
    return (
      <IconBase {...props}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </IconBase>
    );
  },
);


export const AlertIcon = memo(
  function AlertIcon(props) {
    return (
      <IconBase {...props}>
        <path d="M12 3 2.5 20h19L12 3Z" />
        <path d="M12 9v4M12 17h.01" />
      </IconBase>
    );
  },
);


export const ShieldIcon = memo(
  function ShieldIcon(props) {
    return (
      <IconBase {...props}>
        <path d="M12 2 4 5v6c0 5 3.4 8.3 8 11 4.6-2.7 8-6 8-11V5l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </IconBase>
    );
  },
);


export const DatabaseIcon = memo(
  function DatabaseIcon(props) {
    return (
      <IconBase {...props}>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </IconBase>
    );
  },
);


export const UsersIcon = memo(
  function UsersIcon(props) {
    return (
      <IconBase {...props}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
        <path d="M15 6.5a3 3 0 0 1 0 5.8M17 15a5 5 0 0 1 4 5" />
      </IconBase>
    );
  },
);


export const MapIcon = memo(
  function MapIcon(props) {
    return (
      <IconBase {...props}>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
        <path d="M9 3v15M15 6v15" />
      </IconBase>
    );
  },
);


export const PackageIcon = memo(
  function PackageIcon(props) {
    return (
      <IconBase {...props}>
        <path d="m12 2 9 5-9 5-9-5 9-5Z" />
        <path d="M3 7v10l9 5 9-5V7" />
        <path d="M12 12v10" />
      </IconBase>
    );
  },
);


export const ClipboardIcon = memo(
  function ClipboardIcon(props) {
    return (
      <IconBase {...props}>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h4" />
      </IconBase>
    );
  },
);


export const ChartIcon = memo(
  function ChartIcon(props) {
    return (
      <IconBase {...props}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </IconBase>
    );
  },
);


export const MonitorIcon = memo(
  function MonitorIcon(props) {
    return (
      <IconBase {...props}>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </IconBase>
    );
  },
);


export const MobileIcon = memo(
  function MobileIcon(props) {
    return (
      <IconBase {...props}>
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
      </IconBase>
    );
  },
);


export const MailIcon = memo(
  function MailIcon(props) {
    return (
      <IconBase {...props}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </IconBase>
    );
  },
);
