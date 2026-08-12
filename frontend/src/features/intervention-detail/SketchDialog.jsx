import { useEffect, useRef, useState } from 'react';

const COLORS = ['#172033', '#ff4d6d', '#f6b84b', '#34d399', '#4b8dff'];
const WIDTH = 1600;
const HEIGHT = 1000;

function paintGrid(context) {
  context.save();
  context.strokeStyle = '#dce5f1';
  context.lineWidth = 1;
  for (let x = 100; x < WIDTH; x += 100) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, HEIGHT);
    context.stroke();
  }
  for (let y = 100; y < HEIGHT; y += 100) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(WIDTH, y);
    context.stroke();
  }
  context.restore();
}

function resetCanvas(canvas, withGrid) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#f8fafd';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  if (withGrid) paintGrid(context);
}

export default function SketchDialog({
  title = 'Croquis terrain',
  onCancel,
  onSave,
}) {
  const canvasRef = useRef(null);
  const undoRef = useRef([]);
  const drawingRef = useRef(false);
  const [color, setColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(8);
  const [withGrid, setWithGrid] = useState(true);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (canvasRef.current) resetCanvas(canvasRef.current, withGrid);
    undoRef.current = [];
    setHasDrawing(false);
  }, [withGrid]);

  const point = (event) => {
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  };

  const beginStroke = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    undoRef.current = [
      ...undoRef.current.slice(-14),
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
    setHasDrawing(true);
  };

  const draw = (event) => {
    if (!drawingRef.current || !canvasRef.current) return;
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
    setHasDrawing(undoRef.current.length > 0);
  };

  const clear = () => {
    if (!canvasRef.current) return;
    resetCanvas(canvasRef.current, withGrid);
    undoRef.current = [];
    setHasDrawing(false);
  };

  const save = async () => {
    if (!canvasRef.current || !hasDrawing || saving) return;
    setSaving(true);
    const blob = await new Promise((resolve) => {
      canvasRef.current.toBlob(resolve, 'image/png', 0.96);
    });
    if (blob) await onSave(blob, { withGrid });
    setSaving(false);
  };

  return (
    <div className="bv-annotation-backdrop" role="dialog" aria-modal="true">
      <section className="bv-annotation-dialog">
        <header>
          <div>
            <span>Preuve graphique BlueVector</span>
            <h2>{title}</h2>
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
          <label>
            <input
              type="checkbox"
              checked={withGrid}
              onChange={(event) => setWithGrid(event.target.checked)}
            />
            Grille
          </label>
          <button type="button" className="btn btn--secondary" onClick={undo}>
            Annuler le dernier trait
          </button>
          <button type="button" className="btn btn--secondary" onClick={clear}>
            Effacer
          </button>
        </div>

        <div className="bv-annotation-stage">
          <canvas
            ref={canvasRef}
            onPointerDown={beginStroke}
            onPointerMove={draw}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
          />
        </div>

        <footer>
          <p>
            Le croquis est enregistré comme une pièce distincte et reste rattaché à l’intervention.
          </p>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!hasDrawing || saving}
            onClick={save}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer le croquis'}
          </button>
        </footer>
      </section>
    </div>
  );
}
