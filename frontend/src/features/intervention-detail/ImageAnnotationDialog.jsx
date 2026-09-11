import { useEffect, useRef, useState } from 'react';

const COLORS = ['#ff4d6d', '#ffd166', '#34d399', '#4b8dff', '#ffffff'];

export default function ImageAnnotationDialog({
  blob,
  title,
  onCancel,
  onSave,
}) {
  const canvasRef = useRef(null);
  const undoRef = useRef([]);
  const drawingRef = useRef(false);
  const [color, setColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(8);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!blob) return undefined;
    const url = window.URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const scale = Math.min(1, 2200 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      undoRef.current = [];
      setReady(true);
    };
    image.src = url;
    return () => window.URL.revokeObjectURL(url);
  }, [blob]);

  const point = (event) => {
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  };

  const beginStroke = (event) => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    undoRef.current = [
      ...undoRef.current.slice(-11),
      context.getImageData(0, 0, canvas.width, canvas.height),
    ];
    const start = point(event);
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(start.x + 0.01, start.y + 0.01);
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke();
  };

  const draw = (event) => {
    if (!drawingRef.current) return;
    const context = canvasRef.current.getContext('2d');
    const next = point(event);
    context.lineTo(next.x, next.y);
    context.stroke();
  };

  const endStroke = (event) => {
    drawingRef.current = false;
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const undo = () => {
    const snapshot = undoRef.current.pop();
    const canvas = canvasRef.current;
    if (!snapshot || !canvas) return;
    canvas.getContext('2d').putImageData(snapshot, 0, 0);
  };

  const save = async () => {
    if (!canvasRef.current || saving) return;
    setSaving(true);
    const annotated = await new Promise((resolve) => {
      canvasRef.current.toBlob(resolve, 'image/png', 0.96);
    });
    if (annotated) await onSave(annotated);
    setSaving(false);
  };

  return (
    <div className="bv-annotation-backdrop" role="dialog" aria-modal="true">
      <section className="bv-annotation-dialog">
        <header>
          <div>
            <span>Annotation non destructive</span>
            <h2>{title || 'Annoter la pièce'}</h2>
          </div>
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            Fermer
          </button>
        </header>

        <div className="bv-annotation-toolbar">
          <div className="bv-annotation-colors" aria-label="Couleur du trait">
            {COLORS.map((item) => (
              <button
                key={item}
                type="button"
                aria-label={`Couleur ${item}`}
                aria-pressed={color === item}
                style={{ backgroundColor: item }}
                onClick={() => setColor(item)}
              />
            ))}
          </div>
          <label>
            Épaisseur
            <input
              type="range"
              min="3"
              max="24"
              value={lineWidth}
              onChange={(event) => setLineWidth(Number(event.target.value))}
            />
          </label>
          <button type="button" className="btn btn--secondary" onClick={undo}>
            Annuler le dernier trait
          </button>
        </div>

        <div className="bv-annotation-stage">
          {!ready ? <span>Préparation de l’image…</span> : null}
          <canvas
            ref={canvasRef}
            onPointerDown={beginStroke}
            onPointerMove={draw}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
          />
        </div>

        <footer>
          <p>L’original est conservé. GoVector crée une nouvelle version attribuée.</p>
          <button type="button" className="btn btn--primary" disabled={!ready || saving} onClick={save}>
            {saving ? 'Enregistrement…' : 'Partager l’annotation'}
          </button>
        </footer>
      </section>
    </div>
  );
}
