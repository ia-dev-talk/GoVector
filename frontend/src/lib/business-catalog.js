const CANONICALIZED_SECTIONS = new Set([
  'job_types',
  'priorities',
  'status_presentations',
  'field_actions',
]);


export function normalizeCatalogCode(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '_');
}


export function catalogRowKey(section, index) {
  return `${section}:${index}`;
}


export function isCustomCatalogItem(item) {
  return item?.metadata?.custom === true;
}


export function activeCanonicalOptions(items) {
  return (items || []).filter((item) => !isCustomCatalogItem(item) && item?.active === true);
}


export function canonicalLinkState(item, items) {
  if (!isCustomCatalogItem(item)) {
    return { status: 'system', canonical: null };
  }

  const canonical = normalizeCatalogCode(item?.metadata?.canonical);
  if (!canonical) {
    return { status: 'missing', canonical: '' };
  }

  const target = (items || []).find(
    (candidate) => !isCustomCatalogItem(candidate)
      && normalizeCatalogCode(candidate?.code) === canonical,
  );

  if (!target) {
    return { status: 'missing', canonical };
  }

  return {
    status: target.active === true ? 'active' : 'archived',
    canonical,
    target,
  };
}


export function removeCatalogItem(items, index) {
  if (!Array.isArray(items) || !Number.isInteger(index) || index < 0 || index >= items.length) {
    return Array.isArray(items) ? [...items] : [];
  }

  return items.filter((_, itemIndex) => itemIndex !== index);
}


export function validateBusinessCatalogDraft(values) {
  const messages = [];

  Object.entries(values || {}).forEach(([section, items]) => {
    const codes = new Set();

    (items || []).forEach((item, index) => {
      const code = normalizeCatalogCode(item?.code);
      const label = String(item?.label ?? '').trim();

      if (!code) {
        messages.push(`${section} · ligne ${index + 1} : identifiant obligatoire.`);
      } else if (!/^[a-z][a-z0-9_-]{1,47}$/.test(code)) {
        messages.push(
          `${section} · ${code} : utilisez 2 à 48 caractères, en commençant par une lettre.`,
        );
      } else if (codes.has(code)) {
        messages.push(`${section} : identifiant « ${code} » utilisé plusieurs fois.`);
      }

      if (code) codes.add(code);

      if (!label) {
        messages.push(`${section} · ${code || `ligne ${index + 1}`} : libellé obligatoire.`);
      }

      if (CANONICALIZED_SECTIONS.has(section) && isCustomCatalogItem(item) && item?.active) {
        const link = canonicalLinkState(item, items);
        if (link.status === 'missing') {
          messages.push(
            `${section} · ${code || `ligne ${index + 1}`} : choisissez un comportement système existant.`,
          );
        } else if (link.status === 'archived') {
          messages.push(
            `${section} · ${code || `ligne ${index + 1}`} : le comportement système « ${link.canonical} » est archivé. Choisissez un comportement actif ou archivez cet élément métier.`,
          );
        }
      }
    });
  });

  return messages;
}
