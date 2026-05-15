import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Target, CheckCircle2, Clock, ArrowRight, Edit2 } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

// ── Daily Goal Progress ────────────────────────────────────────────────────────
export function DailyGoalWidget() {
  const { data: todayData } = trpc.dashboard.getTodayMinutes.useQuery();
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const utils = trpc.useUtils();
  const updateSettings = trpc.auth.updateSettings.useMutation({
    onSuccess: () => {
      utils.dashboard.getStats.invalidate();
    },
  });

  const [editing, setEditing] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  const todayMinutes = todayData?.minutes ?? 0;
  const goalMinutes = (stats as any)?.settings?.dailyGoalMinutes ?? 240; // default 4h
  const progress = Math.min(
    100,
    Math.round((todayMinutes / goalMinutes) * 100),
  );
  const done = todayMinutes >= goalMinutes;

  const formatMin = (m: number) => {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return h > 0 ? `${h}h${min > 0 ? ` ${min}min` : ""}` : `${min}min`;
  };

  const handleSaveGoal = async () => {
    const val = parseInt(goalInput);
    if (isNaN(val) || val < 1) return;
    await updateSettings.mutateAsync({ dailyGoalMinutes: val });
    setEditing(false);
  };

  return (
    <div
      className="rounded-lg p-4 space-y-3 h-full flex flex-col justify-center bg-card border border-border"
      style={{
        border: done
          ? "1px solid color-mix(in srgb, var(--accent-green) 40%, var(--border))"
          : "1px solid var(--border)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target
            className="h-3.5 w-3.5"
            style={{ color: done ? "var(--accent-green)" : "var(--primary)" }}
          />
          <span className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground opacity-60">
            Meta Diária
          </span>
          {done && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-bold uppercase">
              Atingida
            </span>
          )}
        </div>
        <button
          onClick={() => {
            setGoalInput(String(goalMinutes));
            setEditing((e) => !e);
          }}
          className="p-1 rounded-md transition-all hover:bg-secondary text-muted-foreground opacity-40 hover:opacity-100"
        >
          <Edit2 className="h-3 w-3" />
        </button>
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="number"
            min={1}
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveGoal()}
            placeholder="Minutos"
            className="flex-1 px-3 py-1.5 rounded-md text-xs outline-none bg-secondary border border-border text-foreground"
          />
          <button
            onClick={handleSaveGoal}
            className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground"
          >
            Salvar
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {formatMin(todayMinutes)}
            </span>
            <span className="text-[10px] font-bold text-muted-foreground opacity-30">
              / {formatMin(goalMinutes)}
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="h-1 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${progress}%`,
                  background: done ? "var(--accent-green)" : "var(--primary)",
                }}
              />
            </div>
            <p className="text-[9px] font-semibold text-muted-foreground opacity-60">
              {done
                ? `Objetivo alcançado (+${formatMin(todayMinutes - goalMinutes)})`
                : `Faltam ${formatMin(goalMinutes - todayMinutes)} para concluir`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Today's Revisions Widget ───────────────────────────────────────────────────
export function TodayRevisions() {
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const allTopics = (stats?.disciplineStats ?? []).flatMap((d: any) =>
    (d.topics ?? []).map((t: any) => ({
      ...t,
      disciplineName: d.name,
      disciplineColor: d.color,
    })),
  );
  const todayRevisions = allTopics.filter((t: any) =>
    t.revisions?.some((r: any) => !r.completed && r.scheduledDate <= todayStr),
  );

  if (todayRevisions.length === 0) return null;

  return (
    <div
      className="rounded-lg p-4 space-y-4 bg-card border border-border"
      style={{
        background:
          "color-mix(in srgb, var(--accent-amber) 4%, var(--card-bg))",
        border:
          "1px solid color-mix(in srgb, var(--accent-amber) 20%, var(--border))",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-amber-500" />
          <span className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground opacity-60">
            Revisar Hoje
          </span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white">
            {todayRevisions.length}
          </span>
        </div>
        <Link
          href="/revisions"
          className="text-[9px] font-bold uppercase tracking-wider text-amber-500 hover:opacity-70 transition-opacity flex items-center gap-1"
        >
          Ver todas <ArrowRight size={10} />
        </Link>
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
        {todayRevisions.slice(0, 5).map((t: any) => (
          <div
            key={t.id}
            className="flex items-center gap-3 px-3 py-2 rounded-md bg-secondary/30 border border-border/50"
          >
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: t.disciplineColor }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-foreground truncate">
                {t.name}
              </p>
              <p className="text-[9px] font-medium text-muted-foreground opacity-60 truncate">
                {t.disciplineName}
              </p>
            </div>
            <Clock size={10} className="text-amber-500/50" />
          </div>
        ))}
        {todayRevisions.length > 5 && (
          <p className="text-[9px] text-center font-bold text-muted-foreground opacity-40 pt-1">
            + {todayRevisions.length - 5} OUTROS TEMAS
          </p>
        )}
      </div>
    </div>
  );
}
