import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Brain, Lock, Send, User, Bot, Loader2, ChevronDown, ChevronUp, TrendingDown, Activity, Trash2 } from "lucide-react";
import { toast } from "sonner";

// RenderText component from before (to render bold natively without markdown library)
function RenderText({ text }: { text: string }) {
  return (
    <div style={{ lineHeight: 1.6, fontSize: 14 }}>
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

export default function MentorTab() {
  const [, navigate] = useLocation();
  const { data: stats }     = trpc.dashboard.getStats.useQuery();
  const apiKey = (stats?.settings as any)?.aiApiKey ?? "";
  const provider = (stats?.settings as any)?.aiProvider ?? "gemini";

  const { data: regressionData } = trpc.mentor.getTecRegressions.useQuery({ thresholdPp: 5 });
  const regressions = (regressionData as any)?.regressions ?? [];
  const hasRegressions = regressions.length > 0;
  const [showRegressions, setShowRegressions] = useState(false);

  const [messages, setMessages] = useState<{role: "user"|"assistant", content: string}[]>(() => {
    try {
      const saved = localStorage.getItem("soe_mentor_chat");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { role: "assistant", content: "Olá, concurseiro! Sou seu Mentor Socrático. Analisei seus dados mais recentes (regressões, pontos fracos e acertos). Como posso te ajudar hoje?\n\nVocê pode pedir para eu:\n- Montar seu cronograma do dia.\n- Fazer perguntas rápidas de revisão.\n- Explicar conceitos que você está com dificuldade." }
    ];
  });
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("soe_mentor_chat", JSON.stringify(messages));
  }, [messages]);

  const chatMut = trpc.mentor.chat.useMutation({
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    },
    onError: (err, variables) => {
      toast.error(err.message);
      setMessages(prev => prev.slice(0, -1)); // remove user msg from history
      setInput(variables.message); // restore user's text back to the input box so they can just press enter again
    }
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const noApiKey = !apiKey;

  const handleSend = () => {
    if (!input.trim() || chatMut.isPending || noApiKey) return;
    const userMsg = input.trim();
    setInput("");
    const newHistory = [...messages, { role: "user" as const, content: userMsg }];
    setMessages(newHistory);
    chatMut.mutate({ 
      message: userMsg, 
      history: messages.filter(m => m.role === "user" || m.role === "assistant"), 
      apiKey, 
      provider 
    });
  };

  return (
    <div className="space-y-4 max-w-2xl h-full flex flex-col" style={{ height: "calc(100vh - 40px)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0 pt-2">
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
            Mentor IA
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
            Seu tutor pessoal 24h
          </p>
        </div>
        <div className="ml-auto">
          <button 
            onClick={() => setMessages([{ role: "assistant", content: "Olá, concurseiro! Chat limpo. Como posso te ajudar hoje?" }])}
            title="Limpar Chat"
            className="p-2 rounded-xl transition-all hover:opacity-70"
            style={{ color: "var(--muted-text)", background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Regressões (se houver) */}
      {hasRegressions && (
        <div className="rounded-2xl overflow-hidden shrink-0" style={{ border: "1px solid rgba(220,38,38,0.3)" }}>
          <button
            onClick={() => setShowRegressions(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3"
            style={{ background: "rgba(220,38,38,0.06)", color: "var(--app-fg)" }}>
            <div className="flex items-center gap-2">
              <Activity size={15} style={{ color: "#dc2626" }} />
              <span className="text-sm font-semibold">
                {regressions.length} regressão{regressions.length > 1 ? "ões" : ""} detectada{regressions.length > 1 ? "s" : ""}
              </span>
            </div>
            {showRegressions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showRegressions && (
            <div className="px-5 pb-5 space-y-2 pt-2" style={{ background: "var(--card-bg)" }}>
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
        </div>
      )}

      {/* Chat Area */}
      <div className="flex flex-col flex-1 rounded-2xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        
        {noApiKey ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 p-8 text-center">
            <Lock size={36} style={{ opacity: 0.2, color: "var(--app-fg)" }} />
            <div className="space-y-1">
              <p className="font-bold text-sm" style={{ color: "var(--app-fg)" }}>Configure sua API Key da IA</p>
              <p className="text-xs max-w-sm" style={{ color: "var(--muted-text)" }}>
                O Mentor interativo não está configurado. Vá até o seu Perfil e adicione a chave na aba de configurações.
              </p>
            </div>
            <button onClick={() => navigate("/profile#settings")}
              className="px-5 py-2.5 rounded-xl text-sm font-bold mt-2"
              style={{ background: "var(--primary)", color: "white" }}>
              Ir para Perfil
            </button>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: m.role === "user" ? "var(--primary)" : "linear-gradient(135deg, #d4af37 0%, #f0d060 100%)" }}>
                    {m.role === "user" ? <User size={14} color="white" /> : <Bot size={16} color="#1a1a1a" />}
                  </div>
                  <div className={`p-3 rounded-2xl max-w-[85%] text-sm whitespace-pre-wrap`}
                    style={{ 
                      background: m.role === "user" ? "var(--primary)" : "var(--stat-bg)",
                      color: m.role === "user" ? "white" : "var(--app-fg)",
                      border: m.role === "user" ? "none" : "1px solid var(--card-border)",
                      borderTopRightRadius: m.role === "user" ? 4 : 16,
                      borderTopLeftRadius: m.role === "user" ? 16 : 4,
                    }}>
                    {m.role === "assistant" ? <RenderText text={m.content} /> : m.content}
                  </div>
                </div>
              ))}
              {chatMut.isPending && (
                <div className="flex gap-3 flex-row">
                  <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #d4af37 0%, #f0d060 100%)" }}>
                    <Bot size={16} color="#1a1a1a" />
                  </div>
                  <div className="p-3 rounded-2xl" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", borderTopLeftRadius: 4 }}>
                    <Loader2 size={16} className="animate-spin" style={{ color: "var(--muted-text)" }} />
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="p-3 shrink-0" style={{ borderTop: "1px solid var(--card-border)", background: "var(--app-bg)" }}>
              <div className="relative flex items-center">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Pergunte ao mentor..."
                  disabled={chatMut.isPending}
                  className="w-full text-sm pl-4 pr-12 py-3 rounded-xl outline-none resize-none disabled:opacity-50"
                  rows={1}
                  style={{ 
                    background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)",
                    minHeight: 44, maxHeight: 120
                  }}
                />
                <button 
                  onClick={handleSend}
                  disabled={!input.trim() || chatMut.isPending}
                  className="absolute right-2 p-2 rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                  style={{ background: "var(--primary)", color: "white" }}>
                  <Send size={14} />
                </button>
              </div>
              <p className="text-[10px] text-center mt-2" style={{ color: "var(--muted-text)" }}>
                O Mentor usa seus dados estatísticos reais para dar respostas contextuais.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
