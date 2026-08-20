import {
  normalizeCockpitOrder,
  normalizeCockpitView,
} from './cockpitViewPreferences.js';

export function normalizeCockpitLayout(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};

  return {
    view: normalizeCockpitView(source.view),
    order: normalizeCockpitOrder(source.order),
  };
}

export function cockpitLayoutFingerprint(value = {}) {
  return JSON.stringify(normalizeCockpitLayout(value));
}
