import { useState, useEffect } from "react";

type FontScale = "sm" | "md" | "lg" | "xl";
const SIZES: FontScale[] = ["sm", "md", "lg", "xl"];
const LABELS: Record<FontScale, string> = { sm: "Pequeno", md: "Normal", lg: "Grande", xl: "Maior" };

function getStored(): FontScale {
  return (localStorage.getItem("soe_font") as FontScale) || "md";
}

function apply(scale: FontScale) {
  document.documentElement.setAttribute("data-font", scale);
  localStorage.setItem("soe_font", scale);
}

export function useFontScale() {
  useEffect(() => { apply(getStored()); }, []);
}

export function FontSizeControl() {
  const [scale, setScale] = useState<FontScale>(getStored);

  const set = (s: FontScale) => {
    setScale(s);
    apply(s);
  };

  const decrease = () => {
    const i = SIZES.indexOf(scale);
    if (i > 0) set(SIZES[i - 1]);
  };

  const increase = () => {
    const i = SIZES.indexOf(scale);
    if (i < SIZES.length - 1) set(SIZES[i + 1]);
  };

  const canDecrease = SIZES.indexOf(scale) > 0;
  const canIncrease = SIZES.indexOf(scale) < SIZES.length - 1;

  return (
    <div className="flex items-center gap-0.5" title={`Tamanho do texto: ${LABELS[scale]}`}>
      <button
        onClick={decrease}
        disabled={!canDecrease}
        className="p-1.5 rounded-lg hover:opacity-70 transition-opacity disabled:opacity-25"
        style={{ color: "var(--muted-text)" }}
        title="Diminuir texto"
      >
        <span className="font-bold leading-none" style={{ fontSize: "11px" }}>A</span>
      </button>
      <button
        onClick={increase}
        disabled={!canIncrease}
        className="p-1.5 rounded-lg hover:opacity-70 transition-opacity disabled:opacity-25"
        style={{ color: "var(--muted-text)" }}
        title="Aumentar texto"
      >
        <span className="font-bold leading-none" style={{ fontSize: "15px" }}>A</span>
      </button>
    </div>
  );
}
