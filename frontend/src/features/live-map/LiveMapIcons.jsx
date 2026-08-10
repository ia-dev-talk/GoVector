import { memo } from 'react';


function IconBase({
  children,
  className = '',
  size = 20,
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


export const MapIcon = memo(function MapIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3V6Z" />
      <path d="M8 3v15M16 6v15" />
    </IconBase>
  );
});


export const SearchIcon = memo(function SearchIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </IconBase>
  );
});


export const RefreshIcon = memo(function RefreshIcon({
  spinning = false,
  ...props
}) {
  return (
    <IconBase
      {...props}
      className={spinning ? 'lm-spin' : ''}
    >
      <path d="M20 7v5h-5" />
      <path d="M4 17v-5h5" />
      <path d="M18.2 9A7 7 0 0 0 6.4 6.4L4 9M6 15a7 7 0 0 0 11.6 2.6L20 15" />
    </IconBase>
  );
});


export const UsersIcon = memo(function UsersIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c.5-4 2.5-6 5.5-6s5 2 5.5 6" />
      <path d="M15 5.5a3 3 0 0 1 0 5.5M16 14c2.7.4 4.2 2.4 4.5 6" />
    </IconBase>
  );
});


export const ClipboardIcon = memo(function ClipboardIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="5" y="4.5" width="14" height="17" rx="2.5" />
      <path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" />
    </IconBase>
  );
});


export const LayersIcon = memo(function LayersIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </IconBase>
  );
});


export const FilterIcon = memo(function FilterIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z" />
    </IconBase>
  );
});


export const ChevronIcon = memo(function ChevronIcon({
  direction = 'left',
  ...props
}) {
  const transform = {
    left: 'rotate(0deg)',
    right: 'rotate(180deg)',
    up: 'rotate(90deg)',
    down: 'rotate(-90deg)',
  }[direction];

  return (
    <IconBase
      {...props}
      style={{ transform }}
    >
      <path d="m14 6-6 6 6 6" />
    </IconBase>
  );
});


export const CloseIcon = memo(function CloseIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </IconBase>
  );
});


export const LocationIcon = memo(function LocationIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </IconBase>
  );
});


export const RouteIcon = memo(function RouteIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M8 18h3a3 3 0 0 0 3-3v-6a3 3 0 0 1 3-3h1" />
    </IconBase>
  );
});


export const ExternalIcon = memo(function ExternalIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
    </IconBase>
  );
});


export const ActivityIcon = memo(function ActivityIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M3 12h4l2.2-5 4.1 10 2.2-5H21" />
    </IconBase>
  );
});


export const ClockIcon = memo(function ClockIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </IconBase>
  );
});


export const EyeIcon = memo(function EyeIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </IconBase>
  );
});


export const EmptyIcon = memo(function EmptyIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 7h16v12H4zM8 7V5h8v2" />
      <path d="M8 12h8" />
    </IconBase>
  );
});
