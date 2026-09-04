export function isTerritoryWorkspaceEmpty({
  loading = false,
  error = '',
  nodes = [],
  editorOpen = false,
} = {}) {
  return !loading && !error && !editorOpen && Array.isArray(nodes) && nodes.length === 0;
}
