import { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/apple";
import { sectionProgressLabel } from "./readingModel";
import type { CadernoVivoState } from "./useCadernoVivo";

/**
 * Coluna esquerda do leitor: documentos importados + sumário da seção atual.
 * Fixa no desktop; some no mobile (lá o sumário vira um seletor no topo).
 */
export function DocumentRail({
  caderno,
  onImport,
}: {
  caderno: CadernoVivoState;
  onImport: () => void;
}) {
  const [tocOpen, setTocOpen] = useState(true);
  const { docs, doc, docId, sectionIndex, sections } = caderno;
  const progress = sections.length
    ? ((sectionIndex + 1) / sections.length) * 100
    : 0;

  return (
    <aside
      data-testid="document-rail"
      className="flex min-h-0 flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]"
    >
      <section>
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="apple-label">Documentos</span>
          <button
            type="button"
            onClick={onImport}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            {caderno.importPdf.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FileText className="h-3 w-3" />
            )}
            Importar
          </button>
        </div>

        <div className="mt-1.5 space-y-1">
          {docs.length === 0 && (
            <p className="px-1 text-[11.5px] leading-4 text-muted-foreground">
              Nenhum PDF ainda. Importe um material seu para ler em seções.
            </p>
          )}
          {docs.map((item) => {
            const active = docId === item.id;
            return (
              <div
                key={item.id}
                className={cn(
                  "group flex items-center gap-1.5 rounded-[9px] border px-2 py-1.5 transition-colors",
                  active
                    ? "border-[var(--primary-border)] bg-[var(--primary-bg-subtle)]"
                    : "border-transparent hover:bg-secondary/50",
                )}
              >
                <button
                  type="button"
                  onClick={() => caderno.selectDoc(item.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-[12px] font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="truncate text-[10.5px] text-muted-foreground">
                    {item.pages} páginas · {item.sections} seções
                  </p>
                </button>
                <button
                  type="button"
                  aria-label={`Remover ${item.title}`}
                  onClick={() => caderno.removeDoc.mutate({ docId: item.id })}
                  className="shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-100 transition-colors hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {doc && sections.length > 0 && (
        <section className="min-h-0 flex flex-1 flex-col">
          <button
            type="button"
            onClick={() => setTocOpen((value) => !value)}
            aria-expanded={tocOpen}
            className="flex items-center justify-between gap-2 px-1"
          >
            <span className="apple-label">Sumário</span>
            <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
              {sectionProgressLabel(sectionIndex, sections.length)}
              {tocOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </span>
          </button>
          <ProgressBar value={progress} className="mx-1 mt-1.5" />

          {tocOpen && (
            <div className="mt-1.5 min-h-0 flex-1 overflow-y-auto pr-0.5">
              {sections.map((item, index) => {
                const active = index === sectionIndex;
                return (
                  <button
                    key={`${item.title}-${index}`}
                    type="button"
                    onClick={() => caderno.selectSection(index)}
                    className={cn(
                      "flex w-full items-baseline gap-2 rounded-[7px] px-2 py-[5px] text-left transition-colors",
                      active
                        ? "bg-[var(--primary-bg-subtle)] text-foreground"
                        : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
                    )}
                    aria-current={active ? "true" : undefined}
                  >
                    <span className="min-w-0 flex-1 truncate text-[11.5px] leading-4">
                      {index + 1}. {item.title}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums opacity-70">
                      p. {item.startPage}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {docs.length === 0 && (
        <p className="flex items-start gap-1.5 px-1 text-[11px] leading-4 text-muted-foreground">
          <BookOpen className="mt-0.5 h-3 w-3 shrink-0" />O texto é dividido em
          seções automaticamente; cada seção vira uma sessão de estudo.
        </p>
      )}
    </aside>
  );
}

export default DocumentRail;
