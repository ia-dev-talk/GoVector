import { useMemo, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

function StatusCellRenderer({ value }) {
    if (!value) return null;

    const statusLabels = {
        'STOCK': 'En stock',
        'ASSIGNED': 'Affecté',
        'IN_USE': 'En utilisation',
        'RETURNED': 'Retourné',
        'FAULTY': 'Défectueux'
    };

    const displayValue = statusLabels[value] || value;

    const colorMap = {
        'STOCK': 'success',
        'ASSIGNED': 'info',
        'IN_USE': 'warning',
        'RETURNED': 'muted',
        'FAULTY': 'danger'
    };

    return <span className={`status-badge status-badge--${colorMap[value] || 'default'}`}>{displayValue}</span>;
}

function EquipmentTypeCellRenderer({ value }) {
    if (!value) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    return <span>{value}</span>;
}

const StockGrid = forwardRef(function StockGrid({ equipment, onContextMenu }, ref) {
    const gridRef = useRef(null);

    useImperativeHandle(ref, () => ({
        refresh: () => gridRef.current?.api?.refreshCells?.()
    }), []);

    const handleCellContextMenu = useCallback((e) => {
        if (e.data && onContextMenu) onContextMenu(e.event, e.data);
    }, [onContextMenu]);

    const columnDefs = useMemo(() => [
        { headerName: 'ID', width: 70, valueGetter: (p) => p.data?.id, cellStyle: { fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)' } },
        { field: 'serial_number', headerName: 'N° Série', width: 160, minWidth: 140, flex: 1, pinned: 'left', cellStyle: { fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)' } },
        { field: 'operator', headerName: 'Opérateur', width: 100, cellStyle: { fontWeight: 500 } },
        { field: 'equipment_type', headerName: 'Type', width: 140, cellRenderer: EquipmentTypeCellRenderer },
        { field: 'model', headerName: 'Modèle', width: 140, minWidth: 120, flex: 1, cellStyle: { color: 'var(--text-secondary)' } },
        { field: 'status', headerName: 'Statut', width: 120, cellRenderer: StatusCellRenderer, comparator: (a, b) => (a || '').localeCompare(b || ''), sort: 'asc', sortingOrder: ['asc','desc'] },
        { field: 'warehouse', headerName: 'Entrepôt', width: 140, minWidth: 120, flex: 1, cellStyle: { color: 'var(--text-secondary)' } },
        { field: 'vehicle', headerName: 'Véhicule', width: 140, minWidth: 120, flex: 1, cellStyle: { color: 'var(--text-secondary)' } },
        { headerName: 'Assigné à', width: 110, valueGetter: (p) => p.data?.assigned_job_id || '', cellStyle: { fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } },
        { field: 'mac_address', headerName: 'MAC Address', width: 150, minWidth: 130, flex: 1, cellStyle: { fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' } },
        { headerName: 'Seuil alerte', width: 90, valueGetter: (p) => p.data?.min_stock_threshold ?? 5, cellStyle: { fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)' } },
        { headerName: 'Créé le', width: 110, valueGetter: (p) => p.data?.created_at ? new Date(p.data.created_at).toLocaleDateString('fr-FR') : '', cellStyle: { fontSize: 'var(--font-size-xs)' } },
    ], []);

    const defaultColDef = useMemo(() => ({ sortable: true, resizable: true, suppressMovable: false, minWidth: 80 }), []);

    return (
        <div className="ag-theme-fieldopt" style={{ width: '100%', height: '100%' }}>
            <AgGridReact
                ref={gridRef}
                rowData={equipment || []}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                rowSelection="single"
                selectionColumnDef={null}
                animateRows={false}
                headerHeight={28}
                rowHeight={26}
                suppressCellFocus={true}
                pagination={true}
                paginationPageSize={100}
                paginationPageSizeSelector={[50, 100, 200]}
                onGridReady={(params) => {
                    try {
                        params.api.setSortModel([{ colId: 'status', sort: 'asc' }]);
                    } catch {
                        // Older AG Grid builds may not expose setSortModel.
                    }
                }}
                onCellContextMenu={handleCellContextMenu}
            />
        </div>
    );
});

export default StockGrid;
