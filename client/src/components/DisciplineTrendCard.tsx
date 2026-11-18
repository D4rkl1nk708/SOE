import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { openTecBrowser } from "@/lib/openTecBrowser";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

/**
 * Item 2 (v6.9.4): acerto por disciplina nos últimos 7 dias contra os 30 dias
 * anteriores. Seta só aparece com >= 10 tentativas em cada janela; abaixo disso
 * a resposta honesta é "sem dados suficientes".
 */
export function DisciplineTrendCard() {
  const { data, isLoading } = trpc.study.attemptTrends.useQuery();
  const trends = data?.trends ?? [];

  return (
    <section className="soe-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Tendência por disciplina
        </h3>
        <span className="text-[9.5px] text-muted-foreground">
          últimos 7 dias vs 30 dias anteriores
        </span>
      </div>

      {isLoading ? (
        <p className="mt-3 text-[11px] text-muted-foreground">Carregando…</p>
      ) : trends.length === 0 ? (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Sem dados suficientes. O SOE passou a registrar cada resposta com
          horário — a tendência aparece quando houver histórico nos dois
          períodos (mínimo 10 tentativas em cada).
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {trends.map((trend) => (
            <li
              key={trend.disciplineId}
              className="flex items-center justify-between gap-3 rounded-lg bg-secondary/30 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[11.5px] font-medium text-foreground">
                  {trend.disciplineName}
                </p>
                <p className="text-[9.5px] text-muted-foreground">
                  {trend.recentAttempts} respostas em 7d ·{" "}
                  {trend.previousAttempts} nos 30d anteriores
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-[11px] font-semibold text-foreground">
                  {trend.recentAccuracy === null
                    ? "—"
                    : `${trend.recentAccuracy}%`}
                </span>
                {trend.direction === "up" && (
                  <ArrowUpRight
                    className="h-3.5 w-3.5 text-emerald-500"
                    aria-label="melhorando"
                  />
                )}
                {trend.direction === "down" && (
                  <ArrowDownRight
                    className="h-3.5 w-3.5 text-rose-500"
                    aria-label="piorando"
                  />
                )}
                {trend.direction === "flat" && (
                  <Minus
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-label="estável"
                  />
                )}
                {!trend.sufficient && (
                  <span className="text-[9px] font-medium text-muted-foreground">
                    sem dados suficientes
                  </span>
                )}
                {trend.sufficient && trend.delta !== null && (
                  <span
                    className={`text-[9.5px] font-semibold ${
                      trend.delta > 0
                        ? "text-emerald-500"
                        : trend.delta < 0
                          ? "text-rose-500"
                          : "text-muted-foreground"
                    }`}
                  >
                    {trend.delta > 0 ? "+" : ""}
                    {trend.delta} p.p.
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
