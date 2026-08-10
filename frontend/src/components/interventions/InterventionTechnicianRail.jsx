import { memo } from 'react';

import TechGrid from '../TechGrid';

function TeamIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M3 20c.7-4 2.8-6 6-6s5.3 2 6 6M14.5 14.5c3.2-.4 5.4 1.3 6.1 4.5" />
    </svg>
  );
}

function ChevronIcon({ collapsed }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={collapsed ? 'm7.5 4.5 5 5.5-5 5.5' : 'm12.5 4.5-5 5.5 5 5.5'} />
    </svg>
  );
}

const InterventionTechnicianRail = memo(
  function InterventionTechnicianRail({
    technicians,
    totalCount,
    availableCount,
    offlineCount,
    selectedIds,
    bodyRef,
    gridRef,
    onRowClicked,
    onRowDoubleClicked,
    onContextMenu,
    isDragTarget = false,
    collapsed = false,
    onToggle,
  }) {
    if (collapsed) {
      return (
        <aside className="intervention-technician-rail intervention-technician-rail--collapsed">
          <button
            type="button"
            className="intervention-rail-expand"
            onClick={onToggle}
            title="Afficher les techniciens"
            aria-label="Afficher le rail des techniciens"
          >
            <TeamIcon />
            <span>{technicians.length}</span>
            <ChevronIcon collapsed />
          </button>
        </aside>
      );
    }

    return (
      <aside className="intervention-technician-rail">
        <header className="intervention-rail-header">
          <div className="intervention-panel-title">
            <span className="intervention-panel-icon" aria-hidden="true">
              <TeamIcon />
            </span>

            <div>
              <span>Ressources terrain</span>
              <strong>Techniciens</strong>
            </div>
          </div>

          <div className="intervention-rail-header-actions">
            <span className="intervention-panel-total">
              {technicians.length}
              {technicians.length !== totalCount ? ` / ${totalCount}` : ''}
            </span>

            <button
              type="button"
              className="intervention-rail-collapse"
              onClick={onToggle}
              title="Replier les techniciens"
              aria-label="Replier le rail des techniciens"
            >
              <ChevronIcon collapsed={false} />
            </button>
          </div>
        </header>

        <div className="intervention-rail-status">
          <div>
            <span className="intervention-status-dot intervention-status-dot--available" />
            <span>Disponibles</span>
            <strong>{availableCount}</strong>
          </div>

          <div>
            <span className="intervention-status-dot intervention-status-dot--offline" />
            <span>Hors ligne</span>
            <strong>{offlineCount}</strong>
          </div>
        </div>

        <div
          className={[
            'intervention-technician-grid',
            isDragTarget ? 'intervention-technician-grid--drag-target' : '',
          ].filter(Boolean).join(' ')}
          ref={bodyRef}
        >
          <TechGrid
            ref={gridRef}
            technicians={technicians}
            selectedIds={selectedIds}
            onRowClicked={onRowClicked}
            onRowDoubleClicked={onRowDoubleClicked}
            onContextMenu={onContextMenu}
            isDragTarget={isDragTarget}
          />
        </div>

        <footer className="intervention-rail-footer">
          <span>Glissez une intervention sur un technicien pour l’affecter.</span>
        </footer>
      </aside>
    );
  },
);

InterventionTechnicianRail.displayName =
  'InterventionTechnicianRail';

export default InterventionTechnicianRail;
