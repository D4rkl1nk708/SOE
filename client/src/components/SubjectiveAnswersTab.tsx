/**
 * SubjectiveAnswersTab
 * --------------------
 * Lista todas as respostas subjetivas corrigidas pela IA,
 * com filtros por banca e disciplina, preview da imagem,
 * transcrição, nota e parecer completo.
 */

import { useState, useEffect } from "react";
import {
  PenLine, Trash2, ChevronDown, ChevronUp, BookOpen,
  Calendar, SlidersHorizontal, ImageOff, Key, CheckCircle2,
  Maximize2, RefreshCw, X
} from "lucide-react";
import { toast } from "sonner";
import { localGetSubjectiveAnswers, localDeleteSubjectiveAnswer, type SubjectiveAnswer } from "@/lib/localDb";
import { BANCAS } from "@/components/SubjectiveEssayModal";
import SubjectiveEssayModal from "@/components/SubjectiveEssayModal";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type ParsedCorrection = {
  transcricao?: string;
  erros_encontrados?: string[];
  pontos_positivos?: string[];
  analise_conteudo?: string;
  analise_forma?: string;
  deducoes?: { motivo: string; pontos: number }[];
  nota_final?: number;
  parecer?: string;
};

function parseCorrection(raw: string): ParsedCorrection {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function scoreColor(n: number) {
  if (n >= 8) return "#16a34a";
  if (n >= 6) return "var(--gold)";
  if (n >= 4) return "#f97316";
  return "#dc2626";
}

function scoreLabel(n: number) {
  if (n >= 8) return "Excelente";
  if (n >= 6) return "Bom";
  if (n >= 4) return "Regular";
  return "Insuficiente";
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ─── Single card ─────────────────────────────────────────────────────────────
function AnswerCard({
  answer, onDelete, onReanalyze,
}: { 
  answer: SubjectiveAnswer & { id: number }; 
  onDelete: (id: number) => void;
  onReanalyze: (answer: SubjectiveAnswer & { id: number }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  
  const correction = parseCorrection(answer.correction);
  const score = correction.nota_final ?? answer.score ?? 0;

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmDelete) { 
      setConfirmDelete(true); 
      setTimeout(() => setConfirmDelete(false), 3000);
      return; 
    }
    await localDeleteSubjectiveAnswer(answer.id);
    onDelete(answer.id);
    toast.success("Resposta removida.");
  };

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)" }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-3">
        {/* Thumbnail */}
        <div
          className="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center cursor-pointer group relative"
          style={{ background: "var(--stat-bg)", border: "1px solid var(--card-border)" }}
          onClick={() => setShowImageModal(true)}
        >
          {answer.imageDataUrl && !imgError ? (
            <>
              <img
                src={answer.imageDataUrl}
                alt="Resposta"
                className="w-full h-full object-cover group-hover:opacity-50 transition-opacity"
                onError={() => setImgError(true)}
              />
              <Maximize2 className="absolute opacity-0 group-hover:opacity-100 w-4 h-4 text-white transition-opacity" />
            </>
          ) : (
            <ImageOff className="w-5 h-5" style={{ color: "var(--muted-text)" }} />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
              style={{
                background: "color-mix(in srgb, var(--primary) 12%, transparent)",
                color: "var(--primary)",
              }}
            >
              {answer.banca}
            </span>
            <span className="text-[10px]" style={{ color: "var(--muted-text)" }}>
              {answer.disciplineName}
            </span>
          </div>
          <p className="text-sm font-bold truncate" style={{ color: "var(--app-fg)" }}>
            {answer.topicName}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <Calendar className="w-3 h-3" style={{ color: "var(--muted-text)" }} />
            <span className="text-[11px]" style={{ color: "var(--muted-text)" }}>
              {formatDate(answer.createdAt)}
            </span>
          </div>
        </div>

        {/* Score badge */}
        <div className="flex-shrink-0 text-center">
          <div
            className="text-2xl font-black leading-none"
            style={{ color: scoreColor(score) }}
          >
            {score.toFixed(1)}
          </div>
          <div className="text-[9px] font-medium mt-0.5" style={{ color: scoreColor(score) }}>
            {scoreLabel(score)}
          </div>
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium hover:opacity-70 transition-opacity"
        style={{
          borderTop: "1px solid var(--card-border)",
          color: "var(--muted-text)",
          background: "var(--stat-bg)",
        }}
      >
        <span>{expanded ? "Ocultar detalhes" : "Ver correção completa"}</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="p-3 space-y-3" style={{ borderTop: "1px solid var(--card-border)" }}>
          {/* Transcription */}
          <section>
            <h4 className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--muted-text)" }}>
              Transcrição
            </h4>
            <div
              className="text-sm rounded-xl p-2.5 whitespace-pre-wrap"
              style={{
                background: "var(--stat-bg)",
                border: "1px solid var(--card-border)",
                color: "var(--app-fg)",
                maxHeight: 140,
                overflowY: "auto",
              }}
            >
              {correction.transcricao || "Transcrição não disponível."}
            </div>
          </section>

          {/* Positives */}
          {(correction.pontos_positivos?.length ?? 0) > 0 && (
            <section>
              <h4 className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#16a34a" }}>
                ✓ Pontos positivos
              </h4>
              <ul className="space-y-0.5">
                {correction.pontos_positivos!.map((p, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: "var(--app-fg)" }}>
                    <span style={{ color: "#16a34a" }}>•</span> {p}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Errors */}
          {(correction.erros_encontrados?.length ?? 0) > 0 && (
            <section>
              <h4 className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#dc2626" }}>
                ✗ Erros encontrados
              </h4>
              <ul className="space-y-0.5">
                {correction.erros_encontrados!.map((e, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: "var(--app-fg)" }}>
                    <span style={{ color: "#dc2626" }}>•</span> {e}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Content analysis */}
          {correction.analise_conteudo && (
            <section>
              <h4 className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--muted-text)" }}>
                Análise de conteúdo
              </h4>
              <p className="text-xs" style={{ color: "var(--app-fg)" }}>{correction.analise_conteudo}</p>
            </section>
          )}

          {/* Form analysis */}
          {correction.analise_forma && (
            <section>
              <h4 className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--muted-text)" }}>
                Análise de forma
              </h4>
              <p className="text-xs" style={{ color: "var(--app-fg)" }}>{correction.analise_forma}</p>
            </section>
          )}

          {/* Deductions */}
          {(correction.deducoes?.length ?? 0) > 0 && (
            <section>
              <h4 className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#f97316" }}>
                Deduções
              </h4>
              <div className="space-y-1">
                {correction.deducoes!.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg px-2.5 py-1"
                    style={{
                      background: "color-mix(in srgb, #f97316 8%, var(--stat-bg))",
                      border: "1px solid color-mix(in srgb, #f97316 18%, transparent)",
                    }}
                  >
                    <span className="text-xs" style={{ color: "var(--app-fg)" }}>{d.motivo}</span>
                    <span className="text-xs font-bold" style={{ color: "#f97316" }}>
                      {d.pontos > 0 ? "-" : ""}{Math.abs(d.pontos)} pt
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Verdict */}
          {correction.parecer && (
            <section
              className="rounded-xl p-2.5"
              style={{
                background: "color-mix(in srgb, var(--primary) 8%, var(--stat-bg))",
                border: "1px solid color-mix(in srgb, var(--primary) 18%, transparent)",
              }}
            >
              <h4 className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--primary)" }}>
                Parecer conclusivo
              </h4>
              <p className="text-xs" style={{ color: "var(--app-fg)" }}>{correction.parecer}</p>
            </section>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--card-border)" }}>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 text-[11px] font-medium hover:opacity-70 transition-all px-2 py-1 rounded-lg"
              style={{ 
                color: confirmDelete ? "#dc2626" : "var(--muted-text)",
                background: confirmDelete ? "color-mix(in srgb, #dc2626 10%, transparent)" : "transparent"
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {confirmDelete ? "Confirmar exclusão?" : "Remover"}
            </button>

            <button
              onClick={() => onReanalyze(answer)}
              className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all"
              style={{ 
                background: "color-mix(in srgb, var(--primary) 12%, transparent)",
                color: "var(--primary)"
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reanalisar
            </button>
          </div>
        </div>
      )}

      {/* Image Modal */}
      <Dialog open={showImageModal} onOpenChange={setShowImageModal}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden bg-black border-none">
          <div className="relative w-full h-full flex items-center justify-center p-4">
            <button 
              onClick={() => setShowImageModal(false)}
              className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-all"
            >
              <X className="w-6 h-6" />
            </button>
            <img 
              src={answer.imageDataUrl} 
              alt="Resposta ampliada" 
              className="max-w-full max-h-[90vh] object-contain shadow-2xl"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab container ────────────────────────────────────────────────────────────
export default function SubjectiveAnswersTab() {
  const [answers, setAnswers] = useState<(SubjectiveAnswer & { id: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBanca, setFilterBanca] = useState<string>("all");
  const [savedKey, setSavedKey] = useState(() => localStorage.getItem("soe_ai_apikey") || "");
  
  // Reanalysis state
  const [reanalyzeTarget, setReanalyzeTarget] = useState<(SubjectiveAnswer & { id: number }) | null>(null);

  const loadAnswers = () => {
    localGetSubjectiveAnswers().then(data => {
      setAnswers(data);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadAnswers();
    
    // Listen for key updates
    const handleKeyUpdate = () => {
      setSavedKey(localStorage.getItem("soe_ai_apikey") || "");
    };
    window.addEventListener('storage', handleKeyUpdate);
    return () => window.removeEventListener('storage', handleKeyUpdate);
  }, []);

  const filtered = filterBanca === "all"
    ? answers
    : answers.filter(a => a.banca === filterBanca);

  const usedBancas = Array.from(new Set(answers.map(a => a.banca)));

  const handleDelete = (id: number) => {
    setAnswers(prev => prev.filter(a => a.id !== id));
  };

  const handleReanalyze = (answer: SubjectiveAnswer & { id: number }) => {
    setReanalyzeTarget(answer);
  };

  // Stats
  const avg = filtered.length > 0
    ? filtered.reduce((sum, a) => {
        const c = parseCorrection(a.correction);
        return sum + (c.nota_final ?? a.score ?? 0);
      }, 0) / filtered.length
    : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black flex items-center gap-2" style={{ color: "var(--app-fg)" }}>
              <PenLine className="w-5 h-5" style={{ color: "var(--gold)" }} />
              Respostas Subjetivas
            </h2>
            <button onClick={() => (window as any).dispatchEvent(new CustomEvent('soe-open-ai-modal'))} 
              className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-xl transition-all"
              style={{ 
                background: savedKey ? "color-mix(in srgb, var(--accent-green) 12%, transparent)" : "var(--stat-bg)", 
                border: `1px solid ${savedKey ? "var(--accent-green)" : "var(--card-border)"}`, 
                color: savedKey ? "var(--accent-green)" : "var(--muted-text)" 
              }}
            >
              <Key className="w-3 h-3" />
              {savedKey ? "IA: configurada" : "Configurar IA"}
            </button>
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--muted-text)" }}>
            Correções de respostas discursivas feitas pela IA durante as revisões
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted-text)" }}>Média Geral</div>
            <div className="text-2xl font-black leading-none" style={{ color: scoreColor(avg) }}>
              {avg.toFixed(1)}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      {usedBancas.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setFilterBanca("all")}
            className="px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all"
            style={{
              background: filterBanca === "all" ? "var(--primary)" : "var(--stat-bg)",
              color: filterBanca === "all" ? "white" : "var(--muted-text)",
              border: `1px solid ${filterBanca === "all" ? "var(--primary)" : "var(--card-border)"}`,
            }}
          >
            Todas
          </button>
          {usedBancas.map(b => (
            <button
              key={b}
              onClick={() => setFilterBanca(b)}
              className="px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all"
              style={{
                background: filterBanca === b ? "var(--primary)" : "var(--stat-bg)",
                color: filterBanca === b ? "white" : "var(--muted-text)",
                border: `1px solid ${filterBanca === b ? "var(--primary)" : "var(--card-border)"}`,
              }}
            >
              {b}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
          <p className="text-sm" style={{ color: "var(--muted-text)" }}>Carregando histórico...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center rounded-3xl border-2 border-dashed" style={{ borderColor: "var(--card-border)", background: "var(--stat-bg)" }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: "var(--card-border)" }}>
            <PenLine className="w-6 h-6" style={{ color: "var(--muted-text)" }} />
          </div>
          <p className="text-sm font-bold" style={{ color: "var(--app-fg)" }}>Nenhuma resposta encontrada</p>
          <p className="text-xs mt-1" style={{ color: "var(--muted-text)" }}>
            {filterBanca === "all" ? "Suas correções de redação aparecerão aqui." : "Nenhuma correção para esta banca."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(a => (
            <AnswerCard 
              key={a.id} 
              answer={a} 
              onDelete={handleDelete} 
              onReanalyze={handleReanalyze}
            />
          ))}
        </div>
      )}

      {/* Reanalysis Modal */}
      {reanalyzeTarget && (
        <SubjectiveEssayModal
          open={!!reanalyzeTarget}
          onClose={() => setReanalyzeTarget(null)}
          revisionId={reanalyzeTarget.revisionId}
          topicId={reanalyzeTarget.topicId}
          topicName={reanalyzeTarget.topicName}
          disciplineName={reanalyzeTarget.disciplineName}
          revisionLabel="Reanálise de Resposta"
          onMarkCompleted={() => {
            loadAnswers();
            setReanalyzeTarget(null);
          }}
        />
      )}
    </div>
  );
}
