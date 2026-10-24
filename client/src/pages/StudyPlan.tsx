import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Gauge,
  Layers,
  ListChecks,
  MapPin,
  RotateCcw,
  Target,
  Zap,
} from "lucide-react";

const MINUTE_OPTIONS = [60, 120, 180, 240];

const KIND_META: Record<
  string,
  { label: string; icon: any; color: string; route: string }
> = {
  revisao: {
    label: "Revisão",
    icon: RotateCcw,
    color: "var(--accent-amber)",
    route: "/revisions",
  },
  questoes: {
    label: "Questões",
    icon: ListChecks,
    color: "var(--accent-blue)",
    route: "/question-session",
  },
  estudo: {
    label: "Estudo",
    icon: BookOpen,
    color: "var(--primary)",
    route: "/question-session",
  },
  mapear: {
    label: "Mapear",
    icon: MapPin,
    color: "var(--muted-foreground)",
    route: "/edital",
  },
  revisao_rapida: {
    label: "Recall",
    icon: Zap,
    color: "var(--accent-green)",
    route: "/question-session",
  },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "var(--accent-red)" },
  estudado: { label: "Estudado", color: "var(--accent-amber)" },
  revisar: { label: "Revisar", color: "var(--accent-amber)" },
  dominado: { label: "Dominado", color: "var(--accent-green)" },
  mapear: { label: "Sem correspondência", color: "var(--muted-foreground)" },
};

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h${rest}m` : `${hours}h`;
}

export default function StudyPlan() {
  const [, navigate] = useLocation();
  const [minutes, setMinutes] = useState<number | undefined>(undefined);
  const { data, isLoading, isError, refetch } = trpc.study.overview.useQuery(
    minutes ? { minutes } : undefined,
  );

  const plan = data?.plan;
  const coverage = data?.coverage;
  const mastery = data?.mastery;

  const hasEdital = (coverage?.totalRows || 0) > 0;

  const topPriorities = useMemo(
    () => (coverage?.priorities || []).slice(0, 10),
    [coverage?.priorities],
  );

  const startBlock = (block: any) => {
    if (block.kind === "revisao") {
      navigate("/revisions");
      return;
    }
    if (block.kind === "mapear") {
      navigate("/edital");
      return;
    }
    if (block.topicId) {
      sessionStorage.setItem(
        "qs_prefill",
        JSON.stringify({
          topicId: block.topicId,
          topicName: block.topicName,
          disciplineId: block.disciplineId,
          autoStart: true,
        }),
      );
    }
    navigate("/question-session");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="soe-card p-8 text-center space-y-3">
        <AlertTriangle className="w-6 h-6 mx-auto text-accent-red" />
        <p className="text-sm font-bold">Não foi possível montar seu plano.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full pb-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Plano de aprovação
          </h1>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">
            Cobertura do edital, domínio real e o que estudar agora
          </p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground opacity-50 whitespace-nowrap">
            Tempo hoje
          </span>
          {MINUTE_OPTIONS.map((value) => (
            <button
              key={value}
              onClick={() => setMinutes(value)}
              className={`px-3 py-1.5 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-all ${
                (minutes ?? plan?.dailyMinutes) === value
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {formatMinutes(value)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Cobertura do edital",
            value: `${coverage?.weightedCoveragePct ?? 0}%`,
            sub: `${coverage?.studiedRows ?? 0} de ${coverage?.totalRows ?? 0} tópicos`,
            icon: Layers,
            color: "var(--primary)",
          },
          {
            label: "Prontidão média",
            value: `${coverage?.readiness ?? 0}%`,
            sub: "Domínio ponderado",
            icon: Gauge,
            color: "var(--accent-green)",
          },
          {
            label: "Tópicos frágeis",
            value: coverage?.weakTopics ?? 0,
            sub: "Abaixo de 50% de prontidão",
            icon: AlertTriangle,
            color: "var(--accent-red)",
          },
          {
            label: "Plano de hoje",
            value: formatMinutes(plan?.plannedMinutes ?? 0),
            sub: `de ${plan?.dailyMinutes ?? 0}min disponíveis`,
            icon: Clock,
            color: "var(--accent-amber)",
          },
        ].map((item) => (
          <div key={item.label} className="soe-card p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <item.icon size={14} style={{ color: item.color }} />
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">
                {item.label}
              </span>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-foreground/90">
                {item.value}
              </p>
              <p className="text-[10px] font-semibold text-muted-foreground opacity-50">
                {item.sub}
              </p>
            </div>
          </div>
        ))}
      </div>

      {!hasEdital && (
        <div className="soe-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-accent-amber/30">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-accent-amber flex-shrink-0" />
            <div>
              <p className="text-sm font-bold">
                Seu edital ainda não está no sistema.
              </p>
              <p className="text-[11px] text-muted-foreground">
                Importe o edital verticalizado para o plano priorizar o que
                realmente cai.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/edital")}
          >
            Abrir editais <ArrowRight className="w-3.5 h-3.5 ml-2" />
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 soe-card p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <Target className="w-4 h-4 text-primary" />
              <h2 className="text-[11px] font-bold uppercase tracking-[0.2em]">
                Plano de hoje
              </h2>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground opacity-40">
              {plan?.blocks.length || 0} blocos
            </span>
          </div>

          {!plan?.blocks.length ? (
            <div className="py-10 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-accent-green opacity-40" />
              <p className="text-sm font-bold">Nada urgente para hoje.</p>
              <p className="text-[11px] text-muted-foreground">
                Importe o edital ou registre questões para o plano ficar mais
                preciso.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {plan.blocks.map((block: any) => {
                const meta = KIND_META[block.kind] || KIND_META.estudo;
                const Icon = meta.icon;
                return (
                  <div
                    key={block.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg bg-secondary/10 border border-border/50 hover:border-primary/25 transition-all"
                  >
                    <div
                      className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{
                        background: "var(--secondary)",
                        color: meta.color,
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-[8px] font-black uppercase tracking-widest"
                          style={{ color: meta.color }}
                        >
                          {meta.label}
                        </span>
                        <span className="text-[9px] font-bold text-muted-foreground opacity-40">
                          {block.disciplineName}
                        </span>
                      </div>
                      <p className="text-sm font-bold truncate">
                        {block.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground opacity-60 truncate">
                        {block.reason}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 sm:flex-shrink-0">
                      <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                        {block.minutes}min
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-[9px] font-bold uppercase tracking-wider"
                        onClick={() => startBlock(block)}
                      >
                        Começar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="soe-card p-6">
            <div className="flex items-center gap-3 mb-5">
              <Layers className="w-4 h-4 text-primary" />
              <h2 className="text-[10px] font-bold uppercase tracking-widest">
                Cobertura por disciplina
              </h2>
            </div>
            {!coverage?.disciplines.length ? (
              <p className="text-[11px] text-muted-foreground opacity-60">
                Sem disciplinas do edital mapeadas.
              </p>
            ) : (
              <div className="space-y-4">
                {coverage.disciplines.slice(0, 7).map((discipline: any) => (
                  <div key={discipline.name}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[11px] font-bold truncate">
                        {discipline.name}
                      </span>
                      <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
                        {discipline.studied}/{discipline.rows}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, discipline.weightedCoverage)}%`,
                          background: discipline.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="soe-card p-6">
            <div className="flex items-center gap-3 mb-5">
              <Gauge className="w-4 h-4 text-accent-green" />
              <h2 className="text-[10px] font-bold uppercase tracking-widest">
                Domínio por tópico
              </h2>
            </div>
            {!mastery?.topWeak.length ? (
              <p className="text-[11px] text-muted-foreground opacity-60">
                Registre questões para calcular o domínio.
              </p>
            ) : (
              <div className="space-y-3">
                {mastery.topWeak.slice(0, 5).map((topic: any) => (
                  <div
                    key={topic.topicId}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold truncate">
                        {topic.topicName}
                      </p>
                      <p className="text-[9px] text-muted-foreground opacity-50 truncate">
                        {topic.disciplineName}
                      </p>
                    </div>
                    <span
                      className="text-[10px] font-bold tabular-nums"
                      style={{
                        color:
                          topic.readiness >= 65
                            ? "var(--accent-green)"
                            : topic.readiness >= 45
                              ? "var(--accent-amber)"
                              : "var(--accent-red)",
                      }}
                    >
                      {topic.readiness}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="soe-card p-6">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-accent-amber" />
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em]">
              Prioridades do edital
            </h2>
          </div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground opacity-40">
            Peso × lacuna
          </span>
        </div>
        {!topPriorities.length ? (
          <p className="text-[11px] text-muted-foreground opacity-60">
            Importe o edital para ver as prioridades.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="text-[9px] uppercase tracking-widest text-muted-foreground opacity-50 border-b border-border/50">
                  <th className="py-2 pr-4 font-bold">Tópico</th>
                  <th className="py-2 pr-4 font-bold">Disciplina</th>
                  <th className="py-2 pr-4 font-bold">Status</th>
                  <th className="py-2 pr-4 font-bold">Peso</th>
                  <th className="py-2 font-bold text-right">Prontidão</th>
                </tr>
              </thead>
              <tbody>
                {topPriorities.map((row: any) => {
                  const status =
                    STATUS_META[row.status] || STATUS_META.pendente;
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-border/30 last:border-0"
                    >
                      <td className="py-2.5 pr-4 text-[11px] font-bold max-w-[280px] truncate">
                        {row.topic}
                      </td>
                      <td className="py-2.5 pr-4 text-[10px] text-muted-foreground truncate max-w-[180px]">
                        {row.discipline}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider"
                          style={{ color: status.color }}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-[10px] font-bold tabular-nums">
                        {Math.round(row.weight * 100)}%
                      </td>
                      <td className="py-2.5 text-right">
                        <span className="text-[10px] font-bold tabular-nums">
                          {row.readiness}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
