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
  searchMatches,
  stockSummary,
  text,
} from '../features/stock-v3/stockUtils';
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

  const aggregatedItems = useMemo(
    () => aggregateItems({ items, lines, warehouses }),
    [items, lines, warehouses],
  );

  const summary = useMemo(
    () => stockSummary(aggregatedItems),
    [aggregatedItems],
  );

  const filteredItems = useMemo(
    () => aggregatedItems.filter((item) => {
      if (
        selectedWarehouseId !== null &&
        !item.lines.some(
          (line) => normalizeIdentifier(line?.warehouse_id) === selectedWarehouseId,
        )
      ) return false;

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
      aggregatedItems,
      equipmentType,
      kpiFilter,
      operator,
      searchQuery,
      selectedWarehouseId,
    ],
  );

  const selectedItem = useMemo(
    () => aggregatedItems.find(
      (item) => normalizeIdentifier(item?.id) === selectedItemId,
    ) || null,
    [aggregatedItems, selectedItemId],
  );

  const selectedMovements = useMemo(
    () => movements
      .filter((movement) =>
        normalizeIdentifier(movement?.item_id) === selectedItemId &&
        (!requestedTechnicianId ||
          normalizeIdentifier(movement?.technician_id) === requestedTechnicianId),
      )
      .slice(0, 50),
    [movements, requestedTechnicianId, selectedItemId],
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
    () => sortedUnique(aggregatedItems.map((item) => item?.equipment_type)),
    [aggregatedItems],
  );
  const operators = useMemo(
    () => sortedUnique(aggregatedItems.map((item) => item?.operator)),
    [aggregatedItems],
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
      if (warehouses.length === 0) {
        toast('Aucun dépôt n’est configuré.', 'warning');
        return;
      }
      setReceptionItem(item);
      setFormError('');
      setReceptionOpen(true);
    },
    [selectedItem, toast, warehouses.length],
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
        const created = await stockV3Api.createIssue(document);
        const issueId = Number(created?.data?.id);
        if (!Number.isInteger(issueId) || issueId <= 0) {
          throw new Error('Le bon de dotation créé ne possède pas d’identifiant valide.');
        }
        await stockV3Api.validateIssue(issueId);
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

  return (
    <div className="st3-page">
      <StockHeader
        catalogCount={summary.catalog}
        warehouseCount={warehouses.length}
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
        hasWarehouses={warehouses.length > 0}
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
            onSelect={setSelectedWarehouseId}
            canCreateWarehouse={canManageCatalog}
            onCreateWarehouse={() => {
              setFormError('');
              setWarehouseEditorOpen(true);
            }}
          />

          <StockTable
            items={filteredItems}
            totalCount={aggregatedItems.length}
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
            canReceive={warehouses.length > 0}
            canIssue={warehouses.length > 0 && technicians.length > 0}
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
          warehouses={warehouses}
          selectedWarehouseId={selectedWarehouseId}
          saving={saving}
          error={formError}
          onClose={closeForms}
          onSave={saveReception}
        />
      ) : null}

      {issueOpen ? (
        <StockIssueModal
          item={issueItem}
          warehouses={warehouses}
          technicians={technicians}
          initialWarehouseId={selectedWarehouseId}
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
