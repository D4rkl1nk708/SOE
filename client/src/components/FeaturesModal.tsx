import {
  X,
  Sparkles,
  Brain,
  Target,
  Activity,
  Zap,
  ShieldCheck,
  BarChart3,
  Smartphone,
  Laptop,
  Layers,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface FeatureCategory {
  title: string;
  icon: any;
  items: string[];
}

const FEATURES: FeatureCategory[] = [
  {
    title: "Núcleo de Planejamento",
    icon: Target,
    items: [
      "Calendário Preditivo com gestão de revisões",
      "Ciclo de Revisão Dinâmico baseado em acertos",
      "Gestão de Temas e Editais customizados",
    ],
  },
  {
    title: "Inteligência Artificial",
    icon: Brain,
    items: [
      "SOE Mentor Socrático (Dicas pedagógicas)",
      "Radar de Estagnação (ROI de estudo)",
      "Detector de Ilusão de Competência (Sirene)",
      "Mnemônicos IA Gerados sob demanda",
    ],
  },
  {
    title: "Data Science & Stats",
    icon: BarChart3,
    items: [
      "Matriz de Confusão (Tipificação de erro)",
      "Análise Z-Score e Curva de Pareto",
      "Termômetro de Obsolescência da memória",
    ],
  },
  {
    title: "Sync & Integração",
    icon: Smartphone,
    items: [
      "Bridge TEC Concursos (Sincronia real-time)",
      "Sincronização QR Code (Offline-first)",
      "Importação Automática de Planilhas .xlsx",
    ],
  },
];

export function FeaturesModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener("soe-open-features", handleOpen);
    return () => window.removeEventListener("soe-open-features", handleOpen);
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-[2.5rem] bg-[#0A0A0A] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col"
          >
            {/* Header */}
            <div className="p-8 md:p-10 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-white/[0.02] to-transparent">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-[var(--primary)] flex items-center justify-center shadow-[0_0_30px_rgba(var(--primary-rgb),0.3)]">
                  <Layers className="text-white w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-3xl font-black tracking-tight text-white">
                    Catálogo de Recursos
                  </h2>
                  <p className="text-white/40 text-sm font-medium">
                    Explore todo o poder do ecossistema SOE
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 md:p-10 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {FEATURES.map((cat, i) => (
                  <motion.div
                    key={cat.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="group p-8 rounded-[2rem] bg-white/[0.02] border border-white/5 hover:border-[var(--primary-border)] hover:bg-white/[0.04] transition-all"
                  >
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 rounded-xl bg-[var(--primary-bg-subtle)] border border-[var(--primary-border)] flex items-center justify-center text-[var(--primary)] group-hover:scale-110 transition-transform">
                        <cat.icon size={22} />
                      </div>
                      <h3 className="text-lg font-black text-white/90">
                        {cat.title}
                      </h3>
                    </div>

                    <ul className="space-y-3">
                      {cat.items.map((item, j) => (
                        <li
                          key={j}
                          className="flex items-start gap-3 text-sm text-white/50 leading-relaxed"
                        >
                          <Zap
                            size={12}
                            className="mt-1 text-[var(--primary)] shrink-0 opacity-40"
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                ))}
              </div>

              {/* Bonus Footer */}
              <div className="mt-8 p-8 rounded-[2rem] bg-gradient-to-br from-[var(--primary)]/10 to-transparent border border-[var(--primary)]/20 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/10 rounded-xl">
                    <Sparkles size={20} className="text-[var(--primary)]" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white uppercase tracking-widest">
                      SOE v4.9.8 Premium
                    </p>
                    <p className="text-xs text-white/40">
                      Todas as ferramentas estão ativas e sincronizadas.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-8 h-12 rounded-xl bg-white text-black text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
                >
                  Entendido
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
