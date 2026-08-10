function clean(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}


export function buildGoogleMapsSearchUrl({ address, city, postalCode } = {}) {
  const parts = [address, city, postalCode]
    .map(clean)
    .filter(Boolean);
  const query = [...new Set(parts)].join(', ');
  if (!query) return '';

  const params = new URLSearchParams({
    api: '1',
    query,
  });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}


export function sharedLocationLabel(result) {
  if (!result?.resolved) return '';
  const latitude = Number(result.latitude);
  const longitude = Number(result.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `${latitude.toFixed(6)} · ${longitude.toFixed(6)}`;
}
