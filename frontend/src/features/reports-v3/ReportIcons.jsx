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


export const ReportsIcon = memo(function ReportsIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
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
      className={spinning ? 'rv3-spin' : ''}
    >
      <path d="M20 7v5h-5" />
      <path d="M4 17v-5h5" />
      <path d="M18.2 9A7 7 0 0 0 6.4 6.4L4 9M6 15a7 7 0 0 0 11.6 2.6L20 15" />
    </IconBase>
  );
});


export const ExportIcon = memo(function ExportIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M5 14v6h14v-6" />
    </IconBase>
  );
});


export const CalendarIcon = memo(function CalendarIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </IconBase>
  );
});


export const ClipboardIcon = memo(function ClipboardIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h4" />
    </IconBase>
  );
});


export const CheckIcon = memo(function CheckIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </IconBase>
  );
});


export const ActivityIcon = memo(function ActivityIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M3 12h4l2.5-6 4.5 12 2.5-6H21" />
    </IconBase>
  );
});


export const ClockIcon = memo(function ClockIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </IconBase>
  );
});


export const AlertIcon = memo(function AlertIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v4M12 17h.01" />
    </IconBase>
  );
});


export const UserIcon = memo(function UserIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 21a7 7 0 0 1 14 0" />
    </IconBase>
  );
});


export const UsersIcon = memo(function UsersIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M15 6.5a3 3 0 0 1 0 5.8M17 15a5 5 0 0 1 4 5" />
    </IconBase>
  );
});


export const MapIcon = memo(function MapIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
      <path d="M9 3v15M15 6v15" />
    </IconBase>
  );
});


export const SignalIcon = memo(function SignalIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 18v2M9 14v6M14 10v10M19 5v15" />
    </IconBase>
  );
});


export const DatabaseIcon = memo(function DatabaseIcon(props) {
  return (
    <IconBase {...props}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </IconBase>
  );
});


export const ArrowIcon = memo(function ArrowIcon({
  direction = 'right',
  ...props
}) {
  const rotation = {
    right: 'rotate(0deg)',
    down: 'rotate(90deg)',
    left: 'rotate(180deg)',
    up: 'rotate(-90deg)',
  }[direction];

  return (
    <IconBase
      {...props}
      style={{ transform: rotation }}
    >
      <path d="M5 12h14M14 7l5 5-5 5" />
    </IconBase>
  );
});


export const TrendUpIcon = memo(function TrendUpIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m4 17 5-5 4 4 7-8" />
      <path d="M15 8h5v5" />
    </IconBase>
  );
});


export const TrendDownIcon = memo(function TrendDownIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m4 7 5 5 4-4 7 8" />
      <path d="M15 16h5v-5" />
    </IconBase>
  );
});
