export function getImportFileKey(file) {
  return [
    file?.name || 'Fichier',
    file?.size ?? 'taille-inconnue',
    file?.lastModified ?? 'date-inconnue',
  ].join('::');
}

export function getScopedImportKey(file, value) {
  return `${getImportFileKey(file)}::${value}`;
}

export function getFileColumnOverrides(mappings, file) {
  const prefix = `${getImportFileKey(file)}::`;
  return Object.fromEntries(
    Object.entries(mappings)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, field]) => [key.slice(prefix.length), field]),
  );
}

export function getFileHeaderRowOverrides(mappings, file) {
  const prefix = `${getImportFileKey(file)}::`;
  return Object.fromEntries(
    Object.entries(mappings)
      .filter(([, row]) => Number.isInteger(row))
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, row]) => [key.slice(prefix.length), row]),
  );
}
