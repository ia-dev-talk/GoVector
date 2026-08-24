import {
  cockpitLayoutFingerprint,
  normalizeCockpitLayout,
} from './cockpitLayoutIdentity.js';
import { rememberCockpitPreferenceRevision } from './cockpitViewPreferences.js';

export function reconcileCockpitHydration({
  remoteLayout,
  localLayout,
  locallyModified = false,
} = {}) {
  const remote = normalizeCockpitLayout(remoteLayout);
  const local = normalizeCockpitLayout(localLayout);
  const remoteFingerprint = cockpitLayoutFingerprint(remote);
  const localFingerprint = cockpitLayoutFingerprint(local);
  const keepLocal = locallyModified === true;

  rememberCockpitPreferenceRevision(remoteLayout?.revision);

  return {
    layout: keepLocal ? local : remote,
    persistedFingerprint: remoteFingerprint,
    shouldPersistLocal: keepLocal && localFingerprint !== remoteFingerprint,
  };
}

export function cockpitPreferenceRetryMode({ syncState, hydrated } = {}) {
  if (syncState === 'load-error' && hydrated !== true) {
    return 'hydrate';
  }

  if (syncState === 'error' && hydrated === true) {
    return 'save';
  }

  return null;
}
