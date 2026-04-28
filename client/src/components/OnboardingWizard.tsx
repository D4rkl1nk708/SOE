import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  BookOpen,
  Target,
  Clock,
  ChevronRight,
  Check,
  Zap,
  Trophy,
  Brain,
  BarChart3,
  ArrowRight,
  Sparkles,
} from "lucide-react";

const CONCURSO_PRESETS = [
  {
    label: "Polícia Federal (DELEGADO/PERITO)",
    disciplines: [
      "Direito Constitucional",
      "Direito Administrativo",
      "Direito Penal",
      "Direito Processual Penal",
      "Direito Civil",
      "Criminalística",
      "Medicina Legal",
      "Português",
    ],
  },
  {
    label: "Polícia Federal (AGENTE/ESCRIVÃO)",
    disciplines: [
      "Direito Constitucional",
      "Direito Administrativo",
      "Direito Penal",
      "Direito Processual Penal",
      "Português",
      "Raciocínio Lógico",
      "Informática",
    ],
  },
  {
    label: "PRF — Policial Rodoviário Federal",
    disciplines: [
      "Direito Constitucional",
      "Direito Administrativo",
      "Direito Penal",
      "Direito Processual Penal",
      "Legislação de Trânsito",
      "Português",
      "Raciocínio Lógico",
      "Informática",
      "Física Aplicada",
    ],
  },
  {
    label: "PC — Delegado (Policia Civil)",
    disciplines: [
      "Direito Constitucional",
      "Direito Administrativo",
      "Direito Penal",
      "Direito Processual Penal",
      "Direito Civil",
      "Direito Processual Civil",
      "Medicina Legal",
      "Português",
    ],
  },
  {
    label: "PC — Investigador / Escrivão (Civil)",
    disciplines: [
      "Direito Constitucional",
      "Direito Administrativo",
      "Direito Penal",
      "Direito Processual Penal",
      "Português",
      "Raciocínio Lógico",
      "Informática",
      "Conhecimentos Gerais",
    ],
  },
  {
    label: "PM — Soldado / Cabo (Polícia Militar)",
    disciplines: [
      "Direito Constitucional",
      "Direito Penal",
      "Língua Portuguesa",
      "Matemática",
      "Raciocínio Lógico",
      "Conhecimentos Gerais",
      "Legislação Estadual",
    ],
  },
  {
    label: "PM — Oficial (Polícia Militar)",
    disciplines: [
      "Direito Constitucional",
      "Direito Administrativo",
      "Direito Penal",
      "Direito Processual Penal",
      "Português",
      "Raciocínio Lógico",
      "Administração Pública",
      "Legislação Estadual",
    ],
  },
  {
    label: "PCDF — Agente/Escrivão (DF)",
    disciplines: [
      "Direito Constitucional",
      "Direito Administrativo",
      "Direito Penal",
      "Direito Processual Penal",
      "Português",
      "Raciocínio Lógico",
      "Informática",
      "Lei Orgânica do DF",
    ],
  },
  {
    label: "Guarda Municipal (GCM)",
    disciplines: [
      "Direito Constitucional",
      "Direito Penal",
      "Estatuto de Guarda Municipal",
      "Português",
      "Matemática",
      "Noções de Direito Administrativo",
      "Conhecimentos Gerais",
    ],
  },
  {
    label: "Bombeiro Militar (Oficial/Praça)",
    disciplines: [
      "Direito Constitucional",
      "Direito Administrativo",
      "Português",
      "Matemática",
      "Raciocínio Lógico",
      "Física",
      "Química",
      "Primeiros Socorros",
    ],
  },
  {
    label: "Receita Federal (AUDITOR)",
    disciplines: [
      "Direito Tributário",
      "Direito Constitucional",
      "Direito Administrativo",
      "Contabilidade",
      "Português",
      "Raciocínio Lógico",
      "Matemática Financeira",
    ],
  },
  {
    label: "TCU / TCE (ANALISTA)",
    disciplines: [
      "Direito Constitucional",
      "Direito Administrativo",
      "Auditoria",
      "Finanças Públicas",
      "Contabilidade",
      "Português",
      "Raciocínio Lógico",
    ],
  },
  {
    label: "TI — Área Federal (SERPRO/DATAPREV)",
    disciplines: [
      "Engenharia de Software",
      "Banco de Dados",
      "Redes de Computadores",
      "Segurança da Informação",
      "Sistemas Operacionais",
      "Governança de TI",
      "Português",
      "Raciocínio Lógico",
      "Direito Administrativo",
      "Direito Constitucional",
    ],
  },
  {
    label: "Personalizado",
    disciplines: [],
  },
];

const COLORS = [
  "#6366f1",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
];

type Step = "welcome" | "concurso" | "disciplinas" | "meta" | "done";

interface Props {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: Props) {
  const utils = trpc.useUtils();
  const [step, setStep] = useState<Step>("welcome");
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customDisciplines, setCustomDisciplines] = useState<string[]>([""]);
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [dailyGoalH, setDailyGoalH] = useState(4);
  const [saving, setSaving] = useState(false);

  const createDiscipline = trpc.discipline.create.useMutation();
  const updateSettings = trpc.auth.updateSettings.useMutation();

  const getDisciplines = (): string[] => {
    if (selectedPreset === null) return [];
    const preset = CONCURSO_PRESETS[selectedPreset];
    if (preset.label === "Personalizado") {
      return customDisciplines.filter((d) => d.trim().length > 0);
    }
    return preset.disciplines;
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const disciplines = getDisciplines();
      // Create disciplines with colors
      for (let i = 0; i < disciplines.length; i++) {
        await createDiscipline.mutateAsync({
          name: disciplines[i],
          color: COLORS[i % COLORS.length],
          weight: 5,
        });
      }
      // Save exam + goal
      const examId = examName ? `exam-${Date.now()}` : undefined;
      await updateSettings.mutateAsync({
        onboardingCompleted: true,
        dailyGoalMinutes: dailyGoalH * 60,
        ...(examId && examName && examDate
          ? {
              exams: [{ id: examId, name: examName, date: examDate }],
            }
          : {}),
      });
      await utils.discipline.list.invalidate();
      await utils.dashboard.getStats.invalidate();
      setStep("done");
    } catch {
      toast.error("Erro ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    background: "var(--input-bg)",
    border: "1px solid var(--card-border)",
    color: "var(--app-fg)",
  };

  // ── Done ──
  if (step === "done") {
    return (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      >
        <div
          className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl text-center p-8 space-y-5"
          style={{
            background: "var(--card-bg, var(--app-bg))",
            border: "1px solid var(--card-border)",
          }}
        >
          <div
            className="p-5 rounded-2xl inline-flex"
            style={{
              background:
                "color-mix(in srgb, var(--accent-green) 12%, transparent)",
            }}
          >
            <Trophy
              className="h-14 w-14"
              style={{ color: "var(--accent-green)" }}
            />
          </div>
          <div>
            <h2
              className="text-2xl font-black"
              style={{ color: "var(--app-fg)" }}
            >
              Pronto para começar!
            </h2>
            <p className="text-sm mt-2" style={{ color: "var(--muted-text)" }}>
              Suas disciplinas foram criadas. Agora é só estudar!
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            {[
              {
                icon: BookOpen,
                label: "Registre temas",
                color: "var(--primary)",
              },
              {
                icon: Clock,
                label: "Use o cronômetro",
                color: "var(--accent-amber)",
              },
              {
                icon: Brain,
                label: "Faça flashcards",
                color: "var(--accent-green)",
              },
            ].map(({ icon: Icon, label, color }) => (
              <div
                key={label}
                className="rounded-xl p-3 flex flex-col items-center gap-2"
                style={{
                  background: "var(--stat-bg)",
                  border: "1px solid var(--card-border)",
                }}
              >
                <Icon className="h-5 w-5" style={{ color }} />
                <span style={{ color: "var(--muted-text)" }}>{label}</span>
              </div>
            ))}
          </div>
          <button
            onClick={onComplete}
            className="w-full py-3.5 rounded-xl font-bold text-white text-sm"
            style={{ background: "var(--primary)" }}
          >
            Ir para o Dashboard <ArrowRight className="inline h-4 w-4 ml-1" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
        style={{
          background: "var(--card-bg, var(--app-bg))",
          border: "1px solid var(--card-border)",
        }}
      >
        {/* Progress bar */}
        <div className="h-1" style={{ background: "var(--stat-bg)" }}>
          <div
            className="h-full transition-all duration-500"
            style={{
              background: "var(--primary)",
              width:
                step === "welcome"
                  ? "10%"
                  : step === "concurso"
                    ? "35%"
                    : step === "disciplinas"
                      ? "65%"
                      : "90%",
            }}
          />
        </div>

        <div className="p-6 md:p-8 space-y-6">
          {/* ── Welcome ── */}
          {step === "welcome" && (
            <>
              <div className="text-center space-y-3">
                <div
                  className="inline-flex p-4 rounded-2xl"
                  style={{
                    background:
                      "color-mix(in srgb, var(--primary) 12%, transparent)",
                  }}
                >
                  <Sparkles
                    className="h-10 w-10"
                    style={{ color: "var(--primary)" }}
                  />
                </div>
                <h1
                  className="text-2xl font-black"
                  style={{ color: "var(--app-fg)" }}
                >
                  Bem-vindo ao SOE!
                </h1>
                <p className="text-sm" style={{ color: "var(--muted-text)" }}>
                  Sistema de Organização de Estudos para concursos. Vamos
                  configurar tudo em menos de 2 minutos.
                </p>
              </div>
              <div className="space-y-2">
                {[
                  {
                    icon: BookOpen,
                    text: "Crie suas disciplinas automaticamente baseado no concurso",
                  },
                  { icon: Target, text: "Defina sua meta diária de estudos" },
                  {
                    icon: Zap,
                    text: "Comece a registrar temas, revisões e flashcards",
                  },
                ].map(({ icon: Icon, text }) => (
                  <div
                    key={text}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{
                      background: "var(--stat-bg)",
                      border: "1px solid var(--card-border)",
                    }}
                  >
                    <Icon
                      className="h-4 w-4 shrink-0"
                      style={{ color: "var(--primary)" }}
                    />
                    <span
                      className="text-sm"
                      style={{ color: "var(--app-fg)" }}
                    >
                      {text}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setStep("concurso")}
                className="w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2"
                style={{ background: "var(--primary)" }}
              >
                Configurar agora <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}

          {/* ── Concurso ── */}
          {step === "concurso" && (
            <>
              <div>
                <h2
                  className="text-xl font-black"
                  style={{ color: "var(--app-fg)" }}
                >
                  Qual é o seu concurso?
                </h2>
                <p
                  className="text-sm mt-1"
                  style={{ color: "var(--muted-text)" }}
                >
                  Escolha um preset e suas disciplinas serão criadas
                  automaticamente
                </p>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {CONCURSO_PRESETS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedPreset(i)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                    style={{
                      background:
                        selectedPreset === i
                          ? "color-mix(in srgb, var(--primary) 10%, transparent)"
                          : "var(--stat-bg)",
                      border: `1.5px solid ${selectedPreset === i ? "var(--primary)" : "var(--card-border)"}`,
                    }}
                  >
                    <span
                      className="flex-1 text-sm font-medium"
                      style={{ color: "var(--app-fg)" }}
                    >
                      {p.label}
                    </span>
                    {selectedPreset === i && (
                      <Check
                        className="h-4 w-4 shrink-0"
                        style={{ color: "var(--primary)" }}
                      />
                    )}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="text-xs font-medium block mb-1.5"
                    style={{ color: "var(--muted-text)" }}
                  >
                    Nome do concurso (opcional)
                  </label>
                  <input
                    value={examName}
                    onChange={(e) => setExamName(e.target.value)}
                    placeholder="Ex: PF 2025 Agente"
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label
                    className="text-xs font-medium block mb-1.5"
                    style={{ color: "var(--muted-text)" }}
                  >
                    Data da prova (opcional)
                  </label>
                  <input
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep("welcome")}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium"
                  style={{
                    background: "var(--stat-bg)",
                    border: "1px solid var(--card-border)",
                    color: "var(--app-fg)",
                  }}
                >
                  Voltar
                </button>
                <button
                  onClick={() => setStep("disciplinas")}
                  disabled={selectedPreset === null}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                  style={{ background: "var(--primary)" }}
                >
                  Continuar <ChevronRight className="inline h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {/* ── Disciplinas ── */}
          {step === "disciplinas" && (
            <>
              <div>
                <h2
                  className="text-xl font-black"
                  style={{ color: "var(--app-fg)" }}
                >
                  {selectedPreset !== null &&
                  CONCURSO_PRESETS[selectedPreset].label === "Personalizado"
                    ? "Quais disciplinas você estuda?"
                    : "Confirme as disciplinas"}
                </h2>
                <p
                  className="text-sm mt-1"
                  style={{ color: "var(--muted-text)" }}
                >
                  {selectedPreset !== null &&
                  CONCURSO_PRESETS[selectedPreset].label === "Personalizado"
                    ? "Adicione as matérias do seu edital"
                    : "Você pode adicionar ou remover disciplinas depois"}
                </p>
              </div>

              {selectedPreset !== null &&
              CONCURSO_PRESETS[selectedPreset].label === "Personalizado" ? (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {customDisciplines.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: COLORS[i % COLORS.length] }}
                      />
                      <input
                        value={d}
                        onChange={(e) => {
                          const upd = [...customDisciplines];
                          upd[i] = e.target.value;
                          setCustomDisciplines(upd);
                        }}
                        placeholder={`Disciplina ${i + 1}`}
                        className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                        style={inputStyle}
                      />
                      {customDisciplines.length > 1 && (
                        <button
                          onClick={() =>
                            setCustomDisciplines((prev) =>
                              prev.filter((_, j) => j !== i),
                            )
                          }
                          className="p-1.5 rounded-lg"
                          style={{ color: "var(--accent-red, #dc2626)" }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      setCustomDisciplines((prev) => [...prev, ""])
                    }
                    className="text-xs px-3 py-2 rounded-xl w-full"
                    style={{
                      background: "var(--stat-bg)",
                      border: "1px dashed var(--card-border)",
                      color: "var(--muted-text)",
                    }}
                  >
                    + Adicionar disciplina
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {getDisciplines().map((d, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                      style={{
                        background: "var(--stat-bg)",
                        border: "1px solid var(--card-border)",
                      }}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: COLORS[i % COLORS.length] }}
                      />
                      <span
                        className="text-sm truncate"
                        style={{ color: "var(--app-fg)" }}
                      >
                        {d}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("concurso")}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium"
                  style={{
                    background: "var(--stat-bg)",
                    border: "1px solid var(--card-border)",
                    color: "var(--app-fg)",
                  }}
                >
                  Voltar
                </button>
                <button
                  onClick={() => setStep("meta")}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{ background: "var(--primary)" }}
                >
                  Continuar <ChevronRight className="inline h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {/* ── Meta diária ── */}
          {step === "meta" && (
            <>
              <div>
                <h2
                  className="text-xl font-black"
                  style={{ color: "var(--app-fg)" }}
                >
                  Qual sua meta diária?
                </h2>
                <p
                  className="text-sm mt-1"
                  style={{ color: "var(--muted-text)" }}
                >
                  Você pode alterar isso a qualquer momento no Dashboard
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[2, 4, 6, 8, 10, 12].map((h) => (
                  <button
                    key={h}
                    onClick={() => setDailyGoalH(h)}
                    className="py-4 rounded-2xl font-bold transition-all"
                    style={{
                      background:
                        dailyGoalH === h ? "var(--primary)" : "var(--stat-bg)",
                      color: dailyGoalH === h ? "white" : "var(--app-fg)",
                      border: `1.5px solid ${dailyGoalH === h ? "var(--primary)" : "var(--card-border)"}`,
                    }}
                  >
                    <span className="text-2xl font-black">{h}h</span>
                    <br />
                    <span className="text-xs opacity-70">
                      {h < 4 ? "Relaxado" : h < 8 ? "Moderado" : "Intenso"}
                    </span>
                  </button>
                ))}
              </div>

              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{
                  background:
                    "color-mix(in srgb, var(--primary) 8%, transparent)",
                  border:
                    "1px solid color-mix(in srgb, var(--primary) 20%, transparent)",
                }}
              >
                <BarChart3
                  className="h-5 w-5 shrink-0"
                  style={{ color: "var(--primary)" }}
                />
                <p className="text-xs" style={{ color: "var(--app-fg)" }}>
                  Com <strong>{dailyGoalH}h/dia</strong>, você acumula{" "}
                  <strong>{dailyGoalH * 30}h/mês</strong> de estudo —
                  consistência é o segredo.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("disciplinas")}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium"
                  style={{
                    background: "var(--stat-bg)",
                    border: "1px solid var(--card-border)",
                    color: "var(--app-fg)",
                  }}
                >
                  Voltar
                </button>
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: "var(--primary)" }}
                >
                  {saving ? "Criando..." : "Finalizar configuração"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
