import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ClipboardCheck, Mic, Plus, Trash2, Trophy } from "lucide-react";

type SpecialStage = {
  id: string;
  type: "oral" | "titulos";
  title: string;
  status: "pendente" | "em_preparacao" | "concluido";
  score?: number;
  notes?: string;
  updatedAt: string;
};

const STATUS_LABEL: Record<SpecialStage["status"], string> = {
  pendente: "Pendente",
  em_preparacao: "Em preparação",
  concluido: "Concluído",
};

export default function SpecialStages() {
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const utils = trpc.useUtils();
  const updateSettings = trpc.auth.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Fase especial atualizada.");
      utils.dashboard.getStats.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const [stages, setStages] = useState<SpecialStage[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"oral" | "titulos">("oral");

  useEffect(() => {
    const saved = (stats?.settings as any)?.specialStages;
    setStages(Array.isArray(saved) ? saved : []);
  }, [stats?.settings]);

  const persist = (next: SpecialStage[]) => {
    setStages(next);
    updateSettings.mutate({ specialStages: next } as any);
  };

  const addStage = () => {
    if (!title.trim()) return toast.error("Dê um nome para a fase.");
    persist([
      ...stages,
      {
        id: `stage-${Date.now()}`,
        type,
        title: title.trim(),
        status: "pendente",
        updatedAt: new Date().toISOString(),
      },
    ]);
    setTitle("");
  };

  const patchStage = (id: string, patch: Partial<SpecialStage>) => {
    persist(
      stages.map((stage) =>
        stage.id === id
          ? { ...stage, ...patch, updatedAt: new Date().toISOString() }
          : stage,
      ),
    );
  };

  const summary = useMemo(
    () => ({
      total: stages.length,
      done: stages.filter((stage) => stage.status === "concluido").length,
      oral: stages.filter((stage) => stage.type === "oral").length,
      scores: stages
        .map((stage) => stage.score)
        .filter((score): score is number => typeof score === "number"),
    }),
    [stages],
  );

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        eyebrow="Fases especiais"
        title="Oral e títulos"
        description="Prepare as etapas que não são questões objetivas: prova oral, defesa de títulos e documentos."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Fases" value={summary.total} icon={ClipboardCheck} />
        <StatCard
          label="Concluídas"
          value={summary.done}
          sub={`${summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0}% do total`}
          icon={Trophy}
          color="var(--accent-green)"
        />
        <StatCard label="Orais" value={summary.oral} icon={Mic} />
        <StatCard
          label="Nota média"
          value={
            summary.scores.length > 0
              ? (
                  summary.scores.reduce((sum, score) => sum + score, 0) /
                  summary.scores.length
                ).toFixed(1)
              : "—"
          }
          icon={Trophy}
          color="var(--accent-amber)"
        />
      </div>

      <div className="soe-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex: Prova oral — sustentação de tese"
            className="h-10 flex-1 rounded-md border border-border bg-secondary/30 px-3 text-sm outline-none focus:border-primary"
          />
          <select
            value={type}
            onChange={(event) =>
              setType(event.target.value as "oral" | "titulos")
            }
            className="h-10 rounded-md border border-border bg-secondary/30 px-3 text-xs font-bold"
          >
            <option value="oral">Prova oral</option>
            <option value="titulos">Títulos</option>
          </select>
          <Button onClick={addStage} className="h-10">
            <Plus className="mr-2 h-4 w-4" /> Adicionar
          </Button>
        </div>
      </div>

      {stages.length === 0 ? (
        <div className="soe-card p-10 text-center">
          <Mic className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-30" />
          <p className="text-sm font-semibold">
            Nenhuma fase especial cadastrada.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use para concursos com prova oral, arguição, defesa de títulos ou
            entrega de documentos.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {stages.map((stage) => (
            <div key={stage.id} className="soe-card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      {stage.type === "oral" ? "Oral" : "Títulos"}
                    </span>
                    <span className="text-sm font-semibold">{stage.title}</span>
                  </div>
                  <textarea
                    value={stage.notes || ""}
                    onChange={(event) =>
                      patchStage(stage.id, { notes: event.target.value })
                    }
                    placeholder="Roteiro, documentos, pontos a treinar..."
                    rows={2}
                    className="w-full resize-none rounded-md border border-border bg-secondary/20 p-3 text-xs outline-none focus:border-primary"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <select
                    value={stage.status}
                    onChange={(event) =>
                      patchStage(stage.id, {
                        status: event.target.value as SpecialStage["status"],
                      })
                    }
                    className="h-9 rounded-md border border-border bg-secondary/30 px-2 text-[10px] font-bold"
                  >
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={stage.score ?? ""}
                    onChange={(event) =>
                      patchStage(stage.id, {
                        score: event.target.value
                          ? Number(event.target.value)
                          : undefined,
                      })
                    }
                    placeholder="Nota"
                    className="h-9 w-20 rounded-md border border-border bg-secondary/30 px-2 text-xs"
                  />
                  <button
                    onClick={() =>
                      persist(stages.filter((item) => item.id !== stage.id))
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                    title="Remover"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
