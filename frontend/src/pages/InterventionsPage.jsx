import InterventionsWorkspace from './InterventionsWorkspace';
import { InterventionPermissionsProvider } from '../features/interventions/InterventionPermissionsContext';

export default function InterventionsPage(props) {
  return (
    <InterventionPermissionsProvider userRole={props.userRole}>
      <InterventionsWorkspace {...props} />
    </InterventionPermissionsProvider>
  );
}
