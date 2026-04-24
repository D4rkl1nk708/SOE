import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Target, CheckCircle2, Clock, ArrowRight, Flame, Edit2 } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Daily Goal Progress ────────────────────────────────────────────────────────
export function DailyGoalWidget() {
  const { data: todayData } = trpc.dashboard.getTodayMinutes.useQuery();
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const utils = trpc.useUtils();
  const updateSettings = trpc.auth.updateSettings.useMutation({
    onSuccess: () => { utils.dashboard.getStats.invalidate(); }
  });

  const [editing, setEditing] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  const todayMinutes = todayData?.minutes ?? 0;
  const goalMinutes = (stats as any)?.settings?.dailyGoalMinutes ?? 240; // default 4h
  const progress = Math.min(100, Math.round((todayMinutes / goalMinutes) * 100));
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
    <div className="rounded-2xl p-4 space-y-3"
      style={{ background: "var(--card-bg, var(--app-bg))", border: `1px solid ${done ? "color-mix(in srgb, var(--accent-green) 40%, var(--card-border))" : "var(--card-border)"}` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4" style={{ color: done ? "var(--accent-green)" : "var(--primary)" }} />
          <span className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>Meta Diária</span>
          {done && <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ background: "color-mix(in srgb, var(--accent-green) 15%, transparent)", color: "var(--accent-green)" }}>
            Atingida!
          </span>}
        </div>
        <button onClick={() => { setGoalInput(String(goalMinutes)); setEditing(e => !e); }}
          className="p-1.5 rounded-lg transition-all hover:opacity-60"
          style={{ color: "var(--muted-text)" }}>
          <Edit2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="number"
            min={1}
            value={goalInput}
            onChange={e => setGoalInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSaveGoal()}
            placeholder="Meta em minutos"
            className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}
          />
          <button onClick={handleSaveGoal}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-white"
            style={{ background: "var(--primary)" }}>
            Salvar
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-black" style={{ color: done ? "var(--accent-green)" : "var(--app-fg)" }}>
              {formatMin(todayMinutes)}
            </span>
            <span className="text-sm font-medium" style={{ color: "var(--muted-text)" }}>
              / {formatMin(goalMinutes)}
            </span>
          </div>
          <div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--stat-bg)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${progress}%`,
                  background: done
                    ? "var(--accent-green)"
                    : progress >= 75 ? "var(--primary)"
                    : progress >= 50 ? "var(--accent-amber)"
                    : "var(--primary)",
                }}
              />
            </div>
            <p className="text-xs mt-1.5" style={{ color: "var(--muted-text)" }}>
              {done
                ? `Meta cumprida! ${formatMin(todayMinutes - goalMinutes)} além do objetivo`
                : `Faltam ${formatMin(goalMinutes - todayMinutes)} para atingir a meta`}
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

  // Get due revisions from stats
  const allTopics = (stats?.disciplines ?? []).flatMap((d: any) =>
    (d.topics ?? []).map((t: any) => ({ ...t, disciplineName: d.name, disciplineColor: d.color }))
  );
  const todayRevisions = allTopics.filter((t: any) =>
    t.revisions?.some((r: any) => !r.completed && r.scheduledDate <= todayStr)
  );

  if (todayRevisions.length === 0) return null;

  return (
    <div className="rounded-2xl p-4 space-y-3"
      style={{
        background: "color-mix(in srgb, var(--accent-amber) 6%, var(--card-bg, var(--app-bg)))",
        border: "1px solid color-mix(in srgb, var(--accent-amber) 25%, var(--card-border))",
      }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" style={{ color: "var(--accent-amber)" }} />
          <span className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>Revisar Hoje</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: "var(--accent-amber)", color: "white" }}>
            {todayRevisions.length}
          </span>
        </div>
        <Link href="/revisions" className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent-amber)" }}>
            Ver todas <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {todayRevisions.slice(0, 5).map((t: any) => (
          <div key={t.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
            style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.disciplineColor }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: "var(--app-fg)" }}>{t.name}</p>
              <p className="text-[10px]" style={{ color: "var(--muted-text)" }}>{t.disciplineName}</p>
            </div>
            <Clock className="h-3 w-3 shrink-0" style={{ color: "var(--accent-amber)" }} />
          </div>
        ))}
        {todayRevisions.length > 5 && (
          <p className="text-xs text-center py-1" style={{ color: "var(--muted-text)" }}>
            + {todayRevisions.length - 5} mais...
          </p>
        )}
      </div>
    </div>
  );
}
