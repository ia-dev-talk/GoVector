import { useState } from "react";

export default function ExcelDropZone() {

    const [drag,setDrag]=useState(false);

    return (

        <div

            onDragOver={(e)=>{
                e.preventDefault();
                setDrag(true);
            }}

            onDragLeave={()=>{
                setDrag(false);
            }}

            onDrop={(e)=>{

                e.preventDefault();

                setDrag(false);

                e.dataTransfer.files[0];

            }}

            className={
                drag
                ? "excel-drop drag"
                : "excel-drop"
            }

        >

            📄

            <h2>

                Déposez un fichier Excel

            </h2>

            <p>

                IAM • Orange • Inwi

            </p>

        </div>

    )

}
