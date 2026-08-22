import { useEffect, useMemo } from 'react';

import TechGridBase from './TechGridBase';
import { partitionTechnicianSelection } from '../features/personnel/personnelUtils';

function displayedTechnicianIds(technicians) {
  if (!Array.isArray(technicians)) return [];
  return technicians
    .map((technician) => technician?.id)
    .filter((id) => id !== null && id !== undefined && String(id).trim());
}

export default function TechGrid(props) {
  const {
    technicians,
    selectedIds = [],
    onRowClicked,
  } = props;

  const selection = useMemo(
    () => partitionTechnicianSelection(selectedIds, technicians),
    [selectedIds, technicians],
  );

  const displayedIds = useMemo(
    () => displayedTechnicianIds(technicians),
    [technicians],
  );

  useEffect(() => {
    if (
      selection.hidden.length === 0 ||
      typeof onRowClicked !== 'function'
    ) {
      return;
    }

    const removeFromSelectionEvent = {
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    };

    selection.hidden.forEach((id) => {
      onRowClicked(
        id,
        removeFromSelectionEvent,
        displayedIds,
      );
    });
  }, [displayedIds, onRowClicked, selection.hidden]);

  return (
    <TechGridBase
      {...props}
      selectedIds={selection.visible}
    />
  );
}
