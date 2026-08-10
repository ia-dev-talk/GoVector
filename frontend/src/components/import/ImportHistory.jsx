import { useEffect, useState } from "react";
import { api } from "../../api/client";

export default function ImportHistory() {

    const [records, setRecords] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadHistory();
    }, []);

    async function loadHistory() {
        setLoading(true);
        setError(null);
        try {
            const [histResp, statsResp] = await Promise.all([
                api.getImportHistory({ limit: 20 }),
                api.getImportStats(),
            ]);
            setRecords(histResp.data?.records || []);
            setStats(statsResp.data?.stats || null);
        } catch (err) {
            console.error(err);
            setError("Impossible de charger l'historique.");
        } finally {
            setLoading(false);
        }
    }

    function formatDate(iso) {
        if (!iso) return "-";
        const d = new Date(iso);
        return d.toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function getOperatorColor(op) {
        switch (op) {
            case "IAM": return "#e74c3c";
            case "ORANGE": return "#f39c12";
            case "INWI": return "#27ae60";
            default: return "#95a5a6";
        }
    }

    if (loading) {
        return (
            <div className="panel">
                <h3>Historique des imports</h3>
                <div className="import-loading">Chargement...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="panel">
                <h3>Historique des imports</h3>
                <div className="import-error">{error}</div>
            </div>
        );
    }

    return (
        <div className="import-history-panel">
            <div className="import-history-header">
                <h3>Historique des imports</h3>
                <button
                    className="import-btn import-btn-small"
                    onClick={loadHistory}
                    title="Rafraîchir"
                >
                    ↻
                </button>
            </div>

            {stats && (
                <div className="import-stats-bar">
                    <div className="stat-item">
                        <span className="stat-value">{stats.total_imports}</span>
                        <span className="stat-label">Imports</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-value">{stats.total_created}</span>
                        <span className="stat-label">Créés</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-value">{stats.total_updated}</span>
                        <span className="stat-label">Mis à jour</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-value">{stats.total_errors}</span>
                        <span className="stat-label">Erreurs</span>
                    </div>
                    {stats.avg_duration_seconds > 0 && (
                        <div className="stat-item">
                            <span className="stat-value">{stats.avg_duration_seconds}s</span>
                            <span className="stat-label">Moy.</span>
                        </div>
                    )}
                </div>
            )}

            {records.length === 0 ? (
                <div className="import-empty-state">
                    <div className="empty-icon">📋</div>
                    <p>Aucun import effectué.</p>
                    <p className="empty-hint">
                        Importez un fichier Excel IAM, Orange ou Inwi.
                    </p>
                </div>
            ) : (
                <div className="import-history-list">
                    <div className="import-history-table-header">
                        <span className="col-date">Date</span>
                        <span className="col-file">Fichier</span>
                        <span className="col-op">Opérateur</span>
                        <span className="col-counts">Créés / Mis à jour / Ignorés</span>
                        <span className="col-errors">Erreurs</span>
                        <span className="col-duration">Durée</span>
                    </div>
                    {records.map((record) => (
                        <div key={record.id} className="import-history-row">
                            <span className="col-date">{formatDate(record.created_at)}</span>
                            <span className="col-file" title={record.filename}>
                                {record.filename?.length > 25
                                    ? record.filename.slice(0, 22) + "..."
                                    : record.filename || "-"}
                            </span>
                            <span className="col-op">
                                {record.operator ? (
                                    <span
                                        className="operator-badge"
                                        style={{
                                            backgroundColor: getOperatorColor(record.operator),
                                            color: "#fff",
                                            padding: "2px 8px",
                                            borderRadius: "4px",
                                            fontSize: "0.8em",
                                        }}
                                    >
                                        {record.operator}
                                    </span>
                                ) : (
                                    "-"
                                )}
                            </span>
                            <span className="col-counts">
                                <span className="count-created">{record.jobs_created}</span>
                                {" / "}
                                <span className="count-updated">{record.jobs_updated}</span>
                                {" / "}
                                <span className="count-ignored">{record.jobs_ignored}</span>
                            </span>
                            <span className="col-errors">
                                {record.errors_count > 0 ? (
                                    <span className="error-badge">{record.errors_count}</span>
                                ) : (
                                    <span className="ok-badge">✓</span>
                                )}
                            </span>
                            <span className="col-duration">
                                {record.duration_seconds
                                    ? `${record.duration_seconds.toFixed(1)}s`
                                    : "-"}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}