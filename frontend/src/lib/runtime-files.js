function normalizeText(value) {
  return value === null || value === undefined
    ? ''
    : String(value).trim();
}

function stripTrailingSlash(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

export function isLoopbackHostname(value) {
  const hostname = normalizeText(value)
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .toLowerCase();

  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  );
}

function currentBrowserHostname() {
  try {
    return normalizeText(globalThis?.location?.hostname);
  } catch {
    return '';
  }
}

export function resolveRuntimeFileBase(
  configuredBase,
  { browserHostname = currentBrowserHostname() } = {},
) {
  const base = stripTrailingSlash(configuredBase);

  if (!base) {
    return '';
  }

  try {
    const parsed = new URL(base, 'https://bluevector.invalid');

    if (
      isLoopbackHostname(parsed.hostname) &&
      !isLoopbackHostname(browserHostname)
    ) {
      return '';
    }
  } catch {
    return '';
  }

  return base;
}

export function buildRuntimeFileUrl(
  value,
  configuredBase,
  options = {},
) {
  const path = normalizeText(value);

  if (!path) {
    return null;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const base = resolveRuntimeFileBase(configuredBase, options);
  const normalizedPath = path.replace(/^\/+/, '');

  return base
    ? `${base}/${normalizedPath}`
    : `/${normalizedPath}`;
}
