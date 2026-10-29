import { useMemo, useState } from "react";
import { CheckCircle2, FileUp, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface CadernoRow {
  disciplina: string;
  assunto: string;
  acertos: number;
  erros: number;
}

/** Aceita linhas separadas por TAB, ";" ou "|": Disciplina; Assunto; Acertos; Erros */
function parseRows(text: string): CadernoRow[] {
  const rows: CadernoRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line
      .split(/\t|\s*;\s*|\s*\|\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 4) continue;

    const erros = Number(parts[parts.length - 1].replace(/[^\d]/g, ""));
    const acertos = Number(parts[parts.length - 2].replace(/[^\d]/g, ""));
    if (!Number.isFinite(acertos) || !Number.isFinite(erros)) continue;
    if (acertos === 0 && erros === 0) continue;

    const disciplina = parts[0];
    const assunto = parts.slice(1, parts.length - 2).join(" · ");
    if (!disciplina || !assunto) continue;
    rows.push({ disciplina, assunto, acertos, erros });
  }
  return rows;
}

/**
 * Importação opcional de um caderno do TEC: o usuário cola os números que já
 * vê na tela do TEC. Nada é lido do site automaticamente.
 */
export function TecCadernoImport({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [text, setText] = useState("");
  const rows = useMemo(() => parseRows(text), [text]);
  const utils = trpc.useUtils();

  const importMutation = trpc.study.importCaderno.useMutation({
    onSuccess: (result) => {
      toast.success(
        `${result.imported} tópico(s) importado(s), ${result.skipped} ignorado(s).`,
        { position: "bottom-center" },
      );
      utils.dashboard.getStats.invalidate();
      utils.study.overview.invalidate();
      onOpenChange(false);
      setText("");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[560px] gap-0 overflow-hidden rounded-[16px] border-border !bg-card p-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 duration-200">
        <div className="border-b border-border px-5 py-4">
          <p className="apple-label">Importação opcional</p>
          <DialogTitle className="mt-1 text-[18px] font-semibold tracking-[-0.02em]">
            Importar caderno do TEC
          </DialogTitle>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            Cole aqui as linhas que você já vê no caderno. Nada é lido do site
            automaticamente — é uma importação manual, sem risco para a conta.
          </p>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="rounded-[10px] border border-border bg-secondary/40 px-3 py-2 text-[11.5px] text-muted-foreground">
            Formato por linha:{" "}
            <b className="text-foreground">
              Disciplina; Assunto; Acertos; Erros
            </b>{" "}
            — também aceita TAB (copiar/colar da tabela) ou “|”.
          </div>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={7}
            spellCheck={false}
            placeholder={
              "Direito Administrativo; Controle da Administração; 8; 2\nDireito Constitucional; Direitos Sociais; 5; 3"
            }
            className="w-full resize-y rounded-[10px] border border-border bg-background px-3 py-2 font-mono text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40"
          />

          <div className="flex items-center justify-between text-[11.5px]">
            <span className="text-muted-foreground">
              {rows.length > 0
                ? `${rows.length} linha(s) válida(s) detectada(s)`
                : "Nenhuma linha válida ainda"}
            </span>
            {rows.length > 0 && (
              <span className="text-muted-foreground">
                {rows.reduce((sum, row) => sum + row.acertos, 0)} acertos ·{" "}
                {rows.reduce((sum, row) => sum + row.erros, 0)} erros
              </span>
            )}
          </div>

          {rows.length > 0 && (
            <div className="max-h-[160px] overflow-y-auto rounded-[10px] border border-border">
              {rows.slice(0, 40).map((row, index) => (
                <div
                  key={`${row.disciplina}-${row.assunto}-${index}`}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-[11.5px]",
                    index > 0 && "border-t border-border",
                  )}
                >
                  <CheckCircle2 size={13} className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {row.assunto}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {row.acertos}a / {row.erros}e
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-start gap-2 rounded-[10px] border border-border bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" />
            <span>
              Os totais são absolutos: o SOE só aumenta o que for maior que o
              seu histórico atual. Tópicos com nome diferente do cadastro ficam
              de fora e aparecem como ignorados.
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-[10px] px-3 text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={rows.length === 0 || importMutation.isPending}
            onClick={() => importMutation.mutate({ rows })}
            className="flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <FileUp size={14} />
            {importMutation.isPending ? "Importando…" : "Importar"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
