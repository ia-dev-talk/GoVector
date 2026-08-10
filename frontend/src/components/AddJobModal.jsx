import JobWizard from './JobWizard';

/**
 * Adaptateur de compatibilité pour les anciens imports AddJobModal.
 *
 * La création d'intervention est désormais centralisée dans JobWizard afin
 * d'utiliser le même contrat API, les mêmes validations FTTH et la même
 * gestion de l'affectation dans tous les points d'entrée.
 */
export default function AddJobModal({
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
