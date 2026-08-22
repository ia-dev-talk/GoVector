export const LIVE_MAP_TAB_FILTER_KEYS = Object.freeze({
  technicians: Object.freeze(['sector', 'team', 'status']),
  jobs: Object.freeze(['sector', 'operator']),
});

export function hiddenLiveMapFilterKeys(activeTab) {
  const visibleKeys = new Set(
    LIVE_MAP_TAB_FILTER_KEYS[activeTab] ?? LIVE_MAP_TAB_FILTER_KEYS.technicians,
  );

  return ['sector', 'team', 'status', 'operator'].filter(
    (key) => !visibleKeys.has(key),
  );
}

export function reconcileLiveMapFiltersForTab(filters = {}, activeTab) {
  const nextFilters = {
    sector: filters.sector ?? '',
    team: filters.team ?? '',
    status: filters.status ?? '',
    operator: filters.operator ?? '',
  };

  hiddenLiveMapFilterKeys(activeTab).forEach((key) => {
    nextFilters[key] = '';
  });

  return nextFilters;
}
