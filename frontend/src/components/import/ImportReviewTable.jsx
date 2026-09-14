import { useMemo } from "react";

const COLUMNS = [
    { key: "row", label: "Ligne" },
    { key: "customer_name", label: "Client" },
    { key: "service_address", label: "Adresse" },
    { key: "operator", label: "Opérateur" },
    { key: "nro", label: "NRO" },
    { key: "pbo", label: "PBO" },
    { key: "scheduled_date", label: "Date" },
    { key: "status", label: "Statut" },
];

function formatCell(job, key) {
    if (key === "row") {
        return job._meta?.row ?? "Non renseigné";
    }

    const value = job[key];
    if (value === null || value === undefined || value === "") {
        return "Non renseigné";
    }

    if (key === "scheduled_date" && typeof value === "string") {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            return new Intl.DateTimeFormat("fr-FR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            }).format(date);
        }
    }

    return String(value);
}

function diagnosticMessages(items) {
    return (Array.isArray(items) ? items : [])
        .map((item) => (typeof item?.message === "string" ? item.message.trim() : ""))
        .filter(Boolean);
}

function hasOnlyTypeBlocker(job) {
    const blockers = Array.isArray(job._blocking_errors) ? job._blocking_errors : [];
    return (
        !job.job_type
        && blockers.length > 0
        && blockers.every((item) => item?.field === "job_type" || item?.code === "job_type")
    );
}

function isImportJobConfirmable(job, defaultJobType) {
    return Boolean(
        job?._valid
        || (defaultJobType && hasOnlyTypeBlocker(job))
    );
}

export default function ImportReviewTable({
    jobs,
    onToggle,
    onToggleAll,
    defaultJobType = "",
}) {
    const selectedCount = useMemo(
        () => jobs.filter((job) => job._selected).length,
        [jobs]
    );

    const confirmableSelected = useMemo(
        () => jobs.filter(
            (job) => job._selected && isImportJobConfirmable(job, defaultJobType)
        ).length,
        [jobs, defaultJobType]
    );

    if (!jobs.length) {
        return null;
    }

    return (
        <div className="import-review">
            <div className="import-review-header">
                <div className="import-preview-title">
                    Validation ligne par ligne
                </div>

                <div className="import-review-actions">
                    <span className="import-review-count">
                        {selectedCount} sélectionnée(s)
                        {" • "}
                        {confirmableSelected} confirmable(s)
                    </span>

                    <button
                        type="button"
                        className="import-btn import-btn-cancel"
                        onClick={() => onToggleAll(true)}
                    >
                        Tout sélectionner
                    </button>

                    <button
                        type="button"
                        className="import-btn import-btn-cancel"
                        onClick={() => onToggleAll(false)}
                    >
                        Tout désélectionner
                    </button>
                </div>
            </div>

            <div className="import-sheet-preview import-review-table">
                <table>
                    <thead>
                        <tr>
                            <th />
                            <th>État</th>
                            {COLUMNS.map((col) => (
                                <th key={col.key}>{col.label}</th>
                            ))}
                            <th>Erreurs bloquantes</th>
                            <th>Avertissements</th>
                        </tr>
                    </thead>

                    <tbody>
                        {jobs.map((job) => {
                            const confirmable = isImportJobConfirmable(job, defaultJobType);
                            const blockers = diagnosticMessages(job._blocking_errors);
                            const advisories = diagnosticMessages(job._advisories);
                            const typeResolvedByLot = !job._valid && confirmable;

                            return (
                                <tr
                                    key={job._import_id}
                                    className={
                                        confirmable
                                            ? "import-row-valid"
                                            : "import-row-invalid"
                                    }
                                >
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={Boolean(job._selected)}
                                            onChange={() => onToggle(job._import_id)}
                                        />
                                    </td>

                                    <td>
                                        {job._valid
                                            ? "✓ Prête"
                                            : typeResolvedByLot
                                                ? "✓ Prête avec le type du lot"
                                                : "✕ À corriger"}
                                    </td>

                                    {COLUMNS.map((col) => (
                                        <td key={col.key}>
                                            {formatCell(job, col.key)}
                                        </td>
                                    ))}

                                    <td className="import-row-warnings import-row-blockers">
                                        {typeResolvedByLot
                                            ? "Le type manquant sera celui choisi explicitement pour le lot."
                                            : blockers.join(" · ") || "Aucune"}
                                    </td>

                                    <td className="import-row-warnings">
                                        {advisories.join(" · ") || "Aucun"}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
