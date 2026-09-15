import OperationalJobEditor from './OperationalJobEditor';

/** Complete GoVector operational intervention modification surface. */
export default function EditJobWindow({
  job,
  onClose,
  onSaved,
}) {
  if (!job?.id) return null;
  return (
    <OperationalJobEditor
      job={job}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
