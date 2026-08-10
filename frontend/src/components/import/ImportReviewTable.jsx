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
        return job._meta?.row ?? "-";
    }

    const value = job[key];

    if (value === null || value === undefined) {
        return "-";
    }

    if (key === "scheduled_date" && typeof value === "string") {
        return value.split("T")[0];
    }

    return String(value);
}

export default function ImportReviewTable({

    jobs,

    onToggle,

    onToggleAll,

}) {

    const selectedCount = useMemo(
        () => jobs.filter((job) => job._selected).length,
        [jobs]
    );

    const validSelected = useMemo(
        () => jobs.filter((job) => job._selected && job._valid).length,
        [jobs]
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
                        {validSelected} valide(s)
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

                            <th>Valide</th>

                            {

                                COLUMNS.map((col) => (

                                    <th key={col.key}>{col.label}</th>

                                ))

                            }

                            <th>Alertes</th>

                        </tr>

                    </thead>

                    <tbody>

                        {

                            jobs.map((job) => (

                                <tr
                                    key={job._import_id}
                                    className={
                                        job._valid
                                            ? "import-row-valid"
                                            : "import-row-invalid"
                                    }
                                >

                                    <td>

                                        <input
                                            type="checkbox"
                                            checked={Boolean(job._selected)}
                                            onChange={() =>
                                                onToggle(job._import_id)
                                            }
                                        />

                                    </td>

                                    <td>

                                        {

                                            job._valid

                                                ? "✓"

                                                : "✕"

                                        }

                                    </td>

                                    {

                                        COLUMNS.map((col) => (

                                            <td key={col.key}>

                                                {formatCell(job, col.key)}

                                            </td>

                                        ))

                                    }

                                    <td className="import-row-warnings">

                                        {

                                            (job._warnings || []).join(", ")

                                                || "-"

                                        }

                                    </td>

                                </tr>

                            ))

                        }

                    </tbody>

                </table>

            </div>

        </div>

    );

}
