/**
 * IntercalacaoPlanner - F06 + F14
 * Planejamento de sessões com intercalação forçada + sugestão automática
 *
 * Base científica (Cap 5.11 + 7.3):
 * - Prática intercalada: 20% vs 63% de acerto (Rohrer & Taylor, 2007)
 * - "Intercalar disciplinas relacionadas detecta semelhanças e diferenças" (Chaves)
 * - "Quanto mais longe a prova, maior o espaçamento ideal" (Küpper-Tetzel et al., 2014)
 * - Birnbaum et al. (2012): discriminação entre conceitos relacionados melhora com intercalação
 */
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import {
  Shuffle,
  Info,
  Plus,
  X,
  ArrowRight,
  CheckCircle2,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const SLOTS = ["Manhã", "Tarde", "Noite"];

type Assignment = { day: number; slot: string; disciplineId: number };

function getInterleaveSuggestion(disciplines: any[]): string {
  if (disciplines.length < 2) return "";
  const sorted = [...disciplines].sort(
    (a: any, b: any) => (b.weight || 1) - (a.weight || 1),
  );
  const top = sorted
    .slice(0, 4)
    .map((d: any) => d.name)
    .join(" ↔ ");
  return `Sugestão: intercale ${top} em dias alternados para maximizar retenção.`;
}

export default function IntercalacaoPlanner() {
  const { data: topicsData } = trpc.topic.list.useQuery();
  const disciplines = topicsData?.disciplines || [];

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [relatedGroups, setRelatedGroups] = useState<number[][]>([]);
  const [showTip, setShowTip] = useState(true);

  const disciplineById = useMemo(() => {
    const map: Record<number, any> = {};
    disciplines.forEach((d: any) => {
      map[d.id] = d;
    });
    return map;
  }, [disciplines]);

  const addAssignment = (day: number, slot: string, disciplineId: number) => {
    const existing = assignments.find(
      (a: any) => a.day === day && a.slot === slot,
    );
    if (existing) {
      setAssignments((prev) =>
        prev.map((a: any) =>
          a.day === day && a.slot === slot ? { ...a, disciplineId } : a,
        ),
      );
    } else {
      setAssignments((prev) => [...prev, { day, slot, disciplineId }]);
    }
  };

  const removeAssignment = (day: number, slot: string) => {
    setAssignments((prev) =>
      prev.filter((a: any) => !(a.day === day && a.slot === slot)),
    );
  };

  const getCell = (day: number, slot: string): number | null => {
    return (
      assignments.find((a: any) => a.day === day && a.slot === slot)
        ?.disciplineId ?? null
    );
  };

  // F14 - Check interleave quality
  const interleaveQuality = useMemo(() => {
    let issues = 0;
    let checks = 0;
    // Check if same discipline appears in consecutive slots
    for (let day = 0; day < 7; day++) {
      const dayCells = SLOTS.map((s: any) => getCell(day, s)).filter(Boolean);
      for (let i = 0; i < dayCells.length - 1; i++) {
        checks++;
        if (dayCells[i] === dayCells[i + 1]) issues++;
      }
    }
    // Check consecutive days
    for (let day = 0; day < 6; day++) {
      for (const slot of SLOTS) {
        const c1 = getCell(day, slot);
        const c2 = getCell(day + 1, slot);
        if (c1 && c1 === c2) {
          issues++;
          checks++;
        }
      }
    }
    if (checks === 0) return null;
    const score = Math.round((1 - issues / checks) * 100);
    return { score, issues };
  }, [assignments]);

  const suggestion = useMemo(
    () => getInterleaveSuggestion(disciplines),
    [disciplines],
  );

  const autoFill = () => {
    if (disciplines.length === 0) return;
    const newAssignments: Assignment[] = [];
    let di = 0;
    for (let day = 0; day < 7; day++) {
      for (const slot of SLOTS) {
        const disciplineId = disciplines[di % disciplines.length].id;
        newAssignments.push({ day, slot, disciplineId });
        di++;
      }
    }
    setAssignments(newAssignments);
    toast.success("Grade preenchida com intercalação automática!");
  };

  const clearAll = () => setAssignments([]);

  const filledCount = assignments.length;
  const totalSlots = 7 * SLOTS.length;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-black" style={{ color: "var(--app-fg)" }}>
          Planejador de Intercalação
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted-text)" }}>
          Monte sua grade semanal intercalando disciplinas. Pesquisas mostram
          que a prática intercalada pode triplicar a retenção em relação ao
          estudo em blocos. (Rohrer & Taylor, 2007)
        </p>
      </div>

      {showTip && (
        <div
          className="flex items-start gap-3 p-3 rounded-xl border"
          style={{
            background: "color-mix(in srgb, var(--primary) 8%, transparent)",
            borderColor: "color-mix(in srgb, var(--primary) 25%, transparent)",
          }}
        >
          <Info
            className="h-4 w-4 mt-0.5 flex-shrink-0"
            style={{ color: "var(--primary)" }}
          />
          <div className="flex-1 text-sm">
            <p className="font-semibold" style={{ color: "var(--primary)" }}>
              Como usar
            </p>
            <p style={{ color: "var(--app-fg)" }}>
              Clique em qualquer célula e selecione uma disciplina. Evite a
              mesma disciplina em blocos consecutivos. O índice de intercalação
              abaixo avalia sua grade em tempo real.
            </p>
            {suggestion && (
              <p className="mt-1 italic" style={{ color: "var(--muted-text)" }}>
                {suggestion}
              </p>
            )}
          </div>
          <button onClick={() => setShowTip(false)}>
            <X className="h-4 w-4 opacity-40" />
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <Button
          size="sm"
          onClick={autoFill}
          disabled={disciplines.length === 0}
        >
          <Shuffle className="h-3.5 w-3.5 mr-1" /> Auto-intercalar
        </Button>
        <Button size="sm" variant="outline" onClick={clearAll}>
          <X className="h-3.5 w-3.5 mr-1" /> Limpar
        </Button>
        {interleaveQuality && (
          <Badge
            className="ml-auto"
            style={{
              background:
                interleaveQuality.score >= 80
                  ? "color-mix(in srgb, var(--accent-green) 20%, transparent)"
                  : interleaveQuality.score >= 50
                    ? "color-mix(in srgb, #eab308 20%, transparent)"
                    : "color-mix(in srgb, var(--accent-red) 20%, transparent)",
              color:
                interleaveQuality.score >= 80
                  ? "var(--accent-green)"
                  : interleaveQuality.score >= 50
                    ? "#a16207"
                    : "var(--accent-red)",
            }}
          >
            Índice de intercalação: {interleaveQuality.score}%
          </Badge>
        )}
      </div>

      {/* Legend */}
      {disciplines.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {disciplines.map((d: any) => (
            <div
              key={d.id}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full"
              style={{
                background: d.color + "22",
                border: `1px solid ${d.color}44`,
              }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: d.color }}
              />
              <span style={{ color: d.color }}>{d.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th
                className="w-20 p-2 text-xs text-left"
                style={{ color: "var(--muted-text)" }}
              >
                Período
              </th>
              {DAYS.map((d: any, i: any) => (
                <th
                  key={i}
                  className="p-2 text-xs text-center font-semibold"
                  style={{ color: "var(--app-fg)" }}
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot: any) => (
              <tr key={slot}>
                <td
                  className="p-2 text-xs font-medium"
                  style={{ color: "var(--muted-text)" }}
                >
                  {slot}
                </td>
                {Array.from({ length: 7 }, (_, day) => {
                  const disciplineId = getCell(day, slot);
                  const disc = disciplineId
                    ? disciplineById[disciplineId]
                    : null;
                  return (
                    <td key={day} className="p-1">
                      <div
                        className="rounded-lg border-2 border-dashed h-14 flex flex-col items-center justify-center cursor-pointer transition-all hover:opacity-80 relative group"
                        style={{
                          borderColor: disc ? disc.color : "var(--card-border)",
                          background: disc
                            ? disc.color + "22"
                            : "var(--stat-bg)",
                        }}
                      >
                        {disc ? (
                          <>
                            <span
                              className="text-xs font-semibold text-center px-1 leading-tight"
                              style={{ color: disc.color }}
                            >
                              {disc.name.length > 12
                                ? disc.name.slice(0, 11) + "…"
                                : disc.name}
                            </span>
                            <button
                              className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => removeAssignment(day, slot)}
                            >
                              <X
                                className="h-3 w-3"
                                style={{ color: disc.color }}
                              />
                            </button>
                          </>
                        ) : (
                          <span
                            className="text-xs"
                            style={{ color: "var(--muted-text)" }}
                          >
                            +
                          </span>
                        )}
                        {/* Dropdown on click */}
                        <select
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          value={disciplineId || ""}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (val) addAssignment(day, slot, val);
                            else removeAssignment(day, slot);
                          }}
                        >
                          <option value="">— vazio —</option>
                          {disciplines.map((d: any) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className="p-3 rounded-xl border text-center"
          style={{
            background: "var(--stat-bg)",
            borderColor: "var(--card-border)",
          }}
        >
          <p
            className="text-2xl font-black"
            style={{ color: "var(--primary)" }}
          >
            {filledCount}/{totalSlots}
          </p>
          <p className="text-xs" style={{ color: "var(--muted-text)" }}>
            Blocos preenchidos
          </p>
        </div>
        <div
          className="p-3 rounded-xl border text-center"
          style={{
            background: "var(--stat-bg)",
            borderColor: "var(--card-border)",
          }}
        >
          <p
            className="text-2xl font-black"
            style={{ color: "var(--accent-green)" }}
          >
            {disciplines.length}
          </p>
          <p className="text-xs" style={{ color: "var(--muted-text)" }}>
            Disciplinas disponíveis
          </p>
        </div>
      </div>

      {interleaveQuality && interleaveQuality.issues > 0 && (
        <div
          className="p-3 rounded-lg text-sm"
          style={{
            background: "color-mix(in srgb, #f97316 8%, transparent)",
            borderColor: "#f97316",
          }}
        >
          <p className="font-semibold" style={{ color: "#f97316" }}>
            ⚠️ {interleaveQuality.issues} bloco(s) com mesma disciplina em
            posições consecutivas
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--app-fg)" }}>
            Tente espaçar disciplinas iguais pelo menos 1 posição para maximizar
            o efeito de intercalação.
          </p>
        </div>
      )}

      <p className="text-xs text-center" style={{ color: "var(--muted-text)" }}>
        Ref: Birnbaum et al. (2012) · Rohrer & Taylor (2007) · Agarwal &
        Agostinelli (2020)
      </p>
    </div>
  );
}
