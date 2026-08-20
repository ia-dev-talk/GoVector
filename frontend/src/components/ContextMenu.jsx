import ContextMenuView from './ContextMenuView';
import { useInterventionPermissions } from '../features/interventions/InterventionPermissionsContext';

function normalizeStatus(value) {
  return String(value ?? '').trim().toLowerCase();
}

export default function ContextMenu(props) {
  const permissions = useInterventionPermissions();
  const isCancelledJob =
    props.type === 'job' &&
    normalizeStatus(props.data?.status) === 'cancelled';
  const jobAction =
    isCancelledJob && !permissions.canDeleteIntervention
      ? undefined
      : props.onJobAction;

  return <ContextMenuView {...props} onJobAction={jobAction} />;
}
