import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { isLocalMode } from "@/const";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (!supabase) {
      toast.error("Serviço de autenticação não configurado.");
      setLoading(false);
      return;
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      toast.success("Login efetuado com sucesso!");
      window.location.href = "/";
    } catch (error: any) {
      toast.error("Erro no login: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    if (!supabase) {
      toast.error("Serviço de autenticação não configurado.");
      setLoading(false);
      return;
    }
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;
      toast.success("Registro efetuado! Verifique seu email.");
    } catch (error: any) {
      toast.error("Erro no registro: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="w-full max-w-md p-10 bg-card border border-border rounded-lg shadow-sm">
        <div className="text-center space-y-2 mb-10">
          <h1 className="text-4xl font-bold tracking-tighter text-foreground">
            SOE
          </h1>
          <p className="text-sm text-muted-foreground uppercase tracking-widest font-semibold text-[10px]">
            Sistema de Organização de Estudo
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full h-11 bg-secondary border-border"
            />
          </div>
          <div className="space-y-1">
            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full h-11 bg-secondary border-border"
            />
          </div>
          <div className="flex flex-col gap-3 pt-6">
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs uppercase tracking-wider"
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={handleRegister}
              className="w-full h-11 border-border text-muted-foreground hover:text-foreground font-bold text-xs uppercase tracking-wider"
            >
              Registrar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
