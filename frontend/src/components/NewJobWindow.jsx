import JobWizard from './JobWizard';

/**
 * Point d'entrée historique de création d'intervention.
 *
 * Le cockpit importe encore NewJobWindow. Le composant délègue désormais
 * entièrement au JobWizard afin de conserver un seul workflow de création,
 * une seule validation et un seul contrat API.
 */
export default function NewJobWindow({
  onClose,
  onCreated,
  ...wizardProps
}) {
  return (
    <JobWizard
      {...wizardProps}
      initialData={null}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}