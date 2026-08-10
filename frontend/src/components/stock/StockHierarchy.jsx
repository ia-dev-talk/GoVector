import React, { useState, useMemo, useCallback } from 'react';

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

function getDepotWarehouses(
  warehouses
) {
  const safeWarehouses =
    Array.isArray(warehouses)
      ? warehouses
      : [];

  return safeWarehouses.filter(
    (warehouse) => {
      const type =
        normalizeWarehouseType(
          warehouse?.type
        );

      return (
        !type ||
        type === 'ENTREPOT'
      );
    }
  );
}

// ──────────────────────────────────────────────────────────
// buildTrees — fonction pure, pas de hooks, pas d'état
// Construit l'arbre hiérarchique à partir des collections.
// ──────────────────────────────────────────────────────────

function buildTrees(
  warehouses,
  teams,
  technicians
) {
  const safeWarehouses =
    Array.isArray(warehouses)
      ? warehouses
      : [];
  const safeTeams =
    Array.isArray(teams)
      ? teams
      : [];
  const safeTechnicians =
    Array.isArray(technicians)
      ? technicians
      : [];
  const depots =
    getDepotWarehouses(
      safeWarehouses
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
  const hasExplicitOrganization =
    depots.length === 1 &&
    safeTeams.every((team) => {
      const warehouse =
        warehousesById.get(
          normalizeIdentifier(
            team?.warehouseId ??
            team?.warehouse_id
          )
        );

      return (
        normalizeWarehouseType(
          warehouse?.type
        ) === 'EQUIPE'
      );
    }) &&
    safeTechnicians.every(
      (technician) => {
        const warehouse =
          warehousesById.get(
            normalizeIdentifier(
              technician?.warehouseId ??
              technician?.warehouse_id
            )
          );

        return (
          normalizeWarehouseType(
            warehouse?.type
          ) === 'TECHNICIEN'
        );
      }
    );

  return depots.map((depot) => {
    const children =
      hasExplicitOrganization
        ? safeTeams.map((team) => {
            const teamId =
              normalizeIdentifier(
                team?.id
              );
            const techs =
              safeTechnicians
                .filter(
                  (technician) =>
                    normalizeIdentifier(
                      technician?.teamId ??
                      technician?.team_id
                    ) === teamId
                )
                .map((technician) => ({
                  id:
                    `tech-${technician.id}`,
                  label:
                    technician.name ||
                    technician.full_name ||
                    '—',
                  type: 'technicien',
                  icon: '👤',
                  warehouseId:
                    technician.warehouseId ??
                    technician.warehouse_id,
                  technicianId:
                    technician.id,
                  status:
                    technician.live_status ||
                    technician.status,
                }));

            return {
              id: `team-${team.id}`,
              label: team.name || '—',
              type: 'equipe',
              icon: '👥',
              warehouseId:
                team.warehouseId ??
                team.warehouse_id,
              orienteurId:
                team.orienteurId,
              children: techs,
            };
          })
        : [];

    return {
      id: `depot-${depot.id}`,
      label: depot.name || '—',
      type: 'depot',
      icon: '🏭',
      warehouseId: depot.id,
      children,
    };
  });
}

// ──────────────────────────────────────────────────────────
// Compteurs par noeud (quantité totale, nombre d'articles)
// ──────────────────────────────────────────────────────────

function computeNodeCounts(node, stockLines) {
  if (!node) return { itemCount: 0, totalQty: 0 };

  const safeStockLines =
    Array.isArray(stockLines)
      ? stockLines
      : [];

  const summarize = (lines) => {
    let totalQty = 0;

    for (const line of lines) {
      const quantity =
        parseNonNegativeNumber(
          line?.quantity
        );

      if (quantity === null) {
        return {
          itemCount: lines.length,
          totalQty: null,
        };
      }

      totalQty += quantity;
    }

    return {
      itemCount: lines.length,
      totalQty,
    };
  };

  if (node.type === 'technicien') {
    const warehouseId =
      normalizeIdentifier(
        node.warehouseId
      );
    const lines = safeStockLines.filter(
      (line) =>
        normalizeIdentifier(
          line?.warehouseId
        ) === warehouseId
    );

    return summarize(lines);
  }

  if (node.type === 'equipe') {
    const safeChildren =
      Array.isArray(node.children)
        ? node.children
        : [];
    const allIds = new Set(
      [
        node.warehouseId,
        ...safeChildren.map(
          (child) =>
            child.warehouseId
        ),
      ]
        .map(normalizeIdentifier)
        .filter(Boolean)
    );
    const lines = safeStockLines.filter(
      (line) =>
        allIds.has(
          normalizeIdentifier(
            line?.warehouseId
          )
        )
    );

    return summarize(lines);
  }

  if (node.type === 'depot') {
    const warehouseId =
      normalizeIdentifier(
        node.warehouseId
      );
    const lines = safeStockLines.filter(
      (line) =>
        normalizeIdentifier(
          line?.warehouseId
        ) === warehouseId
    );

    return summarize(lines);
  }

  return { itemCount: 0, totalQty: 0 };
}

// ──────────────────────────────────────────────────────────
// Icône de statut pour les techniciens
// ──────────────────────────────────────────────────────────

function statusIcon(status) {
  const normalizedStatus =
    String(status ?? '')
      .trim()
      .toLowerCase();

  switch (normalizedStatus) {
    case 'disponible': return '🟢';
    case 'en_tache':
    case 'en_intervention':
    case 'en_route':
      return '🔵';
    case 'pause': return '🟡';
    case 'hors_service': return '🔴';
    case 'deconnecte': return '⚫';
    default: return '⚪';
  }
}

// ──────────────────────────────────────────────────────────
// TreeNode — composant récursif privé
// ──────────────────────────────────────────────────────────

const TreeNode = React.memo(function TreeNode({
  node,
  depth,
  selectedId,
  onSelect,
  stockLines,
  warehouses,
}) {
  const [open, setOpen] = useState(true);
  const isSelected =
    normalizeIdentifier(selectedId) ===
    normalizeIdentifier(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const safeWarehouses =
    Array.isArray(warehouses)
      ? warehouses
      : [];
  const warehouseId =
    normalizeIdentifier(
      node.warehouseId
    );
  const wh = safeWarehouses.find(
    (warehouse) =>
      normalizeIdentifier(
        warehouse?.id
      ) === warehouseId
  );

  const counts = useMemo(
    () => computeNodeCounts(node, stockLines),
    [node, stockLines]
  );

  const handleClick = useCallback(() => {
    onSelect?.(node);
    if (hasChildren) setOpen(prev => !prev);
  }, [node, onSelect, hasChildren]);

  const statusBadge = node.type === 'technicien' && node.status
    ? statusIcon(node.status)
    : null;

  return (
    <div>
      {/* Ligne du noeud */}
      <div
        className={`tree-node ${isSelected ? 'tree-node--selected' : ''}`}
        style={{ paddingLeft: 12 + depth * 20 }}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter') handleClick(); }}
      >
        {/* Flèche d'expansion */}
        <span className="tree-node-arrow">
          {hasChildren ? (open ? '▼' : '▶') : '　'}
        </span>

        {/* Icône du noeud */}
        <span className="tree-node-icon">{node.icon}</span>

        {/* Label */}
        <span className="tree-node-label">{node.label}</span>

        {/* Badge statut (technicien uniquement) */}
        {statusBadge && (
          <span className="tree-node-status">{statusBadge}</span>
        )}

        {/* Code entrepôt */}
        {wh && (
          <span className="tree-node-code">{wh.code}</span>
        )}

        {/* Compteurs */}
        {counts.totalQty === null && (
          <span className="tree-node-count">—</span>
        )}
        {counts.totalQty > 0 && (
          <span className="tree-node-count">{counts.totalQty}</span>
        )}
        {counts.itemCount > 0 && (
          <span className="tree-node-items">{counts.itemCount} ligne(s)</span>
        )}
      </div>

      {/* Enfants (récursif) */}
      {open && hasChildren && node.children.map(child => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          stockLines={stockLines}
          warehouses={warehouses}
        />
      ))}
    </div>
  );
});

// ──────────────────────────────────────────────────────────
// StockHierarchy — composant principal exporté
// ──────────────────────────────────────────────────────────

const StockHierarchy = React.memo(function StockHierarchy({
  warehouses,
  teams,
  technicians,
  stockLines,
  selectedNode,
  onSelectNode,
}) {
  const safeWarehouses = useMemo(() => (Array.isArray(warehouses) ? warehouses : []), [warehouses]);
  const safeTeams = useMemo(() => (Array.isArray(teams) ? teams : []), [teams]);
  const safeTechnicians = useMemo(() => (Array.isArray(technicians) ? technicians : []), [technicians]);
  const safeStockLines = useMemo(() => (Array.isArray(stockLines) ? stockLines : []), [stockLines]);

  // Arbres construits depuis les collections
  const trees = useMemo(
    () =>
      buildTrees(
        safeWarehouses,
        safeTeams,
        safeTechnicians
      ),
    [
      safeWarehouses,
      safeTeams,
      safeTechnicians,
    ]
  );

  // Compteurs globaux
  const globalCounts = useMemo(() => {
    let itemCount = 0;
    let totalQty = 0;

    for (const tree of trees) {
      const counts =
        computeNodeCounts(
          tree,
          safeStockLines
        );

      itemCount += counts.itemCount;

      if (
        totalQty !== null &&
        counts.totalQty === null
      ) {
        totalQty = null;
      } else if (
        totalQty !== null
      ) {
        totalQty += counts.totalQty;
      }
    }

    return {
      itemCount,
      totalQty,
    };
  }, [trees, safeStockLines]);

  // Handler de sélection
  const handleSelect = useCallback(
    (node) => onSelectNode?.(node),
    [onSelectNode]
  );

  // État vide
  if (trees.length === 0) {
    return (
      <div className="stock-tree">
        <div className="stock-tree-header">📂 Arborescence</div>
        <div className="stock-tree-empty">
          <span>Aucun dépôt configuré</span>
        </div>
      </div>
    );
  }

  return (
    <div className="stock-tree">
      {/* En-tête */}
      <div className="stock-tree-header">
        <span>📂 Arborescence</span>
        <span className="stock-tree-header-count">
          {globalCounts.totalQty === null
            ? '—'
            : globalCounts.totalQty} unités
        </span>
      </div>

      {/* Arbre */}
      <div className="stock-tree-body">
        {trees.map((tree) => (
          <TreeNode
            key={tree.id}
            node={tree}
            depth={0}
            selectedId={
              selectedNode?.id
            }
            onSelect={handleSelect}
            stockLines={
              safeStockLines
            }
            warehouses={
              safeWarehouses
            }
          />
        ))}
      </div>

      {/* Pied : légende */}
      <div className="stock-tree-footer">
        <span>🏭 Dépôt</span>
        <span>👥 Équipe</span>
        <span>👤 Technicien</span>
      </div>
    </div>
  );
});

export default StockHierarchy;
