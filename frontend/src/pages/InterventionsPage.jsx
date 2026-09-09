import InterventionsWorkspace from './InterventionsWorkspace';
import FieldAgentInterventionsPage from './FieldAgentInterventionsPage';
import InterventionScopeBoundary from '../components/interventions/InterventionScopeBoundary';
import { InterventionPermissionsProvider } from '../features/interventions/InterventionPermissionsContext.jsx';
import { isFieldAgentRole } from '../features/field-agent/fieldAgentReview.js';

export default function InterventionsPage(props) {
  const content = isFieldAgentRole(props.userRole)
    ? <FieldAgentInterventionsPage {...props} />
    : <InterventionsWorkspace {...props} />;

  return (
    <InterventionPermissionsProvider userRole={props.userRole}>
      <InterventionScopeBoundary>
        {content}
      </InterventionScopeBoundary>
    </InterventionPermissionsProvider>
  );
}
