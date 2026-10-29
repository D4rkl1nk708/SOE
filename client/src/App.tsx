import { lazy, Suspense, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Layout } from "./components/Layout";
import { SimuladoGenerationProvider } from "./contexts/SimuladoGenerationContext";

// ── Lazy-loaded pages (code-split per route) ──────────────────────────────────
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const StudyHub = lazy(() => import("@/pages/StudyHub"));
import { TecConfidencePrompt } from "@/components/TecConfidencePrompt";
const StudyPlan = lazy(() => import("@/pages/StudyPlan"));
const GuidedSession = lazy(() => import("@/pages/GuidedSession"));
const Disciplines = lazy(() => import("@/pages/Disciplines"));
const Topics = lazy(() => import("@/pages/Topics"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const History = lazy(() => import("@/pages/History"));
const Revisions = lazy(() => import("@/pages/Revisions"));
const MockExams = lazy(() => import("@/pages/MockExams"));
const Notes = lazy(() => import("@/pages/Notes"));
const Flashcards = lazy(() => import("@/pages/Flashcards"));
const Simulado = lazy(() => import("@/pages/Simulado"));
const SimuladoInteligente = lazy(() => import("@/pages/SimuladoInteligente"));
const TopicStats = lazy(() => import("@/pages/TopicStats"));
const Edital = lazy(() => import("@/pages/Edital"));
const Statistics = lazy(() => import("@/pages/Statistics"));
const Sync = lazy(() => import("@/pages/Sync"));
const Profile = lazy(() => import("@/pages/Profile"));
const QuestionSession = lazy(() => import("@/pages/QuestionSession"));
const QuestionErrors = lazy(() => import("@/pages/QuestionErrors"));
const Lab = lazy(() => import("@/pages/Lab"));
const DisciplinesPage = lazy(() => import("@/pages/DisciplinesPage"));
const StatisticsPage = lazy(() => import("@/pages/StatisticsPage"));
const CienciaDosEstudos = lazy(() => import("@/pages/CienciaDosEstudos"));
const IntercalacaoPlanner = lazy(() => import("@/pages/IntercalacaoPlanner"));
const MentorTab = lazy(() => import("@/pages/MentorTab"));
import { useSmartNotifications } from "@/hooks/useSmartNotifications";
import { useNotifications } from "@/hooks/useNotifications";
import { useDiarioOficial } from "@/hooks/useDiarioOficial";
import { useAutoUpdate } from "@/hooks/useAutoUpdate";
import { GuidedTour } from "./components/GuidedTour";
import { useAuth } from "./_core/hooks/useAuth";

function Router() {
  useAuth({ redirectOnUnauthenticated: true });
  useSmartNotifications();
  useNotifications();
  useDiarioOficial();
  useAutoUpdate();

  // Auto-backup on app start (PC only — not Capacitor Android)
  useEffect(() => {
    const isCapacitor =
      typeof window !== "undefined" &&
      (window.location.protocol === "capacitor:" || !window.location.host);
    if (!isCapacitor) {
      fetch("/api/backup/auto", { method: "POST" }).catch(() => {});
    }
  }, []);

  return (
    <SimuladoGenerationProvider>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-[60vh]">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/study" component={StudyHub} />
          <Route path="/plan" component={StudyPlan} />
          <Route path="/guided" component={GuidedSession} />
          <Route path="/disciplines" component={DisciplinesPage} />
          <Route path="/topics" component={Topics} />
          <Route path="/revisions" component={Revisions} />
          <Route path="/statistics" component={StatisticsPage} />
          <Route path="/calendar" component={Calendar} />
          <Route path="/mock-exams" component={MockExams} />
          <Route path="/notes" component={Notes} />
          <Route path="/flashcards" component={Flashcards} />
          <Route path="/simulado" component={Simulado} />
          <Route path="/simulado-inteligente" component={SimuladoInteligente} />
          <Route path="/topic-stats" component={TopicStats} />
          <Route path="/edital" component={Edital} />
          <Route path="/history" component={History} />
          <Route path="/sync" component={Sync} />
          <Route path="/question-session" component={QuestionSession} />
          <Route path="/question-errors" component={QuestionErrors} />
          <Route path="/lab" component={Lab} />
          <Route path="/profile" component={Profile} />
          <Route path="/ciencia-dos-estudos" component={CienciaDosEstudos} />
          <Route path="/intercalacao" component={IntercalacaoPlanner} />
          <Route path="/mentor" component={MentorTab} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
        <TecConfidencePrompt />
      </Suspense>
    </SimuladoGenerationProvider>
  );
}

// ── Splash Screen ─────────────────────────────────────────────────────────────
function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 200);
    const t2 = setTimeout(() => setPhase("out"), 1400);
    const t3 = setTimeout(onDone, 1800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--background)",
        transition: "opacity 0.4s ease",
        opacity: phase === "out" ? 0 : 1,
        pointerEvents: phase === "out" ? "none" : "all",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          transform: phase === "in" ? "translateY(10px)" : "translateY(0)",
          opacity: phase === "in" ? 0 : 1,
          transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div className="relative">
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                "linear-gradient(140deg, #0A84FF 0%, #0071E3 55%, #0053B8 100%)",
              boxShadow: "0 14px 34px rgba(0, 102, 204, 0.28)",
            }}
          >
            <svg
              width="54"
              height="54"
              viewBox="0 0 100 100"
              aria-hidden="true"
            >
              <g fill="#FFFFFF">
                <path d="M9 27 Q9 22.6 13.4 22 L45 18.6 Q48 18.2 48 22.4 L48 77.4 L13.4 81.4 Q9 81.8 9 77.4 Z" />
                <path d="M91 27 Q91 22.6 86.6 22 L55 18.6 Q52 18.2 52 22.4 L52 77.4 L86.6 81.4 Q91 81.8 91 77.4 Z" />
              </g>
            </svg>
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-[-0.03em] text-foreground">
            SOE
          </h1>
        </div>

        <div className="w-48 h-[1px] bg-border overflow-hidden relative">
          <motion.div
            initial={{ left: "-100%" }}
            animate={{ left: "100%" }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-0 bottom-0 w-24 bg-gradient-to-r from-transparent via-primary to-transparent"
          />
        </div>
      </div>
    </div>
  );
}

function MainContent() {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (location === "/login") {
      setLocation("/", { replace: true });
    }
  }, [location, setLocation]);

  return (
    <Layout>
      <Router />
      <GuidedTour />
    </Layout>
  );
}

function App() {
  const [splashDone, setSplashDone] = useState(() => {
    if (
      typeof window !== "undefined" &&
      window.location.search.includes("no-splash")
    )
      return true;
    return false;
  });

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster position="top-right" richColors />
          {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
          <div style={{ visibility: splashDone ? "visible" : "hidden" }}>
            <MainContent />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
