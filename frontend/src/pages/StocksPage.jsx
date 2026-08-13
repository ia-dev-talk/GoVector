/**
 * StocksPage — workspace logistique FTTH BlueVector.
 *
 * Catalogue, dépôts, quantités, dotations et mouvements restent reliés
 * au même journal de stock autoritatif côté API.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import Toast from '../components/Toast';
import StockEditorModal from '../features/stock-v3/StockEditorModal';
import StockHeader from '../features/stock-v3/StockHeader';
import StockInspector from '../features/stock-v3/StockInspector';
import StockIssueModal from '../features/stock-v3/StockIssueModal';
import StockKpiStrip from '../features/stock-v3/StockKpiStrip';
import StockReceptionModal from '../features/stock-v3/StockReceptionModal';
import StockTable from '../features/stock-v3/StockTable';
import WarehouseEditorModal from '../features/stock-v3/WarehouseEditorModal';
import WarehouseRail from '../features/stock-v3/WarehouseRail';
import { stockV3Api } from '../features/stock-v3/stockV3Api';
import {
  aggregateItems,
  asRecords,
  errorMessage,
  normalizeIdentifier,
  numeric,
  searchMatches,
  stockSummary,
  text,
} from '../features/stock-v3/stockUtils';
import { useWebSocket } from '../hooks/useWebSocket';
import '../styles/stocks-v3.css';

function sortedUnique(values) {
  return [
    ...new Set(values.map((value) => text(value)).filter(Boolean)),
  ].sort((first, second) =>
    first.localeCompare(second, 'fr', { sensitivity: 'base' }),
  );
}

function downloadCsv(items) {
  const rows = [
    [
      'Référence',
      'Libellé',
      'Type',
      'Opérateur',
      'Stock physique',
      'Disponible',
      'Réservé',
      'Unité',
      'Seuil minimum',
      'Prix unitaire DH',
    ],
    ...items.map((item) => [
      item.reference,
      item.label,
      item.equipment_type,
      item.operator,
      item.totals.quantity,
      item.totals.available,
      item.totals.reserved,
      item.unit,
      item.threshold,
      item.unit_price ?? '',
    ]),
  ];

  const csv = rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
        .join(';'),
    )
    .join('\r\n');

  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `bluevector-stock-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function technicianDisplay(technician) {
  if (!technician) return '';
  return [
    text(technician?.name, `Technicien #${technician?.id ?? '—'}`),
    text(technician?.team),
    text(technician?.route_criteria ?? technician?.primary_sector_name),
  ].filter(Boolean).join(' · ');
}

function warehouseType(warehouse) {
  return text(warehouse?.warehouse_type ?? warehouse?.type).toUpperCase();
}

function technicianWarehouse(technician, warehouses) {
  if (!technician?.id) return null;
  const code = `TECH-${technician.id}`;
  return warehouses.find(
    (warehouse) => text(warehouse?.code).toUpperCase() === code,
  ) || null;
}

function scopeItems(items, selectedWarehouseId) {
  if (selectedWarehouseId === null) return items;

  return items.flatMap((item) => {
    const scopedLines = item.lines.filter(
      (line) => normalizeIdentifier(line?.warehouse_id) === selectedWarehouseId,
    );

    if (scopedLines.length === 0) return [];

    const totals = scopedLines.reduce(
      (result, line) => ({
        quantity: result.quantity + numeric(line?.quantity),
        reserved: result.reserved + numeric(line?.reserved_quantity),
        available: result.available + numeric(line?.available_quantity),
      }),
      { quantity: 0, reserved: 0, available: 0 },
    );

    if (totals.quantity <= 0 && totals.reserved <= 0 && totals.available <= 0) {
      return [];
    }

    const lowStock =
      item?.alert_enabled !== false &&
      totals.available <= item.threshold;

    return [{
      ...item,
      lines: scopedLines,
      totals,
      lowStock,
      empty: totals.quantity <= 0,
      warehouseCount: scopedLines.filter(
        (line) => numeric(line?.quantity) > 0,
      ).length,
    }];
  });
}

function StockScopeBar({
  warehouses,
  technicians,
  selectedWarehouseId,
  onSelect,
  summary,
}) {
  const physicalWarehouses = warehouses.filter(
    (warehouse) => warehouseType(warehouse) !== 'TECHNICIEN',
  );
  const technicianOptions = technicians
    .map((technician) => ({
      technician,
      warehouse: technicianWarehouse(technician, warehouses),
    }))
    .filter(({ warehouse }) => warehouse);

  const selectedWarehouse = warehouses.find(
    (warehouse) => normalizeIdentifier(warehouse?.id) === selectedWarehouseId,
  ) || null;
  const selectedTechnician = selectedWarehouse
    ? technicianOptions.find(
        ({ warehouse }) =>
          normalizeIdentifier(warehouse?.id) === selectedWarehouseId,
      )?.technician || null
    : null;

  const title = selectedTechnician
    ? text(selectedTechnician?.name, 'Technicien')
    : selectedWarehouse
      ? text(selectedWarehouse?.name, 'Dépôt')
      : 'Stock général';

  const subtitle = selectedTechnician
    ? `Dotation terrain · ${text(selectedTechnician?.employee_id, `ID ${selectedTechnician?.id}`)}`
    : selectedWarehouse
      ? `${text(selectedWarehouse?.city, 'Localisation non renseignée')} · ${warehouseType(selectedWarehouse) || 'DÉPÔT'}`
      : 'Tous les dépôts et toutes les dotations techniciens';

  return (
    <section className="st3-scopebar" aria-label="Périmètre du stock">
      <div className="st3-scopebar__identity">
        <span>Vue du stock</span>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>

      <label className="st3-scopebar__selector">
        <span>Filtrer par détenteur</span>
        <select
          value={selectedWarehouseId ?? ''}
          onChange={(event) =>
            onSelect(event.target.value ? Number(event.target.value) : null)
          }
        >
          <option value="">Stock général — vue consolidée</option>
          {physicalWarehouses.length ? (
            <optgroup label="Dépôts">
              {physicalWarehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {text(warehouse.name, `Dépôt #${warehouse.id}`)}
                  {warehouse.code ? ` · ${warehouse.code}` : ''}
                </option>
              ))}
            </optgroup>
          ) : null}
          {technicianOptions.length ? (
            <optgroup label="Techniciens">
              {technicianOptions.map(({ technician, warehouse }) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {text(technician.name, `Technicien #${technician.id}`)}
                  {technician.employee_id ? ` · ${technician.employee_id}` : ''}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>

      <div className="st3-scopebar__metrics">
        <div><strong>{summary.catalog}</strong><span>articles</span></div>
        <div><strong>{summary.available}</strong><span>disponibles</span></div>
        <div><strong>{summary.reserved}</strong><span>réservés</span></div>
      </div>
    </section>
  );
}

export default function StocksPage({
  userRole,
  onNavigate,
  navigationPayload,
}) {
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [lines, setLines] = useState([]);
  const [movements, setMovements] = useState([]);
  const [technicians, setTechnicians] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [equipmentType, setEquipmentType] = useState('');
  const [operator, setOperator] = useState('');
  const [kpiFilter, setKpiFilter] = useState('all');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [railCollapsed, setRailCollapsed] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorItem, setEditorItem] = useState(null);
  const [receptionOpen, setReceptionOpen] = useState(false);
  const [receptionItem, setReceptionItem] = useState(null);
  const [warehouseEditorOpen, setWarehouseEditorOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueItem, setIssueItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toasts, setToasts] = useState([]);

  const requestRef = useRef(0);
  const toastIdRef = useRef(0);
  const realtimeRefreshTimerRef = useRef(null);

  const role = text(userRole).toUpperCase();
  const canManageCatalog = [
    'ADMIN',
    'ADMINISTRATEUR',
    'CHEF_ORIENTEUR',
  ].includes(role);
  const canMoveStock = canManageCatalog || role === 'ORIENTEUR';

  const requestedTechnicianId = useMemo(
    () => normalizeIdentifier(
      navigationPayload?.technicianId ?? navigationPayload?.technician_id,
    ),
    [navigationPayload],
  );

  const technicianContext = useMemo(
    () => requestedTechnicianId
      ? technicians.find(
          (technician) =>
            normalizeIdentifier(technician?.id) === requestedTechnicianId,
        ) ?? null
      : null,
    [requestedTechnicianId, technicians],
  );

  const technicianById = useMemo(
    () => new Map(
      technicians.map((technician) => [
        normalizeIdentifier(technician?.id),
        technician,
      ]),
    ),
    [technicians],
  );

  const warehouseById = useMemo(
    () => new Map(
      warehouses.map((warehouse) => [
        normalizeIdentifier(warehouse?.id),
        warehouse,
      ]),
    ),
    [warehouses],
  );

  const toast = useCallback((message, type = 'info') => {
    const id = ++toastIdRef.current;
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3200);
  }, []);

  const loadData = useCallback(async ({ manual = false } = {}) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (manual) setRefreshing(true);
    setLoadError('');

    const results = await Promise.allSettled([
      stockV3Api.getItems(),
      stockV3Api.getWarehouses(),
      stockV3Api.getLines(),
      stockV3Api.getMovements(),
      stockV3Api.getTechnicians(),
    ]);

    if (requestId !== requestRef.current) return;

    const [
      itemsResult,
      warehousesResult,
      linesResult,
      movementsResult,
      techniciansResult,
    ] = results;
    const errors = [];

    if (itemsResult.status === 'fulfilled') {
      setItems(asRecords(itemsResult.value?.data));
    } else {
      errors.push(errorMessage(itemsResult.reason, 'Catalogue indisponible'));
    }

    if (warehousesResult.status === 'fulfilled') {
      setWarehouses(asRecords(warehousesResult.value?.data));
    } else {
      errors.push(errorMessage(warehousesResult.reason, 'Dépôts indisponibles'));
    }

    if (linesResult.status === 'fulfilled') {
      setLines(asRecords(linesResult.value?.data));
    } else {
      errors.push(errorMessage(linesResult.reason, 'Quantités indisponibles'));
    }

    if (movementsResult.status === 'fulfilled') {
      setMovements(asRecords(movementsResult.value?.data));
    } else {
      errors.push(errorMessage(movementsResult.reason, 'Historique indisponible'));
    }

    if (techniciansResult.status === 'fulfilled') {
      setTechnicians(asRecords(techniciansResult.value?.data));
    } else {
      errors.push(
        errorMessage(
          techniciansResult.reason,
          'Destinataires techniciens indisponibles',
        ),
      );
    }

    setLoadError(errors.join(' · '));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => loadData(), 0);
    return () => {
      window.clearTimeout(timer);
      requestRef.current += 1;
    };
  }, [loadData]);

  useEffect(() => {
    if (!requestedTechnicianId || warehouses.length === 0) return;
    const warehouse = warehouses.find(
      (candidate) =>
        text(candidate?.code).toUpperCase() === `TECH-${requestedTechnicianId}`,
    );
    if (warehouse) {
      setSelectedWarehouseId(normalizeIdentifier(warehouse.id));
    }
  }, [requestedTechnicianId, warehouses]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (realtimeRefreshTimerRef.current !== null) {
      window.clearTimeout(realtimeRefreshTimerRef.current);
    }
    realtimeRefreshTimerRef.current = window.setTimeout(() => {
      realtimeRefreshTimerRef.current = null;
      loadData();
    }, 250);
  }, [loadData]);

  const handleRealtimeEvent = useCallback(
    (eventType) => {
      if (eventType === 'stock:updated') {
        scheduleRealtimeRefresh();
      }
    },
    [scheduleRealtimeRefresh],
  );

  useWebSocket(null, {
    onEvent: handleRealtimeEvent,
  });

  useEffect(
    () => () => {
      if (realtimeRefreshTimerRef.current !== null) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
      }
    },
    [],
  );

  const aggregatedItems = useMemo(
    () => aggregateItems({ items, lines, warehouses }),
    [items, lines, warehouses],
  );

  const scopedItems = useMemo(
    () => scopeItems(aggregatedItems, selectedWarehouseId),
    [aggregatedItems, selectedWarehouseId],
  );

  const summary = useMemo(
    () => stockSummary(scopedItems),
    [scopedItems],
  );

  const filteredItems = useMemo(
    () => scopedItems.filter((item) => {
      if (equipmentType && text(item?.equipment_type) !== equipmentType) {
        return false;
      }
      if (operator && text(item?.operator) !== operator) return false;
      if (kpiFilter === 'available' && item.totals.available <= 0) return false;
      if (kpiFilter === 'reserved' && item.totals.reserved <= 0) return false;
      if (kpiFilter === 'low' && !item.lowStock) return false;
      if (kpiFilter === 'empty' && !item.empty) return false;

      return searchMatches(
        [
          item?.reference,
          item?.label,
          item?.equipment_type,
          item?.operator,
          item?.manufacturer,
          item?.model,
          item?.category,
        ],
        searchQuery,
      );
    }),
    [
      scopedItems,
      equipmentType,
      kpiFilter,
      operator,
      searchQuery,
    ],
  );

  const selectedItem = useMemo(
    () => scopedItems.find(
      (item) => normalizeIdentifier(item?.id) === selectedItemId,
    ) || null,
    [scopedItems, selectedItemId],
  );

  const selectedMovements = useMemo(
    () => movements
      .filter((movement) => {
        if (normalizeIdentifier(movement?.item_id) !== selectedItemId) return false;
        if (
          selectedWarehouseId !== null &&
          normalizeIdentifier(movement?.warehouse_id) !== selectedWarehouseId
        ) return false;
        if (
          selectedWarehouseId === null &&
          requestedTechnicianId &&
          normalizeIdentifier(movement?.technician_id) !== requestedTechnicianId
        ) return false;
        return true;
      })
      .map((movement) => {
        const technician = technicianById.get(
          normalizeIdentifier(movement?.technician_id),
        );
        const warehouse = warehouseById.get(
          normalizeIdentifier(movement?.warehouse_id),
        );
        return {
          ...movement,
          technician_name: text(technician?.name),
          technician_employee_id: text(technician?.employee_id),
          warehouse_name: text(warehouse?.name),
          warehouse_code: text(warehouse?.code),
          warehouse_type: warehouseType(warehouse),
        };
      })
      .slice(0, 50),
    [
      movements,
      requestedTechnicianId,
      selectedItemId,
      selectedWarehouseId,
      technicianById,
      warehouseById,
    ],
  );

  const technicianMovements = useMemo(
    () => requestedTechnicianId
      ? movements.filter(
          (movement) =>
            normalizeIdentifier(movement?.technician_id) === requestedTechnicianId,
        )
      : [],
    [movements, requestedTechnicianId],
  );

  const types = useMemo(
    () => sortedUnique(scopedItems.map((item) => item?.equipment_type)),
    [scopedItems],
  );
  const operators = useMemo(
    () => sortedUnique(scopedItems.map((item) => item?.operator)),
    [scopedItems],
  );

  const openCreate = useCallback(() => {
    setEditorItem(null);
    setFormError('');
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((item) => {
    setEditorItem(item);
    setFormError('');
    setEditorOpen(true);
  }, []);

  const openReception = useCallback(
    (item = selectedItem) => {
      if (!item) {
        toast('Sélectionnez un article avant d’enregistrer une réception.', 'warning');
        return;
      }
      const physicalWarehouses = warehouses.filter(
        (warehouse) => warehouseType(warehouse) !== 'TECHNICIEN',
      );
      if (physicalWarehouses.length === 0) {
        toast('Aucun dépôt physique n’est configuré.', 'warning');
        return;
      }
      setReceptionItem(item);
      setFormError('');
      setReceptionOpen(true);
    },
    [selectedItem, toast, warehouses],
  );

  const openIssue = useCallback(
    (item = selectedItem) => {
      if (!item) {
        toast('Sélectionnez un article à affecter.', 'warning');
        return;
      }
      if (warehouses.length === 0 || technicians.length === 0) {
        toast('Un dépôt et au moins un technicien sont nécessaires.', 'warning');
        return;
      }
      setIssueItem(item);
      setFormError('');
      setIssueOpen(true);
    },
    [selectedItem, technicians.length, toast, warehouses.length],
  );

  const closeForms = useCallback(() => {
    if (saving) return;
    setEditorOpen(false);
    setEditorItem(null);
    setReceptionOpen(false);
    setReceptionItem(null);
    setWarehouseEditorOpen(false);
    setIssueOpen(false);
    setIssueItem(null);
    setFormError('');
  }, [saving]);

  const saveItem = useCallback(
    async (document) => {
      setSaving(true);
      setFormError('');
      try {
        const response = editorItem?.id
          ? await stockV3Api.updateItem(editorItem.id, document)
          : await stockV3Api.createItem(document);
        const savedId = normalizeIdentifier(response?.data?.id);
        if (savedId) setSelectedItemId(savedId);
        setEditorOpen(false);
        setEditorItem(null);
        toast(editorItem?.id ? 'Article mis à jour.' : 'Article créé.', 'success');
        await loadData({ manual: true });
      } catch (error) {
        setFormError(errorMessage(error, 'Impossible d’enregistrer l’article.'));
      } finally {
        setSaving(false);
      }
    },
    [editorItem, loadData, toast],
  );

  const saveWarehouse = useCallback(
    async (document) => {
      setSaving(true);
      setFormError('');
      try {
        const response = await stockV3Api.createWarehouse(document);
        const warehouseId = normalizeIdentifier(response?.data?.id);
        if (warehouseId) setSelectedWarehouseId(warehouseId);
        setWarehouseEditorOpen(false);
        toast('Dépôt créé.', 'success');
        await loadData({ manual: true });
      } catch (error) {
        setFormError(errorMessage(error, 'Impossible de créer le dépôt.'));
      } finally {
        setSaving(false);
      }
    },
    [loadData, toast],
  );

  const saveReception = useCallback(
    async (document) => {
      setSaving(true);
      setFormError('');
      try {
        await stockV3Api.receive(document);
        setReceptionOpen(false);
        setReceptionItem(null);
        toast('Réception enregistrée.', 'success');
        await loadData({ manual: true });
      } catch (error) {
        setFormError(errorMessage(error, 'Impossible d’enregistrer la réception.'));
      } finally {
        setSaving(false);
      }
    },
    [loadData, toast],
  );

  const saveIssue = useCallback(
    async (document) => {
      setSaving(true);
      setFormError('');
      try {
        await stockV3Api.createIssue(document);
        setIssueOpen(false);
        setIssueItem(null);
        toast('Stock affecté au technicien et mouvement journalisé.', 'success');
        await loadData({ manual: true });
      } catch (error) {
        setFormError(errorMessage(error, 'Impossible de valider la dotation.'));
      } finally {
        setSaving(false);
      }
    },
    [loadData, toast],
  );

  const physicalWarehouses = warehouses.filter(
    (warehouse) => warehouseType(warehouse) !== 'TECHNICIEN',
  );

  return (
    <div className="st3-page">
      <StockHeader
        catalogCount={summary.catalog}
        warehouseCount={physicalWarehouses.length}
        availableUnits={summary.available}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRefresh={() => loadData({ manual: true })}
        refreshing={refreshing}
        onExport={() => downloadCsv(filteredItems)}
        onCreate={openCreate}
        onReceive={() => openReception()}
        canManageCatalog={canManageCatalog}
        canMoveStock={canMoveStock}
        hasWarehouses={physicalWarehouses.length > 0}
      />

      {technicianContext ? (
        <div className="st3-notice st3-notice--context" role="status">
          <span>
            <strong>Stock lié au technicien</strong>
            {' · '}{technicianDisplay(technicianContext)}
            {' · '}{technicianMovements.length} mouvement{technicianMovements.length !== 1 ? 's' : ''} journalisé{technicianMovements.length !== 1 ? 's' : ''}
          </span>
          {typeof onNavigate === 'function' ? (
            <button
              type="button"
              onClick={() => onNavigate('personnel', {
                technicianId: technicianContext.id,
                from: 'stocks',
              })}
            >
              Retour à la fiche
            </button>
          ) : null}
        </div>
      ) : requestedTechnicianId && !loading ? (
        <div className="st3-notice" role="alert">
          <span>Le technicien demandé n’est pas disponible dans les données chargées.</span>
        </div>
      ) : null}

      {loadError ? (
        <div className="st3-notice" role="alert">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => loadData({ manual: true })}
            disabled={refreshing}
          >
            Réessayer
          </button>
        </div>
      ) : null}

      <div className="st3-content">
        <StockKpiStrip
          summary={summary}
          activeFilter={kpiFilter}
          onFilter={setKpiFilter}
        />

        <StockScopeBar
          warehouses={warehouses}
          technicians={technicians}
          selectedWarehouseId={selectedWarehouseId}
          onSelect={(warehouseId) => {
            setSelectedWarehouseId(warehouseId);
            setSelectedItemId(null);
          }}
          summary={summary}
        />

        <main
          className={[
            'st3-workspace',
            railCollapsed ? 'st3-workspace--rail-collapsed' : '',
          ].join(' ')}
        >
          <WarehouseRail
            collapsed={railCollapsed}
            onToggle={() => setRailCollapsed((current) => !current)}
            warehouses={warehouses}
            lines={lines}
            selectedWarehouseId={selectedWarehouseId}
            onSelect={(warehouseId) => {
              setSelectedWarehouseId(warehouseId);
              setSelectedItemId(null);
            }}
            canCreateWarehouse={canManageCatalog}
            onCreateWarehouse={() => {
              setFormError('');
              setWarehouseEditorOpen(true);
            }}
          />

          <StockTable
            items={filteredItems}
            totalCount={scopedItems.length}
            selectedId={selectedItemId}
            onSelect={setSelectedItemId}
            equipmentType={equipmentType}
            onEquipmentType={setEquipmentType}
            operator={operator}
            onOperator={setOperator}
            types={types}
            operators={operators}
          />

          <StockInspector
            item={selectedItem}
            movements={selectedMovements}
            canManageCatalog={canManageCatalog}
            canMoveStock={canMoveStock}
            canReceive={physicalWarehouses.length > 0}
            canIssue={physicalWarehouses.length > 0 && technicians.length > 0}
            onEdit={openEdit}
            onReceive={openReception}
            onIssue={openIssue}
          />
        </main>
      </div>

      {editorOpen ? (
        <StockEditorModal
          item={editorItem}
          saving={saving}
          error={formError}
          onClose={closeForms}
          onSave={saveItem}
        />
      ) : null}

      {warehouseEditorOpen ? (
        <WarehouseEditorModal
          saving={saving}
          error={formError}
          onClose={closeForms}
          onSave={saveWarehouse}
        />
      ) : null}

      {receptionOpen ? (
        <StockReceptionModal
          item={receptionItem}
          warehouses={physicalWarehouses}
          selectedWarehouseId={
            physicalWarehouses.some(
              (warehouse) => normalizeIdentifier(warehouse.id) === selectedWarehouseId,
            )
              ? selectedWarehouseId
              : null
          }
          saving={saving}
          error={formError}
          onClose={closeForms}
          onSave={saveReception}
        />
      ) : null}

      {issueOpen ? (
        <StockIssueModal
          item={issueItem}
          warehouses={physicalWarehouses}
          technicians={technicians}
          initialWarehouseId={
            physicalWarehouses.some(
              (warehouse) => normalizeIdentifier(warehouse.id) === selectedWarehouseId,
            )
              ? selectedWarehouseId
              : null
          }
          initialTechnicianId={technicianContext?.id ?? null}
          saving={saving}
          error={formError}
          onClose={closeForms}
          onSave={saveIssue}
        />
      ) : null}

      <div className="toast-container">
        {toasts.map((item) => (
          <Toast
            key={item.id}
            message={item.message}
            type={item.type}
          />
        ))}
      </div>

      {loading ? (
        <div className="st3-loading">Chargement du stock FTTH…</div>
      ) : null}
    </div>
  );
}
