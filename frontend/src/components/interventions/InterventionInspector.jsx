import InterventionInspectorView from './InterventionInspectorView';
import { useInterventionPermissions } from '../../features/interventions/interventionPermissionsContext';

export default function InterventionInspector(props) {
  const { canDeleteIntervention } =
    useInterventionPermissions();

  return (
    <InterventionInspectorView
      {...props}
      onDelete={
        canDeleteIntervention
          ? props.onDelete
          : undefined
      }
    />
  );
}
