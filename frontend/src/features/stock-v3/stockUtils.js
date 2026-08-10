export function text(
  value,
  fallback = '',
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const normalized =
    String(value).trim();

  return normalized || fallback;
}


export function normalizeIdentifier(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const number = Number(value);

  if (
    Number.isSafeInteger(number) &&
    number > 0
  ) {
    return number;
  }

  const normalized = text(value);
  return normalized || null;
}


export function asRecords(value) {
  if (Array.isArray(value)) {
    return value.filter(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        !Array.isArray(item),
    );
  }

  if (
    value &&
    typeof value === 'object' &&
    Array.isArray(value.data)
  ) {
    return asRecords(value.data);
  }

  return [];
}


export function numeric(
  value,
  fallback = 0,
) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number
    : fallback;
}


export function nonNegativeInteger(
  value,
) {
  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 0
  ) {
    return null;
  }

  return number;
}


export function positiveInteger(
  value,
) {
  const number =
    nonNegativeInteger(value);

  return number && number > 0
    ? number
    : null;
}


export function normalizeSearch(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
}


export function searchMatches(
  values,
  query,
) {
  const normalized =
    normalizeSearch(query);

  if (!normalized) {
    return true;
  }

  return values.some((value) =>
    normalizeSearch(value).includes(
      normalized,
    ),
  );
}


export function stockLineAvailable(line) {
  const explicit =
    Number(line?.available_quantity);

  if (Number.isFinite(explicit)) {
    return Math.max(0, explicit);
  }

  return Math.max(
    0,
    numeric(line?.quantity) -
      numeric(line?.reserved_quantity),
  );
}


export function aggregateItems({
  items,
  lines,
  warehouses,
}) {
  const warehouseById =
    new Map(
      asRecords(warehouses).map(
        (warehouse) => [
          normalizeIdentifier(
            warehouse?.id,
          ),
          warehouse,
        ],
      ),
    );

  const linesByItem =
    new Map();

  asRecords(lines).forEach((line) => {
    const itemId =
      normalizeIdentifier(
        line?.item_id,
      );

    if (!linesByItem.has(itemId)) {
      linesByItem.set(itemId, []);
    }

    linesByItem.get(itemId).push({
      ...line,
      warehouse:
        warehouseById.get(
          normalizeIdentifier(
            line?.warehouse_id,
          ),
        ) || null,
      available_quantity:
        stockLineAvailable(line),
    });
  });

  return asRecords(items).map((item) => {
    const itemLines =
      linesByItem.get(
        normalizeIdentifier(item?.id),
      ) || [];

    const totals =
      itemLines.reduce(
        (summary, line) => ({
          quantity:
            summary.quantity +
            numeric(line?.quantity),
          reserved:
            summary.reserved +
            numeric(
              line?.reserved_quantity,
            ),
          available:
            summary.available +
            stockLineAvailable(line),
        }),
        {
          quantity: 0,
          reserved: 0,
          available: 0,
        },
      );

    const threshold =
      Math.max(
        0,
        numeric(
          item?.min_stock_threshold,
        ),
      );

    const lowStock =
      item?.alert_enabled !== false &&
      totals.available <= threshold;

    return {
      ...item,
      lines: itemLines,
      totals,
      threshold,
      lowStock,
      empty:
        totals.quantity <= 0,
      warehouseCount:
        itemLines.filter(
          (line) =>
            numeric(line?.quantity) > 0,
        ).length,
    };
  });
}


export function stockSummary(items) {
  return items.reduce(
    (summary, item) => ({
      catalog:
        summary.catalog + 1,
      available:
        summary.available +
        item.totals.available,
      reserved:
        summary.reserved +
        item.totals.reserved,
      lowStock:
        summary.lowStock +
        (item.lowStock ? 1 : 0),
      empty:
        summary.empty +
        (item.empty ? 1 : 0),
      value:
        summary.value +
        item.totals.quantity *
          numeric(item?.unit_price),
    }),
    {
      catalog: 0,
      available: 0,
      reserved: 0,
      lowStock: 0,
      empty: 0,
      value: 0,
    },
  );
}


export function formatMoney(value) {
  return new Intl.NumberFormat(
    'fr-MA',
    {
      style: 'currency',
      currency: 'MAD',
      maximumFractionDigits: 2,
    },
  ).format(
    numeric(value),
  );
}


export function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    'fr-FR',
    {
      dateStyle: 'short',
      timeStyle: 'short',
    },
  ).format(date);
}


export function movementLabel(value) {
  const labels = {
    RECEPTION: 'Réception',
    ISSUE: 'Sortie',
    RETURN: 'Retour',
    CONSUMPTION: 'Consommation',
    ADJUSTMENT: 'Ajustement',
    TRANSFER: 'Transfert',
    reception: 'Réception',
    issue: 'Sortie',
    return: 'Retour',
    consumption: 'Consommation',
    adjustment: 'Ajustement',
    transfer: 'Transfert',
  };

  return (
    labels[value] ||
    text(value, 'Mouvement')
      .replace(/_/g, ' ')
  );
}


export function errorMessage(
  error,
  fallback,
) {
  const detail =
    error?.response?.data?.detail;

  if (
    typeof detail === 'string' &&
    detail.trim()
  ) {
    return detail.trim();
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        text(
          item?.msg ??
            item?.message,
        ),
      )
      .filter(Boolean);

    if (messages.length) {
      return messages.join(' · ');
    }
  }

  return (
    text(error?.message) ||
    fallback
  );
}


export function buildItemDocument(form) {
  const reference =
    text(form?.reference);

  const label =
    text(form?.label);

  const equipmentType =
    text(form?.equipment_type);

  const operator =
    text(form?.operator);

  const unit =
    text(form?.unit);

  if (!reference) {
    throw new Error(
      'La référence est obligatoire.',
    );
  }

  if (!label) {
    throw new Error(
      'Le libellé est obligatoire.',
    );
  }

  if (!equipmentType) {
    throw new Error(
      'Le type d’équipement est obligatoire.',
    );
  }

  if (!operator) {
    throw new Error(
      'L’opérateur est obligatoire.',
    );
  }

  if (!unit) {
    throw new Error(
      'L’unité est obligatoire.',
    );
  }

  const threshold =
    nonNegativeInteger(
      form?.min_stock_threshold,
    );

  if (threshold === null) {
    throw new Error(
      'Le seuil minimum doit être un entier positif ou nul.',
    );
  }

  const priceText =
    text(form?.unit_price);

  let price = null;

  if (priceText) {
    price = Number(priceText);

    if (
      !Number.isFinite(price) ||
      price < 0
    ) {
      throw new Error(
        'Le prix unitaire est invalide.',
      );
    }
  }

  return {
    reference,
    label,
    equipment_type:
      equipmentType,
    operator,
    manufacturer:
      text(form?.manufacturer) ||
      null,
    model:
      text(form?.model) ||
      null,
    unit,
    unit_price: price,
    category:
      text(form?.category) ||
      null,
    is_active:
      form?.is_active !== false,
    min_stock_threshold:
      threshold,
    alert_enabled:
      form?.alert_enabled !== false,
  };
}
