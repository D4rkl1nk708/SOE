import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { BookOpen, AlertCircle } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Bypass para desenvolvimento/teste (apenas localhost, não Vercel)
  useEffect(() => {
    const isDev = import.meta.env.DEV || window.location.hostname === "localhost";
    const urlParams = new URLSearchParams(window.location.search);
    const testMode = urlParams.get("test") === "true";

    if (isDev && testMode) {
      handleTestLogin();
    }
  }, []);

  const handleTestLogin = async () => {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: "test@gmail.com",
      password: "6482",
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      window.location.href = "/?no-splash";
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      window.location.href = "/?no-splash";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-4">
      <div className="w-full max-w-md p-8 rounded-3xl bg-[#141414] border border-white/5 shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-[var(--primary)]/20 blur-[100px] pointer-events-none" />
        
        <div className="flex flex-col items-center mb-10 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--primary)] to-purple-600 flex items-center justify-center shadow-lg shadow-[var(--primary)]/30 mb-6">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-widest uppercase mb-1">
            SOE Estudos
          </h1>
          <p className="text-sm opacity-50 font-medium">
            Entre na sua conta para continuar
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 relative z-10">
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase tracking-widest opacity-50 ml-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/5 focus:border-[var(--primary)]/50 focus:bg-white/10 outline-none transition-all"
              placeholder="seu@email.com"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase tracking-widest opacity-50 ml-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/5 focus:border-[var(--primary)]/50 focus:bg-white/10 outline-none transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 mt-6 rounded-xl bg-gradient-to-r from-[var(--primary)] to-purple-600 font-black uppercase tracking-widest text-sm hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center"
            style={{ boxShadow: "0 10px 30px -10px var(--primary)" }}
          >
            {loading ? "Entrando..." : "Acessar Plataforma"}
          </button>
        </form>
      </div>
    </div>
  );
}
