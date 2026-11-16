import { useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  ListChecks,
  Target,
} from "lucide-react";

type SessionRow = {
  date: string;
  hourStart: number;
  durationMin: number;
  accuracy: number;
  disciplineId?: number;
  startedAt?: string;
  endedAt?: string;
  topicId?: number;
  topicName?: string;
  blockId?: string;
  questions?: number;
  correct?: number;
  revisionCompleted?: boolean;
};

const WINDOW_DAYS = 7;

/** Data de início da sessão, local, ou null quando o registro é inválido. */
function sessionDate(session: SessionRow): Date | null {
  const raw = session.startedAt ? new Date(session.startedAt) : null;
  if (raw && !Number.isNaN(raw.getTime())) return raw;
  const fromDate =
    session.date && /^\d{4}-\d{2}-\d{2}$/.test(session.date)
      ? new Date(`${session.date}T00:00:00`)
      : null;
  return fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : null;
}

/** "2026-11-15" + 14 -> "15/11 · 14h" — sem depender de locale do ambiente. */
function formatWhen(session: SessionRow): string {
  const parsed = sessionDate(session);
  const day = parsed
    ? `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}`
    : session.date;
  const hour = Number.isFinite(session.hourStart)
    ? `${String(session.hourStart).padStart(2, "0")}h`
    : "";
  return hour ? `${day} · ${hour}` : day;
}

function accuracyPct(accuracy: number): number {
  return Math.round(Math.max(0, Math.min(1, accuracy)) * 100);
}

export default function Sessions() {
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.study.recentSessions.useQuery({ limit: 30 });

  const sessions = useMemo<SessionRow[]>(
    () => (Array.isArray(data) ? (data as SessionRow[]) : []),
    [data],
  );

  const summary = useMemo(() => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (WINDOW_DAYS - 1));

    const recent = sessions.filter((session) => {
      const parsed = sessionDate(session);
      return parsed ? parsed.getTime() >= since.getTime() : false;
    });

    const withAccuracy = recent.filter(
      (session) =>
        typeof session.accuracy === "number" &&
        Number.isFinite(session.accuracy),
    );
    const accuracySum = withAccuracy.reduce(
      (sum, session) => sum + session.accuracy,
      0,
    );

    return {
      count: recent.length,
      minutes: Math.round(
        recent.reduce((sum, session) => sum + (session.durationMin || 0), 0),
      ),
      accuracy: withAccuracy.length
        ? Math.round((accuracySum / withAccuracy.length) * 100)
        : 0,
      questions: recent.reduce(
        (sum, session) => sum + (session.questions || 0),
        0,
      ),
    };
  }, [sessions]);

  const stats = [
    {
      label: "Sessões",
      value: String(summary.count),
      icon: CalendarDays,
      hint: "últimos 7 dias",
    },
    {
      label: "Minutos",
      value: String(summary.minutes),
      icon: Clock,
      hint: "tempo estudado",
    },
    {
      label: "Acurácia",
      value: `${summary.accuracy}%`,
      icon: Target,
      hint: "média do período",
    },
    {
      label: "Questões",
      value: String(summary.questions),
      icon: ListChecks,
      hint: "respondidas",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 pb-20">
      <PageHeader
        eyebrow="Histórico"
        title="Sessões"
        description="O que você já executou, com tempo, acertos e revisão — mais recente primeiro."
        actions={
          <Button
            variant="outline"
            className="h-9 rounded-md bg-secondary/50 border-border text-[10px] font-bold uppercase tracking-wider"
            onClick={() => navigate("/plan")}
          >
            Abrir plano
            <ArrowRight size={13} className="ml-2 opacity-60" />
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="soe-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </p>
              <stat.icon
                size={13}
                className="shrink-0 text-muted-foreground/60"
              />
            </div>
            <p className="mt-1 text-[19px] font-semibold leading-none tracking-tight text-foreground">
              {stat.value}
            </p>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              {stat.hint}
            </p>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Últimas sessões
          </h2>
          {sessions.length > 0 && (
            <span className="text-[10px] text-muted-foreground/70">
              {sessions.length} registro{sessions.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex min-h-[160px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="soe-card p-6">
            <div className="flex flex-col items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Nenhuma sessão registrada ainda
                </p>
                <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                  A sessão guiada grava o histórico automaticamente quando você
                  encerra o bloco. Comece pelo plano: o tempo, os acertos e a
                  revisão aparecem aqui depois.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {sessions.slice(0, 30).map((session, index) => {
              const pct = accuracyPct(session.accuracy ?? 0);
              const hasQuestions =
                typeof session.questions === "number" &&
                typeof session.correct === "number";
              return (
                <li
                  key={`${session.date}-${session.hourStart}-${session.blockId ?? index}`}
                  className="soe-card p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {formatWhen(session)}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                        {session.topicName || "Sessão livre"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      {session.revisionCompleted && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-primary">
                          <CheckCircle2 size={10} />
                          Revisão
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5">
                        <Clock size={10} className="opacity-60" />
                        {session.durationMin || 0} min
                      </span>
                      {hasQuestions && (
                        <span className="rounded-md border border-border/60 px-1.5 py-0.5">
                          {session.correct}/{session.questions} acertos
                        </span>
                      )}
                      <span
                        className={
                          pct >= 70
                            ? "rounded-md border border-border/60 px-1.5 py-0.5 font-semibold text-[var(--accent-green)]"
                            : pct >= 50
                              ? "rounded-md border border-border/60 px-1.5 py-0.5 font-semibold text-[var(--accent-amber)]"
                              : "rounded-md border border-border/60 px-1.5 py-0.5 font-semibold text-muted-foreground"
                        }
                      >
                        {pct}%
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
