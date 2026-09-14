import { useState } from 'react';

import InterventionsWorkspace from './InterventionsWorkspace';
import PlanningPage from './PlanningPage';
import FieldAgentInterventionsPage from './FieldAgentInterventionsPage';
import InterventionScopeBoundary from '../components/interventions/InterventionScopeBoundary';
import InterventionPeriodWorkspace from '../components/interventions/InterventionPeriodWorkspace.jsx';
import { InterventionPermissionsProvider } from '../features/interventions/InterventionPermissionsContext.jsx';
import { isFieldAgentRole } from '../features/field-agent/fieldAgentReview.js';
import '../styles/intervention-period.css';

export default function InterventionsPage(props) {
  const page = String(props.currentPage ?? '').trim().toLowerCase();
  const [workspaceMode, setWorkspaceMode] = useState('day');

  if (page === 'planning') {
    return <PlanningPage {...props} />;
  }

  const fieldAgent = isFieldAgentRole(props.userRole);
  const canUsePeriodAssignment = ['ADMIN', 'ORIENTEUR'].includes(props.userRole);

  const content = fieldAgent
    ? <FieldAgentInterventionsPage {...props} />
    : workspaceMode === 'period' && canUsePeriodAssignment
      ? <InterventionPeriodWorkspace {...props} />
      : <InterventionsWorkspace {...props} />;

  return (
    <InterventionPermissionsProvider userRole={props.userRole}>
      <InterventionScopeBoundary>
        {canUsePeriodAssignment ? (
          <div className="intervention-mode-shell">
            <nav className="intervention-mode-switch" aria-label="Périmètre des interventions">
              <button
                type="button"
                className={workspaceMode === 'day' ? 'is-active' : ''}
                onClick={() => setWorkspaceMode('day')}
              >
                Journée opérationnelle
              </button>
              <button
                type="button"
                className={workspaceMode === 'period' ? 'is-active' : ''}
                onClick={() => setWorkspaceMode('period')}
              >
                Périodes & affectation future
              </button>
            </nav>
            <div className="intervention-mode-content">
              {content}
            </div>
          </div>
        ) : content}
      </InterventionScopeBoundary>
    </InterventionPermissionsProvider>
  );
}
