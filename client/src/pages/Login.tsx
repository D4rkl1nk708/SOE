import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Login() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    toast.success("Login local efetuado!");
    window.location.href = "/";
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="w-full max-w-md p-10 bg-card border border-border rounded-lg shadow-sm">
        <div className="text-center space-y-2 mb-10">
          <h1 className="text-4xl font-bold tracking-tighter text-foreground">
            SOE
          </h1>
          <p className="text-sm text-muted-foreground uppercase tracking-widest font-semibold text-[10px]">
            Modo Offline
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="flex flex-col gap-3 pt-6">
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs uppercase tracking-wider"
            >
              {loading ? "Entrando..." : "Entrar no Modo Offline"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
