import { useEffect, useMemo, useState } from "react";

import "./ImportCenter.css";

import { api } from "../../api/client";

import ImportDropZone from "./ImportDropZone";
import ImportFileCard from "./ImportFileCard";
import ImportSummary from "./ImportSummary";
import ImportReviewTable from "./ImportReviewTable";
import {
    getFileColumnOverrides,
    getFileHeaderRowOverrides,
    getImportFileKey,
    getScopedImportKey,
} from "../../lib/import-mapping";

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

function getMappingMethodLabel(match) {
    if (match.issue === "duplicate_field") {
        return "Doublon détecté : cette colonne n’est pas utilisée";
    }
    if (match.method === "ignored") return "Ignorée manuellement";
    if (match.method === "manual") return "Choix manuel";
    if (match.method === "unmapped") return "Non reconnue";
    return `Détection ${match.method}`;
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
    const [canonicalFieldLabels, setCanonicalFieldLabels] = useState({});
    const [headerMappings, setHeaderMappings] = useState({});
    const [headerRowMappings, setHeaderRowMappings] = useState({});
    const [importProfiles, setImportProfiles] = useState([]);
    const [profilesRevision, setProfilesRevision] = useState(0);
    const [selectedProfileId, setSelectedProfileId] = useState("");
    const [profileName, setProfileName] = useState("");
    const [savingProfile, setSavingProfile] = useState(false);

    useEffect(() => {
        Promise.all([api.getImportContract(), api.getImportProfiles()])
            .then(([contractResponse, profilesResponse]) => {
                setCanonicalFields(contractResponse.data?.canonical_fields || []);
                setCanonicalFieldLabels(contractResponse.data?.field_labels || {});
                setImportProfiles(profilesResponse.data?.profiles || []);
                setProfilesRevision(profilesResponse.data?.revision || 0);
            })
            .catch(() => {
                setCanonicalFields([]);
                setCanonicalFieldLabels({});
                setImportProfiles([]);
                setProfilesRevision(0);
            });
    }, []);

    const selectedProfile = useMemo(
        () => importProfiles.find((profile) => profile.id === selectedProfileId) || null,
        [importProfiles, selectedProfileId],
    );

    const mappingRows = useMemo(() => {
        const byFileHeader = new Map();
        results.forEach((result) => {
            const fileKey = getImportFileKey(result.file);
            (result.info?.mapping_diagnostics || []).forEach((sheet) => {
                (sheet.column_matches || []).forEach((match) => {
                    const key = `${fileKey}::${match?.header || ""}`;
                    if (!match?.header || byFileHeader.has(key)) return;
                    byFileHeader.set(key, {
                        ...match,
                        key,
                        fileKey,
                        fileName: result.file?.name || result.filename || "Fichier",
                        sheetName: sheet.sheet,
                    });
                });
            });
        });
        return [...byFileHeader.values()];
    }, [results]);

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
                const rowOverrides = getFileHeaderRowOverrides(
                    headerRowMappings,
                    file,
                );
                const columnOverrides = getFileColumnOverrides(
                    headerMappings,
                    file,
                );
                const response = await api.uploadExcel(
                    file,
                    null,
                    {
                        ...(selectedProfile?.column_overrides || {}),
                        ...columnOverrides,
                    },
                    {
                        ...(selectedProfile?.header_row_overrides || {}),
                        ...rowOverrides,
                    },
                );

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

    function buildProfilePayload() {
        const columnOverrides = {};
        mappingRows.forEach((match) => {
            const hasOverride = Object.prototype.hasOwnProperty.call(headerMappings, match.key);
            columnOverrides[match.header] = hasOverride
                ? headerMappings[match.key]
                : selectedProfile?.column_overrides?.[match.header] ?? match.field ?? null;
        });
        const headerRows = {};
        results.forEach((result) => {
            (result.info?.mapping_diagnostics || []).forEach((sheet) => {
                const key = getScopedImportKey(result.file, sheet.sheet);
                const row = headerRowMappings[key]
                    ?? selectedProfile?.header_row_overrides?.[sheet.sheet]
                    ?? sheet.header_row;
                if (Number.isInteger(row) && row > 0) headerRows[sheet.sheet] = row;
            });
        });
        return {
            name: profileName.trim() || selectedProfile?.name || "",
            operator: selectedProfile?.operator || null,
            column_overrides: columnOverrides,
            header_row_overrides: headerRows,
            expected_revision: profilesRevision,
        };
    }

    async function saveImportProfile() {
        const payload = buildProfilePayload();
        if (!payload.name) {
            setError("Donnez un nom au profil avant de l’enregistrer.");
            return;
        }
        if (mappingRows.length === 0) {
            setError("Analysez au moins un fichier avant d’enregistrer son profil.");
            return;
        }
        setSavingProfile(true);
        setError(null);
        try {
            const response = selectedProfile
                ? await api.updateImportProfile(selectedProfile.id, payload)
                : await api.createImportProfile(payload);
            const profiles = response.data?.profiles || [];
            setImportProfiles(profiles);
            setProfilesRevision(response.data?.revision || 0);
            const saved = selectedProfile
                ? profiles.find((profile) => profile.id === selectedProfile.id)
                : profiles.find((profile) => profile.name === payload.name);
            setSelectedProfileId(saved?.id || "");
            setProfileName(saved?.name || payload.name);
        } catch (err) {
            setError(getApiErrorMessage(err, "Impossible d’enregistrer ce profil."));
        } finally {
            setSavingProfile(false);
        }
    }

    async function deleteImportProfile() {
        if (!selectedProfile) return;
        if (!window.confirm(`Supprimer le profil « ${selectedProfile.name} » ?`)) return;
        setSavingProfile(true);
        setError(null);
        try {
            const response = await api.deleteImportProfile(selectedProfile.id, profilesRevision);
            setImportProfiles(response.data?.profiles || []);
            setProfilesRevision(response.data?.revision || 0);
            setSelectedProfileId("");
            setProfileName("");
        } catch (err) {
            setError(getApiErrorMessage(err, "Impossible de supprimer ce profil."));
        } finally {
            setSavingProfile(false);
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
            const planning = data?.planning || { dates: {}, unscheduled: 0 };

            setConfirmationResult({
                created,
                updated,
                ignored,
                errors,
                planning,
            });

            if (onImported) {
                onImported(created + updated, data);
            }

            if (
                errors.length === 0
                && ignored === 0
                && created + updated > 0
                && Number(planning.unscheduled || 0) === 0
            ) {
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

        setHeaderMappings({});

        setHeaderRowMappings({});

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

                            Centre d'import GoVector

                        </h2>

                        <p>

                            Adaptez puis importez les fichiers de vos opérateurs sans perdre les valeurs inconnues.

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

                    <section className="import-profile-bar">
                        <div>
                            <strong>Profil de fichier</strong>
                            <small>Réutilisez une correspondance de colonnes déjà vérifiée.</small>
                        </div>
                        <label>
                            <span>Profil actif</span>
                            <select
                                value={selectedProfileId}
                                onChange={(event) => {
                                    const profile = importProfiles.find((item) => item.id === event.target.value);
                                    setSelectedProfileId(event.target.value);
                                    setProfileName(profile?.name || "");
                                    setHeaderMappings({});
                                    setHeaderRowMappings({});
                                }}
                            >
                                <option value="">Détection automatique / nouveau profil</option>
                                {importProfiles.map((profile) => (
                                    <option value={profile.id} key={profile.id}>{profile.name}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span>Nom du profil</span>
                            <input
                                value={profileName}
                                maxLength={80}
                                onChange={(event) => setProfileName(event.target.value)}
                                placeholder="Ex. Plaque commandes IAM"
                            />
                        </label>
                        <div className="import-profile-bar__actions">
                            <button
                                type="button"
                                className="import-btn import-btn-secondary"
                                disabled={savingProfile || mappingRows.length === 0}
                                onClick={saveImportProfile}
                            >
                                {savingProfile ? "Enregistrement…" : selectedProfile ? "Mettre à jour" : "Enregistrer"}
                            </button>
                            {selectedProfile ? (
                                <button
                                    type="button"
                                    className="import-btn import-btn-cancel"
                                    disabled={savingProfile}
                                    onClick={deleteImportProfile}
                                >
                                    Supprimer
                                </button>
                            ) : null}
                        </div>
                    </section>

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

                                <div className="import-planning-result">
                                    <strong>Destination planning</strong>
                                    {Object.entries(confirmationResult.planning?.dates || {}).map(([date, count]) => (
                                        <span key={date}>{date} · {count} intervention(s)</span>
                                    ))}
                                    {Number(confirmationResult.planning?.unscheduled || 0) > 0 ? (
                                        <span className="import-planning-result__warning">
                                            Sans date · {confirmationResult.planning.unscheduled} intervention(s). Elles sont enregistrées mais ne peuvent pas apparaître dans une journée tant qu’elles ne sont pas planifiées.
                                        </span>
                                    ) : null}
                                    {Number(confirmationResult.ignored || 0) > 0 ? (
                                        <span className="import-planning-result__warning">
                                            {confirmationResult.ignored} doublon(s) ignoré(s). Pour compléter les interventions déjà présentes, sélectionnez le mode « Mettre à jour » puis confirmez de nouveau.
                                        </span>
                                    ) : null}
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
                                    (result.info?.mapping_diagnostics || []).length > 0
                                ) ? (
                                    <div className="import-preview-card">
                                        <h3>Comprendre et adapter le fichier</h3>
                                        <p>
                                            Vérifiez la ligne d’en-tête et chaque association. Les corrections manuelles sont prioritaires à la prochaine analyse ; aucune valeur n’est inventée.
                                        </p>
                                        <div className="import-header-row-grid">
                                            {results.flatMap((result) =>
                                                (result.info?.mapping_diagnostics || []).map((sheet) => ({ result, sheet }))
                                            ).map(({ result, sheet }) => {
                                                const fileName = result.file?.name || result.filename || "Fichier";
                                                const key = getScopedImportKey(result.file, sheet.sheet);
                                                const candidates = sheet.header_candidates || [];
                                                const currentRow = headerRowMappings[key]
                                                    ?? selectedProfile?.header_row_overrides?.[sheet.sheet]
                                                    ?? sheet.header_row
                                                    ?? "";
                                                const rows = candidates.some((candidate) => candidate.row === currentRow)
                                                    ? candidates
                                                    : [{ row: currentRow, values: sheet.headers || [] }, ...candidates];
                                                return (
                                                    <label key={key}>
                                                        <span>{fileName} · {sheet.sheet}</span>
                                                        <select
                                                            value={currentRow}
                                                            onChange={(event) => setHeaderRowMappings((current) => ({
                                                                ...current,
                                                                [key]: Number(event.target.value),
                                                            }))}
                                                        >
                                                            {rows.filter((candidate) => candidate.row).map((candidate) => (
                                                                <option key={candidate.row} value={candidate.row}>
                                                                    Ligne {candidate.row} · {(candidate.values || []).slice(0, 4).join(" | ")}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <small>
                                                            Détection {sheet.header_detection === "manual" ? "confirmée" : "automatique"} · confiance {sheet.header_confidence || "faible"}
                                                        </small>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                        <div className="import-mapping-grid">
                                            {mappingRows.map((match) => {
                                                const hasOverride = Object.prototype.hasOwnProperty.call(
                                                    headerMappings,
                                                    match.key,
                                                );
                                                const value = hasOverride
                                                    ? headerMappings[match.key] ?? ""
                                                    : selectedProfile?.column_overrides?.[match.header]
                                                        ?? match.field
                                                        ?? "";
                                                return (
                                                    <label key={match.key}>
                                                        <span>{match.fileName} · {match.header}</span>
                                                        <select
                                                            value={value}
                                                            onChange={(event) => setHeaderMappings((current) => ({
                                                                ...current,
                                                                [match.key]: event.target.value || null,
                                                            }))}
                                                        >
                                                            <option value="">Ignorer</option>
                                                            {canonicalFields.map((field) => (
                                                                <option key={field} value={field}>
                                                                    {canonicalFieldLabels[field] || field}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <small>
                                                            {getMappingMethodLabel(match)}
                                                        </small>
                                                    </label>
                                                );
                                            })}
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
