import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Brain, X, Copy, Check, AlertTriangle, Sparkles, ExternalLink, Filter } from "lucide-react";

interface AIAnalysisProps {
  open: boolean;
  onClose: () => void;
  topicId?: number;
  topicName?: string;
  disciplineId?: number;
  disciplineName?: string;
}

const AI_LINKS = [
  { label: "ChatGPT", url: "https://chat.openai.com", color: "#10a37f" },
  { label: "Gemini",  url: "https://gemini.google.com", color: "#4285f4" },
  { label: "Claude",  url: "https://claude.ai", color: "#d97706" },
];

function buildPrompt(errors: any[], scopeLabel: string): string {
  if (errors.length === 0) return "";

  const grouped: Record<string, any[]> = {};
  for (const e of errors) {
    const key = String(e.topicId);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  }

  const sections = Object.entries(grouped).map(([, errs]) => {
    const lines = errs.map((e: any) => {
      const chosenText  = e.alternatives?.find((a: any) => a.letter === e.userAnswer)?.text || "";
      const correctText = e.alternatives?.find((a: any) => a.letter === e.correctAnswer)?.text || "";
      const parts = [
        `--- Questão ${e.questionId || ""} (${e.banca || ""} ${e.year || ""}) ---`,
        e.statement,
        ...(e.alternatives || []).map((a: any) => `${a.letter}) ${a.text}`),
        e.userAnswer    ? `Marquei: ${e.userAnswer}${chosenText  ? ` — "${chosenText}"`  : ""}` : "",
        e.correctAnswer ? `Gabarito: ${e.correctAnswer}${correctText ? ` — "${correctText}"` : ""}` : "",
        e.errorOrigin   ? `Tipo do erro: ${e.errorOrigin}` : "",
      ].filter(Boolean);
      return parts.join("\n");
    });
    return `=== ${errs.length} erro(s) — Tópico ${errs[0]?.topicId} ===\n${lines.join("\n\n")}`;
  }).join("\n\n");

  return `Você é um professor especialista em concursos públicos brasileiros.

Analise as questões abaixo que errei em ${scopeLabel} e faça um diagnóstico cirúrgico dos meus padrões de erro.

${sections}

Com base nas questões acima, responda:

1. **Diagnóstico preciso**: Para cada questão, diga EXATAMENTE qual conceito confundi. Use os próprios enunciados e alternativas — ex: "Você marcou B mas a correta é C porque confundiu X com Y — a diferença é..."

2. **Padrão de erro**: Há um padrão? (confundo institutos parecidos, caio em pegadinhas de enunciado, erro por esquecimento, etc.)

3. **O que estudar agora**: Liste os conceitos específicos a revisar. Não diga "revise Direito Administrativo" — diga "revise a distinção entre X e Y, especialmente Z".

4. **Dica de prova**: Uma estratégia prática para não cair nesses erros.

Responda em português, direto e técnico como professor de cursinho. Máximo 500 palavras.`;
}

export function AIAnalysis({ open, onClose, topicId: initTopicId, topicName: initTopicName, disciplineId: initDiscId, disciplineName: initDiscName }: AIAnalysisProps) {
  const [copied, setCopied] = useState(false);

  // Filtros internos — começam com os valores passados como prop
  const [filterDisc,    setFilterDisc]    = useState<number | "">(initDiscId  ?? "");
  const [filterTopic,   setFilterTopic]   = useState<number | "">(initTopicId ?? "");
  const [filterLimit,   setFilterLimit]   = useState<number>(20);
  const [showFilters,   setShowFilters]   = useState(false);

  // Dados para os selects
  const { data: disciplines } = trpc.discipline.list.useQuery(undefined, { enabled: open });
  const { data: topicsData }  = trpc.topic.list.useQuery(
    { disciplineId: filterDisc || undefined },
    { enabled: open && !!filterDisc }
  );
  const topics = (topicsData as any)?.topics ?? [];

  // Questões — usa os filtros internos
  const { data: errorsPage, isLoading } = trpc.questionError.list.useQuery(
    {
      disciplineId: filterDisc  || undefined,
      topicId:      filterTopic || undefined,
      limit:        filterLimit,
    },
    { enabled: open }
  );
  // errorsPage is PaginatedResult — extract .items
  const errors = errorsPage?.items ?? [];

  if (!open) return null;

  const count = errors.length;

  // Label do escopo para o prompt
  const discObj  = (disciplines as any[])?.find((d: any) => d.id === filterDisc);
  const topicObj = topics.find((t: any) => t.id === filterTopic);
  const scopeLabel =
    topicObj  ? `o tópico "${topicObj.name}"` :
    discObj   ? `a disciplina "${discObj.name}"` :
    initTopicName  ? `o tópico "${initTopicName}"` :
    initDiscName   ? `a disciplina "${initDiscName}"` :
    "todas as disciplinas";

  const prompt = errors.length > 0 ? buildPrompt(errors, scopeLabel) : "";

  const handleCopy = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = prompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 20, width: "100%", maxWidth: 560, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: "1px solid var(--card-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg, var(--accent-blue) 0%, #7c3aed 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Brain style={{ width: 20, height: 20, color: "#fff" }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--app-fg)" }}>Diagnóstico IA</div>
              <div style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 1 }}>
                {count > 0 ? `${count} questão(ões) · ${scopeLabel}` : scopeLabel}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowFilters(v => !v)}
              style={{ background: showFilters ? "color-mix(in srgb, var(--primary) 15%, transparent)" : "var(--stat-bg)", border: "1px solid var(--card-border)", borderRadius: 8, cursor: "pointer", padding: "6px 10px", display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--app-fg)" }}>
              <Filter style={{ width: 13, height: 13 }} /> Filtros
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-text)", padding: 4, borderRadius: 8 }}>
              <X style={{ width: 18, height: 18 }} />
            </button>
          </div>
        </div>

        {/* Painel de filtros */}
        {showFilters && (
          <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--card-border)", background: "var(--stat-bg)", display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-text)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>Filtrar questões para o prompt</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--muted-text)", display: "block", marginBottom: 4 }}>Disciplina</label>
                <select
                  value={filterDisc}
                  onChange={e => { setFilterDisc(e.target.value ? Number(e.target.value) : ""); setFilterTopic(""); }}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--app-fg)", fontSize: 13 }}>
                  <option value="">Todas</option>
                  {(disciplines as any[])?.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--muted-text)", display: "block", marginBottom: 4 }}>Tema</label>
                <select
                  value={filterTopic}
                  onChange={e => setFilterTopic(e.target.value ? Number(e.target.value) : "")}
                  disabled={!filterDisc}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--app-fg)", fontSize: 13, opacity: filterDisc ? 1 : 0.5 }}>
                  <option value="">Todos</option>
                  {topics.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--muted-text)", display: "block", marginBottom: 4 }}>Quantidade máxima de questões</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[5, 10, 20, 50].map(n => (
                  <button key={n} onClick={() => setFilterLimit(n)}
                    style={{ padding: "5px 14px", borderRadius: 8, border: "1px solid var(--card-border)", cursor: "pointer", fontSize: 13, fontWeight: 600, background: filterLimit === n ? "var(--primary)" : "var(--card-bg)", color: filterLimit === n ? "white" : "var(--app-fg)" }}>
                    {n}
                  </button>
                ))}
                <span style={{ fontSize: 12, color: "var(--muted-text)", alignSelf: "center" }}>mais recentes</span>
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {isLoading && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--muted-text)", fontSize: 14 }}>
              Carregando questões...
            </div>
          )}

          {!isLoading && count === 0 && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", borderRadius: 12, background: "color-mix(in srgb, var(--accent-amber) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-amber) 30%, transparent)" }}>
              <AlertTriangle style={{ width: 18, height: 18, color: "var(--accent-amber)", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, color: "var(--app-fg)", lineHeight: 1.6 }}>
                Nenhuma questão encontrada com os filtros atuais.
                {!filterDisc && !filterTopic && <><br /><br />Vá em <strong>Sessão de Questões → Modo Questões</strong> e registre questões erradas do TEC.</>}
              </div>
            </div>
          )}

          {!isLoading && count > 0 && (
            <>
              {/* Step 1 */}
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: "color-mix(in srgb, var(--accent-blue) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-blue) 40%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--accent-blue)" }}>1</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--app-fg)", marginBottom: 6 }}>Copie o prompt com suas questões</div>
                  <p style={{ fontSize: 13, color: "var(--muted-text)", lineHeight: 1.5, marginBottom: 10 }}>
                    O texto contém <strong>{count}</strong> questão(ões) de <strong>{scopeLabel}</strong>, com gabaritos e pedido de análise.
                  </p>
                  <button
                    onClick={handleCopy}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, background: copied ? "color-mix(in srgb, var(--accent-green) 15%, transparent)" : "linear-gradient(135deg, var(--accent-blue) 0%, #7c3aed 100%)", color: copied ? "var(--accent-green)" : "#fff", transition: "all 0.2s" }}>
                    {copied
                      ? <><Check style={{ width: 16, height: 16 }} /> Copiado!</>
                      : <><Copy style={{ width: 16, height: 16 }} /> Copiar prompt ({count} questão{count !== 1 ? "ões" : ""})</>}
                  </button>
                </div>
              </div>

              <div style={{ height: 1, background: "var(--card-border)" }} />

              {/* Step 2 */}
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: "color-mix(in srgb, var(--accent-blue) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-blue) 40%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--accent-blue)" }}>2</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--app-fg)", marginBottom: 6 }}>Abra qualquer IA gratuita e cole</div>
                  <p style={{ fontSize: 13, color: "var(--muted-text)", lineHeight: 1.5, marginBottom: 10 }}>Cole o texto copiado e receba o diagnóstico.</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {AI_LINKS.map(ai => (
                      <a key={ai.label} href={ai.url} target="_blank" rel="noopener noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, textDecoration: "none", fontSize: 13, fontWeight: 600, background: `color-mix(in srgb, ${ai.color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${ai.color} 30%, transparent)`, color: ai.color }}>
                        {ai.label} <ExternalLink style={{ width: 12, height: 12 }} />
                      </a>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ height: 1, background: "var(--card-border)" }} />

              {/* O que esperar */}
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: "color-mix(in srgb, var(--gold, #d4af37) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--gold, #d4af37) 40%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Sparkles style={{ width: 14, height: 14, color: "var(--gold, #d4af37)" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--app-fg)", marginBottom: 4 }}>O que a IA vai te dizer</div>
                  <p style={{ fontSize: 13, color: "var(--muted-text)", lineHeight: 1.6 }}>
                    Com base nos enunciados e alternativas reais, a IA identifica exatamente qual conceito você confundiu — não uma análise genérica, mas <em>"você marcou B porque confundiu revogação com anulação: a diferença fundamental é..."</em>
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--card-border)", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 20px", borderRadius: 10, border: "1px solid var(--card-border)", background: "none", cursor: "pointer", fontSize: 14, color: "var(--muted-text)", fontWeight: 600 }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
