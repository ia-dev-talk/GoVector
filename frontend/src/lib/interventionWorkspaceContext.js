export function getInterventionWorkspaceContextLabel({
  isToday = false,
  isDemo = false,
} = {}) {
  if (isDemo) {
    return 'Simulation';
  }

  return isToday
    ? 'Vue du jour'
    : 'Vue historique';
}
