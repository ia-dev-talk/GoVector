import ContextMenuView from './ContextMenuView';
import { useInterventionPermissions } from '../features/interventions/interventionPermissionsContext';
import {
  buildPersonnelStatusConfirmation,
  getPersonnelStatusTargetCount,
} from '../features/personnel/personnelUtils';

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
  const techAction = typeof props.onTechAction === 'function'
    ? (action, tech) => {
        if (action === 'set_off_duty') {
          const targetCount = getPersonnelStatusTargetCount(
            props.selectedTechIds,
            tech?.id,
          );
          const confirmation = buildPersonnelStatusConfirmation(
            'hors_service',
            targetCount,
          );
          if (confirmation && !window.confirm(confirmation)) {
            return;
          }
        }
        props.onTechAction(action, tech);
      }
    : undefined;

  return (
    <ContextMenuView
      {...props}
      onJobAction={jobAction}
      onTechAction={techAction}
    />
  );
}
