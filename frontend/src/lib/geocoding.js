function cleanText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}


function keepOrSuggest(currentValue, suggestedValue) {
  return cleanText(currentValue) ? currentValue : cleanText(suggestedValue);
}


export function applyResolvedAddress(form, result, resolveSector = () => '') {
  const latitude = Number(result?.latitude);
  const longitude = Number(result?.longitude);

  if (!result?.resolved || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return form;
  }

  return {
    ...form,
    latitude,
    longitude,
    service_city: keepOrSuggest(form?.service_city, result?.city),
    service_zip: keepOrSuggest(form?.service_zip, result?.postal_code),
    route_criteria: keepOrSuggest(
      form?.route_criteria,
      resolveSector(latitude, longitude),
    ),
  };
}


export function geocodingSummary(result) {
  if (!result?.resolved) {
    return '';
  }

  const location = [
    cleanText(result.city),
    cleanText(result.postal_code),
    cleanText(result.district),
  ].filter(Boolean);

  const precisionLabels = {
    building_or_address: 'adresse ou bâtiment',
    street: 'rue',
    neighbourhood_or_area: 'quartier',
    locality: 'localité',
  };
  const precision = precisionLabels[result.precision] || 'non déterminée';

  return `${location.join(' · ') || 'Coordonnées trouvées'} · précision ${precision}`;
}
