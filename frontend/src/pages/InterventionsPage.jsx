import InterventionsWorkspace from './InterventionsWorkspace';
import InterventionScopeBoundary from '../components/interventions/InterventionScopeBoundary';
import { InterventionPermissionsProvider } from '../features/interventions/InterventionPermissionsContext.jsx';

export default function InterventionsPage(props) {
  return (
    <InterventionPermissionsProvider userRole={props.userRole}>
      <InterventionScopeBoundary>
        <InterventionsWorkspace {...props} />
      </InterventionScopeBoundary>
    </InterventionPermissionsProvider>
  );
}
