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
    <div className="flex h-screen w-full items-center justify-center bg-zinc-950">
      <div className="w-full max-w-md p-8 bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl">
        <h1 className="text-3xl font-bold text-center mb-6 text-zinc-100">
          SOE
        </h1>
        <p className="text-center text-zinc-400 mb-8">
          Entre para acessar seu ambiente de estudos
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-zinc-800 border-zinc-700"
            />
          </div>
          <div>
            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-zinc-800 border-zinc-700"
            />
          </div>
          <div className="flex flex-col gap-3 pt-4">
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={handleRegister}
              className="w-full border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800"
            >
              Registrar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
