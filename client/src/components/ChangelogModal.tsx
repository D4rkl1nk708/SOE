import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CHANGELOG_DATA } from "@/constants/changelog";
import { Rocket, Sparkles, ShieldCheck, Zap, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const LS_VERSION_KEY = "soe_last_seen_version";

export function ChangelogModal() {
  const [isOpen, setIsOpen] = useState(false);
  const latestVersion = CHANGELOG_DATA[0].version;

  useEffect(() => {
    const lastSeen = localStorage.getItem(LS_VERSION_KEY);
    if (lastSeen !== latestVersion) {
      // Pequeno delay para não sobrecarregar a entrada
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [latestVersion]);

  const handleClose = () => {
    localStorage.setItem(LS_VERSION_KEY, latestVersion);
    setIsOpen(false);
  };

  const latest = CHANGELOG_DATA[0];

  // Adicionamos um listener global para abrir o modal via versão
  useEffect(() => {
    const handleOpenChangelog = () => setIsOpen(true);
    window.addEventListener("soe-open-changelog", handleOpenChangelog);
    return () =>
      window.removeEventListener("soe-open-changelog", handleOpenChangelog);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl bg-[#0b0f1a] border-white/5 p-0 overflow-hidden rounded-[3rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.7)]">
        <div className="relative">
          {/* Header Visual */}
          <div className="h-40 bg-gradient-to-br from-[var(--primary)]/20 to-blue-600/10 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
            <div className="relative z-10 text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
                <Rocket size={14} className="text-[var(--primary)]" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">
                  Atualização de Sistema
                </span>
              </div>
              <h2 className="text-4xl font-black tracking-tighter text-white">
                Versão {latest.version}
              </h2>
            </div>

            <button
              onClick={handleClose}
              className="absolute top-6 right-6 w-10 h-10 rounded-full bg-black/20 flex items-center justify-center text-white/40 hover:text-white transition-all"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-10 space-y-10 max-h-[60vh] overflow-y-auto custom-scrollbar">
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-white/90">
                {latest.title}
              </h3>
              <p className="text-sm text-white/40 font-medium">
                Lançado em {latest.date}
              </p>
            </div>

            <div className="grid gap-8">
              {latest.categories.map((cat, idx) => (
                <div key={idx} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-xl bg-white/5 border border-white/10`}
                    >
                      {cat.type === "feature" ? (
                        <Sparkles size={16} className="text-amber-400" />
                      ) : cat.type === "fix" ? (
                        <ShieldCheck size={16} className="text-emerald-400" />
                      ) : (
                        <Zap size={16} className="text-blue-400" />
                      )}
                    </div>
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-white/70">
                      {cat.title}
                    </span>
                  </div>
                  <ul className="space-y-3 pl-11">
                    {cat.items.map((item, i) => (
                      <li
                        key={i}
                        className="text-sm text-white/50 leading-relaxed relative"
                      >
                        <div className="absolute -left-5 top-2.5 w-1.5 h-1.5 rounded-full bg-white/10" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Action */}
          <div className="p-8 border-t border-white/5 bg-black/20 flex justify-center">
            <button
              onClick={handleClose}
              className="px-12 h-14 rounded-2xl bg-white text-black font-black uppercase text-[10px] tracking-[0.3em] shadow-2xl hover:scale-[1.02] active:scale-95 transition-all"
            >
              Explorar Novidades
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
