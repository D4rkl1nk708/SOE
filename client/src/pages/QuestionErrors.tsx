import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  XCircle, Trash2, Filter, Brain, BookOpen,
  AlertTriangle, BookMarked, Crosshair, ChevronDown, ChevronUp,
  Sparkles, Key, X, CheckCircle2, RefreshCw, Lightbulb, Search, CreditCard,
} from "lucide-react";

const ORIGIN_LABELS: Record<string, { label: string; color: string }> = {
  attention:  { label: "Atenção",      color: "#f59e0b" },
  forgetting: { label: "Esquecimento", color: "#3b82f6" },
  theory:     { label: "Teoria",       color: "#8b5cf6" },
  trap:       { label: "Pegadinha",    color: "#ef4444" },
};
const ORIGIN_ICONS: Record<string, any> = {
  attention: AlertTriangle, forgetting: Brain, theory: BookMarked, trap: Crosshair,
};

const KEY_STORAGE  = "soe_ai_apikey";
const PROV_STORAGE = "soe_ai_provider";
function loadSavedKey() { try { return localStorage.getItem(KEY_STORAGE) || ""; } catch { return ""; } }
function loadSavedProvider(): "gemini" | "openai" | "claude" { try { return (localStorage.getItem(PROV_STORAGE) as any) || "gemini"; } catch { return "gemini"; } }

// ── Markdown simples ────────────────────────────────────────────────────────
function MD({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--app-fg)" }}>
      {text.split("\n").map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i} style={{ margin: "2px 0" }}>
            {parts.map((p, j) =>
              p.startsWith("**") && p.endsWith("**")
                ? <strong key={j}>{p.slice(2, -2)}</strong>
                : p
            )}
          </p>
        );
      })}
    </div>
  );
}

// ── Modal de chave ──────────────────────────────────────────────────────────
function ApiKeyModal({ onClose, onSave }: { onClose: () => void; onSave: (key: string, provider: "gemini" | "openai" | "claude") => void }) {
  const [key, setKey]         = useState(loadSavedKey());
  const [provider, setProvider] = useState<"gemini" | "openai" | "claude">(loadSavedProvider());
  const provInfo = {
    gemini: { label: "Google Gemini", url: "https://aistudio.google.com/app/apikey", hint: "Gratuito · Limite generoso", color: "#4285f4" },
    openai: { label: "OpenAI",        url: "https://platform.openai.com/api-keys",   hint: "Pago por uso",              color: "#10a37f" },
    claude: { label: "Anthropic",     url: "https://console.anthropic.com/settings/keys", hint: "Pago por uso",        color: "#d97706" },
  };
  const sel = provInfo[provider];
  return (
    <div style={{ position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.72)",display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}
      onClick={e => { if (e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:"var(--card-bg)",border:"1px solid var(--card-border)",borderRadius:20,width:"100%",maxWidth:480,boxShadow:"0 24px 64px rgba(0,0,0,0.5)" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 24px 16px",borderBottom:"1px solid var(--card-border)" }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <div style={{ width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#4285f4,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center" }}><Key style={{ width:18,height:18,color:"#fff" }} /></div>
            <div><div style={{ fontWeight:700,fontSize:15,color:"var(--app-fg)" }}>Chave de API</div><div style={{ fontSize:12,color:"var(--muted-text)" }}>Para análise automática com IA</div></div>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",color:"var(--muted-text)",padding:4 }}><X style={{ width:18,height:18 }} /></button>
        </div>
        <div style={{ padding:"20px 24px",display:"flex",flexDirection:"column",gap:18 }}>
          <div>
            <label style={{ fontSize:12,fontWeight:600,color:"var(--muted-text)",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:8 }}>Escolha a IA</label>
            <div style={{ display:"flex",gap:8 }}>
              {(["gemini","openai","claude"] as const).map(p => (
                <button key={p} onClick={() => setProvider(p)} style={{ flex:1,padding:"8px 0",borderRadius:10,border:`2px solid ${provider===p?provInfo[p].color:"var(--card-border)"}`,background:provider===p?`color-mix(in srgb, ${provInfo[p].color} 12%, transparent)`:"var(--stat-bg)",cursor:"pointer",fontSize:13,fontWeight:700,color:provider===p?provInfo[p].color:"var(--muted-text)",transition:"all 0.15s" }}>
                  {provInfo[p].label.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6 }}>
              <label style={{ fontSize:12,fontWeight:600,color:"var(--muted-text)",textTransform:"uppercase",letterSpacing:"0.05em" }}>Sua chave — {sel.label}</label>
              <a href={sel.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:12,color:sel.color,textDecoration:"none",fontWeight:600 }}>Obter grátis →</a>
            </div>
            <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder={`Cole aqui sua chave ${sel.label}...`}
              style={{ width:"100%",padding:"10px 14px",borderRadius:10,border:"1px solid var(--card-border)",background:"var(--stat-bg)",color:"var(--app-fg)",fontSize:14,outline:"none",boxSizing:"border-box" }} />
            <p style={{ fontSize:11,color:"var(--muted-text)",marginTop:6,lineHeight:1.5 }}>{sel.hint} · Chave salva localmente, enviada direto para a API da {sel.label.split(" ")[0]}.</p>
          </div>
        </div>
        <div style={{ padding:"0 24px 20px",display:"flex",gap:10,justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"9px 20px",borderRadius:10,border:"1px solid var(--card-border)",background:"none",cursor:"pointer",fontSize:14,color:"var(--muted-text)",fontWeight:600 }}>Cancelar</button>
          <button onClick={() => { if (!key.trim()) { toast.error("Cole uma chave válida."); return; } try { localStorage.setItem(KEY_STORAGE,key.trim()); localStorage.setItem(PROV_STORAGE,provider); } catch {} onSave(key.trim(), provider); onClose(); }}
            style={{ padding:"9px 24px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#4285f4,#7c3aed)",cursor:"pointer",fontSize:14,fontWeight:700,color:"#fff" }}>Salvar e usar</button>
        </div>
      </div>
    </div>
  );
}

// ── Botão de ação IA reutilizável ───────────────────────────────────────────
function AIActionButton({ label, doneLabel, icon: Icon, color, loading, done, onClick }: {
  label: string; doneLabel: string; icon: any; color: string;
  loading: boolean; done: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{
        display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:10,fontSize:12,fontWeight:700,cursor:loading?"not-allowed":"pointer",transition:"all 0.15s",
        background: done ? `color-mix(in srgb, ${color} 10%, transparent)` : `color-mix(in srgb, ${color} 15%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} ${done?"40%":"25%"}, transparent)`,
        color: color, opacity: loading ? 0.7 : 1,
      }}>
      {loading ? <RefreshCw style={{ width:12,height:12 }} className="animate-spin" /> : <Icon style={{ width:12,height:12 }} />}
      {loading ? "Gerando..." : done ? doneLabel : label}
    </button>
  );
}

// ── Painel colapsável de resultado IA ──────────────────────────────────────
function AIResultPanel({ title, color, icon: Icon, content, date }: {
  title: string; color: string; icon: any; content: string; date?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ borderRadius:12,border:`1px solid color-mix(in srgb, ${color} 30%, transparent)`,background:`color-mix(in srgb, ${color} 7%, transparent)`,overflow:"hidden" }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width:"100%",display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:"none",border:"none",cursor:"pointer" }}>
        <Icon style={{ width:14,height:14,color,flexShrink:0 }} />
        <span style={{ fontWeight:700,fontSize:12,textTransform:"uppercase",letterSpacing:"0.05em",color,flex:1,textAlign:"left" }}>{title}</span>
        {date && <span style={{ fontSize:11,color:"var(--muted-text)",fontWeight:400,textTransform:"none",letterSpacing:0 }}>{new Date(date).toLocaleDateString("pt-BR")}</span>}
        {open ? <ChevronUp style={{ width:13,height:13,color:"var(--muted-text)" }} /> : <ChevronDown style={{ width:13,height:13,color:"var(--muted-text)" }} />}
      </button>
      {open && <div style={{ padding:"0 14px 12px" }}><MD text={content} /></div>}
    </div>
  );
}

// ── Página principal ────────────────────────────────────────────────────────
export default function QuestionErrors() {
  const [filterDisc,   setFilterDisc]   = useState<number | "">("");
  const [filterTopic,  setFilterTopic]  = useState<number | "">("");
  const [filterOrigin, setFilterOrigin] = useState<string>("");
  const [expanded,     setExpanded]     = useState<number | null>(null);
  const [deleting,     setDeleting]     = useState<number | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);

  useEffect(() => {
    const handleOpenModal = () => setShowKeyModal(true);
    window.addEventListener('soe-open-ai-modal', handleOpenModal);
    return () => window.removeEventListener('soe-open-ai-modal', handleOpenModal);
  }, []);

  // Estados de loading por questão e por ação
  const [loadingAction, setLoadingAction] = useState<{ id: number; action: string } | null>(null);

  const [savedKey,      setSavedKey]      = useState(loadSavedKey);
  const [savedProvider, setSavedProvider] = useState(loadSavedProvider);

  const { data: disciplines } = trpc.discipline.list.useQuery();
  const { data: topicsData }  = trpc.topic.list.useQuery({ disciplineId: filterDisc || undefined }, { enabled: true });
  const topics = (topicsData as any)?.topics ?? [];

  const { data: errorsPage, isLoading, refetch } = trpc.questionError.list.useQuery({
    disciplineId: filterDisc  || undefined,
    topicId:      filterTopic || undefined,
    limit: 200,
  });
  // errorsPage is PaginatedResult — extract .items
  const errors = errorsPage?.items ?? [];

  const deleteError = trpc.questionError.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Questão removida."); setDeleting(null); },
    onError:   () => { toast.error("Erro ao remover."); setDeleting(null); },
  });

  const analyzeMut       = trpc.questionError.analyze.useMutation({ onSuccess: () => { setLoadingAction(null); refetch(); toast.success("Diagnóstico salvo!"); }, onError: (e) => { setLoadingAction(null); toast.error(e.message); } });
  const revisionTipMut   = trpc.questionError.revisionTip.useMutation({ onSuccess: () => { setLoadingAction(null); refetch(); toast.success("Dica de revisão salva!"); }, onError: (e) => { setLoadingAction(null); toast.error(e.message); } });
  const similarMut       = trpc.questionError.similarQuestions.useMutation({ onSuccess: () => { setLoadingAction(null); refetch(); toast.success("Questões similares salvas!"); }, onError: (e) => { setLoadingAction(null); toast.error(e.message); } });
  const flashcardMut     = trpc.questionError.generateFlashcard.useMutation({ onSuccess: (d) => { setLoadingAction(null); refetch(); toast.success(`Flashcard criado: "${d.front.slice(0,40)}..."`); }, onError: (e) => { setLoadingAction(null); toast.error(e.message); } });

  const filtered = errors.filter(e => !filterOrigin || e.errorOrigin === filterOrigin);

  const discName  = (id: number) => (disciplines as any[])?.find((d: any) => d.id === id)?.name ?? `Disciplina ${id}`;
  const topicName = (id: number) => topics.find((t: any) => t.id === id)?.name ?? `Tema ${id}`;

  const callAI = (id: number, action: "analyze" | "revisionTip" | "similarQuestions" | "generateFlashcard") => {
    if (!savedKey) { setShowKeyModal(true); return; }
    setLoadingAction({ id, action });
    setExpanded(id);
    const args = { id, apiKey: savedKey, provider: savedProvider };
    if (action === "analyze")           analyzeMut.mutate(args);
    else if (action === "revisionTip")  revisionTipMut.mutate(args);
    else if (action === "similarQuestions") similarMut.mutate(args);
    else if (action === "generateFlashcard") flashcardMut.mutate(args);
  };

  const isLoading2 = (id: number, action: string) => loadingAction?.id === id && loadingAction?.action === action;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {showKeyModal && <ApiKeyModal onClose={() => setShowKeyModal(false)} onSave={(k, p) => { setSavedKey(k); setSavedProvider(p); }} />}

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black" style={{ color:"var(--app-fg)" }}>Questões Erradas</h1>
          <p className="text-sm mt-0.5" style={{ color:"var(--muted-text)" }}>Diagnóstico individual com IA — análise, dica, similares e flashcard</p>
        </div>
        <button onClick={() => setShowKeyModal(true)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl shrink-0"
          style={{ background:savedKey?"color-mix(in srgb, var(--accent-green) 12%, transparent)":"var(--stat-bg)", border:`1px solid ${savedKey?"var(--accent-green)":"var(--card-border)"}`, color:savedKey?"var(--accent-green)":"var(--muted-text)" }}>
          {savedKey ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Key className="w-3.5 h-3.5" />}
          {savedKey ? `IA: ${savedProvider}` : "Configurar IA"}
        </button>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background:"var(--card-bg, var(--app-bg))",border:"1px solid var(--card-border)" }}>
        <div className="flex items-center gap-2 mb-1">
          <Filter className="w-4 h-4" style={{ color:"var(--muted-text)" }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color:"var(--muted-text)" }}>Filtros</span>
          {(filterDisc || filterTopic || filterOrigin) && (
            <button onClick={() => { setFilterDisc(""); setFilterTopic(""); setFilterOrigin(""); }} className="ml-auto text-xs px-2 py-0.5 rounded-lg" style={{ color:"var(--accent-red, #dc2626)",border:"1px solid var(--card-border)" }}>Limpar</button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={filterDisc} onChange={e => { setFilterDisc(e.target.value ? Number(e.target.value) : ""); setFilterTopic(""); }} className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none" style={{ background:"var(--stat-bg)",border:"1px solid var(--card-border)",color:"var(--app-fg)" }}>
            <option value="">Todas as disciplinas</option>
            {(disciplines as any[])?.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={filterTopic} onChange={e => setFilterTopic(e.target.value ? Number(e.target.value) : "")} disabled={!filterDisc} className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none" style={{ background:"var(--stat-bg)",border:"1px solid var(--card-border)",color:"var(--app-fg)",opacity:filterDisc?1:0.5 }}>
            <option value="">Todos os temas</option>
            {topics.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={filterOrigin} onChange={e => setFilterOrigin(e.target.value)} className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none" style={{ background:"var(--stat-bg)",border:"1px solid var(--card-border)",color:"var(--app-fg)" }}>
            <option value="">Todas as origens</option>
            <option value="theory">Teoria</option>
            <option value="trap">Pegadinha</option>
            <option value="forgetting">Esquecimento</option>
            <option value="attention">Atenção</option>
          </select>
        </div>
      </div>

      {!isLoading && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color:"var(--muted-text)" }}>
            {filtered.length === 0
              ? "Nenhuma questão encontrada"
              : `${filtered.length} questão(ões)${errorsPage && errorsPage.total > filtered.length ? ` (de ${errorsPage.total})` : ""}`}
          </span>
          {errorsPage && errorsPage.hasMore && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:"rgba(99,102,241,0.1)", color:"#6366f1" }}>
              +{errorsPage.total - errors.length} não exibidas
            </span>
          )}
        </div>
      )}

      {isLoading && <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor:"var(--primary)",borderTopColor:"transparent" }} /></div>}

      {!isLoading && filtered.length === 0 && (
        <div className="rounded-2xl p-12 text-center space-y-3" style={{ background:"var(--card-bg, var(--app-bg))",border:"1px solid var(--card-border)" }}>
          <XCircle className="w-10 h-10 mx-auto opacity-20" style={{ color:"var(--muted-text)" }} />
          <p className="text-sm font-semibold" style={{ color:"var(--app-fg)" }}>Nenhuma questão registrada ainda</p>
          <p className="text-xs" style={{ color:"var(--muted-text)" }}>Vá em <strong>Sessão de Questões → Modo Questões</strong> e registre questões erradas do TEC.</p>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-3">
        {filtered.map(e => {
          const isExpanded  = expanded === e.id;
          const originInfo  = e.errorOrigin ? ORIGIN_LABELS[e.errorOrigin] : null;
          const OriginIcon  = e.errorOrigin ? ORIGIN_ICONS[e.errorOrigin] : null;
          const hasAnalysis = !!(e as any).aiAnalysis;
          const hasTip      = !!(e as any).aiRevisionTip;
          const hasSimilar  = !!(e as any).aiSimilarQuestions;
          const hasFlashcard = !!(e as any).aiFlashcardGenerated;

          const anyAI = hasAnalysis || hasTip || hasSimilar || hasFlashcard;

          return (
            <div key={e.id} className="rounded-2xl overflow-hidden" style={{ background:"var(--card-bg, var(--app-bg))",border:"1px solid var(--card-border)" }}>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <XCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color:"var(--accent-red, #dc2626)" }} />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {e.banca && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:"var(--stat-bg)",color:"var(--muted-text)" }}>{e.banca}</span>}
                      {e.year  && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:"var(--stat-bg)",color:"var(--muted-text)" }}>{e.year}</span>}
                      {originInfo && OriginIcon && (
                        <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background:`color-mix(in srgb, ${originInfo.color} 12%, transparent)`,color:originInfo.color }}>
                          <OriginIcon style={{ width:10,height:10 }} />{originInfo.label}
                        </span>
                      )}
                      {anyAI && (
                        <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background:"color-mix(in srgb, #7c3aed 12%, transparent)",color:"#7c3aed" }}>
                          <Sparkles style={{ width:10,height:10 }} />
                          {[hasAnalysis&&"diagnóstico", hasTip&&"dica", hasSimilar&&"similares", hasFlashcard&&"flashcard"].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      <span className="text-xs ml-auto" style={{ color:"var(--muted-text)" }}>{new Date(e.createdAt).toLocaleDateString("pt-BR")}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs" style={{ color:"var(--muted-text)" }}>
                      <BookOpen style={{ width:11,height:11 }} />
                      <span>{discName(e.disciplineId)}</span>
                      {e.topicId > 0 && <><span>·</span><span>{topicName(e.topicId)}</span></>}
                    </div>

                    <p className="text-sm leading-relaxed line-clamp-2" style={{ color:"var(--app-fg)" }}>{e.statement}</p>

                    {e.userAnswer && e.correctAnswer && (
                      <div className="text-xs font-semibold" style={{ color:"var(--accent-red, #dc2626)" }}>
                        Marcou {e.userAnswer} · Gabarito {e.correctAnswer}
                      </div>
                    )}
                  </div>
                </div>

                {/* Ações principais */}
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3" style={{ borderTop:"1px solid var(--card-border)" }}>
                  <button onClick={() => setExpanded(isExpanded ? null : e.id)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl"
                    style={{ background:"var(--stat-bg)",color:"var(--app-fg)",border:"1px solid var(--card-border)" }}>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {isExpanded ? "Recolher" : "Ver completo"}
                  </button>
                  <button onClick={() => { if (deleting===e.id) { deleteError.mutate({ id:e.id }); } else { setDeleting(e.id); setTimeout(() => setDeleting(d => d===e.id?null:d), 3000); } }}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl ml-auto"
                    style={{ background:deleting===e.id?"var(--accent-red, #dc2626)":"var(--stat-bg)",color:deleting===e.id?"white":"var(--muted-text)",border:"1px solid var(--card-border)" }}>
                    <Trash2 className="w-3.5 h-3.5" />
                    {deleting===e.id?"Confirmar exclusão":"Remover"}
                  </button>
                </div>

                {/* Botões de IA — sempre visíveis */}
                <div className="flex flex-wrap gap-2 mt-2">
                  <AIActionButton label="Diagnóstico" doneLabel="Re-diagnosticar" icon={Brain} color="#7c3aed"
                    loading={isLoading2(e.id,"analyze")} done={hasAnalysis} onClick={() => callAI(e.id,"analyze")} />
                  <AIActionButton label="Dica de revisão" doneLabel="Refazer dica" icon={Lightbulb} color="#f59e0b"
                    loading={isLoading2(e.id,"revisionTip")} done={hasTip} onClick={() => callAI(e.id,"revisionTip")} />
                  <AIActionButton label="Questões similares" doneLabel="Refazer similares" icon={Search} color="#3b82f6"
                    loading={isLoading2(e.id,"similarQuestions")} done={hasSimilar} onClick={() => callAI(e.id,"similarQuestions")} />
                  <AIActionButton label="Gerar flashcard" doneLabel="Flashcard criado ✓" icon={CreditCard} color="#10b981"
                    loading={isLoading2(e.id,"generateFlashcard")} done={hasFlashcard} onClick={() => !hasFlashcard && callAI(e.id,"generateFlashcard")} />
                </div>
              </div>

              {/* Expandido */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 pt-1" style={{ borderTop:"1px solid var(--card-border)" }}>
                  <p className="text-sm leading-relaxed pt-2" style={{ color:"var(--app-fg)" }}>{e.statement}</p>

                  {e.alternatives?.length > 0 && (
                    <div className="space-y-1.5">
                      {e.alternatives.map((a: any) => {
                        const isUser    = a.letter === e.userAnswer;
                        const isCorrect = a.letter === e.correctAnswer;
                        return (
                          <div key={a.letter} className="flex gap-2 px-3 py-2 rounded-lg text-sm"
                            style={{ background:isCorrect?"color-mix(in srgb, var(--accent-green) 12%, transparent)":isUser?"color-mix(in srgb, var(--accent-red, #dc2626) 10%, transparent)":"var(--stat-bg)", border:`1px solid ${isCorrect?"var(--accent-green)":isUser?"var(--accent-red, #dc2626)":"var(--card-border)"}` }}>
                            <span className="font-bold w-5 shrink-0" style={{ color:isCorrect?"var(--accent-green)":isUser?"var(--accent-red, #dc2626)":"var(--muted-text)" }}>
                              {a.letter}{isCorrect?" ✓":isUser?" ✗":""}
                            </span>
                            <span style={{ color:"var(--app-fg)" }}>{a.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Loading states inline */}
                  {["analyze","revisionTip","similarQuestions","generateFlashcard"].map(action => (
                    isLoading2(e.id, action) && (
                      <div key={action} style={{ padding:"12px 14px",borderRadius:12,background:"var(--stat-bg)",border:"1px solid var(--card-border)",fontSize:13,color:"var(--muted-text)" }}>
                        ⏳ {{analyze:"Gerando diagnóstico...",revisionTip:"Gerando dica de revisão...",similarQuestions:"Buscando questões similares...",generateFlashcard:"Gerando flashcard..."}[action]}
                      </div>
                    )
                  ))}

                  {/* Resultados */}
                  {hasAnalysis && <AIResultPanel title="Diagnóstico IA" color="#7c3aed" icon={Brain} content={(e as any).aiAnalysis} date={(e as any).aiAnalyzedAt} />}
                  {hasTip      && <AIResultPanel title="Dica de Revisão" color="#f59e0b" icon={Lightbulb} content={(e as any).aiRevisionTip} date={(e as any).aiRevisionTipAt} />}
                  {hasSimilar  && <AIResultPanel title="Questões Similares para Praticar" color="#3b82f6" icon={Search} content={(e as any).aiSimilarQuestions} date={(e as any).aiSimilarQuestionsAt} />}
                  {hasFlashcard && (
                    <div style={{ padding:"10px 14px",borderRadius:12,background:"color-mix(in srgb, #10b981 8%, transparent)",border:"1px solid color-mix(in srgb, #10b981 30%, transparent)",fontSize:13,color:"#10b981",fontWeight:600,display:"flex",alignItems:"center",gap:8 }}>
                      <CreditCard style={{ width:14,height:14 }} /> Flashcard criado e salvo na aba Flashcards!
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
