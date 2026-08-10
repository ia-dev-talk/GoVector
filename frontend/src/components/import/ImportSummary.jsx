export default function ImportSummary({ files }) {

    const totalSize = files.reduce(
        (sum, file) => sum + file.size,
        0
    );

    return (

        <div className="import-summary">

            <h3>
                Résumé de l'import
            </h3>

            <div className="import-summary-grid">

                <div className="import-summary-card">

                    <span className="value">
                        {files.length}
                    </span>

                    <span className="label">
                        Fichiers
                    </span>

                </div>

                <div className="import-summary-card">

                    <span className="value">
                        {(totalSize / 1024 / 1024).toFixed(2)} Mo
                    </span>

                    <span className="label">
                        Taille totale
                    </span>

                </div>

            </div>

            {files.length === 0 && (

                <p className="import-empty">

                    Aucun fichier sélectionné.

                </p>

            )}

        </div>

    );

}