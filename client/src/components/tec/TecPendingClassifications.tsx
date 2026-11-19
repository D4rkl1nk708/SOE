import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HelpCircle, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";

type PendingGroup = {
  tecLabel: string;
  tecDiscipline: string;
  count: number;
  lastAt: string;
  reason?: string;
  suggestion?: {
    disciplineId?: number | null;
    topicId?: number | null;
    createDiscipline?: string;
    createTopic?: string;
    confidence: number;
    reason: string;
  } | null;
  suggestedTopicName?: string;
  suggestedDisciplineName?: string;
};

/**
 * Cartão de pendências de classificação (v6.9.5).
 *
 * O SOE NUNCA cria disciplina/tópico sozinho quando não tem certeza: ele guarda
 * o rótulo do TEC e pergunta. Ao decidir, o rótulo vira alias (as próximas
 * questões do mesmo rótulo resolvem sozinhas) e as tentativas pendentes são
 * reatribuídas retroativamente.
 */
export function TecPendingClassifications() {
  const utils = trpc.useUtils();
  const [topicChoice, setTopicChoice] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState<string | null>(null);
  const [newTopicName, setNewTopicName] = useState("");
  const [newDisciplineId, setNewDisciplineId] = useState<string>("");

  const pending = trpc.tec.pendingClassifications.useQuery(undefined, {
    refetchInterval: 20000,
    staleTime: 5000,
  });
  const { data: disciplinesRaw } = trpc.discipline.list.useQuery();
  const { data: topicsRaw } = trpc.topic.list.useQuery();

  const groups: PendingGroup[] = (pending.data as any)?.groups || [];
  const total = (pending.data as any)?.total || 0;
  const disciplines = (disciplinesRaw as any[]) || [];
  const topics = ((topicsRaw as any)?.topics as any[]) || [];

  const resolve = trpc.tec.resolvePending.useMutation({
    onSuccess: (result: any) => {
      if (result?.ok) {
        toast.success(result.message || "Classificação aplicada.");
        setCreating(null);
        setNewTopicName("");
      } else {
        toast.error(result?.message || "Não foi possível classificar.");
      }
      void utils.tec.pendingClassifications.invalidate();
      void utils.tec.liveActivity.invalidate();
      void utils.topic.list.invalidate();
      void utils.study.masterySnapshot.invalidate();
      void utils.dashboard.getStats.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const disciplineName = useMemo(() => {
    const map = new Map<number, string>();
    for (const discipline of disciplines)
      map.set(discipline.id, discipline.name);
    return map;
  }, [disciplines]);

  if (!total) return null;

  return (
    <div className="soe-card border-amber-500/25 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-amber-500/10 p-2 text-amber-500">
          <HelpCircle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-wider text-amber-600">
            Classificação pendente
          </p>
          <p className="mt-0.5 text-sm font-semibold">
            {total}{" "}
            {total === 1
              ? "questão do TEC aguarda"
              : "questões do TEC aguardam"}{" "}
            classificação
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            O rótulo do TEC não bateu com nenhum tópico seu e o SOE não cria
            nada sozinho. Escolha uma vez: as próximas questões do mesmo rótulo
            entram automaticamente.
          </p>
        </div>
      </div>

      <div className="mt-3 divide-y divide-border">
        {groups.map((group) => {
          const key = group.tecLabel;
          const suggestion = group.suggestion;
          const suggestedTopicId = suggestion?.topicId ?? null;
          const selected = topicChoice[key] || "";
          const busy = resolve.isPending;
          return (
            <div key={key} className="py-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="text-[12.5px] font-medium">{group.tecLabel}</p>
                {group.tecDiscipline && (
                  <span className="text-[10px] text-muted-foreground">
                    Matéria TEC: {group.tecDiscipline}
                  </span>
                )}
                <span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-semibold tabular-nums text-muted-foreground">
                  {group.count}
                </span>
              </div>

              {(group.suggestedTopicName ||
                group.suggestedDisciplineName ||
                suggestion?.createTopic) && (
                <p className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-primary" />
                  {group.suggestedTopicName
                    ? `Sugestão: ${group.suggestedTopicName}${
                        group.suggestedDisciplineName
                          ? ` (${group.suggestedDisciplineName})`
                          : ""
                      }`
                    : suggestion?.createTopic
                      ? `Sugestão: criar tópico "${suggestion.createTopic}"`
                      : `Sugestão: disciplina ${group.suggestedDisciplineName}`}
                  {typeof suggestion?.confidence === "number" && (
                    <span className="tabular-nums">
                      · {Math.round(suggestion.confidence * 100)}%
                    </span>
                  )}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {suggestedTopicId ? (
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={busy}
                    onClick={() =>
                      resolve.mutate({
                        tecLabel: key,
                        action: "assign",
                        topicId: suggestedTopicId,
                      })
                    }
                  >
                    Aceitar sugestão
                  </Button>
                ) : null}

                <select
                  value={selected}
                  onChange={(event) =>
                    setTopicChoice((previous) => ({
                      ...previous,
                      [key]: event.target.value,
                    }))
                  }
                  className="h-8 max-w-[220px] rounded-md border border-border bg-secondary/30 px-2 text-[11px] outline-none focus:border-primary/50"
                >
                  <option value="">Escolher tópico…</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                      {disciplineName.get(topic.disciplineId)
                        ? ` · ${disciplineName.get(topic.disciplineId)}`
                        : ""}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={busy || !selected}
                  onClick={() =>
                    resolve.mutate({
                      tecLabel: key,
                      action: "assign",
                      topicId: Number(selected),
                    })
                  }
                >
                  Usar tópico
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    setCreating(creating === key ? null : key);
                    setNewTopicName(group.tecLabel);
                    if (!newDisciplineId) {
                      const suggested =
                        suggestion?.disciplineId ??
                        (selected ? Number(selected) : null);
                      void suggested;
                    }
                  }}
                >
                  <Plus className="mr-1.5 h-3 w-3" /> Criar tópico
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  disabled={busy}
                  onClick={() =>
                    resolve.mutate({ tecLabel: key, action: "ignore" })
                  }
                >
                  <Trash2 className="mr-1.5 h-3 w-3" /> Ignorar
                </Button>

                {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>

              {creating === key && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md bg-secondary/25 p-2">
                  <input
                    value={newTopicName}
                    onChange={(event) => setNewTopicName(event.target.value)}
                    placeholder="Nome do tópico"
                    className="h-8 min-w-[160px] flex-1 rounded-md border border-border bg-card px-2 text-[11px] outline-none focus:border-primary/50"
                  />
                  <select
                    value={
                      newDisciplineId ||
                      (group.suggestion?.disciplineId
                        ? String(group.suggestion.disciplineId)
                        : "")
                    }
                    onChange={(event) => setNewDisciplineId(event.target.value)}
                    className="h-8 max-w-[200px] rounded-md border border-border bg-card px-2 text-[11px] outline-none focus:border-primary/50"
                  >
                    <option value="">Disciplina…</option>
                    {disciplines.map((discipline: any) => (
                      <option key={discipline.id} value={discipline.id}>
                        {discipline.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={
                      busy ||
                      !newTopicName.trim() ||
                      !(newDisciplineId || group.suggestion?.disciplineId)
                    }
                    onClick={() =>
                      resolve.mutate({
                        tecLabel: key,
                        action: "create",
                        newTopicName: newTopicName.trim(),
                        disciplineId: Number(
                          newDisciplineId || group.suggestion?.disciplineId,
                        ),
                      })
                    }
                  >
                    Criar e classificar
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TecPendingClassifications;
