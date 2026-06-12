import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Layout } from "./components/Layout";
import Dashboard from "@/pages/Dashboard";
import Disciplines from "@/pages/Disciplines";
import Topics from "@/pages/Topics";
import Calendar from "@/pages/Calendar";
import History from "@/pages/History";
import Revisions from "@/pages/Revisions";
import MockExams from "@/pages/MockExams";
import Notes from "@/pages/Notes";
import Flashcards from "@/pages/Flashcards";
import Simulado from "@/pages/Simulado";
import TopicStats from "@/pages/TopicStats";
import Edital from "@/pages/Edital";
import Statistics from "@/pages/Statistics";
import Sync from "@/pages/Sync";
import Profile from "@/pages/Profile";
import QuestionSession from "@/pages/QuestionSession";
import QuestionErrors from "@/pages/QuestionErrors";
import Lab from "@/pages/Lab";
import DisciplinesPage from "@/pages/DisciplinesPage";
import StatisticsPage from "@/pages/StatisticsPage";
import CienciaDosEstudos from "@/pages/CienciaDosEstudos";
import IntercalacaoPlanner from "@/pages/IntercalacaoPlanner";
import MentorTab from "@/pages/MentorTab";
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
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/disciplines" component={DisciplinesPage} />
      <Route path="/topics" component={Topics} />
      <Route path="/revisions" component={Revisions} />
      <Route path="/statistics" component={StatisticsPage} />
      <Route path="/calendar" component={Calendar} />
      <Route path="/mock-exams" component={MockExams} />
      <Route path="/notes" component={Notes} />
      <Route path="/flashcards" component={Flashcards} />
      <Route path="/simulado" component={Simulado} />
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
              width: 80,
              height: 80,
              border: "1px solid var(--border)",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "var(--card)",
            }}
          >
            <div className="w-10 h-10 border-2 border-primary/20 rounded-md flex items-center justify-center">
              <div className="w-4 h-4 bg-primary rounded-sm animate-pulse" />
            </div>
          </div>
          <div className="absolute -inset-4 border border-primary/5 rounded-[20px] animate-pulse" />
        </div>

        <div className="text-center space-y-1">
          <h1 className="text-4xl font-bold tracking-tighter text-foreground">
            SOE
          </h1>
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.3em] ml-1">
            Sistema de Organização de Estudo
          </p>
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
