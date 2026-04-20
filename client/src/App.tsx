import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
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
import DisciplinesPage from "@/pages/DisciplinesPage";
import StatisticsPage from "@/pages/StatisticsPage";
import CienciaDosEstudos from "@/pages/CienciaDosEstudos";
import IntercalacaoPlanner from "@/pages/IntercalacaoPlanner";
import MentorTab from "@/pages/MentorTab";
import { useSmartNotifications } from "@/hooks/useSmartNotifications";
import { useNotifications } from "@/hooks/useNotifications";
import { useDiarioOficial } from "@/hooks/useDiarioOficial";

function Router() {
  useSmartNotifications();
  useNotifications();
  useDiarioOficial();

  // Auto-backup on app start (PC only — not Capacitor Android)
  useEffect(() => {
    const isCapacitor = typeof window !== "undefined" &&
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
    const t1 = setTimeout(() => setPhase("hold"), 400);
    const t2 = setTimeout(() => setPhase("out"), 1800);
    const t3 = setTimeout(onDone, 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
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
        background: "linear-gradient(135deg, #0a0a0a 0%, #141414 50%, #0a0a0a 100%)",
        transition: "opacity 0.6s ease",
        opacity: phase === "out" ? 0 : 1,
        pointerEvents: phase === "out" ? "none" : "all",
      }}
    >
      {/* Animated background orbs */}
      <div style={{
        position: "absolute", width: 400, height: 400, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(212,175,55,0.12) 0%, transparent 70%)",
        top: "10%", left: "50%", transform: "translateX(-50%)",
        animation: "pulse-orb 3s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", width: 200, height: 200, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%)",
        bottom: "20%", right: "20%",
        animation: "pulse-orb 4s ease-in-out infinite reverse",
      }} />

      {/* Logo container */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
        transform: phase === "in" ? "translateY(20px)" : "translateY(0)",
        opacity: phase === "in" ? 0 : 1,
        transition: "all 0.5s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        {/* Icon */}
        <div style={{
          width: 96, height: 96, borderRadius: 28,
          background: "linear-gradient(135deg, #d4af37 0%, #f0d060 50%, #c49a2a 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 60px rgba(212,175,55,0.4), 0 20px 40px rgba(0,0,0,0.5)",
          position: "relative",
        }}>
          {/* Book icon — open book matching app icon */}
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Left page */}
            <rect x="4" y="10" width="21" height="28" rx="1" stroke="#1a1a1a" strokeWidth="3" fill="none"/>
            {/* Right page */}
            <rect x="27" y="10" width="21" height="28" rx="1" stroke="#1a1a1a" strokeWidth="3" fill="none"/>
            {/* Center binding tab */}
            <rect x="23" y="38" width="6" height="5" rx="1" fill="#1a1a1a"/>
          </svg>
          {/* Shine effect */}
          <div style={{
            position: "absolute", top: 8, left: 12, width: 20, height: 8, borderRadius: 10,
            background: "rgba(255,255,255,0.35)", transform: "rotate(-20deg)",
          }} />
        </div>

        {/* Title */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: 52, fontWeight: 900, letterSpacing: "0.18em",
            background: "linear-gradient(135deg, #d4af37 0%, #f5e070 50%, #c49a2a 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            fontFamily: "system-ui, -apple-system, sans-serif",
            textShadow: "none",
          }}>SOE</div>
          <div style={{
            fontSize: 13, letterSpacing: "0.35em", textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)", marginTop: -4,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}>Estudos para Concursos</div>
        </div>

        {/* Loading bar */}
        <div style={{
          width: 140, height: 2, borderRadius: 2,
          background: "rgba(255,255,255,0.1)",
          marginTop: 8, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", borderRadius: 2,
            background: "linear-gradient(90deg, #d4af37, #f5e070)",
            animation: "loading-bar 1.8s ease forwards",
          }} />
        </div>
      </div>

      <style>{`
        @keyframes pulse-orb {
          0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.6; }
          50% { transform: translateX(-50%) scale(1.1); opacity: 1; }
        }
        @keyframes loading-bar {
          0% { width: 0%; }
          30% { width: 40%; }
          60% { width: 70%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
}

function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster position="top-right" richColors />
          {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
          <div style={{ visibility: splashDone ? "visible" : "hidden" }}>
            <Layout>
              <Router />
            </Layout>
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
