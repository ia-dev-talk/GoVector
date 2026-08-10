export default function ImportFileCard({ file }) {

    return (

        <div className="import-file-card">

            <h3>{file.name}</h3>

            <p>
                {(file.size / 1024).toFixed(1)} Ko
            </p>

            <p className="import-file-hint">
                En attente d'analyse
            </p>

        </div>

    );

}
