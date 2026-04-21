import { useState, useRef, useEffect, Fragment } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { 
  Brain, Lock, Send, User, Bot, Loader2, ChevronDown, 
  ChevronUp, TrendingDown, Activity, Trash2, Plus, 
  Sparkles, History, MessageSquare, ShieldAlert, Zap,
  Search, Wand2, Info, ChevronRight, GraduationCap
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

function RenderText({ text }: { text: string }) {
  return (
    <div className="leading-relaxed text-sm">
      {text.split("\n").map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <div key={i} className={line.trim() === "" ? "h-4" : "mb-1"}>
            {parts.map((p, j) =>
              p.startsWith("**") && p.endsWith("**") ? (
                <strong key={j} className="text-[var(--primary)] font-black">{p.slice(2, -2)}</strong>
              ) : (
                <span key={j} className="opacity-90">{p}</span>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function MentorTab() {
  const [, navigate] = useLocation();
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const apiKey = (stats?.settings as any)?.aiApiKey ?? "";
  const provider = (stats?.settings as any)?.aiProvider ?? "gemini";

  const { data: regressionData } = trpc.mentor.getTecRegressions.useQuery({ thresholdPp: 5 });
  const regressions = (regressionData as any)?.regressions ?? [];
  const hasRegressions = regressions.length > 0;
  const [showRegressions, setShowRegressions] = useState(false);

  const [sessions, setSessions] = useState<{id: string, title: string, messages: any[], createdAt: number}[]>(() => {
    try {
      const saved = localStorage.getItem("soe_mentor_sessions");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [{
      id: "default",
      title: "Nova Conversa",
      messages: [{ role: "assistant", content: "Olá! Sou a **Inteligência Central do SOE**. \n\nEstou conectada a todo o seu ecossistema: estatísticas, regressões, anotações e flashcards. Você pode me pedir para:\n\n- **Agendar revisões** ou criar um cronograma dinâmico.\n- **Gerar flashcards** sobre temas específicos que você está errando.\n- **Explicar conceitos** ou tirar dúvidas sobre qualquer tópico do seu edital.\n- **Analisar seu progresso** e identificar onde você deve focar hoje.\n\nComo posso otimizar sua aprovação agora?" }],
      createdAt: Date.now()
    }];
  });
  const [activeSessionId, setActiveSessionId] = useState(() => localStorage.getItem("soe_mentor_active_session") || "default");

  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];
  const messages = activeSession.messages;
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem("soe_mentor_sessions", JSON.stringify(sessions)); }, [sessions]);
  useEffect(() => { localStorage.setItem("soe_mentor_active_session", activeSessionId); }, [activeSessionId]);

  const setMessages = (updater: (prev: any[]) => any[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        const newMsgs = updater(s.messages);
        let newTitle = s.title;
        if (s.title === "Nova Conversa") {
          const firstUserMsg = newMsgs.find(m => m.role === "user");
          if (firstUserMsg) newTitle = firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? "..." : "");
        }
        return { ...s, messages: newMsgs, title: newTitle };
      }
      return s;
    }));
  };

  const createNewSession = () => {
    const newId = Math.random().toString(36).substring(7);
    const newSession = { id: newId, title: "Nova Conversa", messages: [{ role: "assistant", content: "Olá! Como posso ajudar nesta nova conversa?" }], createdAt: Date.now() };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newId);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length <= 1) { toast.error("Mantenha ao menos uma conversa."); return; }
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    if (activeSessionId === id) setActiveSessionId(newSessions[0].id);
  };

  const chatMut = trpc.mentor.chat.useMutation({
    onSuccess: (data) => setMessages(prev => [...prev, { role: "assistant", content: data.reply }]),
    onError: (err, vars) => { toast.error(err.message); setMessages(prev => prev.slice(0, -1)); setInput(vars.message); }
  });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = () => {
    if (!input.trim() || chatMut.isPending || !apiKey) return;
    const userMsg = input.trim();
    setInput("");
    const newHistory = [...messages, { role: "user" as const, content: userMsg }];
    setMessages(() => newHistory);
    chatMut.mutate({ message: userMsg, history: newHistory.filter(m => m.role === "user" || m.role === "assistant"), apiKey, provider });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] -mx-4 -mb-4 overflow-hidden bg-[var(--app-bg)]">
      {/* Sidebar - Modern Glass List */}
      <div className="hidden md:flex flex-col w-72 shrink-0 border-r border-white/5 bg-white/[0.01] backdrop-blur-3xl">
        <div className="p-6 space-y-6">
            <button onClick={createNewSession} className="group relative w-full overflow-hidden p-4 rounded-2xl bg-[var(--primary)] text-white shadow-xl shadow-[var(--primary-shadow)] active:scale-95 transition-all">
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                <div className="relative flex items-center justify-center gap-3">
                    <Plus size={18} />
                    <span className="text-xs font-black uppercase tracking-widest">Nova Sessão</span>
                </div>
            </button>
            
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-2 opacity-30">
                    <History size={12} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Histórico de Sessões</span>
                </div>
                
                <div className="space-y-1.5 custom-scrollbar max-h-[calc(100vh-20rem)] overflow-y-auto pr-2">
                    {sessions.map(s => (
                        <div key={s.id} onClick={() => setActiveSessionId(s.id)}
                            className={`group relative p-4 rounded-2xl cursor-pointer transition-all border ${activeSessionId === s.id ? 'bg-[var(--primary-bg-subtle)] border-[var(--primary-border)]' : 'border-transparent hover:bg-white/5'}`}>
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <MessageSquare size={14} className={activeSessionId === s.id ? 'text-[var(--primary)]' : 'opacity-20'} />
                                    <span className={`text-[11px] font-bold truncate ${activeSessionId === s.id ? 'text-[var(--primary)]' : 'text-white/60'}`}>{s.title}</span>
                                </div>
                                <button onClick={(e) => deleteSession(s.id, e)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500 transition-all">
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        <div className="mt-auto p-6 border-t border-white/5">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                <div className="flex items-center gap-2">
                    <Activity size={14} className="text-[var(--primary)]" />
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Motor Ativo</span>
                </div>
                <p className="text-[11px] font-bold truncate opacity-80" style={{ color: "var(--app-fg)" }}>
                    {provider.toUpperCase()} AI Engine
                </p>
            </div>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Background Mesh Gradient (Subtle) */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[var(--primary)] blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[var(--accent-blue)] blur-[120px]" />
        </div>

        {/* Header */}
        <div className="relative px-8 py-4 border-b border-white/5 backdrop-blur-md bg-white/[0.01] flex items-center justify-between z-10">
            <div className="flex items-center gap-4">
                <div className="relative">
                    <div className="absolute inset-0 bg-[var(--primary)] blur-xl opacity-20" />
                    <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--accent-amber)] flex items-center justify-center text-white shadow-lg shadow-[var(--primary-shadow)]">
                        <Brain size={20} />
                    </div>
                </div>
                <div>
                    <h2 className="text-sm font-black uppercase tracking-widest" style={{ color: "var(--app-fg)" }}>SOE Inteligência Central</h2>
                    <p className="text-[10px] font-bold opacity-40">{activeSession.title}</p>
                </div>
            </div>

            <div className="flex items-center gap-3">
                {hasRegressions && (
                    <button onClick={() => setShowRegressions(!showRegressions)} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-black uppercase tracking-widest animate-pulse">
                        <ShieldAlert size={12} /> {regressions.length} Alertas
                    </button>
                )}
                <div className="h-4 w-px bg-white/10" />
                <button onClick={() => setMessages(() => [{ role: "assistant", content: "Como posso ajudar agora?" }])}
                    className="p-2.5 rounded-xl hover:bg-white/5 text-white/20 hover:text-white transition-all" title="Limpar conversa">
                    <Trash2 size={16} />
                </button>
            </div>
        </div>

        {/* Regressions Overlay */}
        <AnimatePresence>
            {showRegressions && hasRegressions && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="relative z-20 border-b border-rose-500/20 bg-rose-500/[0.02] overflow-hidden">
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {regressions.map((r: any, i: number) => (
                            <div key={i} className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-widest truncate" style={{ color: "var(--app-fg)" }}>{r.topicName}</p>
                                    <p className="text-[9px] opacity-40 truncate">{r.disciplineName}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <TrendingDown size={14} className="text-rose-500" />
                                    <span className="text-xs font-black text-rose-500">-{r.delta}pp</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        {/* Chat Canvas */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 z-10">
            <div className="max-w-3xl mx-auto space-y-10">
                {!apiKey ? (
                    <div className="h-full flex flex-col items-center justify-center py-20 text-center gap-8">
                        <div className="relative">
                            <div className="absolute inset-0 bg-rose-500 blur-3xl opacity-10" />
                            <div className="relative p-10 rounded-[3rem] bg-white/[0.02] border border-white/5">
                                <Lock size={48} className="text-rose-500/40" />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-2xl font-black" style={{ color: "var(--app-fg)" }}>Acesso Restrito</h3>
                            <p className="text-sm opacity-40 max-w-xs mx-auto leading-relaxed">
                                Configure suas chaves de API no perfil para liberar o potencial do seu Mentor Socrático.
                            </p>
                        </div>
                        <button onClick={() => navigate("/profile#settings")}
                            className="px-8 py-4 rounded-2xl bg-[var(--primary)] text-white font-black text-xs uppercase tracking-widest shadow-2xl shadow-[var(--primary-shadow)] hover:opacity-90 active:scale-95 transition-all">
                            Ir para Configurações
                        </button>
                    </div>
                ) : (
                    <>
                        {messages.map((m, i) => (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={i}
                                className={`flex gap-6 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                                <div className={`shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg transition-all ${m.role === "user" ? 'bg-[var(--primary)] text-white shadow-[var(--primary-shadow)]' : 'bg-white/5 text-[var(--primary)]'}`}>
                                    {m.role === "user" ? <User size={18} /> : <GraduationCap size={18} />}
                                </div>
                                <div className={`relative p-6 rounded-[2rem] max-w-[85%] border ${m.role === "user" ? 'bg-white/5 border-white/10 text-white' : 'bg-transparent border-transparent text-[var(--app-fg)]'}`}>
                                    {m.role === "assistant" ? <RenderText text={m.content} /> : <p className="text-sm leading-relaxed opacity-90">{m.content}</p>}
                                </div>
                            </motion.div>
                        ))}
                        {chatMut.isPending && (
                            <div className="flex gap-6 flex-row items-center opacity-40 animate-pulse">
                                <div className="shrink-0 w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-[var(--primary)]">
                                    <Bot size={18} />
                                </div>
                                <div className="flex gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        )}
                        <div ref={endRef} className="h-20" />
                    </>
                )}
            </div>
        </div>

        {/* Floating Input Dock */}
        {apiKey && (
            <div className="absolute bottom-8 left-0 right-0 px-8 z-20">
                <div className="max-w-3xl mx-auto relative group">
                    <div className="absolute inset-0 bg-black/40 blur-2xl opacity-50 group-focus-within:opacity-80 transition-opacity" />
                    <div className="relative p-2 rounded-[2rem] bg-white/[0.03] border border-white/10 backdrop-blur-2xl shadow-2xl flex items-center gap-2">
                        <div className="pl-4 text-[var(--primary)] opacity-40">
                            <Sparkles size={18} />
                        </div>
                        <textarea value={input} onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                            placeholder="Como posso otimizar seus estudos hoje?..."
                            disabled={chatMut.isPending}
                            rows={1} className="flex-1 bg-transparent border-none outline-none py-4 text-sm font-medium placeholder:opacity-20 resize-none min-h-[56px] max-h-32 custom-scrollbar"
                            style={{ color: "var(--app-fg)" }} />
                        <button onClick={handleSend} disabled={!input.trim() || chatMut.isPending}
                            className="p-4 rounded-[1.5rem] bg-[var(--primary)] text-white shadow-xl shadow-[var(--primary-shadow)] hover:scale-105 active:scale-95 transition-all disabled:opacity-20 disabled:scale-100">
                            {chatMut.isPending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        </button>
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-center mt-4 opacity-20">
                        Integração Total: Estatísticas, Revisões, Flashcards e Anotações em tempo real
                    </p>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
