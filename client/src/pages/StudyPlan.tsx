import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
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

const LENS_META: Record<string, { label: string; color: string }> = {
  base: { label: "Rotina base", color: "var(--accent-blue)" },
  edital: { label: "Edital", color: "var(--primary)" },
  revisao: { label: "Revisão", color: "var(--accent-amber)" },
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
  const { data: errorIntel } = trpc.study.errorPatterns.useQuery();
  const { data: disciplines } = trpc.discipline.list.useQuery();
  const { data: weekly } = trpc.study.weeklyReview.useQuery();

  const plan = data?.plan;
  const coverage = data?.coverage;
  const mastery = data?.mastery;
  const base = data?.base;
  const calibration = data?.calibration;

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
      <PageHeader
        eyebrow="Decisão"
        title="Plano de aprovação"
        description="Cobertura do edital, domínio real e o que estudar agora."
        actions={
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
        }
      />

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
          <StatCard
            key={item.label}
            label={item.label}
            value={item.value}
            sub={item.sub}
            icon={item.icon}
            color={item.color}
          />
        ))}
      </div>

      <div className="soe-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Layers className="w-4 h-4 text-primary" />
            <h2 className="text-[10px] font-bold uppercase tracking-widest">
              Base × Edital
            </h2>
          </div>
          <span className="text-[9px] font-medium text-muted-foreground">
            métricas globais, sem duplicar estudo
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border/70 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Rotina base
              </span>
              <span className="text-[10px] font-bold tabular-nums">
                {base?.coveragePct ?? 0}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-[var(--accent-blue)]"
                style={{ width: `${Math.min(100, base?.coveragePct ?? 0)}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {base?.studied ?? 0}/{base?.topics ?? 0} tópicos com contato ·{" "}
              {base?.readiness ?? 0}% de prontidão
            </p>
            {!base?.configured && (
              <button
                onClick={() => navigate("/profile#settings")}
                className="mt-2 text-[9px] font-bold uppercase tracking-wider text-primary"
              >
                Configurar rotina base
              </button>
            )}
          </div>
          <div className="rounded-lg border border-border/70 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Edital
              </span>
              <span className="text-[10px] font-bold tabular-nums">
                {coverage?.weightedCoveragePct ?? 0}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${Math.min(100, coverage?.weightedCoveragePct ?? 0)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {coverage?.studiedRows ?? 0}/{coverage?.totalRows ?? 0} tópicos
              cobertos · {coverage?.readiness ?? 0}% de prontidão
            </p>
          </div>
        </div>
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
                        {block.lens && LENS_META[block.lens] && (
                          <span
                            className="rounded-full bg-secondary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                            style={{ color: LENS_META[block.lens].color }}
                          >
                            {LENS_META[block.lens].label}
                          </span>
                        )}
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

          <div className="soe-card p-6">
            <div className="flex items-center gap-3 mb-5">
              <Target className="w-4 h-4 text-accent-amber" />
              <h2 className="text-[10px] font-bold uppercase tracking-widest">
                Calibração de confiança
              </h2>
            </div>
            {!calibration?.calibrated ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground opacity-70">
                Marque “chute / acho / certeza” antes de registrar o resultado
                para o SOE detectar overconfidence.
              </p>
            ) : (
              <div className="space-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Brier score</span>
                  <span className="font-bold tabular-nums">
                    {calibration.brier}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Excesso de confiança
                  </span>
                  <span className="font-bold tabular-nums text-accent-red">
                    {calibration.overconfidence}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subconfiança</span>
                  <span className="font-bold tabular-nums text-accent-green">
                    {calibration.underconfidence}
                  </span>
                </div>
                <p className="pt-1 text-[9px] text-muted-foreground">
                  {calibration.calibrated} tentativas calibradas
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="soe-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-accent-amber" />
            <h2 className="text-[10px] font-bold uppercase tracking-widest">
              Padrões de erro
            </h2>
          </div>
          {!errorIntel?.total ? (
            <p className="text-[11px] text-muted-foreground opacity-70">
              Registre erros no TEC ou no treino manual para o SOE encontrar
              padrões.
            </p>
          ) : (
            <div className="space-y-3">
              {errorIntel.byOrigin.slice(0, 4).map((origin: any) => (
                <div key={origin.origin}>
                  <div className="mb-1 flex items-center justify-between text-[10px]">
                    <span className="font-semibold capitalize">
                      {origin.origin === "nao_classificado"
                        ? "Não classificado"
                        : origin.origin}
                    </span>
                    <span className="text-muted-foreground">
                      {origin.count} · {origin.share}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-[var(--accent-amber)]"
                      style={{ width: `${origin.share}%` }}
                    />
                  </div>
                </div>
              ))}
              {errorIntel.topTopics.slice(0, 3).map((topic: any) => (
                <button
                  key={topic.topicId}
                  onClick={() => {
                    sessionStorage.setItem(
                      "qs_prefill",
                      JSON.stringify({
                        topicId: topic.topicId,
                        topicName: topic.topicName,
                        disciplineId: (disciplines as any[])?.find(
                          (discipline) =>
                            discipline.name === topic.disciplineName,
                        )?.id,
                        autoStart: true,
                      }),
                    );
                    navigate("/question-session");
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded border border-border bg-secondary/20 px-2 py-1.5 text-left transition-colors hover:border-primary/30"
                  title="Treinar este padrão de erro"
                >
                  <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                    {topic.count}× {topic.topicName} · {topic.disciplineName}
                  </span>
                  <span className="flex-shrink-0 text-[8px] font-bold uppercase tracking-wider text-primary">
                    Treinar
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="soe-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <Clock className="h-4 w-4 text-accent-green" />
            <h2 className="text-[10px] font-bold uppercase tracking-widest">
              Revisão da semana
            </h2>
          </div>
          {!weekly ? (
            <p className="text-[11px] text-muted-foreground opacity-70">
              Sem dados suficientes nesta semana.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Questões", value: weekly.answered },
                  { label: "Acurácia", value: `${weekly.accuracy}%` },
                  {
                    label: "Tempo",
                    value: `${Math.round(weekly.minutes / 60)}h`,
                  },
                  { label: "Revisões", value: weekly.revisionsCompleted },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-md bg-secondary/30 p-2.5"
                  >
                    <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="text-sm font-semibold tabular-nums">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
              {weekly.wins[0] && (
                <p className="text-[10px] text-accent-green">
                  ✓ {weekly.wins[0]}
                </p>
              )}
              {weekly.risks[0] && (
                <p className="text-[10px] text-accent-red">
                  ! {weekly.risks[0]}
                </p>
              )}
            </div>
          )}
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
