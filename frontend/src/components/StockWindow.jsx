import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api, apiClient } from '../api/client';
import StockGrid from './StockGrid';
import Button from './ui/Button';
import Input from './ui/Input';
import Select from './ui/Select';
import Card from './ui/Card';
import EmptyState from './ui/EmptyState';
import Loading from './ui/Loading';

export default function StockWindow({ onClose }) {
    const [equipment, setEquipment] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [operatorFilter, setOperatorFilter] = useState('');
    const [search, setSearch] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [form, setForm] = useState({ serial_number: '', operator: '', equipment_type: '', model: '', mac_address: '', warehouse: '' });
    const [ctxMenu, setCtxMenu] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [alerts, setAlerts] = useState([]);
    const toastRef = useRef(null);
    const toast = useCallback((msg, type = 'info') => { if (toastRef.current) toastRef.current(msg, type); }, []);

    const loadEquipment = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (statusFilter) params.status = statusFilter;
            if (typeFilter) params.equipment_type = typeFilter;
            if (operatorFilter) params.operator = operatorFilter;
            const res = await api.getStock(params);
            let data = res.data || [];
            if (search.trim()) {
                const q = search.trim().toLowerCase();
                data = data.filter((item) => {
                    const hay = [item.serial_number, item.mac_address, item.operator, item.equipment_type, item.model, item.warehouse, item.vehicle, String(item.id), String(item.assigned_job_id || '')].join(' ').toLowerCase();
                    return hay.includes(q);
                });
            }
            setEquipment(data);
        } catch (e) {
            console.error('Stock load error:', e);
            toast('Échec du chargement du stock', 'error');
        } finally { setLoading(false); }
    }, [statusFilter, typeFilter, operatorFilter, search, toast]);

    const loadSummary = useCallback(async () => {
        try { const res = await api.getStockSummary(); setSummary(res.data || {}); } catch (e) { console.error('Stock summary error:', e); }
    }, []);
    const loadAlerts = useCallback(async () => {
        try { const res = await api.getStockAlerts(); setAlerts(res.data || []); } catch (e) { console.error('Stock alerts error:', e); }
    }, []);

    useEffect(() => { loadEquipment(); }, [loadEquipment]);
    useEffect(() => { loadSummary(); }, [loadSummary]);
    useEffect(() => { loadAlerts(); }, [loadAlerts]);

    const resetForm = useCallback(() => { setForm({ serial_number: '', operator: '', equipment_type: '', model: '', mac_address: '', warehouse: '' }); }, []);

    const handleAddEquipment = useCallback(async (e) => {
        e.preventDefault();
        if (!form.serial_number || !form.operator || !form.equipment_type) { toast('N° série, opérateur et type sont obligatoires', 'warning'); return; }
        setSaving(true);
        try {
            await api.createEquipment({ serial_number: form.serial_number, operator: form.operator, equipment_type: form.equipment_type, model: form.model || null, mac_address: form.mac_address || null, warehouse: form.warehouse || null });
            toast('Matériel ajouté au stock', 'success');
            resetForm(); setShowAddForm(false); loadEquipment(); loadSummary();
        } catch (e) { console.error('Add equipment error:', e); toast('Échec de l\'ajout du matériel', 'error'); } finally { setSaving(false); }
    }, [form, toast, resetForm, loadEquipment, loadSummary]);

    const handleDelete = useCallback(async (item) => {
        if (!window.confirm(`Supprimer l'équipement #${item.id} (${item.serial_number}) ?`)) return;
        try { await api.deleteEquipment(item.id); toast('Équipement supprimé', 'success'); setCtxMenu(null); loadEquipment(); loadSummary(); }
        catch (e) { console.error('Delete equipment error:', e); toast('Échec de la suppression', 'error'); }
    }, [toast, loadEquipment, loadSummary]);

    const handleExportStock = useCallback(async () => {
        try {
            const blob = await api.exportStock({ status: statusFilter || undefined, equipment_type: typeFilter || undefined, operator: operatorFilter || undefined });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `stock_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
            document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); a.remove();
            toast('Export Excel téléchargé', 'success');
        } catch (e) { console.error('Export error:', e); toast('Échec de l\'export', 'error'); }
    }, [statusFilter, typeFilter, operatorFilter, toast]);

    const handleStockContextMenu = useCallback((event, item) => { if (!item) return; setCtxMenu({ x: event.clientX, y: event.clientY, data: item }); }, []);

    const handleOCRScan = useCallback(async () => {
        const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
        input.onchange = async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            setScanning(true);
            try {
                const formData = new FormData();
                formData.append('file', file);

                const res = await apiClient.post(
                    '/tech/scan-router-sn',
                    formData
                );

                const data = res.data;
                if (data.serial_number) { setForm((p) => ({ ...p, serial_number: data.serial_number })); setShowAddForm(true); toast(`N° série détecté : ${data.serial_number}`, 'success'); }
                else { toast('Numéro de série non détecté', 'warning'); }
            } catch { toast('Erreur OCR', 'error'); } finally { setScanning(false); }
        };
        input.click();
    }, [toast]);

    const handleStockAction = useCallback(async (item, action) => {
        try {
            if (action === 'DELETE') { await handleDelete(item); return; }
            await api.updateEquipment(item.id, { status: action, warehouse: item.warehouse || undefined });
            toast(`Statut mis à jour : ${action}`, 'success'); setCtxMenu(null); loadEquipment(); loadSummary();
        } catch (e) { console.error('Stock action error:', e); toast('Échec de l\'action', 'error'); }
    }, [toast, loadEquipment, loadSummary, handleDelete]);

    const operatorOptions = useMemo(() => { const set = new Set((equipment || []).map((i) => i.operator).filter(Boolean)); return Array.from(set).sort().map((op) => ({ value: op, label: op })); }, [equipment]);
    const typeOptions = useMemo(() => { const set = new Set((equipment || []).map((i) => i.equipment_type).filter(Boolean)); return Array.from(set).sort().map((t) => ({ value: t, label: t })); }, [equipment]);

    const statuses = [
        { value: '', label: 'Tous les statuts' }, { value: 'STOCK', label: 'En stock' }, { value: 'ASSIGNED', label: 'Affecté' },
        { value: 'IN_USE', label: 'En utilisation' }, { value: 'RETURNED', label: 'Retourné' }, { value: 'FAULTY', label: 'Défectueux' },
    ];

    const summaryCards = useMemo(() => {
        if (!summary) return [];
        return [
            { label: 'Total', value: summary.total, color: 'default' }, { label: 'En stock', value: summary.by_status?.STOCK || 0, color: 'success' },
            { label: 'Affectés', value: summary.by_status?.ASSIGNED || 0, color: 'info' }, { label: 'En utilisation', value: summary.by_status?.IN_USE || 0, color: 'warning' },
            { label: 'Retournés', value: summary.by_status?.RETURNED || 0, color: 'muted' }, { label: 'Défectueux', value: summary.by_status?.FAULTY || 0, color: 'danger' },
        ];
    }, [summary]);

    return (
        <div className="stock-overlay" onClick={onClose}>
            <div className="stock-window" onClick={(e) => e.stopPropagation()}>
                <div className="fw-titlebar"><span className="fw-title">Gestion du Stock Matériel</span><button className="fw-close" onClick={onClose}>X</button></div>
                <div className="stock-body">
                    {summaryCards.length > 0 && (
                        <div className="stock-summary">{summaryCards.map((item) => (
                            <Card key={item.label} className="stock-summary-card"><div className={`dash-count dash-count--${item.color}`}>{item.value}</div><div className="dash-label">{item.label}</div></Card>
                        ))}</div>
                    )}
                    {alerts.length > 0 && (
                        <div className="stock-alerts">{alerts.map((alert, idx) => (
                            <div key={idx} className="stock-alert"><span className="stock-alert-icon">!</span><div><strong>{alert.equipment_type}</strong> stock bas : {alert.current_stock} / {alert.min_stock_threshold}<div className="stock-alert-detail">Operateur : {alert.operator}</div></div></div>
                        ))}</div>
                    )}
                    <div className="stock-toolbar">
                        <div className="stock-filters">
                            <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') loadEquipment(); }} />
                            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={statuses} />
                            <Select value={operatorFilter} onChange={(e) => setOperatorFilter(e.target.value)} options={[{ value: '', label: 'Tous les operateurs' }, ...operatorOptions]} />
                            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} options={[{ value: '', label: 'Tous les types' }, ...typeOptions]} />
                            <Button variant="secondary" onClick={loadEquipment} disabled={loading}>Actualiser</Button>
                            <Button variant="secondary" onClick={handleExportStock}>Export Excel</Button>
                            <Button variant="secondary" onClick={handleOCRScan} disabled={scanning}>{scanning ? 'Scan...' : 'Scan OCR'}</Button>
                        </div>
                        <Button variant="primary" onClick={() => { resetForm(); setShowAddForm((p) => !p); }}>{showAddForm ? 'Annuler' : '+ Nouvel equipement'}</Button>
                    </div>
                    {showAddForm && (
                        <Card className="stock-add-form">
                            <div className="stock-add-header"><strong>Nouvel equipement</strong></div>
                            <form onSubmit={handleAddEquipment} className="stock-add-form-row">
                                <Input label="No Serie *" value={form.serial_number} onChange={(e) => setForm((p) => ({ ...p, serial_number: e.target.value }))} required />
                                <Input label="Operateur *" value={form.operator} onChange={(e) => setForm((p) => ({ ...p, operator: e.target.value }))} required />
                                <Input label="Type *" value={form.equipment_type} onChange={(e) => setForm((p) => ({ ...p, equipment_type: e.target.value }))} required />
                                <Input label="Modele" value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))} />
                                <Input label="MAC Address" value={form.mac_address} onChange={(e) => setForm((p) => ({ ...p, mac_address: e.target.value }))} />
                                <Input label="Entrepot" value={form.warehouse} onChange={(e) => setForm((p) => ({ ...p, warehouse: e.target.value }))} />
                                <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Enregistrement...' : 'Ajouter au stock'}</Button>
                            </form>
                        </Card>
                    )}
                    <Card className="stock-grid-card">
                        {loading && equipment.length === 0 ? (<Loading />) : equipment.length === 0 ? (
                            <EmptyState title="Aucun equipement en stock" description="Ajoutez un equipement ou modifiez vos filtres." actionLabel="Ajouter un equipement" onAction={() => { resetForm(); setShowAddForm(true); }} />
                        ) : (<div className="stock-grid-container"><StockGrid equipment={equipment} onContextMenu={handleStockContextMenu} /></div>)}
                    </Card>
                    {ctxMenu && (
                        <div className="ctx-menu-overlay" onClick={() => setCtxMenu(null)}>
                            <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={(e) => e.stopPropagation()}>
                                <div className="ctx-menu-header">Materiel #{ctxMenu.data.id}  {ctxMenu.data.serial_number}</div>
                                <div className="ctx-menu-status"><span className={`status-badge status-badge--${(ctxMenu.data.status || '').toLowerCase()}`}>{ctxMenu.data.status}</span></div>
                                <div className="ctx-menu-sep" />
                                <div className="ctx-menu-label">Changer le statut</div>
                                <button className="ctx-menu-item" onClick={() => handleStockAction(ctxMenu.data, 'STOCK')}><span className="ctx-dot ctx-dot--success" /> En stock</button>
                                <button className="ctx-menu-item" onClick={() => handleStockAction(ctxMenu.data, 'ASSIGNED')}><span className="ctx-dot ctx-dot--info" /> Affecte</button>
                                <button className="ctx-menu-item" onClick={() => handleStockAction(ctxMenu.data, 'IN_USE')}><span className="ctx-dot ctx-dot--warning" /> En utilisation</button>
                                <button className="ctx-menu-item" onClick={() => handleStockAction(ctxMenu.data, 'RETURNED')}><span className="ctx-dot ctx-dot--muted" /> Retourne</button>
                                <button className="ctx-menu-item" onClick={() => handleStockAction(ctxMenu.data, 'FAULTY')}><span className="ctx-dot ctx-dot--danger" /> Defectueux</button>
                                <div className="ctx-menu-sep" />
                                <div className="ctx-menu-label">Seuil d'alerte</div>
                                <div className="ctx-menu-threshold">
                                    <input type="number" min="0" defaultValue={ctxMenu.data.min_stock_threshold ?? 5} className="ctx-menu-input-threshold" id="threshold-input" />
                                    <button className="ctx-menu-item ctx-menu-item--small" onClick={async () => {
                                        const input = document.getElementById('threshold-input');
                                        const val = parseInt(input.value, 10);
                                        if (isNaN(val) || val < 0) return;
                                        try { await api.updateEquipment(ctxMenu.data.id, { min_stock_threshold: val }); toast('Seuil d\'alerte mis a jour', 'success'); setCtxMenu(null); loadEquipment(); }
                                        catch { toast('Echec mise a jour seuil', 'error'); }
                                    }}>Appliquer</button>
                                </div>
                                <div className="ctx-menu-sep" />
                                <button className="ctx-menu-item ctx-menu-item--danger" onClick={() => handleStockAction(ctxMenu.data, 'DELETE')}>Supprimer l'equipement</button>
                            </div>
                        </div>
                    )}
                    <div className="stock-footer"><span className="stock-count">{equipment.length} equipement(s) affiche(s)</span></div>
                </div>
            </div>
        </div>
    );
}
