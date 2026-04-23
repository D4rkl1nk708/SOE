import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Brain, RefreshCw, Zap, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

// Simple markdown-like bold renderer
function RenderText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div style={{ lineHeight: 1.7 }}>
      {lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <div key={i} style={{ marginBottom: line.trim() === "" ? "0.3rem" : 0 }}>
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

const API_KEY_STORAGE = "soe_mentor_api_key";
const API_PROVIDER_STORAGE = "soe_mentor_provider";

export function MentorBriefing() {
  const [, navigate] = useLocation();
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const settings = stats?.settings as any;

  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<"claude" | "gemini" | "openai">("gemini");
  
  useEffect(() => {
    if (settings) {
      setApiKey(settings.aiApiKey || "");
      setProvider(settings.aiProvider || "gemini");
    }
  }, [settings]);

  const [showConfig, setShowConfig] = useState(false);
  const [briefingCache, setBriefingCache] = useState<{ text: string; date: string } | null>(() => {
    try {
      const c = localStorage.getItem("soe_mentor_briefing_cache");
      return c ? JSON.parse(c) : null;
    } catch {
      return null;
    }
  });

  const generate = trpc.mentor.getDailyBriefing.useMutation({
    onSuccess: (data) => {
      const cached = { text: data.briefing, date: new Date().toLocaleDateString("pt-BR") };
      setBriefingCache(cached);
      localStorage.setItem("soe_mentor_briefing_cache", JSON.stringify(cached));
    },
  });

  const updateSettings = trpc.v10.updateV10Settings.useMutation({
    onSuccess: () => {
      toast.success("Configuração salva no seu perfil!");
      setShowConfig(false);
    },
    onError: (err) => toast.error("Erro ao salvar: " + err.message)
  });

  const today = new Date().toLocaleDateString("pt-BR");
  const isTodaysCached = briefingCache?.date === today;

  const handleGenerate = () => {
    if (!apiKey) { setShowConfig(true); return; }
    generate.mutate({ apiKey, provider });
  };

  const saveConfig = () => {
    updateSettings.mutate({ aiApiKey: apiKey, aiProvider: provider });
  };

  return (
    <div
      className="soe-card"
      style={{ borderRadius: "var(--card-radius)", padding: "1rem 1.25rem" }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: "linear-gradient(135deg, #d4af37 0%, #f0d060 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Brain size={15} color="#1a1a1a" />
          </div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>IA</span>
          {isTodaysCached && (
            <span
              style={{
                fontSize: 11, padding: "2px 7px", borderRadius: 20,
                background: "var(--success-bg, #e6f4ea)", color: "var(--success-fg, #1a7f37)",
                border: "1px solid var(--success-border, #a8d5b5)",
              }}
            >
              Hoje
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setShowConfig((v) => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5, padding: 4 }}
            title="Configurar IA"
          >
            <Lock size={13} />
          </button>
          <button
            onClick={handleGenerate}
            disabled={generate.isPending}
            style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.7, padding: 4 }}
            title="Gerar briefing"
          >
            <RefreshCw size={13} className={generate.isPending ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div
          style={{
            marginBottom: "0.75rem", padding: "0.75rem",
            borderRadius: 8, background: "var(--card-bg-secondary, rgba(0,0,0,0.04))",
            border: "1px solid var(--card-border)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, opacity: 0.7 }}>
            Configurar IA do Mentor
          </div>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as any)}
            style={{ width: "100%", marginBottom: 6, fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--card-border)" }}
          >
            <option value="claude">Claude (Anthropic)</option>
            <option value="gemini">Gemini (Google)</option>
            <option value="openai">GPT-4o mini (OpenAI)</option>
          </select>
          <input
            type="password"
            placeholder="API Key..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ width: "100%", marginBottom: 6, fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--card-border)" }}
          />
          <button
            onClick={saveConfig}
            style={{
              width: "100%", padding: "5px 0", borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: "#d4af37", border: "none", cursor: "pointer", color: "#1a1a1a",
            }}
          >
            Salvar
          </button>
        </div>
      )}

      {/* Content */}
      {generate.isPending && (
        <div style={{ fontSize: 13, opacity: 0.6, padding: "0.5rem 0" }}>
          Seu mentor está analisando seus dados...
        </div>
      )}

      {generate.isError && (
        <div style={{ fontSize: 12, color: "var(--danger-fg, #c0392b)", padding: "0.4rem 0" }}>
          {generate.error.message}
        </div>
      )}

      {briefingCache && !generate.isPending && (
        <div style={{ fontSize: 13 }}>
          <RenderText text={briefingCache.text} />
        </div>
      )}

      {!briefingCache && !generate.isPending && !generate.isError && (
        <div
          style={{
            textAlign: "center", padding: "1rem 0",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          }}
        >
          <Zap size={28} style={{ opacity: 0.3 }} />
          <div style={{ fontSize: 13, opacity: 0.6 }}>
            Gere seu briefing diário personalizado
          </div>
          <Button onClick={handleGenerate} size="sm" style={{ fontSize: 12 }}>
            Gerar briefing de hoje
          </Button>
        </div>
      )}

    </div>
  );
}
