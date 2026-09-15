import OperationalJobEditor from './OperationalJobEditor';

/** Complete GoVector operational intervention creation surface. */
export default function NewJobWindow({
  onClose,
  onCreated,
}) {
  return (
    <OperationalJobEditor
      job={null}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}
