import React, { useState, useMemo, useCallback } from 'react';

// ──────────────────────────────────────────────────────────
// Fonctions pures
// ──────────────────────────────────────────────────────────

function normalizeIdentifier(value) {
  if (value == null) {
    return null;
  }

  const identifier = String(
    value
  ).trim();

  return identifier || null;
}

function normalizeText(value) {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number'
  ) {
    return null;
  }

  const normalized = String(
    value
  ).trim();

  return normalized || null;
}

function parseNonNegativeNumber(value) {
  if (
    typeof value !== 'number' &&
    typeof value !== 'string'
  ) {
    return null;
  }

  if (
    typeof value === 'string' &&
    value.trim() === ''
  ) {
    return null;
  }

  const number = Number(value);

  return (
    Number.isFinite(number) &&
    number >= 0
  )
    ? number
    : null;
}

function enrichLines(stockLines, stockItems, warehouses) {
  const safeStockLines = Array.isArray(stockLines) ? stockLines : [];
  const safeStockItems = Array.isArray(stockItems) ? stockItems : [];
  const safeWarehouses = Array.isArray(warehouses) ? warehouses : [];

  const itemsById = new Map(
    safeStockItems
      .map((item) => [
        normalizeIdentifier(
          item?.id
        ),
        item,
      ])
      .filter(([id]) => id)
  );

  const warehousesById = new Map(
    safeWarehouses
      .map((warehouse) => [
        normalizeIdentifier(
          warehouse?.id
        ),
        warehouse,
      ])
      .filter(([id]) => id)
  );

  return safeStockLines.map((line, index) => {
    const itemId =
      normalizeIdentifier(
        line?.itemId ??
        line?.item_id
      );
    const warehouseId =
      normalizeIdentifier(
        line?.warehouseId ??
        line?.warehouse_id
      );
    const item =
      itemsById.get(itemId);
    const warehouse =
      warehousesById.get(
        warehouseId
      );
    const quantity =
      parseNonNegativeNumber(
        line?.quantity
      );
    const reserved =
      parseNonNegativeNumber(
        line?.reserved ??
        line?.reserved_quantity
      );
    const available =
      parseNonNegativeNumber(
        line?.available ??
        line?.available_quantity
      );
    const unitPrice =
      parseNonNegativeNumber(
        line?.unit_price ??
        item?.unit_price
      );
    const value =
      quantity !== null &&
      unitPrice !== null
        ? quantity * unitPrice
        : null;
    const normalizedSourceId =
      normalizeIdentifier(
        line?.id
      );
    const fallbackId =
      `line-${index}`;
    const publicId =
      normalizedSourceId !== null
        ? line.id
        : fallbackId;
    const rowKey =
      normalizedSourceId !== null
        ? `stock-${normalizedSourceId}`
        : fallbackId;

    return {
      id: publicId,
      rowKey,
      itemId,
      warehouseId,
      reference:
        normalizeText(
          line?.reference
        ) ||
        normalizeText(
          item?.reference
        ) ||
        '—',
      label:
        normalizeText(
          line?.label
        ) ||
        normalizeText(
          item?.label
        ) ||
        '—',
      equipment_type:
        normalizeText(
          line?.equipment_type
        ) ||
        normalizeText(
          item?.equipment_type
        ) ||
        '—',
      operator:
        normalizeText(
          line?.operator
        ) ||
        normalizeText(
          item?.operator
        ) ||
        '—',
      unit_price: unitPrice,
      warehouse:
        normalizeText(
          line?.warehouse_name
        ) ||
        normalizeText(
          warehouse?.name
        ) ||
        '—',
      quantity,
      reserved,
      available,
      value,
    };
  });
}

function sortLines(lines, sortKey, sortDir) {
  if (!sortKey) return lines;
  return [...lines].sort((a, b) => {
    const va = a[sortKey] ?? '';
    const vb = b[sortKey] ?? '';
    const cmp = typeof va === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb));
    return sortDir === 'desc' ? -cmp : cmp;
  });
}

function paginate(lines, page, pageSize) {
  const start = (page - 1) * pageSize;
  return lines.slice(start, start + pageSize);
}

// ──────────────────────────────────────────────────────────
// Cell renderers (purs, pas de hooks)
// ──────────────────────────────────────────────────────────

function renderQty(v) {
  const n =
    parseNonNegativeNumber(v);

  if (n === null) {
    return (
      <span className="st-qty">
        —
      </span>
    );
  }

  const cls =
    n === 0
      ? 'st-qty--empty'
      : 'st-qty--ok';

  return <span className={`st-qty ${cls}`}>{n}</span>;
}

function renderType(v) {
  return v ? <span className="st-type">{v}</span> : '—';
}

function renderPrice(v) {
  const n =
    parseNonNegativeNumber(v);

  return n === null
    ? '—'
    : `${n.toLocaleString('fr-FR')} DH`;
}

// ──────────────────────────────────────────────────────────
// Header de colonne (tri)
// ──────────────────────────────────────────────────────────

const SortHeader = React.memo(function SortHeader({ label, sortKey, currentSort, onSort }) {
  const active = currentSort.key === sortKey;
  const dir = active && currentSort.dir === 'asc' ? 'desc' : 'asc';

  return (
    <th className="st-th st-th--sortable" onClick={() => onSort(sortKey, dir)}>
      <span>{label}</span>
      <span className="st-sort-icon">
        {active ? (currentSort.dir === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    </th>
  );
});

// ──────────────────────────────────────────────────────────
// Ligne du tableau
// ──────────────────────────────────────────────────────────

const StockRow = React.memo(function StockRow({
  line,
  isSelected,
  onSelect,
  onDoubleClick,
  onContextMenu,
}) {
  const handleClick = useCallback(() => onSelect(line), [line, onSelect]);
  const handleDblClick = useCallback(() => onDoubleClick?.(line), [line, onDoubleClick]);
  const handleCtx = useCallback(e => onContextMenu?.(e, line), [line, onContextMenu]);

  return (
    <tr
      className={`st-tr ${isSelected ? 'st-tr--selected' : ''}`}
      onClick={handleClick}
      onDoubleClick={handleDblClick}
      onContextMenu={handleCtx}
    >
      <td className="st-td st-td--mono">{line.reference}</td>
      <td className="st-td st-td--label">{line.label}</td>
      <td className="st-td">{renderType(line.equipment_type)}</td>
      <td className="st-td st-td--num">{renderQty(line.quantity)}</td>
      <td className="st-td st-td--num">{renderQty(line.available)}</td>
      <td className="st-td st-td--num">{renderQty(line.reserved)}</td>
      <td className="st-td st-td--num">{renderPrice(line.value)}</td>
      <td className="st-td">{line.warehouse}</td>
      <td className="st-td">{line.operator}</td>
    </tr>
  );
});

// ──────────────────────────────────────────────────────────
// Composant principal
// ──────────────────────────────────────────────────────────

const StockTable = React.memo(function StockTable({
  stockLines = [],
  stockItems = [],
  warehouses = [],
  selectedNode,
  loading = false,
  selectedRowId = null,
  onSelectionChange,
  onRowClick,
  onRowDoubleClick,
  onContextMenu,
  pageSize = 50,
}) {
  const safeStockLines = useMemo(() => (Array.isArray(stockLines) ? stockLines : []), [stockLines]);
  const safeStockItems = useMemo(() => (Array.isArray(stockItems) ? stockItems : []), [stockItems]);
  const safeWarehouses = useMemo(() => (Array.isArray(warehouses) ? warehouses : []), [warehouses]);

  // ── Tri ────────────────────────────────────────────
  const [sort, setSort] = useState({ key: '', dir: 'asc' });
  const [page, setPage] = useState(1);

  const handleSort = useCallback((key, dir) => {
    setSort({ key, dir });
  }, []);

  // ── Enrichissement + tri + pagination ─────────────
  const enriched = useMemo(
    () =>
      enrichLines(
        safeStockLines,
        safeStockItems,
        safeWarehouses
      ),
    [
      safeStockLines,
      safeStockItems,
      safeWarehouses,
    ]
  );

  const sorted = useMemo(
    () => sortLines(enriched, sort.key, sort.dir),
    [enriched, sort]
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(sorted.length / pageSize)),
    [sorted.length, pageSize]
  );

  const paged = useMemo(
    () => paginate(sorted, page, pageSize),
    [sorted, page, pageSize]
  );

  // ── Reset page quand les données changent ──────────
  // (sans useEffect — géré dans le handler de sélection)

  // ── Handlers ──────────────────────────────────────
  const handleSelect = useCallback((line) => {
    onSelectionChange?.(line.id);
    onRowClick?.(line);
  }, [onSelectionChange, onRowClick]);

  const handlePrevPage = useCallback(() => {
    setPage(p => Math.max(1, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setPage(p => Math.min(totalPages, p + 1));
  }, [totalPages]);

  const handlePageChange = useCallback((e) => {
    const p = parseInt(e.target.value, 10);
    if (p >= 1 && p <= totalPages) setPage(p);
  }, [totalPages]);

  // ── Colonnes ──────────────────────────────────────
  const columns = [
    { key: 'reference', label: 'Réf.' },
    { key: 'label', label: 'Désignation' },
    { key: 'equipment_type', label: 'Type' },
    { key: 'quantity', label: 'Qté' },
    { key: 'available', label: 'Dispo' },
    { key: 'reserved', label: 'Réservé' },
    { key: 'value', label: 'Valeur' },
    { key: 'warehouse', label: 'Entrepôt' },
    { key: 'operator', label: 'Op.' },
  ];

  // ── États vides ───────────────────────────────────
  if (loading) {
    return (
      <div className="st-container">
        <div className="st-loading">
          <div className="st-spinner" />
          <span>Chargement du stock…</span>
        </div>
      </div>
    );
  }

  if (safeStockLines.length === 0) {
    return (
      <div className="st-container">
        <div className="st-empty">
          <span className="st-empty-icon">📦</span>
          <span className="st-empty-title">Aucun stock</span>
          <span className="st-empty-desc">
            {selectedNode
              ? `Aucun article pour ${selectedNode.label}`
              : 'Configurez un dépôt pour commencer'}
          </span>
        </div>
      </div>
    );
  }

  if (enriched.length === 0) {
    return (
      <div className="st-container">
        <div className="st-empty">
          <span className="st-empty-icon">🔍</span>
          <span className="st-empty-title">Aucun résultat</span>
          <span className="st-empty-desc">Modifiez vos filtres</span>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────
  return (
    <div className="st-container">
      {/* Table */}
      <div className="st-wrapper">
        <table className="st-table">
          <thead>
            <tr className="st-tr-head">
              {columns.map(col => (
                <SortHeader
                  key={col.key}
                  label={col.label}
                  sortKey={col.key}
                  currentSort={sort}
                  onSort={handleSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map(line => (
              <StockRow
                key={line.rowKey}
                line={line}
                isSelected={
                  normalizeIdentifier(
                    selectedRowId
                  ) ===
                  normalizeIdentifier(
                    line.id
                  )
                }
                onSelect={handleSelect}
                onDoubleClick={onRowDoubleClick}
                onContextMenu={onContextMenu}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="st-footer">
        <span className="st-count">
          {sorted.length} ligne{ sorted.length > 1 ? 's' : '' }
        </span>
        <div className="st-pagination">
          <button className="st-page-btn" onClick={handlePrevPage} disabled={page <= 1}>
            ◀
          </button>
          <span className="st-page-info">
            Page{' '}
            <input
              className="st-page-input"
              type="number"
              min="1"
              max={totalPages}
              value={page}
              onChange={handlePageChange}
            />{' '}
            / {totalPages}
          </span>
          <button className="st-page-btn" onClick={handleNextPage} disabled={page >= totalPages}>
            ▶
          </button>
        </div>
      </div>
    </div>
  );
});

export default StockTable;
