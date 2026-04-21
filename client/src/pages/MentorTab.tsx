import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  Brain, RefreshCw, Play, Lock, ChevronDown, ChevronUp,
  AlertTriangle, TrendingDown, CheckCircle2, Clock, Zap,
  TrendingUp, Link, Database, Activity, Wifi, Trash2, Copy, Check,
} from "lucide-react";

function RenderText({ text }: { text: string }) {
  return (
    <div style={{ lineHeight: 1.8, fontSize: 14 }}>
      {text.split("\n").map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <div key={i} style={{ marginBottom: line.trim() === "" ? "0.5rem" : "0.1rem" }}>
            {parts.map((p, j) =>
              p.startsWith("**") && p.endsWith("**") ? (
                <strong key={j}>{p.slice(2, -2)}</strong>
              ) : (
                <span key={j}>{p}</span>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}



const CACHE_KEY = "soe_mentor_briefing_cache";

export default function MentorTab() {
  const [, navigate] = useLocation();
  const { data: stats }     = trpc.dashboard.getStats.useQuery();
  const apiKey = (stats?.settings as any)?.aiApiKey ?? "";
  const provider = (stats?.settings as any)?.aiProvider ?? "gemini";

  const [showStats, setShowStats]               = useState(false);
  const [showRegressions, setShowRegressions]   = useState(false);
  const [showScrape, setShowScrape]             = useState(false);
  const [scrapeUrl, setScrapeUrl]               = useState("");
  const [briefingMeta, setBriefingMeta]         = useState<{
    hasTecData?: boolean; regressionCount?: number; weakTopicCount?: number;
  }>({});
  const [briefingCache, setBriefingCache] = useState<{ text: string; date: string } | null>(() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; }
  });

  const { data: weakData }  = trpc.mentor.getWeakProfile.useQuery();
  const { data: revisions } = trpc.revision.list.useQuery({ completed: false, ignored: false });
  const { data: regressionData, refetch: refetchRegressions } =
    trpc.mentor.getTecRegressions.useQuery({ thresholdPp: 5 });

  const generate = trpc.mentor.getDailyBriefing.useMutation({
    onSuccess: (data: any) => {
      const cached = { text: data.briefing, date: new Date().toLocaleDateString("pt-BR") };
      setBriefingCache(cached);
      setBriefingMeta({
        hasTecData:      data.hasTecData,
        regressionCount: data.regressionCount,
        weakTopicCount:  data.weakTopicCount,
      });
      localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    },
  });

  const scrape = trpc.import.tecConcursosScrape.useMutation({
    onSuccess: () => {
      setScrapeUrl("");
      setShowScrape(false);
      refetchRegressions();
    },
  });



  const today          = new Date().toLocaleDateString("pt-BR");
  const isTodaysCached = briefingCache?.date === today;
  const discStats      = (stats?.disciplineStats ?? []) as any[];
  const totalQ         = discStats.reduce((s, d) => s + (d.performance?.questionsResolved ?? 0), 0);
  const totalC         = discStats.reduce((s, d) => s + (d.performance?.correctCount ?? 0), 0);
  const accuracy       = totalQ > 0 ? Math.round(totalC / totalQ * 100) : null;
  const pending        = (revisions ?? []).length;
  const topWeak        = (weakData as any)?.weakTopics?.slice(0, 3) ?? [];

  const regressions    = (regressionData as any)?.regressions ?? [];
  const weakTopics     = (regressionData as any)?.weakTopics ?? [];
  const latestSnap     = (regressionData as any)?.latestSnapshot;
  const deltaAcc       = (regressionData as any)?.deltaAccuracy;
  const hasRegressions = regressions.length > 0;
  const noApiKey       = !apiKey;



  const handleGenerate = () => {
    if (!apiKey) { navigate("/profile#settings"); return; }
    generate.mutate({ apiKey, provider });
  };

  const handleScrape = () => {
    if (!scrapeUrl.trim()) return;
    scrape.mutate({ url: scrapeUrl.trim() });
  };

  return (
    <div className="space-y-4 max-w-2xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: "linear-gradient(135deg, #d4af37 0%, #f0d060 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(212,175,55,0.35)",
          }}>
            <Brain size={20} color="#1a1a1a" />
          </div>
          <div>
            <h2 className="font-black text-base" style={{ color: "var(--app-fg)" }}>
              IA
              {hasRegressions && (
                <span style={{
                  marginLeft: 8, fontSize: 10, fontWeight: 700,
                  background: "rgba(220,38,38,0.12)", color: "#dc2626",
                  padding: "2px 7px", borderRadius: 99, verticalAlign: "middle",
                }}>
                  {regressions.length} regressão{regressions.length > 1 ? "ões" : ""}
                </span>
              )}
            </h2>
            <p className="text-xs" style={{ color: "var(--muted-text)" }}>
              {isTodaysCached
                ? briefingMeta.hasTecData ? "Análise com dados TEC atualizados" : "Análise de hoje"
                : "Análise personalizada"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowScrape(v => !v)}
            className="p-2 rounded-xl hover:opacity-70"
            style={{ color: showScrape ? "var(--primary)" : "var(--muted-text)" }}
            title="Importar TEC via URL">
            <Link size={15} />
          </button>
          <button onClick={handleGenerate} disabled={generate.isPending}
            className="p-2 rounded-xl hover:opacity-70"
            style={{ color: "var(--muted-text)" }} title="Atualizar análise">
            <RefreshCw size={15} className={generate.isPending ? "animate-spin" : ""} />
          </button>
        </div>
      </div>



      {/* Scraping TEC via URL */}
      {showScrape && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
          <div className="flex items-center gap-2">
            <Link size={14} style={{ color: "var(--primary)" }} />
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>
              Importar TEC via URL
            </p>
          </div>
          <p className="text-xs" style={{ color: "var(--muted-text)", lineHeight: 1.6 }}>
            Cole a URL da sua página de <strong>Desempenho por Assunto</strong> do TEC Concursos.
            O sistema importa os dados e salva um snapshot automaticamente.
          </p>
          <input
            type="url"
            placeholder="https://www.tecconcursos.com.br/..."
            value={scrapeUrl}
            onChange={e => setScrapeUrl(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-xl"
            style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}
          />
          {scrape.isError && (
            <p className="text-xs" style={{ color: "#dc2626" }}>
              {(scrape.error as any)?.message ?? "Erro ao importar. Use a importação XLSX se a página requer login."}
            </p>
          )}
          {scrape.isSuccess && (
            <p className="text-xs font-semibold" style={{ color: "var(--accent-green)" }}>
              ✓ Importado com sucesso! Snapshot salvo e cronograma ajustado.
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleScrape}
              disabled={!scrapeUrl.trim() || scrape.isPending}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold"
              style={{ background: "var(--primary)", color: "white", opacity: !scrapeUrl.trim() ? 0.4 : 1 }}>
              {scrape.isPending ? "Importando..." : "Importar agora"}
            </button>
            <button
              onClick={() => setShowScrape(false)}
              className="py-2.5 px-4 rounded-xl text-sm"
              style={{ background: "var(--stat-bg)", color: "var(--muted-text)", border: "1px solid var(--card-border)" }}>
              Cancelar
            </button>
          </div>
          <p className="text-[10px]" style={{ color: "var(--muted-text)" }}>
            Se a importação falhar (página requer login), use a aba Sincronizar → importar XLSX exportado do TEC.
          </p>
        </div>
      )}



      {/* Status TEC snapshot */}
      {latestSnap && (
        <div className="rounded-2xl p-4" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database size={14} style={{ color: "var(--primary)" }} />
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>
                Último snapshot TEC
              </p>
            </div>
            <span className="text-[10px]" style={{ color: "var(--muted-text)" }}>
              {new Date(latestSnap.importedAt).toLocaleDateString("pt-BR")}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--stat-bg)" }}>
              <p className="text-base font-black" style={{ color: "var(--app-fg)" }}>{latestSnap.totalQuestions}</p>
              <p className="text-[10px]" style={{ color: "var(--muted-text)" }}>questões</p>
            </div>
            <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--stat-bg)" }}>
              <p className="text-base font-black" style={{
                color: latestSnap.overallAccuracy >= 70 ? "var(--accent-green)"
                     : latestSnap.overallAccuracy >= 55 ? "var(--accent-amber)" : "#dc2626",
              }}>
                {latestSnap.overallAccuracy}%
              </p>
              <p className="text-[10px]" style={{ color: "var(--muted-text)" }}>acerto geral</p>
            </div>
            <div className="rounded-xl p-2.5 text-center" style={{ background: "var(--stat-bg)" }}>
              {deltaAcc !== null ? (
                <>
                  <p className="text-base font-black" style={{ color: deltaAcc >= 0 ? "var(--accent-green)" : "#dc2626" }}>
                    {deltaAcc >= 0 ? "+" : ""}{deltaAcc}pp
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--muted-text)" }}>vs anterior</p>
                </>
              ) : (
                <>
                  <p className="text-base font-black" style={{ color: "var(--muted-text)" }}>—</p>
                  <p className="text-[10px]" style={{ color: "var(--muted-text)" }}>1ª importação</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Painel de Regressões */}
      {(hasRegressions || weakTopics.length > 0) && (
        <div className="rounded-2xl overflow-hidden" style={{
          border: hasRegressions ? "1px solid rgba(220,38,38,0.3)" : "1px solid var(--card-border)",
        }}>
          <button
            onClick={() => setShowRegressions(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5"
            style={{ background: hasRegressions ? "rgba(220,38,38,0.06)" : "var(--card-bg)", color: "var(--app-fg)" }}>
            <div className="flex items-center gap-2">
              <Activity size={15} style={{ color: hasRegressions ? "#dc2626" : "var(--accent-amber)" }} />
              <span className="text-sm font-semibold">
                {hasRegressions
                  ? `${regressions.length} regressão${regressions.length > 1 ? "ões" : ""} detectada${regressions.length > 1 ? "s" : ""}`
                  : `${weakTopics.length} tópico${weakTopics.length > 1 ? "s" : ""} crítico${weakTopics.length > 1 ? "s" : ""}`}
              </span>
            </div>
            {showRegressions
              ? <ChevronUp size={16} style={{ color: "var(--muted-text)" }} />
              : <ChevronDown size={16} style={{ color: "var(--muted-text)" }} />}
          </button>

          {showRegressions && (
            <div className="px-5 pb-5 space-y-4" style={{ background: "var(--card-bg)", borderTop: "1px solid var(--card-border)" }}>

              {hasRegressions && (
                <div className="space-y-2 pt-4">
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#dc2626" }}>
                    ⚠ Pioraram desde a última importação
                  </p>
                  {regressions.map((r: any, i: number) => (
                    <div key={i} className="rounded-xl px-3 py-2.5"
                      style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)" }}>
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color: "var(--app-fg)" }}>{r.topicName}</p>
                          <p className="text-[10px]" style={{ color: "var(--muted-text)" }}>{r.disciplineName}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                          <span className="text-xs" style={{ color: "var(--muted-text)" }}>{r.previousAccuracy}%</span>
                          <TrendingDown size={12} style={{ color: "#dc2626" }} />
                          <span className="text-xs font-bold" style={{ color: "#dc2626" }}>{r.currentAccuracy}%</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ color: "#dc2626", background: "rgba(220,38,38,0.1)" }}>
                            {r.delta}pp
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {weakTopics.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--accent-amber)" }}>
                    Tópicos críticos (acerto &lt; 65%)
                  </p>
                  {weakTopics.slice(0, 8).map((t: any, i: number) => {
                    const col = t.accuracy < 50 ? "#dc2626" : t.accuracy < 60 ? "var(--accent-amber)" : "var(--muted-text)";
                    return (
                      <div key={i}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: "var(--stat-bg)" }}>
                            <div className="h-full rounded-full" style={{ width: `${t.accuracy}%`, background: col }} />
                          </div>
                          <span className="text-xs font-bold w-8 text-right flex-shrink-0" style={{ color: col }}>{t.accuracy}%</span>
                        </div>
                        <p className="text-[10px]" style={{ color: "var(--muted-text)" }}>
                          {t.disciplineName} › {t.topicName} · {t.errorCount} erros / {t.questionsResolved}q
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Briefing Principal */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>

        {generate.isPending && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold" style={{ color: "var(--app-fg)" }}>
                Seu mentor está analisando seus dados...
              </p>
              <p className="text-xs" style={{ color: "var(--muted-text)" }}>
                {latestSnap
                  ? "Cruzando dados TEC, regressões, revisões e pontos fracos"
                  : "Cruzando acertos, erros, revisões e tempo de estudo"}
              </p>
            </div>
          </div>
        )}

        {generate.isError && !generate.isPending && (
          <div className="rounded-xl p-4 text-sm"
            style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.2)" }}>
            <strong>Erro:</strong> {generate.error.message}
          </div>
        )}

        {noApiKey && !generate.isPending && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <Lock size={36} style={{ opacity: 0.2, color: "var(--app-fg)" }} />
            <div className="space-y-1">
              <p className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>Configure sua API Key da IA</p>
              <p className="text-xs" style={{ color: "var(--muted-text)" }}>
                A IA não está configurada. Vá até o seu Perfil e adicione a chave na aba de configurações.
              </p>
            </div>
            <button onClick={() => navigate("/profile#settings")}
              className="px-5 py-2.5 rounded-xl text-sm font-bold"
              style={{ background: "var(--primary)", color: "white" }}>
              Ir para Perfil
            </button>
          </div>
        )}

        {briefingCache && !generate.isPending && briefingMeta.hasTecData && (
          <div className="flex items-center gap-1.5 text-[10px] font-semibold rounded-lg px-2.5 py-1.5"
            style={{ background: "rgba(16,185,129,0.1)", color: "var(--accent-green)", width: "fit-content" }}>
            <TrendingUp size={11} />
            Briefing com dados TEC atualizados
            {(briefingMeta.regressionCount ?? 0) > 0
              ? ` · ${briefingMeta.regressionCount} regressão${briefingMeta.regressionCount! > 1 ? "ões" : ""} incluída${briefingMeta.regressionCount! > 1 ? "s" : ""}`
              : ""}
          </div>
        )}

        {briefingCache && !generate.isPending && (
          <RenderText text={briefingCache.text} />
        )}

        {!briefingCache && !generate.isPending && !generate.isError && !noApiKey && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <Zap size={36} style={{ opacity: 0.2, color: "var(--app-fg)" }} />
            <div className="space-y-1">
              <p className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>Pronto para analisar seus estudos</p>
              <p className="text-xs" style={{ color: "var(--muted-text)" }}>
                {latestSnap
                  ? "O Mentor vai usar seus dados TEC para um diagnóstico cirúrgico."
                  : "O Mentor vai ler todos os seus dados e te dizer o que fazer hoje."}
              </p>
            </div>
          </div>
        )}

        {!generate.isPending && (
          <div className="flex gap-2 pt-1">
            {!briefingCache && !noApiKey && (
              <button onClick={handleGenerate}
                className="flex-1 py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2"
                style={{ background: "var(--primary)", color: "white" }}>
                <Brain size={16} /> Analisar meus estudos agora
              </button>
            )}
            {briefingCache && (
              <>
                <button onClick={() => navigate("/question-session")}
                  className="flex-1 py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2"
                  style={{ background: "var(--primary)", color: "white" }}>
                  <Play size={16} /> Começar agora
                </button>
                <button onClick={handleGenerate}
                  className="py-3 px-4 rounded-xl text-sm font-semibold"
                  style={{ background: "var(--stat-bg)", color: "var(--muted-text)", border: "1px solid var(--card-border)" }}>
                  <RefreshCw size={15} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Estatísticas colapsável */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
        <button onClick={() => setShowStats(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5"
          style={{ background: "var(--card-bg)", color: "var(--app-fg)" }}>
          <span className="text-sm font-semibold">Ver estatísticas detalhadas</span>
          {showStats
            ? <ChevronUp size={16} style={{ color: "var(--muted-text)" }} />
            : <ChevronDown size={16} style={{ color: "var(--muted-text)" }} />}
        </button>

        {showStats && (
          <div className="px-5 pb-5 space-y-4" style={{ background: "var(--card-bg)", borderTop: "1px solid var(--card-border)" }}>
            <div className="grid grid-cols-3 gap-3 pt-4">
              {[
                { label: "Acerto geral", value: accuracy !== null ? `${accuracy}%` : "—", icon: TrendingDown, color: accuracy !== null && accuracy >= 70 ? "var(--accent-green)" : "#dc2626" },
                { label: "Revisões pendentes", value: pending, icon: Clock, color: "var(--accent-amber)" },
                { label: "Questões resolvidas", value: totalQ, icon: CheckCircle2, color: "var(--primary)" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="rounded-xl p-3 text-center" style={{ background: "var(--stat-bg)" }}>
                  <Icon size={16} className="mx-auto mb-1" style={{ color }} />
                  <p className="text-base font-black" style={{ color: "var(--app-fg)" }}>{value}</p>
                  <p className="text-[10px] leading-tight mt-0.5" style={{ color: "var(--muted-text)" }}>{label}</p>
                </div>
              ))}
            </div>

            {topWeak.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Pontos mais críticos</p>
                {topWeak.map((t: any) => (
                  <div key={t.topicId} className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={{ background: "var(--stat-bg)" }}>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: "var(--app-fg)" }}>{t.topicName}</p>
                      <p className="text-[10px]" style={{ color: "var(--muted-text)" }}>{t.disciplineName}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <AlertTriangle size={12} style={{ color: "#dc2626" }} />
                      <span className="text-xs font-bold" style={{ color: "#dc2626" }}>
                        {Math.round(t.vulnerabilityScore)}pts
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {discStats.filter(d => (d.performance?.questionsResolved ?? 0) > 0).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Por disciplina</p>
                {discStats
                  .filter(d => (d.performance?.questionsResolved ?? 0) > 0)
                  .sort((a, b) => (a.performance?.accuracy ?? 100) - (b.performance?.accuracy ?? 100))
                  .map(d => {
                    const acc = d.performance?.accuracy ?? 0;
                    const color = acc >= 70 ? "var(--accent-green)" : acc >= 50 ? "var(--accent-amber)" : "#dc2626";
                    return (
                      <div key={d.disciplineId} className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color ?? "var(--primary)" }} />
                        <p className="text-xs flex-1 truncate" style={{ color: "var(--app-fg)" }}>{d.name}</p>
                        <div className="h-1.5 w-20 rounded-full overflow-hidden" style={{ background: "var(--stat-bg)" }}>
                          <div className="h-full rounded-full" style={{ width: `${acc}%`, background: color }} />
                        </div>
                        <span className="text-xs font-bold w-8 text-right" style={{ color }}>{acc}%</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
