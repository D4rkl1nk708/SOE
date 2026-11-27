import type { CadernoVivoState } from "./useCadernoVivo";

/**
 * Micro-recuperação por seção (v6.9.11, B7/4.11).
 *
 * Uma pergunta por seção — nunca por parágrafo — antes de liberar a próxima.
 * Sem IA obrigatória: a pergunta é heurística, do próprio título da seção, e a
 * autoavaliação é do aluno ("acertei / não soube"). Nunca bloqueia para sempre.
 */
export function SectionRecallGate({ caderno }: { caderno: CadernoVivoState }) {
  if (!caderno.recallGate) return null;
  return (
    <div className="space-y-2.5 border-t border-border bg-secondary/20 px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Antes da próxima seção
      </p>
      <p className="text-[13px] font-medium leading-5 text-foreground">
        {caderno.recallQuestion}
      </p>
      <textarea
        rows={2}
        value={caderno.recallText}
        onChange={(event) => caderno.setRecallText(event.target.value)}
        placeholder="Responda de memória, sem reler."
        className="w-full resize-none rounded-[10px] border border-border bg-card px-3 py-2 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-[var(--primary-shadow)]"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => caderno.submitSectionRecall("acertei")}
          disabled={caderno.saveSectionRecall.isPending}
          className="rounded-full border border-[color-mix(in_srgb,var(--accent-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent-green)_10%,transparent)] px-3 py-1.5 text-[11px] font-semibold text-[var(--accent-green)] disabled:opacity-50"
        >
          Acertei
        </button>
        <button
          type="button"
          onClick={() => caderno.submitSectionRecall("nao_soube")}
          disabled={caderno.saveSectionRecall.isPending}
          className="rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground disabled:opacity-50"
        >
          Não soube
        </button>
        <button
          type="button"
          onClick={caderno.cancelRecallGate}
          className="ml-auto text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          Agora não
        </button>
      </div>
    </div>
  );
}
