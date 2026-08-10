import { useRef } from "react";

export default function ImportDropZone({ setFiles }) {

    const input = useRef(null);

    function addFiles(fileList) {

        const incoming = Array.from(fileList);

        setFiles((old) => {

            const existing = new Set(
                old.map(file => `${file.name}-${file.size}`)
            );

            const unique = incoming.filter(
                file => !existing.has(`${file.name}-${file.size}`)
            );

            return [
                ...old,
                ...unique,
            ];
        });

    }

    return (

        <div
            className="excel-drop"
            onClick={() => input.current.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {

                e.preventDefault();

                addFiles(e.dataTransfer.files);

            }}
        >

            <input
                ref={input}
                type="file"
                hidden
                multiple
                accept=".xlsx,.xls,.xlsm,.csv"
                onChange={(e) => {

                    addFiles(e.target.files);

                    e.target.value = "";

                }}
            />

            <div className="excel-drop-icon">
                📄
            </div>

            <h2>
                Déposez vos fichiers Excel
            </h2>

            <p>
                ou cliquez ici pour sélectionner un ou plusieurs fichiers
            </p>

            <small>
                Formats supportés : XLSX • XLS • XLSM • CSV
            </small>

        </div>

    );

}
