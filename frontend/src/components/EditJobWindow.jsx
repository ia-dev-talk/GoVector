import AdvancedJobEditor from './AdvancedJobEditor';

/**
 * Office intervention editing now uses the complete persisted-data editor.
 * Creation remains on JobWizard so the validated creation/assignment workflow
 * is not weakened during the delivery hotfix.
 */
export default function EditJobWindow({
  job,
  onClose,
  onSaved,
}) {
  if (!job?.id) {
    return null;
  }

  return (
    <AdvancedJobEditor
      job={job}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
