export function normalizeStatusCode(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  const parts = raw.trim().split('.');

  return (parts[parts.length - 1] || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[\s-]+/g, '_');
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeWorkflowCapabilities(value) {
  const source = isRecord(value) ? value : {};
  const statuses = Array.isArray(source.statuses)
    ? source.statuses.filter((item) => isRecord(item) && normalizeStatusCode(item.code))
    : [];
  const commands = Array.isArray(source.commands)
    ? source.commands.filter((item) => isRecord(item) && String(item.code || '').trim())
    : [];

  return {
    schema_version: Number.isInteger(source.schema_version)
      ? source.schema_version
      : null,
    current_role: String(source.current_role || '').trim() || null,
    statuses,
    commands,
    completion_policy: isRecord(source.completion_policy)
      ? source.completion_policy
      : null,
  };
}

export function statusMetadataIndex(statuses) {
  return new Map(
    (Array.isArray(statuses) ? statuses : []).map((item) => [
      normalizeStatusCode(item?.code),
      item,
    ]),
  );
}

export function statusMetadataFor(index, status) {
  return index.get(normalizeStatusCode(status)) || null;
}
