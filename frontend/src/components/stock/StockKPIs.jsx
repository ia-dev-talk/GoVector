import React, { useMemo } from 'react';

// ──────────────────────────────────────────────────────────
// Fonctions de calcul pures
// ──────────────────────────────────────────────────────────

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

function normalizeIdentifier(value) {
  if (value == null) {
    return null;
  }

  const identifier = String(
    value
  ).trim();

  return identifier || null;
}

function normalizeWarehouseType(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function getDepotWarehouses(warehouses) {
  const safeWarehouses =
    Array.isArray(warehouses)
      ? warehouses
      : [];

  const hasTypedWarehouses =
    safeWarehouses.some(
      (warehouse) =>
        normalizeWarehouseType(
          warehouse?.type
        )
    );

  if (!hasTypedWarehouses) {
    return safeWarehouses;
  }

  return safeWarehouses.filter(
    (warehouse) =>
      normalizeWarehouseType(
        warehouse?.type
      ) === 'ENTREPOT'
  );
}

function getDepotLines(
  stockLines,
  warehouses
) {
  const safeLines =
    Array.isArray(stockLines)
      ? stockLines
      : [];

  const depotIds = new Set(
    getDepotWarehouses(
      warehouses
    )
      .map((warehouse) =>
        normalizeIdentifier(
          warehouse?.id
        )
      )
      .filter(Boolean)
  );

  return safeLines.filter(
    (line) =>
      depotIds.has(
        normalizeIdentifier(
          line?.warehouseId
        )
      )
  );
}

function sumLineValues(
  lines,
  getValue
) {
  let total = 0;

  for (const line of lines) {
    const value =
      parseNonNegativeNumber(
        getValue(line)
      );

    if (value === null) {
      return null;
    }

    total += value;
  }

  return total;
}

function calcTotalQuantity(stockLines, warehouses) {
  return sumLineValues(
    getDepotLines(
      stockLines,
      warehouses
    ),
    (line) => line.quantity
  );
}

function calcTotalValue(stockLines, stockItems, warehouses) {
  const safeItems =
    Array.isArray(stockItems)
      ? stockItems
      : [];
  let total = 0;

  for (
    const line of getDepotLines(
      stockLines,
      warehouses
    )
  ) {
    const quantity =
      parseNonNegativeNumber(
        line.quantity
      );
    const item = safeItems.find(
      (candidate) =>
        normalizeIdentifier(
          candidate?.id
        ) ===
        normalizeIdentifier(
          line?.itemId
        )
    );
    const unitPrice =
      parseNonNegativeNumber(
        item?.unit_price
      );

    if (
      quantity === null ||
      !item ||
      unitPrice === null
    ) {
      return null;
    }

    total += quantity * unitPrice;
  }

  return total;
}

function calcAvailableTotal(stockLines, warehouses) {
  return sumLineValues(
    getDepotLines(
      stockLines,
      warehouses
    ),
    (line) => line.available
  );
}

function calcReservedTotal(stockLines, warehouses) {
  return sumLineValues(
    getDepotLines(
      stockLines,
      warehouses
    ),
    (line) => line.reserved
  );
}

function calcItemCount(stockItems) {
  return stockItems.length;
}

function calcWarehouseCount(warehouses) {
  return getDepotWarehouses(
    warehouses
  ).length;
}

function calcTeamCount(teams) {
  return teams.length;
}

function calcTechnicianCount(technicians) {
  return technicians.length;
}

function calcAlertCount(stockLines, stockItems, warehouses) {
  const safeItems =
    Array.isArray(stockItems)
      ? stockItems
      : [];
  const depotLines =
    getDepotLines(
      stockLines,
      warehouses
    );
  let alerts = 0;

  for (const line of depotLines) {
    const item = safeItems.find(
      (candidate) =>
        normalizeIdentifier(
          candidate?.id
        ) ===
        normalizeIdentifier(
          line?.itemId
        )
    );
    const threshold =
      parseNonNegativeNumber(
        item?.min_stock_threshold
      );
    const available =
      parseNonNegativeNumber(
        line.available
      );

    if (
      !item ||
      threshold === null ||
      available === null
    ) {
      return null;
    }

    if (
      threshold > 0 &&
      available < threshold
    ) {
      alerts += 1;
    }
  }

  return alerts;
}

function calcCriticalCount(stockLines, stockItems, warehouses) {
  const depotLines =
    getDepotLines(
      stockLines,
      warehouses
    );
  let critical = 0;

  for (const line of depotLines) {
    const available =
      parseNonNegativeNumber(
        line.available
      );

    if (available === null) {
      return null;
    }

    if (available === 0) {
      critical += 1;
    }
  }

  return critical;
}

function calcCategoryBreakdown(stockLines, stockItems, warehouses) {
  const depotIds = warehouses
    .filter(w => w.type === 'ENTREPOT')
    .map(w => w.id);
  const depotLines = stockLines.filter(l => depotIds.includes(l.warehouseId));
  const breakdown = {};
  depotLines.forEach(l => {
    const item = stockItems.find(i => i.id === l.itemId);
    const cat = item?.equipment_type || 'AUTRE';
    if (!breakdown[cat]) breakdown[cat] = { quantity: 0, value: 0, count: 0 };
    breakdown[cat].quantity += l.quantity;
    breakdown[cat].value += l.quantity * (item?.unit_price || 0);
    breakdown[cat].count += 1;
  });
  return breakdown;
}

// ──────────────────────────────────────────────────────────
// Hook de calcul (peut être utilisé sans le composant)
// ──────────────────────────────────────────────────────────

function useStockMetrics({ stockLines, stockItems, warehouses, teams, technicians }) {
  const safeStockLines = useMemo(() => (Array.isArray(stockLines) ? stockLines : []), [stockLines]);
  const safeStockItems = useMemo(() => (Array.isArray(stockItems) ? stockItems : []), [stockItems]);
  const safeWarehouses = useMemo(() => (Array.isArray(warehouses) ? warehouses : []), [warehouses]);
  const safeTeams = useMemo(() => (Array.isArray(teams) ? teams : []), [teams]);
  const safeTechnicians = useMemo(() => (Array.isArray(technicians) ? technicians : []), [technicians]);

  return useMemo(() => ({
    totalQuantity: calcTotalQuantity(safeStockLines, safeWarehouses),
    totalValue: calcTotalValue(safeStockLines, safeStockItems, safeWarehouses),
    totalAvailable: calcAvailableTotal(safeStockLines, safeWarehouses),
    totalReserved: calcReservedTotal(safeStockLines, safeWarehouses),
    itemCount: calcItemCount(safeStockItems),
    warehouseCount: calcWarehouseCount(safeWarehouses),
    teamCount: calcTeamCount(safeTeams),
    techCount: calcTechnicianCount(safeTechnicians),
    alertCount: calcAlertCount(safeStockLines, safeStockItems, safeWarehouses),
    criticalCount: calcCriticalCount(safeStockLines, safeStockItems, safeWarehouses),
    categoryBreakdown: calcCategoryBreakdown(safeStockLines, safeStockItems, safeWarehouses),
  }), [
    safeStockLines,
    safeStockItems,
    safeWarehouses,
    safeTeams,
    safeTechnicians,
  ]);
}

// ──────────────────────────────────────────────────────────
// Composant d'affichage uniquement
// ──────────────────────────────────────────────────────────

const KpiCard = React.memo(function KpiCard({ label, value, icon, color, onClick }) {
  return (
    <div
      className="sk-kpi-card"
      style={color ? { '--kpi-color': color } : undefined}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => { if (e.key === 'Enter') onClick(); } : undefined}
    >
      <span className="sk-kpi-icon">{icon}</span>
      <span className="sk-kpi-value">
        {typeof value === 'number' && value > 999
          ? value.toLocaleString('fr-FR')
          : value}
      </span>
      <span className="sk-kpi-label">{label}</span>
    </div>
  );
});

const StockKPIs = React.memo(function StockKPIs({
  stockLines = [],
  stockItems = [],
  warehouses = [],
  teams = [],
  technicians = [],
  onKpiClick,
}) {
  const metrics = useStockMetrics({ stockLines, stockItems, warehouses, teams, technicians });

  return (
    <div className="sk-kpi-row">
      <KpiCard
        label="Valeur totale"
        value={
          metrics.totalValue === null
            ? '—'
            : `${metrics.totalValue.toLocaleString('fr-FR')} DH`
        }
        icon="💰"
        color="#22c55e"
        onClick={
          typeof onKpiClick ===
            'function'
            ? () =>
                onKpiClick(
                  'value'
                )
            : undefined
        }
      />
      <KpiCard
        label="Unités en dépôt"
        value={
          metrics.totalQuantity ?? '—'
        }
        icon="📦"
        color="#4a9eff"
        onClick={
          typeof onKpiClick ===
            'function'
            ? () =>
                onKpiClick(
                  'quantity'
                )
            : undefined
        }
      />
      <KpiCard
        label="Disponible"
        value={
          metrics.totalAvailable ?? '—'
        }
        icon="🟢"
        color="#22c55e"
      />
      <KpiCard
        label="Réservé"
        value={
          metrics.totalReserved ?? '—'
        }
        icon="🔵"
        color="#3b82f6"
      />
      <KpiCard
        label="Dépôts"
        value={metrics.warehouseCount}
        icon="🏭"
        color="#8b5cf6"
      />
      <KpiCard
        label="Équipes"
        value={metrics.teamCount}
        icon="👥"
        color="#f59e0b"
      />
      <KpiCard
        label="Techniciens"
        value={metrics.techCount}
        icon="👤"
        color="#6b7280"
      />
      <KpiCard
        label="Stock faible"
        value={
          metrics.alertCount ?? '—'
        }
        icon={
          metrics.alertCount === null
            ? '⚪'
            : metrics.alertCount > 0
                ? '🔴'
                : '🟢'
        }
        color={
          metrics.alertCount === null
            ? '#6b7280'
            : metrics.alertCount > 0
                ? '#ef4444'
                : '#22c55e'
        }
        onClick={
          typeof metrics.alertCount ===
            'number' &&
          metrics.alertCount > 0 &&
          typeof onKpiClick ===
            'function'
            ? () =>
                onKpiClick(
                  'alerts'
                )
            : undefined
        }
      />
      <KpiCard
        label="Critique"
        value={
          metrics.criticalCount ?? '—'
        }
        icon={
          metrics.criticalCount === null
            ? '⚪'
            : '⚠️'
        }
        color={
          metrics.criticalCount > 0
            ? '#ef4444'
            : '#6b7280'
        }
        onClick={
          typeof metrics.criticalCount ===
            'number' &&
          metrics.criticalCount > 0 &&
          typeof onKpiClick ===
            'function'
            ? () =>
                onKpiClick(
                  'critical'
                )
            : undefined
        }
      />
    </div>
  );
});

export default StockKPIs;
