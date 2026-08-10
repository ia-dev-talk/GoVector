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


export const BoxIcon = memo(function BoxIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m4 7 8-4 8 4-8 4-8-4Z" />
      <path d="M4 7v10l8 4 8-4V7M12 11v10" />
    </IconBase>
  );
});


export const WarehouseIcon = memo(function WarehouseIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M3 9 12 3l9 6v12H3V9Z" />
      <path d="M7 21v-8h10v8M7 9h.01M12 9h.01M17 9h.01" />
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
      className={spinning ? 'st3-spin' : ''}
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
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M5 14v6h14v-6" />
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


export const ReceptionIcon = memo(function ReceptionIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 18h16v3H4z" />
    </IconBase>
  );
});


export const HistoryIcon = memo(function HistoryIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
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


export const ReservedIcon = memo(function ReservedIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M8 11h8M8 15h5" />
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


export const CloseIcon = memo(function CloseIcon(props) {
  return (
    <IconBase {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
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


export const MoneyIcon = memo(function MoneyIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5c-.8-.8-1.9-1.2-3.2-1.2-1.8 0-3.1.9-3.1 2.3 0 1.6 1.4 2.1 3.1 2.5 1.7.4 3.1.9 3.1 2.5 0 1.4-1.3 2.4-3.3 2.4-1.4 0-2.7-.5-3.6-1.4M12 5.5v13" />
    </IconBase>
  );
});
