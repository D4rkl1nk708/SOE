import { useState, useEffect } from "react";
import { Minus, Plus, RefreshCw } from "lucide-react";

const MIN_ZOOM = 80;
const MAX_ZOOM = 200;
const STEP = 10;

function getStoredZoom(): number {
  const saved = localStorage.getItem("soe_zoom_level");
  return saved ? parseInt(saved, 10) : 100;
}

function applyZoom(level: number) {
  // CSS zoom escala texto, espaçamento e layout juntos. Antes era aplicado
  // apenas no font-size do <html>, o que aumentava o padding mas não o texto
  // em px — daí a distorção em 140%/200%.
  const root = document.documentElement;
  root.style.fontSize = "";
  root.style.zoom = String(level / 100);
  localStorage.setItem("soe_zoom_level", level.toString());
}

export function useFontScale() {
  useEffect(() => {
    applyZoom(getStoredZoom());
  }, []);
}

export function FontSizeControl() {
  const [zoom, setZoom] = useState<number>(getStoredZoom);

  const update = (newZoom: number) => {
    const clamped = Math.min(Math.max(newZoom, MIN_ZOOM), MAX_ZOOM);
    setZoom(clamped);
    applyZoom(clamped);
  };

  const increase = () => update(zoom + STEP);
  const decrease = () => update(zoom - STEP);
  const reset = () => update(100);

  return (
    <div
      className="flex items-center gap-1 bg-secondary/40 border border-border rounded-xl px-2 py-1"
      title={`Zoom do Sistema: ${zoom}%`}
    >
      <button
        onClick={decrease}
        disabled={zoom <= MIN_ZOOM}
        className="p-1 rounded-lg hover:bg-secondary/60 transition-all disabled:opacity-20"
        title="Diminuir texto"
      >
        <Minus size={14} className="opacity-60" />
      </button>

      <button
        onClick={reset}
        className="px-1 min-w-[3rem] text-[10px] font-black tabular-nums opacity-60 hover:opacity-100 transition-opacity"
      >
        {zoom}%
      </button>

      <button
        onClick={increase}
        disabled={zoom >= MAX_ZOOM}
        className="p-1 rounded-lg hover:bg-secondary/60 transition-all disabled:opacity-20"
        title="Aumentar texto"
      >
        <Plus size={14} className="opacity-60" />
      </button>
    </div>
  );
}
