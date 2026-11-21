import { useEffect, useState, type JSX, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type MicroWorld = {
  id: string;
  title: string;
  html: string; // documento HTML completo, autocontido, SEM dependências externas
  controls: string[]; // rótulos dos controles que o artefato expõe
  challenges: string[]; // 3 desafios verificáveis manualmente
  limits: string[]; // o que o modelo ignora
};

const FRAME_HEIGHT = 420;

type InfoBlockProps = {
  heading: string;
  items: string[];
  ordered?: boolean;
};

/**
 * Bloco de metadados do micro-mundo. Some por completo quando não há itens,
 * para não deixar títulos vazios no rodapé.
 */
function InfoBlock({ heading, items, ordered = false }: InfoBlockProps) {
  if (items.length === 0) return null;

  const listClassName =
    "space-y-1 pl-4 text-[13px] leading-snug text-muted-foreground marker:text-primary/60";
  const content = items.map((item, index) => (
    <li key={`${heading}-${index}-${item}`}>{item}</li>
  ));

  return (
    <section className="space-y-1.5" data-testid={`micro-world-${heading}`}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
        {heading}
      </h3>
      {ordered ? (
        <ol className={cn(listClassName, "list-decimal")}>{content}</ol>
      ) : (
        <ul className={cn(listClassName, "list-disc")}>{content}</ul>
      )}
    </section>
  );
}

/**
 * Renderiza um micro-mundo gerado por IA dentro de um iframe isolado.
 *
 * Segurança: `sandbox="allow-scripts"` e NUNCA `allow-same-origin` — o artefato
 * roda em origem opaca, sem acesso a cookies, storage ou ao DOM do SOE.
 * Nada de `dangerouslySetInnerHTML`: o HTML só entra via `srcDoc`.
 */
export function SandboxFrame({
  world,
  actions,
  frameKey,
  kicker,
  height = FRAME_HEIGHT,
}: {
  world: MicroWorld;
  /** Controles do app (reiniciar, marcar como estudado...) no cabeçalho. */
  actions?: ReactNode;
  /** Trocar a chave recarrega o iframe (reiniciar a animação). */
  frameKey?: string | number;
  /** Linha de apoio abaixo do título. */
  kicker?: string;
  /** Altura do iframe no modo normal (a aula pede mais que o micro-mundo). */
  height?: number;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const hasDetails =
    world.controls.length > 0 ||
    world.challenges.length > 0 ||
    world.limits.length > 0;

  // Em tela cheia: trava o scroll do app e permite sair com Esc.
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [expanded]);

  return (
    <div
      data-testid="sandbox-frame"
      data-world-id={world.id}
      className={cn(
        "soe-card flex flex-col overflow-hidden",
        expanded
          ? "fixed inset-0 z-[80] gap-3 rounded-none border-0 bg-background p-3 sm:p-4"
          : "gap-3 p-4",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight">
            {world.title}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {kicker ||
              "Micro-mundo isolado · apenas scripts, sem acesso ao app"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? "Fechar tela cheia" : "Abrir em tela cheia"}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {expanded ? (
              <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{expanded ? "Fechar" : "Abrir em tela cheia"}</span>
          </button>
        </div>
      </header>

      <div className={cn("overflow-hidden", expanded && "min-h-0 flex-1")}>
        <iframe
          key={frameKey ?? world.id}
          title={world.title}
          aria-label={`Micro-mundo interativo: ${world.title}`}
          srcDoc={world.html}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          className={cn(
            "w-full bg-white",
            expanded
              ? "h-full rounded-md border-0"
              : "rounded-md border border-border",
          )}
          style={expanded ? undefined : { height }}
        />
      </div>

      {hasDetails && (
        <footer className="grid gap-4 border-t border-border pt-3 sm:grid-cols-3">
          <InfoBlock heading="Controles" items={world.controls} />
          <InfoBlock heading="Desafios" items={world.challenges} ordered />
          <InfoBlock heading="Limites deste modelo" items={world.limits} />
        </footer>
      )}
    </div>
  );
}

export default SandboxFrame;
