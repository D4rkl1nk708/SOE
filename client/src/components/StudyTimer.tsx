import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, Clock, Maximize2, Minimize2, X, PenLine, Save, Timer, Coffee, AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Link } from "wouter";
import { AttentionTimer } from "./AttentionTimer";

interface TimerSession {
  totalTime: number;
  activeTime: number;
  pausedTime: number;
}

const POMODORO_WORK = 25 * 60;
const POMODORO_BREAK = 5 * 60;

export function StudyTimer() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [session, setSession] = useState<TimerSession>({ totalTime: 0, activeTime: 0, pausedTime: 0 });
  const [selectedDiscipline, setSelectedDiscipline] = useState<number | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<number | null>(null);
  const pauseStartTimeRef = useRef<number | null>(null);

  // Pomodoro
  const [pomodoroMode, setPomodoroMode] = useState(false);
  const [pomodoroPhase, setPomodoroPhase] = useState<"work" | "break">("work");
  const [pomodoroTimeLeft, setPomodoroTimeLeft] = useState(POMODORO_WORK);
  const [pomodoroCount, setPomodoroCount] = useState(0);
  // F07 - Attention timer
  const [showAttentionTimer, setShowAttentionTimer] = useState(false);

  // Exam/Simulado mode
  const [examMode, setExamMode] = useState(false);
  const [examDurationH, setExamDurationH] = useState(3);
  const [examDurationM, setExamDurationM] = useState(0);
  const [examTimeLeft, setExamTimeLeft] = useState(3 * 3600);
  const [examFinished, setExamFinished] = useState(false);

  const { data: disciplines } = trpc.discipline.list.useQuery();
  const { data: notes } = trpc.note.list.useQuery();
  const { data: topicsData } = trpc.topic.list.useQuery(
    { disciplineId: selectedDiscipline ?? undefined },
    { enabled: !!selectedDiscipline }
  );
  const topics = (topicsData as any)?.topics ?? [];

  const utils = trpc.useUtils();
  const updateDiscipline = trpc.discipline.update.useMutation({
    onSuccess: () => { utils.discipline.list.invalidate(); utils.dashboard.getStats.invalidate(); },
  });
  const updateTopic = trpc.topic.update.useMutation({
    onSuccess: () => { utils.topic.list.invalidate(); utils.dashboard.getStats.invalidate(); },
  });

  useEffect(() => { if (!selectedDiscipline) setSelectedTopic(null); }, [selectedDiscipline]);

  // Regular timer tick
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isActive && !isPaused) {
      interval = setInterval(() => {
        setSession(prev => ({ ...prev, totalTime: prev.totalTime + 1, activeTime: prev.activeTime + 1 }));
        // Exam countdown
        if (examMode && !examFinished) {
          setExamTimeLeft(t => {
            if (t <= 1) {
              setExamFinished(true);
              toast("⏰ Tempo de prova encerrado!", { duration: 6000 });
              return 0;
            }
            return t - 1;
          });
        }
        // Pomodoro countdown
        if (pomodoroMode && !examMode) {
          setPomodoroTimeLeft(t => {
            if (t <= 1) {
              // Phase switch
              const nextPhase = pomodoroPhase === "work" ? "break" : "work";
              const nextTime = nextPhase === "work" ? POMODORO_WORK : POMODORO_BREAK;
              setPomodoroPhase(nextPhase);
              if (nextPhase === "break") setPomodoroCount(c => c + 1);
              // Play sound cue via vibration
              try { navigator.vibrate?.([200, 100, 200]); } catch {}
              toast(nextPhase === "break" ? "Pomodoro concluído! Hora do intervalo." : "Intervalo encerrado. Hora de estudar!", { duration: 4000 });
              return nextTime;
            }
            return t - 1;
          });
        }
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isActive, isPaused, pomodoroMode, pomodoroPhase, examMode, examFinished]);

  const handlePauseToggle = () => {
    if (!isPaused) {
      pauseStartTimeRef.current = Date.now();
      setIsPaused(true);
    } else {
      if (pauseStartTimeRef.current) {
        const pauseDuration = Math.floor((Date.now() - pauseStartTimeRef.current) / 1000);
        setSession(prev => ({ ...prev, totalTime: prev.totalTime + pauseDuration, pausedTime: prev.pausedTime + pauseDuration }));
      }
      pauseStartTimeRef.current = null;
      setIsPaused(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatMM = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleReset = () => {
    if (confirm("Descartar este cronômetro? Os dados não salvos serão perdidos.")) {
      setSession({ totalTime: 0, activeTime: 0, pausedTime: 0 });
      setIsActive(false); setIsPaused(false);
      pauseStartTimeRef.current = null;
      setPomodoroTimeLeft(POMODORO_WORK);
      setPomodoroPhase("work");
      setPomodoroCount(0);
    }
  };

  const handleSave = async () => {
    if (!selectedDiscipline) { toast.error("Selecione uma disciplina primeiro!"); return; }
    if (session.activeTime === 0) return;
    const disc = (disciplines as any[])?.find(d => d.id === selectedDiscipline);
    if (!disc) return;
    try {
      await updateDiscipline.mutateAsync({ id: selectedDiscipline, studyTimeSeconds: (disc.studyTimeSeconds || 0) + session.activeTime });
      if (selectedTopic) {
        const topic = topics.find((t: any) => t.id === selectedTopic);
        if (topic) await updateTopic.mutateAsync({ id: selectedTopic, studyTimeSeconds: (topic.studyTimeSeconds || 0) + session.activeTime });
      }
      toast.success(`Tempo de estudo salvo! (${formatTime(session.activeTime)})`);
      setSession({ totalTime: 0, activeTime: 0, pausedTime: 0 });
      setIsActive(false); setIsPaused(false);
      pauseStartTimeRef.current = null;
      setPomodoroTimeLeft(POMODORO_WORK);
      setPomodoroPhase("work");
      setPomodoroCount(0);
    } catch { toast.error("Erro ao salvar tempo de estudo."); }
  };

  const notesCount = notes?.length ?? 0;

  const statusLabel = isPaused ? "PAUSADO" : pomodoroMode ? (pomodoroPhase === "work" ? "POMODORO" : "INTERVALO") : isActive ? "ESTUDANDO" : "PRONTO";
  const statusCssColor = isPaused
    ? "var(--accent-amber)"
    : pomodoroMode && pomodoroPhase === "break"
    ? "var(--accent-blue, #2563eb)"
    : isActive
    ? "var(--accent-green)"
    : "var(--primary)";

  // Pomodoro ring progress
  const pomodoroTotal = pomodoroPhase === "work" ? POMODORO_WORK : POMODORO_BREAK;
  const pomodoroProgress = (pomodoroTotal - pomodoroTimeLeft) / pomodoroTotal;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pomodoroProgress);

  const containerClass = isOpen
    ? isFullscreen
      ? "fixed inset-0 z-[100] flex items-end md:items-center justify-center"
      : "fixed z-40"
    : "fixed z-40";

  const containerStyle: React.CSSProperties = isOpen && isFullscreen
    ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }
    : !isOpen || !isFullscreen
    ? { bottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)", right: "1rem" }
    : {};

  return (
    <div className={containerClass} style={containerStyle}>
      {!isOpen ? (
        <div className="flex flex-col items-end gap-2">
          <button onClick={() => setIsOpen(true)} title="Abrir cronômetro"
            style={{ background: statusCssColor }}
            className={`relative rounded-full h-14 w-14 flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all duration-200`}>
            <Clock className="h-6 w-6 text-white" />
            {isActive && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: statusCssColor }} />
                <span className="relative inline-flex rounded-full h-3 w-3" style={{ background: statusCssColor }} />
              </span>
            )}
            {!isActive && notesCount > 0 && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white shadow"
                style={{ background: "var(--accent-amber)", border: "2px solid var(--app-bg)" }}>
                {notesCount > 9 ? "9+" : notesCount}
              </span>
            )}
          </button>
        </div>
      ) : (
        <div className={`rounded-2xl overflow-hidden shadow-2xl ${isFullscreen ? "w-full max-w-lg mx-4" : "w-80"}`}
          style={{ background: "var(--card-bg, var(--app-bg))", border: "1px solid var(--card-border)" }}>

          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between" style={{ background: statusCssColor }}>
            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 text-white/90" />
              <span className="text-xs font-bold text-white tracking-widest uppercase">Cronômetro</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-black/20 text-white tracking-wider">{statusLabel}</span>
            </div>
            <div className="flex gap-0.5">
              <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-black/10 transition-all">
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button onClick={() => { setIsOpen(false); if (!isActive) setSession({ totalTime: 0, activeTime: 0, pausedTime: 0 }); }}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-black/10 transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {notesCount > 0 && (
              <Link href="/notes">
                <a className="flex items-center gap-2 px-3 py-2 rounded-xl hover:opacity-80"
                  style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}
                  onClick={() => setIsOpen(false)}>
                  <PenLine className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--accent-amber)" }} />
                  <span className="text-xs" style={{ color: "var(--accent-amber)" }}>
                    {notesCount} anotaç{notesCount === 1 ? "ão" : "ões"} pendente{notesCount !== 1 ? "s" : ""}
                  </span>
                </a>
              </Link>
            )}

            {/* Mode toggle */}
            <div className="flex rounded-xl overflow-hidden" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
              {[
                { label: "Cronômetro", icon: Clock, mode: "timer" },
                { label: "Pomodoro", icon: Timer, mode: "pomodoro" },
                { label: "Simulado", icon: null, emoji: "⏳", mode: "exam" },
              ].map(m => {
                const active = m.mode === "exam" ? examMode : m.mode === "pomodoro" ? (pomodoroMode && !examMode) : (!pomodoroMode && !examMode);
                return (
                <button key={m.mode} onClick={() => { if (!isActive) { setPomodoroMode(m.mode==="pomodoro"); setExamMode(m.mode==="exam"); if (m.mode==="exam") { setExamTimeLeft(examDurationH*3600+examDurationM*60); setExamFinished(false); } } }}
                  disabled={isActive}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-all disabled:opacity-50"
                  style={{ background: active ? statusCssColor : "transparent", color: active ? "white" : "var(--muted-text)" }}>
                  {m.icon ? <m.icon className="h-3.5 w-3.5" /> : <span>{m.emoji}</span>} {m.label}
                </button>
                );
              })}
            </div>

            {/* Main display */}
            {examMode ? (
              <div className="space-y-3">
                {/* Duration config (only when not active) */}
                {!isActive && !examFinished && (
                  <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
                    <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--muted-text)" }}>Duração da prova</p>
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} max={12} value={examDurationH}
                        onChange={e => { const h=Math.max(0,Math.min(12,parseInt(e.target.value)||0)); setExamDurationH(h); setExamTimeLeft(h*3600+examDurationM*60); }}
                        className="w-14 text-center text-lg font-black rounded-lg py-1 outline-none"
                        style={{ background: "var(--card-bg, var(--app-bg))", border: "1px solid var(--card-border)", color: "var(--app-fg)" }} />
                      <span style={{ color: "var(--muted-text)" }}>h</span>
                      <input type="number" min={0} max={59} value={examDurationM}
                        onChange={e => { const m=Math.max(0,Math.min(59,parseInt(e.target.value)||0)); setExamDurationM(m); setExamTimeLeft(examDurationH*3600+m*60); }}
                        className="w-14 text-center text-lg font-black rounded-lg py-1 outline-none"
                        style={{ background: "var(--card-bg, var(--app-bg))", border: "1px solid var(--card-border)", color: "var(--app-fg)" }} />
                      <span style={{ color: "var(--muted-text)" }}>min</span>
                    </div>
                  </div>
                )}
                <div className="rounded-2xl p-5 text-center" style={{ background: examFinished ? "rgba(220,38,38,0.08)" : "var(--stat-bg)", border: `1px solid ${examFinished ? "var(--accent-red,#dc2626)" : "var(--card-border)"}` }}>
                  {examFinished ? (
                    <>
                      <p className="text-lg font-black" style={{ color: "var(--accent-red,#dc2626)" }}>⏰ Tempo Encerrado!</p>
                      <p className="text-xs mt-1" style={{ color: "var(--muted-text)" }}>Tempo estudado: {formatTime(session.activeTime)}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--muted-text)" }}>Tempo Restante</p>
                      <div className={`font-mono font-black tabular-nums tracking-tight ${isFullscreen ? "text-5xl" : "text-3xl"}`}
                        style={{ color: examTimeLeft < 300 ? "var(--accent-red,#dc2626)" : examTimeLeft < 900 ? "var(--accent-amber)" : statusCssColor }}>
                        {`${String(Math.floor(examTimeLeft/3600)).padStart(2,"0")}:${String(Math.floor((examTimeLeft%3600)/60)).padStart(2,"0")}:${String(examTimeLeft%60).padStart(2,"0")}`}
                      </div>
                      <p className="text-[10px] mt-2" style={{ color: "var(--muted-text)" }}>Estudado: {formatTime(session.activeTime)}</p>
                    </>
                  )}
                </div>
              </div>
            ) : pomodoroMode ? (
              <div className="flex flex-col items-center gap-2 py-2">
                {/* SVG ring */}
                <div className="relative">
                  <svg width={130} height={130} className="-rotate-90">
                    <circle cx={65} cy={65} r={radius} fill="none" stroke="var(--stat-bg)" strokeWidth={8} />
                    <circle cx={65} cy={65} r={radius} fill="none" stroke={statusCssColor}
                      strokeWidth={8} strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      style={{ transition: "stroke-dashoffset 1s linear" }} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {pomodoroPhase === "work"
                      ? <Timer className="h-5 w-5 mb-1" style={{ color: statusCssColor }} />
                      : <Coffee className="h-5 w-5 mb-1" style={{ color: statusCssColor }} />}
                    <span className="text-2xl font-black font-mono" style={{ color: statusCssColor }}>{formatMM(pomodoroTimeLeft)}</span>
                    <span className="text-[10px] font-semibold" style={{ color: "var(--muted-text)" }}>
                      {pomodoroPhase === "work" ? "Foco" : "Intervalo"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs" style={{ color: "var(--muted-text)" }}>
                  <span>{pomodoroCount} pomodoro{pomodoroCount !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>Total: {formatTime(session.activeTime)}</span>
                </div>

              </div>
            ) : (
              <div className="rounded-2xl p-5 text-center"
                style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
                <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--muted-text)" }}>Tempo de Estudo</p>
                <div className={`font-mono font-black tabular-nums tracking-tight transition-colors duration-500 ${isFullscreen ? "text-5xl" : "text-3xl"}`}
                  style={{ color: statusCssColor }}>
                  {formatTime(session.activeTime)}
                </div>
              </div>
            )}

            {/* Mini stats */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total", value: formatTime(session.totalTime) },
                { label: "Pausas", value: formatTime(session.pausedTime) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl p-3 text-center"
                  style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}>
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--muted-text)" }}>{label}</p>
                  <p className="text-sm font-mono font-bold" style={{ color: "var(--app-fg)" }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Selects */}
            <div className="space-y-2.5">
              <select
                className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none disabled:opacity-40"
                style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}
                value={selectedDiscipline ?? ""} onChange={e => setSelectedDiscipline(e.target.value ? Number(e.target.value) : null)}
                disabled={isActive}>
                <option value="">Selecionar Disciplina...</option>
                {(disciplines as any[])?.map(d => <option key={d.id} value={d.id} style={{ background: "var(--card-bg)", color: "var(--app-fg)" }}>{d.name}</option>)}
              </select>
              <select
                className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none disabled:opacity-40"
                style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--app-fg)" }}
                value={selectedTopic ?? ""} onChange={e => setSelectedTopic(e.target.value ? Number(e.target.value) : null)}
                disabled={isActive || !selectedDiscipline}>
                <option value="">Selecionar Tema...</option>
                {(topics as any[]).map((t: any) => <option key={t.id} value={t.id} style={{ background: "var(--card-bg)", color: "var(--app-fg)" }}>{t.name}</option>)}
              </select>
            </div>

            {/* Controls */}
            <div className="space-y-2.5">
              <div className="flex gap-2">
                {!isActive ? (
                  <button onClick={() => setIsActive(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white active:scale-95 transition-all shadow-md"
                    style={{ background: "var(--accent-green)" }}>
                    <Play className="h-4 w-4 fill-white" /> Iniciar
                  </button>
                ) : (
                  <>
                    <button onClick={handlePauseToggle}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white active:scale-95 transition-all shadow-md"
                      style={{ background: isPaused ? "var(--accent-green)" : "var(--accent-amber)" }}>
                      {isPaused ? <><Play className="h-4 w-4 fill-white" /> Retomar</> : <><Pause className="h-4 w-4" /> Pausar</>}
                    </button>
                    <button onClick={handleReset} disabled={session.activeTime === 0}
                      className="p-3 rounded-xl disabled:opacity-30 active:scale-95 transition-all"
                      style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)", color: "var(--muted-text)" }}>
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>

              {/* F07 - Attention Timer toggle */}
              <div className="px-4 pb-2">
                <button
                  onClick={() => setShowAttentionTimer(v => !v)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium transition-all"
                  style={{
                    background: showAttentionTimer ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "var(--stat-bg)",
                    color: showAttentionTimer ? "var(--primary)" : "var(--muted-text)",
                    border: `1px solid ${showAttentionTimer ? "color-mix(in srgb, var(--primary) 30%, transparent)" : "var(--card-border)"}`,
                  }}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {showAttentionTimer ? "Ocultar timer de atenção" : "Timer de intercalação (F07)"}
                </button>
                {showAttentionTimer && (
                  <div className="mt-2">
                    <AttentionTimer
                      disciplineName={(disciplines as any[])?.find(d => d.id === selectedDiscipline)?.name}
                      alertMinutes={45}
                    />
                  </div>
                )}
              </div>

              <button onClick={handleSave} disabled={session.activeTime === 0 || !selectedDiscipline}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all shadow-md"
                style={{ background: "var(--primary)" }}>
                <Save className="h-4 w-4" /> Salvar Estudo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
