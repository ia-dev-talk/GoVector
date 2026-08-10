function IconBase({ children, className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function PeopleIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c.7-4 2.8-6.1 5.5-6.1s4.8 2.1 5.5 6.1" />
      <path d="M15.8 5.6a3 3 0 0 1 0 5.8M17 14.2c2 .6 3.3 2.5 3.8 5.8" />
    </IconBase>
  );
}

export function UserCheckIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c.7-4 2.8-6.1 5.5-6.1 1.7 0 3.1.8 4.1 2.2" />
      <path d="m15 17 2 2 4-5" />
    </IconBase>
  );
}

export function RouteIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M8 18h3a4 4 0 0 0 4-4V10a4 4 0 0 1 4-4" />
    </IconBase>
  );
}

export function ActivityIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M3 12h4l2.2-5 4.1 10 2.2-5H21" />
    </IconBase>
  );
}

export function PauseIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 8.5v7M14.5 8.5v7" />
    </IconBase>
  );
}

export function OfflineIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 4l16 16" />
      <path d="M9.2 5.5A8.5 8.5 0 0 1 20.5 16M4.6 8.5A8.5 8.5 0 0 0 15.5 20.6" />
    </IconBase>
  );
}

export function PinIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.2" />
    </IconBase>
  );
}

export function SearchIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </IconBase>
  );
}

export function FilterIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 5h16l-6.2 7v5.5l-3.6 1.8V12L4 5Z" />
    </IconBase>
  );
}

export function RefreshIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M20 7v5h-5" />
      <path d="M4 17v-5h5" />
      <path d="M6.2 8.5A7 7 0 0 1 18.8 7L20 12M4 12l1.2 5A7 7 0 0 0 17.8 15.5" />
    </IconBase>
  );
}

export function CloseIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </IconBase>
  );
}

export function ChevronIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m9 18 6-6-6-6" />
    </IconBase>
  );
}

export function SaveIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M5 4h12l2 2v14H5V4Z" />
      <path d="M8 4v6h8V4M8 20v-6h8v6" />
    </IconBase>
  );
}

export function BriefcaseIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M9 7V5h6v2M3 12h18" />
    </IconBase>
  );
}

export function ToolIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M14.5 6.5a4.5 4.5 0 0 0-5.8 5.8L3.5 17.5a2.1 2.1 0 0 0 3 3l5.2-5.2a4.5 4.5 0 0 0 5.8-5.8l-2.7 2.7-3-3 2.7-2.7Z" />
    </IconBase>
  );
}

export function CalendarIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </IconBase>
  );
}

export function HistoryIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </IconBase>
  );
}

export function SettingsIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.5 1a7 7 0 0 0-1.7-1L14.4 3h-4.8l-.4 3.1a7 7 0 0 0-1.7 1L5 6.1 3 9.5 5 11a7 7 0 0 0 0 2l-2 1.5L5 17.9l2.5-1a7 7 0 0 0 1.7 1l.4 3.1h4.8l.4-3.1a7 7 0 0 0 1.7-1l2.5 1 2-3.4L19 13a7 7 0 0 0 .1-1Z" />
    </IconBase>
  );
}
