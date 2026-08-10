import { useEffect, useMemo, useState } from "react";

import "./ImportCenter.css";

import { api } from "../../api/client";

import ImportDropZone from "./ImportDropZone";
import ImportFileCard from "./ImportFileCard";
import ImportSummary from "./ImportSummary";
import ImportReviewTable from "./ImportReviewTable";

function getApiErrorMessage(err, fallback) {
    const detail = err.response?.data?.detail;

    if (typeof detail === "string" && detail.trim()) {
        return detail;
    }

    if (Array.isArray(detail)) {
        const messages = detail
            .map((item) =>
                typeof item === "string"
                    ? item
                    : item?.msg
            )
            .filter(Boolean);

        if (messages.length > 0) {
            return messages.join(" ");
        }
    }

    return fallback;
}

export default function ImportCenter({

    onClose,

    onImported,

}) {

    const [files, setFiles] = useState([]);

    const [uploading, setUploading] = useState(false);

    const [results, setResults] = useState([]);

    const [reviewJobs, setReviewJobs] = useState([]);

    const [error, setError] = useState(null);

    const [confirmationResult, setConfirmationResult] = useState(null);

    const [importMode, setImportMode] = useState("create");
    const [canonicalFields, setCanonicalFields] = useState([]);
    const [headerMappings, setHeaderMappings] = useState({});

    useEffect(() => {
        api.getImportContract()
            .then((response) => setCanonicalFields(response.data?.canonical_fields || []))
            .catch(() => setCanonicalFields([]));
    }, []);

    const mappingOverrides = useMemo(() => {
        const result = {};
        Object.entries(headerMappings).forEach(([header, field]) => {
            if (!field) return;
            result[field] = [...(result[field] || []), header];
        });
        return result;
    }, [headerMappings]);

    const totalSize = useMemo(() => {

        return files.reduce(

            (sum, file) => sum + file.size,

            0

        );

    }, [files]);

    const selectedCount = useMemo(
        () => reviewJobs.filter(
            (job) => job._selected && job._valid
        ).length,
        [reviewJobs]
    );

    async function analyzeFiles() {

        if (files.length === 0)
            return;

        setUploading(true);

        setError(null);

        setConfirmationResult(null);

        setResults([]);

        setReviewJobs([]);

        try {

            const previews = [];

            for (const file of files) {

                const response = await api.uploadExcel(file, mappingOverrides);

                previews.push({

                    file,

                    ...response.data,

                });

            }

            const jobs = previews.flatMap(
                (preview) => preview.jobs || []
            );

            setResults(previews);

            setReviewJobs(jobs);

            if (
                jobs.length > 0 &&
                !jobs.some((job) => job._valid)
            ) {
                setError(
                    "Aucune intervention valide à importer."
                );
            }

        }

        catch (err) {

            console.error(err);

            setError(
                getApiErrorMessage(
                    err,
                    "Erreur lors de l'analyse."
                )
            );

        }

        finally {

            setUploading(false);

        }

    }

    function toggleJob(importId) {

        setReviewJobs((prev) =>

            prev.map((job) =>

                job._import_id === importId

                    ? { ...job, _selected: !job._selected }

                    : job

            )

        );

    }

    function toggleAll(selected) {

        setReviewJobs((prev) =>

            prev.map((job) => ({ ...job, _selected: selected }))

        );

    }

    async function confirmImport() {

        const jobs = reviewJobs.filter(
            (job) => job._selected && job._valid
        );

        if (jobs.length === 0) {
            setError(
                "Aucune intervention valide à importer."
            );
            return;
        }

        try {

            setUploading(true);

            setError(null);

            setConfirmationResult(null);

            const response = await api.confirmExcelImport({
                jobs,
                skip_duplicates: true,
                mode: importMode,
            });

            const data = response.data;
            const created = data?.created ?? 0;
            const updated = data?.updated ?? 0;
            const ignored = data?.ignored ?? 0;
            const errors = Array.isArray(data?.errors)
                ? data.errors
                : [];

            setConfirmationResult({
                created,
                updated,
                ignored,
                errors,
            });

            if (onImported) {
                onImported(created + updated);
            }

            if (errors.length === 0) {
                onClose();
            }

        }

        catch (err) {

            console.error(err);

            setError(
                getApiErrorMessage(
                    err,
                    "Impossible de confirmer l'import."
                )
            );

        }

        finally {

            setUploading(false);

        }

    }

    function clearFiles() {

        setFiles([]);

        setResults([]);

        setReviewJobs([]);

        setError(null);

        setConfirmationResult(null);

    }

    return (

        <div

            className="import-overlay"

            onClick={onClose}

        >

            <div

                className="import-window"

                onClick={(e) => e.stopPropagation()}

            >

                <div className="import-header">

                    <div>

                        <h2>

                            Centre d'import Magellan

                        </h2>

                        <p>

                            Importez les fichiers IAM, Orange ou Inwi.

                        </p>

                    </div>

                    <button

                        className="import-close"

                        onClick={onClose}

                    >

                        ✕

                    </button>

                </div>

                <div className="import-body">

                    <ImportDropZone

                        files={files}

                        setFiles={setFiles}

                    />

                    {

                        files.length > 0 && (

                            <div className="import-files">

                                {

                                    files.map((file, index) => (

                                        <ImportFileCard

                                            key={`${file.name}-${index}`}

                                            file={file}

                                        />

                                    ))

                                }

                            </div>

                        )

                    }

                    <ImportSummary

                        files={files}

                    />

                    {

                        error && (

                            <div className="import-error">

                                {error}

                            </div>

                        )

                    }

                    {

                        confirmationResult && (

                            <div className="import-preview-card">

                                <h3>

                                    {
                                        confirmationResult.errors.length === 0
                                            ? "Import terminé"
                                            : (
                                                confirmationResult.created +
                                                confirmationResult.updated
                                            ) > 0
                                                ? "Import partiel"
                                                : "Échec de l'import"
                                    }

                                </h3>

                                <div className="import-preview-grid">

                                    <div>

                                        <strong>Créées</strong>

                                        <br />

                                        {confirmationResult.created}

                                    </div>

                                    <div>

                                        <strong>Mises à jour</strong>

                                        <br />

                                        {confirmationResult.updated}

                                    </div>

                                    <div>

                                        <strong>Ignorées</strong>

                                        <br />

                                        {confirmationResult.ignored}

                                    </div>

                                    <div>

                                        <strong>Erreurs</strong>

                                        <br />

                                        {confirmationResult.errors.length}

                                    </div>

                                </div>

                                {

                                    confirmationResult.errors.length > 0 && (

                                        <div className="import-error">

                                            {

                                                confirmationResult.errors.map(
                                                    (item, index) => {
                                                        const row =
                                                            item?.row ??
                                                            (
                                                                (
                                                                    item?.index ??
                                                                    index
                                                                ) + 2
                                                            );

                                                        const message =
                                                            typeof item?.error === "string" &&
                                                            item.error.trim()
                                                                ? item.error
                                                                : "Erreur d'import.";

                                                        return (
                                                            <div
                                                                key={
                                                                    item?.index ??
                                                                    index
                                                                }
                                                            >
                                                                <strong>
                                                                    Ligne {row}
                                                                </strong>

                                                                {
                                                                    item?.job_number
                                                                        ? ` — ${item.job_number}`
                                                                        : ""
                                                                }

                                                                {" — "}

                                                                {message}
                                                            </div>
                                                        );
                                                    }
                                                )

                                            }

                                        </div>

                                    )

                                }

                            </div>

                        )

                    }

                    {

                        results.length > 0 && (

                            <>

                                <div className="import-preview-title">

                                    Résumé par fichier

                                </div>

                                {

                                    results.map((result, index) => (

                                        <div

                                            key={index}

                                            className="import-preview-card"

                                        >

                                            <h3>

                                                {result.file.name}

                                            </h3>

                                            <div className="import-preview-grid">

                                                <div>

                                                    <strong>Opérateur</strong>

                                                    <br />

                                                    {result.info?.operator ?? "-"}

                                                </div>

                                                <div>

                                                    <strong>Feuilles</strong>

                                                    <br />

                                                    {result.info?.sheet_count ?? "-"}

                                                </div>

                                                <div>

                                                    <strong>Interventions</strong>

                                                    <br />

                                                    {result.summary?.total_jobs ?? result.jobs?.length ?? 0}

                                                </div>

                                                <div>

                                                    <strong>Erreurs</strong>

                                                    <br />

                                                    {result.summary?.errors ?? 0}

                                                </div>

                                            </div>

                                        </div>

                                    ))

                                }

                                {results.some((result) =>
                                    (result.info?.mapping_diagnostics || []).some((sheet) =>
                                        (sheet.unmapped_headers || []).length > 0
                                    )
                                ) ? (
                                    <div className="import-preview-card">
                                        <h3>Adapter les colonnes non reconnues</h3>
                                        <p>
                                            Associez uniquement les en-têtes utiles. Le mapping est appliqué à la prochaine analyse ; aucune valeur n’est inventée.
                                        </p>
                                        <div className="import-mapping-grid">
                                            {[...new Set(results.flatMap((result) =>
                                                (result.info?.mapping_diagnostics || []).flatMap((sheet) => sheet.unmapped_headers || [])
                                            ))].map((header) => (
                                                <label key={header}>
                                                    <span>{header}</span>
                                                    <select
                                                        value={headerMappings[header] || ""}
                                                        onChange={(event) => setHeaderMappings((current) => ({ ...current, [header]: event.target.value }))}
                                                    >
                                                        <option value="">Ignorer</option>
                                                        {canonicalFields.map((field) => <option key={field} value={field}>{field}</option>)}
                                                    </select>
                                                </label>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            className="import-btn import-btn-cancel"
                                            onClick={analyzeFiles}
                                            disabled={uploading}
                                        >
                                            Ré-analyser avec ce mapping
                                        </button>
                                    </div>
                                ) : null}

                                <ImportReviewTable

                                    jobs={reviewJobs}

                                    onToggle={toggleJob}

                                    onToggleAll={toggleAll}

                                />

                            </>

                        )

                    }

                </div>

                <div className="import-footer">

                    <div className="import-footer-left">

                        <strong>

                            {files.length}

                        </strong>

                        {" "}fichier{files.length > 1 ? "s" : ""}

                        {" • "}

                        {(totalSize / 1024 / 1024).toFixed(2)} Mo

                        {

                            reviewJobs.length > 0 && (

                                <>
                                    {" • "}
                                    <strong>{selectedCount}</strong>
                                    {" "}sélectionnée(s)
                                </>

                            )

                        }

                    </div>

                    <div className="import-footer-right">

                        {results.length > 0 ? (
                            <select
                                className="import-mode-select"
                                value={importMode}
                                onChange={(event) => setImportMode(event.target.value)}
                                disabled={uploading}
                                aria-label="Traitement des doublons"
                            >
                                <option value="create">Créer · ignorer les doublons</option>
                                <option value="update">Mettre à jour les dossiers existants</option>
                                <option value="ignore">Ignorer tous les doublons</option>
                            </select>
                        ) : null}

                        <button

                            className="import-btn import-btn-cancel"

                            onClick={clearFiles}

                            disabled={uploading}

                        >

                            Vider

                        </button>

                        <button

                            className="import-btn import-btn-cancel"

                            onClick={onClose}

                            disabled={uploading}

                        >

                            Fermer

                        </button>

                        {

                            results.length === 0 ? (

                                <button

                                    className="import-btn import-btn-import"

                                    onClick={analyzeFiles}

                                    disabled={

                                        files.length === 0 ||

                                        uploading

                                    }

                                >

                                    {

                                        uploading

                                            ? "Analyse..."

                                            : "Analyser"

                                    }

                                </button>

                            ) : (

                                <button

                                    className="import-btn import-btn-import"

                                    onClick={confirmImport}

                                    disabled={uploading || selectedCount === 0}

                                >

                                    {

                                        uploading

                                            ? "Import..."

                                            : `Importer ${selectedCount} intervention(s)`

                                    }

                                </button>

                            )

                        }

                    </div>

                </div>

            </div>

        </div>

    );

}
