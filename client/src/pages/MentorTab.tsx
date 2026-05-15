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
  TrendingDown,
  Activity,
  Trash2,
  Plus,
  Sparkles,
  History,
  MessageSquare,
  ShieldAlert,
  Search,
  Wand2,
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function RenderText({ text }: { text: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-p:mb-6 prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-md">
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
            content: "",
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
    <div className="flex flex-col h-full bg-secondary/20 border-r border-border/50">
      <div className="p-6 space-y-8">
        <Button
          onClick={createNewSession}
          className="w-full h-11 rounded-md font-bold text-[10px] uppercase tracking-widest shadow-none border border-primary/20"
        >
          <Plus size={16} className="mr-2" /> Nova Conversa
        </Button>

        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2 opacity-30">
            <History size={12} />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              Sessões Recentes
            </span>
          </div>

          <div className="space-y-1 custom-scrollbar max-h-[calc(100vh-20rem)] overflow-y-auto">
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => {
                  setActiveSessionId(s.id);
                  setIsSidebarOpen(false);
                }}
                className={cn(
                  "group relative px-4 py-3 rounded-md cursor-pointer transition-all border",
                  activeSessionId === s.id
                    ? "bg-secondary border-border/60"
                    : "border-transparent hover:bg-secondary/40",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <MessageSquare
                      size={14}
                      className={cn(
                        activeSessionId === s.id
                          ? "text-primary"
                          : "text-muted-foreground opacity-30",
                      )}
                    />
                    <span
                      className={cn(
                        "text-[11px] font-bold truncate",
                        activeSessionId === s.id
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {s.title}
                    </span>
                  </div>
                  <button
                    onClick={(e) => deleteSession(s.id, e)}
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-auto p-6 border-t border-border/30">
        <div className="p-4 rounded-md bg-secondary/30 border border-border/50 space-y-2">
          <div className="flex items-center gap-2 opacity-40">
            <Activity size={12} />
            <span className="text-[9px] font-bold uppercase tracking-widest">
              Motor Estratégico
            </span>
          </div>
          <p className="text-[10px] font-bold text-foreground/80 uppercase">
            {provider} v2.5.0
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-8.5rem)] md:h-[calc(100vh-4rem)] -mx-4 -mb-4 overflow-hidden bg-background">
      <div className="hidden md:flex flex-col w-72 shrink-0">
        {SidebarContent}
      </div>

      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden fixed inset-0 z-[100] bg-background/80 backdrop-blur-md"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            className="md:hidden fixed top-0 left-0 bottom-0 w-[85vw] max-w-[320px] z-[101] border-r border-border shadow-2xl"
          >
            <div className="flex flex-col h-full bg-background">
              <div className="p-4 flex justify-end border-b border-border/30">
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 rounded-md bg-secondary/50 text-muted-foreground"
                >
                  <X size={20} />
                </button>
              </div>
              {SidebarContent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col relative overflow-hidden">
        <div className="relative px-6 h-14 shrink-0 border-b border-border bg-card/50 backdrop-blur-md flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden flex items-center gap-2 p-2 rounded-md bg-secondary/50 text-primary active:scale-95 transition-all"
            >
              <Menu size={18} />
            </button>

            <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Brain size={16} />
            </div>

            <div className="hidden xs:block">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">
                Mentor Estratégico
              </h2>
              <p className="text-[11px] font-bold text-foreground truncate max-w-[200px]">
                {activeSession.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {hasRegressions && (
              <button
                onClick={() => setShowRegressions(!showRegressions)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-bold uppercase tracking-wider animate-pulse"
              >
                <ShieldAlert size={12} />
                <span className="hidden sm:inline">
                  {regressions.length} Alertas de Queda
                </span>
              </button>
            )}
            <div className="h-4 w-px bg-border mx-1" />
            <button
              onClick={() =>
                setMessages(() => [
                  { role: "assistant", content: "Como posso ajudar agora?" },
                ])
              }
              className="p-2 rounded-md hover:bg-secondary text-muted-foreground transition-colors"
              title="Limpar conversa"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showRegressions && hasRegressions && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="relative z-20 border-b border-destructive/20 bg-destructive/5 overflow-hidden"
            >
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 custom-scrollbar max-h-[40vh] overflow-y-auto">
                {regressions.map((r: any, i: number) => (
                  <div
                    key={i}
                    className="p-4 rounded-md bg-card border border-border/50 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest truncate text-foreground">
                        {r.topicName}
                      </p>
                      <p className="text-[9px] font-bold opacity-30 truncate uppercase">
                        {r.disciplineName}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => {
                          if (!apiKey) {
                            toast.error("Configure sua chave.");
                            return;
                          }
                          setMessages((prev) => [
                            ...prev,
                            {
                              role: "user",
                              content: `Gere um mnemônico para: ${r.topicName}`,
                            },
                          ]);
                          chatMut.mutate({
                            message: `Gere um mnemônico estratégico para "${r.topicName}" (${r.disciplineName}). Tive uma queda de ${r.delta}pp.`,
                            history: [],
                            apiKey,
                            provider,
                          });
                          setShowRegressions(false);
                        }}
                        title="Gerar Mnemônico"
                        className="w-8 h-8 rounded-md bg-primary/10 text-primary border border-primary/20 flex items-center justify-center hover:bg-primary hover:text-white transition-all"
                      >
                        <Wand2 size={14} />
                      </button>
                      <div className="flex items-center gap-1.5 text-destructive">
                        <TrendingDown size={14} />
                        <span className="text-[11px] font-bold tabular-nums">
                          -{r.delta}pp
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 z-10 pb-32">
          <div className="max-w-4xl mx-auto space-y-12">
            {!apiKey ? (
              <div className="h-full flex flex-col items-center justify-center py-20 text-center space-y-8">
                <div className="w-16 h-16 rounded-lg bg-secondary/50 border border-border flex items-center justify-center text-muted-foreground/30">
                  <Lock size={32} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold">Mentor Bloqueado</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                    Configure sua chave de API nas configurações para ativar a
                    inteligência estratégica do SOE.
                  </p>
                </div>
                <Button
                  onClick={() => navigate("/profile#settings")}
                  className="h-12 px-10 rounded-md font-bold text-[11px] uppercase tracking-widest"
                >
                  Ir para Configurações
                </Button>
              </div>
            ) : (
              <>
                {messages.map((m, i) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={i}
                    className={cn(
                      "flex gap-4 md:gap-8",
                      m.role === "user" ? "flex-row-reverse" : "flex-row",
                    )}
                  >
                    <div
                      className={cn(
                        "shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-md flex items-center justify-center border transition-all",
                        m.role === "user"
                          ? "bg-primary border-primary text-white"
                          : "bg-secondary/50 border-border text-primary",
                      )}
                    >
                      {m.role === "user" ? (
                        <User size={16} />
                      ) : (
                        <GraduationCap size={16} />
                      )}
                    </div>
                    <div
                      className={cn(
                        "relative p-5 md:p-6 rounded-md max-w-[85%] border",
                        m.role === "user"
                          ? "bg-secondary/30 border-border/50"
                          : "bg-transparent border-transparent",
                      )}
                    >
                      {m.role === "assistant" && m.content ? (
                        <RenderText text={m.content} />
                      ) : m.role === "user" ? (
                        <p className="text-sm font-semibold leading-relaxed text-foreground/90">
                          {m.content}
                        </p>
                      ) : null}

                      {(m as any).action && (
                        <div className="mt-6 p-5 rounded-md bg-primary/5 border border-primary/20 space-y-4 animate-in fade-in slide-in-from-top-2">
                          <div className="flex items-center gap-2 text-primary opacity-60">
                            <Sparkles size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">
                              Ação Proposta
                            </span>
                          </div>
                          <p className="text-xs font-bold leading-relaxed">
                            {(m as any).action.description}
                          </p>
                          <div className="flex gap-3 pt-2">
                            <Button
                              onClick={() =>
                                handleAction(i, (m as any).action, true)
                              }
                              className="flex-1 h-10 rounded-md text-[10px] font-bold uppercase tracking-widest"
                            >
                              <Check size={14} className="mr-2" /> Aceitar
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() =>
                                handleAction(i, (m as any).action, false)
                              }
                              className="h-10 px-6 rounded-md text-[10px] font-bold uppercase tracking-widest"
                            >
                              Recusar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
                {chatMut.isPending && (
                  <div className="flex gap-8 items-center opacity-40">
                    <div className="shrink-0 w-9 h-9 rounded-md bg-secondary/50 border border-border flex items-center justify-center text-primary">
                      <Bot size={18} />
                    </div>
                    <div className="flex gap-1.5">
                      <div
                        className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <div
                        className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <div
                        className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  </div>
                )}
                <div ref={endRef} className="h-24" />
              </>
            )}
          </div>
        </div>

        {apiKey && (
          <div className="absolute bottom-8 left-0 right-0 px-6 z-20">
            <div className="max-w-4xl mx-auto">
              <div className="relative p-2 rounded-md bg-card border border-border shadow-2xl flex items-center gap-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Como posso otimizar seu estudo hoje?"
                  disabled={chatMut.isPending}
                  rows={1}
                  className="flex-1 bg-transparent border-none outline-none py-3 px-4 text-sm font-bold placeholder:text-muted-foreground/30 resize-none min-h-[48px] max-h-32 custom-scrollbar"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || chatMut.isPending}
                  className="w-11 h-11 shrink-0 rounded-md bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-all disabled:opacity-20"
                >
                  {chatMut.isPending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
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
