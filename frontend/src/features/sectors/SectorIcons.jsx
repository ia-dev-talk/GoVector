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


export const SectorIcon = memo(function SectorIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m3 7 6-4 6 4 6-4v14l-6 4-6-4-6 4V7Z" />
      <path d="M9 3v14M15 7v14" />
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
      className={spinning ? 'sv3-spin' : ''}
    >
      <path d="M20 7v5h-5" />
      <path d="M4 17v-5h5" />
      <path d="M18.2 9A7 7 0 0 0 6.4 6.4L4 9M6 15a7 7 0 0 0 11.6 2.6L20 15" />
    </IconBase>
  );
});


export const PlusIcon = memo(function PlusIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14M5 12h14" />
    </IconBase>
  );
});


export const ExportIcon = memo(function ExportIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M5 14v6h14v-6" />
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


export const LocationIcon = memo(function LocationIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </IconBase>
  );
});


export const AlertIcon = memo(function AlertIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v4.5M12 17h.01" />
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


export const EditIcon = memo(function EditIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
      <path d="m13.5 7.5 3 3" />
    </IconBase>
  );
});


export const ArchiveIcon = memo(function ArchiveIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 7h16v13H4V7ZM3 4h18v3H3V4Z" />
      <path d="M9 11h6" />
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


export const CloseIcon = memo(function CloseIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </IconBase>
  );
});


export const GeometryIcon = memo(function GeometryIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M5 4h5v5H5zM14 15h5v5h-5z" />
      <path d="m10 6.5 4 2.5M16.5 15v-4.5L10 8.5M7.5 9v6.5L14 17.5" />
    </IconBase>
  );
});


export const SortIcon = memo(function SortIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M8 5v14M5 8l3-3 3 3M16 19V5M13 16l3 3 3-3" />
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
