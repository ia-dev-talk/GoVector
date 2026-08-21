import GuardedJobWizard from './GuardedJobWizard';

/**
 * Point d'entrée historique de modification d'une intervention.
 *
 * Le cockpit utilise encore EditJobWindow avec les props `job`, `onClose`
 * et `onSaved`. La modification est désormais centralisée dans JobWizard
 * pour partager les validations, le contrat API et la gestion d'affectation.
 */
export default function EditJobWindow({
  job,
  onClose,
  onSaved,
  ...wizardProps
}) {
  if (!job?.id) {
    return null;
  }

  return (
    <GuardedJobWizard
      {...wizardProps}
      initialData={job}
      onClose={onClose}
      onCreated={onSaved}
    />
  );
}