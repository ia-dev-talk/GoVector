export default function ImportPreview({ file }) {

    if (!file) {

        return (

            <div className="panel">

                <h3>
                    Aperçu
                </h3>

                <div className="empty">

                    Aucun aperçu disponible.

                </div>

            </div>

        );

    }

    return (

        <div className="panel">

            <h3>

                Aperçu du tableau

            </h3>

            <div className="preview-placeholder">

                📊

                <br />

                Le contenu Excel apparaîtra ici après lecture.

            </div>

        </div>

    );

}