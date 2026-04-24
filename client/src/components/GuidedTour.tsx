import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ChevronLeft,
  X,
  Zap,
  Sparkles,
  Target,
  BarChart3,
  Clock,
  LayoutDashboard,
  StickyNote,
  Brain,
  Wifi,
  ShieldCheck,
  Microscope,
  Flame,
  Database,
  AlertCircle,
} from "lucide-react";

interface TourStep {
  target: string;
  title: string;
  content: string;
  icon?: any;
  url: string;
}

const GLOBAL_TOUR_STEPS: TourStep[] = [
  {
    target: "#tour-dashboard-header",
    title: "Seu Centro de Comando",
    content:
      "Aqui é onde a mágica começa. O SOE consolida todo o seu progresso em uma visão tática única.",
    icon: <LayoutDashboard className="text-primary" size={20} />,
    url: "/",
  },
  {
    target: "#tour-accuracy-card",
    title: "Aproveitamento Real",
    content:
      "Monitoramos sua taxa de acerto global. O segredo da aprovação é manter essa barra acima dos 80%.",
    icon: <Target className="text-emerald-400" size={20} />,
    url: "/",
  },
  {
    target: "#tour-plateau-radar",
    title: "Radar de Estagnação",
    content:
      "Exclusivo: A IA detecta onde você parou de evoluir e precisa de uma intervenção imediata.",
    icon: <Flame className="text-orange-500" size={20} />,
    url: "/",
  },
  {
    target: "#tour-confusion-matrix",
    title: "Matriz de Confusão",
    content:
      "Mapeamos conceitos que você costuma trocar e sugerimos reforços específicos.",
    icon: <Brain className="text-purple-400" size={20} />,
    url: "/",
  },
  {
    target: "#tour-notes-sidebar",
    title: "Biblioteca de Notas",
    content:
      "Seus resumos organizados. Use a busca global para encontrar qualquer termo em milésimos de segundo.",
    icon: <Database className="text-primary" size={20} />,
    url: "/notes",
  },
  {
    target: "#tour-notes-ai",
    title: "Varinha Mágica (IA)",
    content:
      "Selecione um texto e peça para a IA resumir ou criar flashcards automáticos. É o fim do estudo passivo.",
    icon: <Sparkles className="text-amber-400" size={20} />,
    url: "/notes",
  },
  {
    target: "h1",
    title: "Mentoria Estratégica",
    content:
      "Analise seu perfil de erros detalhado ou peça roteiros de estudo personalizados para o seu concurso.",
    icon: <ShieldCheck className="text-emerald-400" size={20} />,
    url: "/mentor",
  },
  {
    target: "h1",
    title: "Análise de Tendência",
    content:
      "Gráficos de evolução que mostram se você está subindo ou descendo em cada disciplina.",
    icon: <BarChart3 className="text-rose-400" size={20} />,
    url: "/statistics",
  },
  {
    target: "#tour-trigger",
    title: "Tudo Pronto!",
    content:
      "O SOE está em suas mãos. Use o ícone do raio ⚡ sempre que precisar de ajuda.",
    icon: <Zap className="text-primary" size={20} />,
    url: "/",
  },
];

export function GuidedTour() {
  const [location, navigate] = useLocation();
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<number | undefined>(undefined);

  const findElement = useCallback(() => {
    const step = GLOBAL_TOUR_STEPS[currentStep];
    const el = document.querySelector(step.target);

    if (el) {
      const rect = el.getBoundingClientRect();
      // Mesmo que o rect seja pequeno ou zero (animando), tentamos pegar o centro
      setTargetRect(rect);
      setNotFound(false);
      setIsSearching(false);

      // Scroll apenas se estiver muito longe
      const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
      if (!isInViewport) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return true;
    }
    return false;
  }, [currentStep]);

  useEffect(() => {
    const handleStart = () => {
      setCurrentStep(0);
      setIsActive(true);
    };
    window.addEventListener("soe-start-tour", handleStart);
    return () => window.removeEventListener("soe-start-tour", handleStart);
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const step = GLOBAL_TOUR_STEPS[currentStep];
    setTargetRect(null);
    setNotFound(false);
    setIsSearching(true);

    const check = () => {
      if (findElement()) {
        return true;
      }
      return false;
    };

    if (location !== step.url) {
      navigate(step.url);

      const interval = setInterval(() => {
        if (check()) clearInterval(interval);
      }, 200);

      const timeout = setTimeout(() => {
        clearInterval(interval);
        if (!document.querySelector(step.target)) {
          setNotFound(true);
          setIsSearching(false);
        }
      }, 4000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    } else {
      // Já na página correta
      if (!check()) {
        const interval = setInterval(() => {
          if (check()) clearInterval(interval);
        }, 100);

        const timeout = setTimeout(() => {
          clearInterval(interval);
          if (!document.querySelector(step.target)) {
            setNotFound(true);
            setIsSearching(false);
          }
        }, 2000);

        return () => {
          clearInterval(interval);
          clearTimeout(timeout);
        };
      }
    }
  }, [isActive, currentStep, location, navigate, findElement]);

  useEffect(() => {
    if (isActive && !isSearching && !notFound) {
      const update = () => findElement();
      window.addEventListener("scroll", update);
      window.addEventListener("resize", update);
      const interval = setInterval(update, 1000);
      return () => {
        window.removeEventListener("scroll", update);
        window.removeEventListener("resize", update);
        clearInterval(interval);
      };
    }
  }, [isActive, isSearching, notFound, findElement]);

  if (!isActive) return null;

  const step = GLOBAL_TOUR_STEPS[currentStep];

  return (
    <div className="fixed inset-0 z-[99999] pointer-events-none select-none">
      {/* Dark Overlay - Only show if not in fatal error and not searching */}
      <AnimatePresence>
        {isActive && !isSearching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-[2px] pointer-events-auto"
            style={
              targetRect && !notFound
                ? {
                    backgroundColor: "transparent",
                    boxShadow: "0 0 0 5000px rgba(0,0,0,0.85)",
                    left: targetRect.left - 8,
                    top: targetRect.top - 8,
                    width: targetRect.width + 16,
                    height: targetRect.height + 16,
                    borderRadius: "1rem",
                  }
                : {}
            }
            onClick={() => setIsActive(false)}
          />
        )}
      </AnimatePresence>

      {/* Info Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={
            currentStep + (notFound ? "-nf" : "") + (isSearching ? "-s" : "")
          }
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="absolute z-20 pointer-events-auto flex flex-col items-center justify-center"
          style={
            targetRect && !notFound && !isSearching
              ? {
                  left: Math.max(
                    20,
                    Math.min(
                      window.innerWidth - 360,
                      targetRect.left + targetRect.width / 2 - 170,
                    ),
                  ),
                  top:
                    targetRect.bottom + 30 > window.innerHeight - 320
                      ? Math.max(20, targetRect.top - 320)
                      : targetRect.bottom + 30,
                  width: 340,
                }
              : {
                  left: "50%",
                  top: "50%",
                  x: "-50%",
                  y: "-50%",
                  width: 340,
                }
          }
        >
          <div className="bg-[#111]/95 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 shadow-[0_20px_100px_rgba(0,0,0,0.8)] relative overflow-hidden ring-1 ring-white/10 w-full">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 blur-[80px] rounded-full" />

            {notFound ? (
              <div className="flex flex-col items-center text-center gap-4 py-4 relative">
                <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500">
                  <AlertCircle size={32} />
                </div>
                <h3 className="text-sm font-black uppercase tracking-widest text-white">
                  Elemento Oculto
                </h3>
                <p className="text-xs text-white/60 font-medium">
                  Não conseguimos localizar "{step.title}" nesta tela. Ele pode
                  estar carregando ou desabilitado.
                </p>
                <button
                  onClick={() => {
                    if (currentStep < GLOBAL_TOUR_STEPS.length - 1)
                      setCurrentStep((s) => s + 1);
                    else setIsActive(false);
                  }}
                  className="mt-4 px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-white/60 transition-all"
                >
                  Pular este passo
                </button>
              </div>
            ) : isSearching ? (
              <div className="flex flex-col items-center text-center gap-6 py-8 relative">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]" />
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white">
                    Sincronizando
                  </p>
                  <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/30 italic">
                    Aguardando {step.url}...
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4 mb-6 relative">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-xl">
                    {step.icon}
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">
                      {step.title}
                    </h3>
                    <div className="flex gap-1 mt-2">
                      {GLOBAL_TOUR_STEPS.map((_, i) => (
                        <div
                          key={i}
                          className={`h-1 rounded-full transition-all duration-500 ${i === currentStep ? "w-6 bg-primary" : "w-1.5 bg-white/10"}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-white/80 mb-10 font-medium">
                  {step.content}
                </p>
              </>
            )}

            <div className="flex items-center justify-between relative">
              <button
                onClick={() => setIsActive(false)}
                className="p-3.5 rounded-2xl bg-white/5 hover:bg-rose-500/10 border border-white/5 text-white/40 hover:text-rose-500 transition-all active:scale-90"
              >
                <X size={20} />
              </button>

              <div className="flex gap-2">
                {currentStep > 0 && (
                  <button
                    onClick={() => setCurrentStep((s) => s - 1)}
                    className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-90"
                  >
                    <ChevronLeft size={22} />
                  </button>
                )}
                <button
                  onClick={() => {
                    if (currentStep < GLOBAL_TOUR_STEPS.length - 1)
                      setCurrentStep((s) => s + 1);
                    else setIsActive(false);
                  }}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-[0_10px_30px_rgba(var(--primary-rgb),0.3)] hover:brightness-110 active:scale-95 transition-all"
                >
                  <span>
                    {currentStep === GLOBAL_TOUR_STEPS.length - 1
                      ? "Entendido"
                      : "Próximo"}
                  </span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
