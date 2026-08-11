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
    });
  });

  return messages;
}
