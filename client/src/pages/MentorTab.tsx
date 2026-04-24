import { useState, useRef, useEffect, Fragment } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  Brain,
  Lock,
  Send,
  User,
  Bot,
  Loader2,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  Activity,
  Trash2,
  Plus,
  Sparkles,
  History,
  MessageSquare,
  ShieldAlert,
  Zap,
  Search,
  Wand2,
  Info,
  ChevronRight,
  GraduationCap,
  X,
  Menu,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

function RenderText({ text }: { text: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default function MentorTab() {
  const [, navigate] = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const apiKey = (stats?.settings as any)?.aiApiKey ?? "";
  const provider = (stats?.settings as any)?.aiProvider ?? "gemini";

  const { data: regressionData } = trpc.mentor.getTecRegressions.useQuery({
    thresholdPp: 5,
  });
  const regressions = (regressionData as any)?.regressions ?? [];
  const hasRegressions = regressions.length > 0;
  const [showRegressions, setShowRegressions] = useState(false);

  const [sessions, setSessions] = useState<
    { id: string; title: string; messages: any[]; createdAt: number }[]
  >(() => {
    try {
      const saved = localStorage.getItem("soe_mentor_sessions");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: "default",
        title: "Nova Conversa",
        messages: [
          {
            role: "assistant",
            content:
              "Olá! Sou a **Inteligência Central do SOE**. \n\nEstou conectada a todo o seu ecossistema: estatísticas, regressões, anotações e flashcards. Você pode me pedir para:\n\n- **Agendar revisões** ou criar um cronograma dinâmico.\n- **Gerar flashcards** sobre temas específicos que você está errando.\n- **Explicar conceitos** ou tirar dúvidas sobre qualquer tópico do seu edital.\n- **Analisar seu progresso** e identificar onde você deve focar hoje.\n\nComo posso otimizar sua aprovação agora?",
          },
        ],
        createdAt: Date.now(),
      },
    ];
  });
  const [activeSessionId, setActiveSessionId] = useState(
    () => localStorage.getItem("soe_mentor_active_session") || "default",
  );

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const messages = activeSession.messages;
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("soe_mentor_sessions", JSON.stringify(sessions));
  }, [sessions]);
  useEffect(() => {
    localStorage.setItem("soe_mentor_active_session", activeSessionId);
  }, [activeSessionId]);

  const setMessages = (updater: (prev: any[]) => any[]) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === activeSessionId) {
          const newMsgs = updater(s.messages);
          let newTitle = s.title;
          if (s.title === "Nova Conversa") {
            const firstUserMsg = newMsgs.find((m) => m.role === "user");
            if (firstUserMsg)
              newTitle =
                firstUserMsg.content.slice(0, 30) +
                (firstUserMsg.content.length > 30 ? "..." : "");
          }
          return { ...s, messages: newMsgs, title: newTitle };
        }
        return s;
      }),
    );
  };

  const createNewSession = () => {
    const newId = Math.random().toString(36).substring(7);
    const newSession = {
      id: newId,
      title: "Nova Conversa",
      messages: [
        {
          role: "assistant",
          content: "Olá! Como posso ajudar nesta nova conversa?",
        },
      ],
      createdAt: Date.now(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newId);
    setIsSidebarOpen(false);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length <= 1) {
      toast.error("Mantenha ao menos uma conversa.");
      return;
    }
    const newSessions = sessions.filter((s) => s.id !== id);
    setSessions(newSessions);
    if (activeSessionId === id) setActiveSessionId(newSessions[0].id);
  };

  const execAction = trpc.mentor.executeAction.useMutation({
    onSuccess: (data) => toast.success(data.message),
    onError: (err) => toast.error(err.message),
  });

  const chatMut = trpc.mentor.chat.useMutation({
    onSuccess: (data: any) => {
      const newMsgs: any[] = [{ role: "assistant", content: data.reply }];
      if (data.proposals && data.proposals.length > 0) {
        data.proposals.forEach((p: any) => {
          newMsgs.push({
            role: "assistant",
            content: "", // Content empty as we'll render the action card
            action: p,
          });
        });
      }
      setMessages((prev) => [...prev, ...newMsgs]);
    },
    onError: (err, vars) => {
      toast.error(err.message);
      setMessages((prev) => prev.slice(0, -1));
      setInput(vars.message);
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleAction = (msgIndex: number, action: any, accepted: boolean) => {
    if (accepted) {
      execAction.mutate({ type: action.type, payload: action.payload });
    }
    // Remove a mensagem de ação do histórico após a escolha
    setMessages((prev) => prev.filter((_, i) => i !== msgIndex));
  };

  const handleSend = () => {
    if (!input.trim() || chatMut.isPending || !apiKey) return;
    const userMsg = input.trim();
    setInput("");
    const newHistory = [
      ...messages,
      { role: "user" as const, content: userMsg },
    ];
    setMessages(() => newHistory);
    chatMut.mutate({
      message: userMsg,
      history: newHistory.filter(
        (m) => m.role === "user" || m.role === "assistant",
      ),
      apiKey,
      provider,
    });
  };

  const SidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-6 space-y-6">
        <button
          onClick={createNewSession}
          className="group relative w-full overflow-hidden p-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xl shadow-[var(--primary-shadow)] active:scale-95 transition-all"
        >
          <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
          <div className="relative flex items-center justify-center gap-3">
            <Plus size={18} />
            <span className="text-xs font-black uppercase tracking-widest">
              Nova Sessão
            </span>
          </div>
        </button>

        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2 opacity-30">
            <History size={12} />
            <span className="text-[10px] font-black uppercase tracking-widest">
              Histórico
            </span>
          </div>

          <div className="space-y-1.5 custom-scrollbar max-h-[calc(100vh-20rem)] overflow-y-auto pr-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => {
                  setActiveSessionId(s.id);
                  setIsSidebarOpen(false);
                }}
                className={`group relative p-5 rounded-2xl cursor-pointer transition-all border ${activeSessionId === s.id ? "bg-[var(--primary-bg-subtle)] border-[var(--primary-border)]" : "border-transparent hover:bg-white/5"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <MessageSquare
                      size={16}
                      className={
                        activeSessionId === s.id
                          ? "text-[var(--primary)]"
                          : "opacity-20"
                      }
                    />
                    <span
                      className={`text-[13px] md:text-[11px] font-bold truncate ${activeSessionId === s.id ? "text-[var(--primary)]" : "text-white/60"}`}
                    >
                      {s.title}
                    </span>
                  </div>
                  <button
                    onClick={(e) => deleteSession(s.id, e)}
                    className="p-2 rounded-lg hover:bg-rose-500/10 text-rose-500 transition-all"
                  >
                    <Trash2 size={14} />
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
            <span className="text-[10px] font-black uppercase tracking-widest opacity-40">
              Motor Ativo
            </span>
          </div>
          <p
            className="text-[11px] font-bold truncate opacity-80"
            style={{ color: "var(--app-fg)" }}
          >
            {provider.toUpperCase()} AI Engine
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-8.5rem)] md:h-[calc(100vh-4rem)] -mx-4 -mb-4 overflow-hidden bg-[var(--app-bg)]">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col w-72 shrink-0 border-r border-white/5 bg-white/[0.01] backdrop-blur-3xl">
        {SidebarContent}
      </div>

      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="md:hidden fixed top-0 left-0 bottom-0 w-[80vw] max-w-[300px] z-[101] bg-[var(--app-bg)] border-r border-white/10 shadow-2xl"
          >
            <div className="flex flex-col h-full">
              <div className="p-4 flex justify-end">
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 rounded-xl bg-white/5"
                >
                  <X size={20} />
                </button>
              </div>
              {SidebarContent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Background Mesh Gradient (Subtle) */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[var(--primary)] blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[var(--accent-blue)] blur-[120px]" />
        </div>

        {/* Header */}
        <div className="relative px-4 md:px-8 py-3 md:py-4 border-b border-white/5 backdrop-blur-md bg-white/[0.01] flex items-center justify-between z-10">
          <div className="flex items-center gap-3 md:gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 text-[var(--primary)] active:scale-95 transition-all"
            >
              <Menu size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Sessões
              </span>
            </button>
            <div className="hidden xs:block w-px h-4 bg-white/10 mx-1 md:hidden" />
            <div className="relative">
              <div className="absolute inset-0 bg-[var(--primary)] blur-xl opacity-20" />
              <div className="relative w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--accent-amber)] flex items-center justify-center text-[var(--primary-foreground)] shadow-lg shadow-[var(--primary-shadow)]">
                <Brain size={18} className="md:w-5 md:h-5" />
              </div>
            </div>
            <div>
              <h2
                className="text-[11px] md:text-sm font-black uppercase tracking-widest"
                style={{ color: "var(--app-fg)" }}
              >
                Mentor IA
              </h2>
              <p className="text-[9px] md:text-[10px] font-bold opacity-40 truncate max-w-[120px] md:max-w-none">
                {activeSession.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {hasRegressions && (
              <button
                onClick={() => setShowRegressions(!showRegressions)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[9px] font-black uppercase tracking-widest animate-pulse"
              >
                <ShieldAlert size={10} />{" "}
                <span className="hidden xs:inline">
                  {regressions.length} Alertas
                </span>
                <span className="xs:hidden">{regressions.length}</span>
              </button>
            )}
            <div className="h-4 w-px bg-white/10" />
            <button
              onClick={() =>
                setMessages(() => [
                  { role: "assistant", content: "Como posso ajudar agora?" },
                ])
              }
              className="p-2 rounded-xl hover:bg-white/5 text-white/20 hover:text-white transition-all"
              title="Limpar conversa"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Regressions Overlay */}
        <AnimatePresence>
          {showRegressions && hasRegressions && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="relative z-20 border-b border-rose-500/20 bg-rose-500/[0.02] overflow-hidden"
            >
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {regressions.map((r: any, i: number) => (
                  <div
                    key={i}
                    className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p
                        className="text-[10px] font-black uppercase tracking-widest truncate"
                        style={{ color: "var(--app-fg)" }}
                      >
                        {r.topicName}
                      </p>
                      <p className="text-[9px] opacity-40 truncate">
                        {r.disciplineName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          if (!apiKey) {
                            toast.error("Configure sua chave no perfil.");
                            return;
                          }
                          const topicName = r.topicName;
                          setMessages((prev) => [
                            ...prev,
                            {
                              role: "user",
                              content: `Gere um mnemônico para o tópico: ${topicName}`,
                            },
                          ]);
                          chatMut.mutate({
                            message: `Gere um mnemônico bizarro e inesquecível para o tópico "${topicName}" da disciplina "${r.disciplineName}". Foque no motivo da minha queda de desempenho.`,
                            history: [],
                            apiKey,
                            provider,
                          });
                          setShowRegressions(false);
                        }}
                        className="p-2 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-all"
                        title="Gerar Mnemônico"
                      >
                        <Wand2 size={12} />
                      </button>
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1.5">
                          <TrendingDown size={14} className="text-rose-500" />
                          <span className="text-xs font-black text-rose-500">
                            -{r.delta}pp
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Canvas */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 z-10 pb-32 md:pb-32">
          <div className="max-w-3xl mx-auto space-y-6 md:space-y-10">
            {!apiKey ? (
              <div className="h-full flex flex-col items-center justify-center py-10 md:py-20 text-center gap-6 md:gap-8">
                <div className="relative">
                  <div className="absolute inset-0 bg-rose-500 blur-3xl opacity-10" />
                  <div className="relative p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] bg-white/[0.02] border border-white/5">
                    <Lock
                      size={32}
                      className="text-rose-500/40 md:w-12 md:h-12"
                    />
                  </div>
                </div>
                <div className="space-y-2 md:space-y-3">
                  <h3
                    className="text-xl md:text-2xl font-black"
                    style={{ color: "var(--app-fg)" }}
                  >
                    Acesso Restrito
                  </h3>
                  <p className="text-xs md:text-sm opacity-40 max-w-[240px] md:max-w-xs mx-auto leading-relaxed">
                    Configure suas chaves de API no perfil para liberar o
                    potencial do seu Mentor.
                  </p>
                </div>
                <button
                  onClick={() => navigate("/profile#settings")}
                  className="px-6 md:px-8 h-12 md:h-14 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] font-black text-xs uppercase tracking-widest shadow-2xl shadow-[var(--primary-shadow)] hover:opacity-90 active:scale-95 transition-all"
                >
                  Ir para Perfil
                </button>
              </div>
            ) : (
              <>
                {messages.map((m, i) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={i}
                    className={`flex gap-3 md:gap-6 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                  >
                    <div
                      className={`shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg transition-all ${m.role === "user" ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[var(--primary-shadow)]" : "bg-white/5 text-[var(--primary)]"}`}
                    >
                      {m.role === "user" ? (
                        <User size={14} className="md:w-[18px] md:h-[18px]" />
                      ) : (
                        <GraduationCap
                          size={14}
                          className="md:w-[18px] md:h-[18px]"
                        />
                      )}
                    </div>
                    <div
                      className={`relative p-4 md:p-6 rounded-2xl md:rounded-[2rem] max-w-[88%] md:max-w-[85%] border ${m.role === "user" ? "bg-white/5 border-white/10 text-[var(--app-fg)]" : m.action ? "bg-white/[0.02] border-white/10" : "bg-transparent border-transparent text-[var(--app-fg)]"}`}
                    >
                      {m.role === "assistant" && m.content ? (
                        <RenderText text={m.content} />
                      ) : m.role === "user" ? (
                        <p className="text-sm leading-relaxed opacity-90">
                          {m.content}
                        </p>
                      ) : null}

                      {(m as any).action && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
                          <div className="flex items-center gap-2 mb-1">
                            <Sparkles
                              size={14}
                              className="text-[var(--primary)]"
                            />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                              Proposta da IA
                            </span>
                          </div>
                          <p className="text-xs font-bold text-white/80 leading-relaxed">
                            {(m as any).action.description}
                          </p>

                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={() =>
                                handleAction(i, (m as any).action, true)
                              }
                              className="flex-1 h-10 rounded-xl bg-[var(--primary)] text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-[var(--primary-shadow)]/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                              <Check size={14} strokeWidth={3} /> Aceitar
                            </button>
                            <button
                              onClick={() =>
                                handleAction(i, (m as any).action, false)
                              }
                              className="h-10 px-4 rounded-xl bg-white/5 border border-white/10 text-white/40 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/20 transition-all flex items-center justify-center gap-2"
                            >
                              <X size={14} strokeWidth={3} /> Recusar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
                {chatMut.isPending && (
                  <div className="flex gap-6 flex-row items-center opacity-40 animate-pulse">
                    <div className="shrink-0 w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-[var(--primary)]">
                      <Bot size={18} />
                    </div>
                    <div className="flex gap-2">
                      <div
                        className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <div
                        className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <div
                        className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
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
          <div className="absolute bottom-4 md:bottom-8 left-0 right-0 px-4 md:px-8 z-20">
            <div className="max-w-3xl mx-auto relative group">
              <div className="absolute inset-0 bg-black/40 blur-2xl opacity-50 group-focus-within:opacity-80 transition-opacity" />
              <div className="relative p-1.5 md:p-2 rounded-[1.5rem] md:rounded-[2rem] bg-white/[0.03] border border-white/10 backdrop-blur-2xl shadow-2xl flex items-center gap-1 md:gap-2">
                <div className="pl-3 md:pl-4 text-[var(--primary)] opacity-40">
                  <Sparkles size={16} />
                </div>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Mensagem..."
                  disabled={chatMut.isPending}
                  rows={1}
                  className="flex-1 bg-transparent border-none outline-none py-3 md:py-4 text-sm font-medium placeholder:opacity-20 resize-none min-h-[48px] md:min-h-[56px] max-h-32 custom-scrollbar"
                  style={{ color: "var(--app-fg)" }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || chatMut.isPending}
                  className="p-3 md:p-4 rounded-xl md:rounded-[1.5rem] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xl shadow-[var(--primary-shadow)] hover:scale-105 active:scale-95 transition-all disabled:opacity-20 disabled:scale-100"
                >
                  {chatMut.isPending ? (
                    <Loader2
                      size={16}
                      className="animate-spin md:w-[18px] md:h-[18px]"
                    />
                  ) : (
                    <Send size={16} className="md:w-[18px] md:h-[18px]" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
