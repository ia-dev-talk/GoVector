import {
  normalizeCockpitOrder,
  normalizeCockpitView,
} from './cockpitViewPreferences.js';

export function normalizeCockpitLayout(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  const view = source.view && typeof source.view === 'object' && !Array.isArray(source.view)
    ? source.view
    : source;

  return {
    view: normalizeCockpitView(view),
    order: normalizeCockpitOrder(source.order),
  };
}

export function cockpitLayoutFingerprint(value = {}) {
  return JSON.stringify(normalizeCockpitLayout(value));
}
