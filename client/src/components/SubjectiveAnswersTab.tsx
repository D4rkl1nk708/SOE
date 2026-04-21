/**
 * SubjectiveAnswersTab
 * --------------------
 * Lista todas as respostas subjetivas corrigidas pela IA,
 * com filtros por banca e disciplina, preview da imagem,
 * transcrição, nota e parecer completo.
 */

import { useState, useEffect } from "react";
import {
  PenLine, Trash2, ChevronDown, ChevronUp,
  Calendar, SlidersHorizontal, ImageOff, Key,
  Maximize2, RefreshCw, X, Award, Target, MessageSquare
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { localGetSubjectiveAnswers, localDeleteSubjectiveAnswer, type SubjectiveAnswer } from "@/lib/localDb";
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
  if (n >= 8) return "var(--accent-green)";
  if (n >= 6) return "var(--accent-amber)";
  if (n >= 4) return "#f97316";
  return "var(--accent-red)";
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
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="soe-card overflow-hidden transition-all group"
      style={{ 
        background: "var(--card-bg)",
        border: expanded ? "1px solid var(--primary)" : "1px solid var(--card-border)",
        boxShadow: expanded ? "0 8px 30px rgba(0,0,0,0.12)" : "none"
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-4 p-4">
        {/* Thumbnail */}
        <div
          className="w-16 h-16 rounded-2xl flex-shrink-0 overflow-hidden flex items-center justify-center cursor-pointer group/thumb relative border border-white/5"
          style={{ background: "var(--stat-bg)" }}
          onClick={() => setShowImageModal(true)}
        >
          {answer.imageDataUrl && !imgError ? (
            <>
              <img
                src={answer.imageDataUrl}
                alt="Resposta"
                className="w-full h-full object-cover group-hover/thumb:opacity-50 transition-opacity"
                onError={() => setImgError(true)}
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity bg-black/40">
                <Maximize2 className="w-5 h-5 text-white" />
              </div>
            </>
          ) : (
            <ImageOff className="w-6 h-6 opacity-30" style={{ color: "var(--muted-text)" }} />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest bg-white/5 border border-white/5" style={{ color: "var(--muted-text)" }}>
              {answer.banca}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-widest opacity-40" style={{ color: "var(--muted-text)" }}>
              {answer.disciplineName}
            </span>
          </div>
          <h3 className="text-sm font-black tracking-tight line-clamp-1" style={{ color: "var(--app-fg)" }}>
            {answer.topicName}
          </h3>
          <div className="flex items-center gap-2 mt-1.5 opacity-60">
            <Calendar className="w-3 h-3" style={{ color: "var(--muted-text)" }} />
            <span className="text-[10px] font-bold" style={{ color: "var(--muted-text)" }}>
              {formatDate(answer.createdAt)}
            </span>
          </div>
        </div>

        {/* Score badge */}
        <div className="flex-shrink-0 flex flex-col items-center justify-center bg-[var(--stat-bg)] rounded-2xl p-2 min-w-[64px] border border-[var(--card-border)]">
          <span className="text-2xl font-black tabular-nums leading-none" style={{ color: scoreColor(score) }}>
            {score.toFixed(1)}
          </span>
          <span className="text-[8px] font-black uppercase tracking-tighter mt-1" style={{ color: scoreColor(score) }}>
            {scoreLabel(score)}
          </span>
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-colors border-t"
        style={{
          borderColor: "var(--card-border)",
          color: expanded ? "var(--primary)" : "var(--muted-text)",
          background: expanded ? "color-mix(in srgb, var(--primary) 4%, var(--stat-bg))" : "var(--stat-bg)",
        }}
      >
        <span>{expanded ? "Recolher Detalhes" : "Ver Correção da IA"}</span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4 border-t" style={{ borderColor: "var(--card-border)" }}>
              {/* Transcription */}
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-3 h-3 opacity-40" />
                  <h4 className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--muted-text)" }}>
                    Transcrição
                  </h4>
                </div>
                <div
                  className="text-xs font-medium leading-relaxed rounded-2xl p-4 whitespace-pre-wrap italic"
                  style={{
                    background: "var(--stat-bg)",
                    border: "1px solid var(--card-border)",
                    color: "var(--app-fg)",
                    maxHeight: 160,
                    overflowY: "auto",
                  }}
                >
                  "{correction.transcricao || "Transcrição não disponível."}"
                </div>
              </section>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Positives */}
                {(correction.pontos_positivos?.length ?? 0) > 0 && (
                  <section className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5" style={{ color: "var(--accent-green)" }}>
                      <Award className="w-3 h-3" /> Pontos Fortes
                    </h4>
                    <ul className="space-y-1.5">
                      {correction.pontos_positivos!.map((p, i) => (
                        <li key={i} className="text-[11px] font-medium flex items-start gap-2 leading-tight" style={{ color: "var(--app-fg)" }}>
                          <span className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ background: "var(--accent-green)" }} /> {p}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Errors */}
                {(correction.erros_encontrados?.length ?? 0) > 0 && (
                  <section className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5" style={{ color: "var(--accent-red)" }}>
                      <Target className="w-3 h-3" /> Pontos a Melhorar
                    </h4>
                    <ul className="space-y-1.5">
                      {correction.erros_encontrados!.map((e, i) => (
                        <li key={i} className="text-[11px] font-medium flex items-start gap-2 leading-tight" style={{ color: "var(--app-fg)" }}>
                          <span className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ background: "var(--accent-red)" }} /> {e}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>

              {/* Deductions */}
              {(correction.deducoes?.length ?? 0) > 0 && (
                <section>
                  <h4 className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--accent-amber)" }}>
                    Deduções de Pontuação
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {correction.deducoes!.map((d, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-xl px-3 py-2 border"
                        style={{
                          background: "color-mix(in srgb, var(--accent-amber) 6%, var(--stat-bg))",
                          borderColor: "color-mix(in srgb, var(--accent-amber) 20%, transparent)",
                        }}
                      >
                        <span className="text-[11px] font-medium truncate pr-2" style={{ color: "var(--app-fg)" }}>{d.motivo}</span>
                        <span className="text-[11px] font-black whitespace-nowrap" style={{ color: "var(--accent-amber)" }}>
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
                  className="rounded-2xl p-4 border"
                  style={{
                    background: "color-mix(in srgb, var(--primary) 6%, var(--stat-bg))",
                    borderColor: "color-mix(in srgb, var(--primary) 20%, transparent)",
                  }}
                >
                  <h4 className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2" style={{ color: "var(--primary)" }}>
                    <div className="w-1 h-3 rounded-full" style={{ background: "var(--primary)" }} />
                    Parecer Estratégico
                  </h4>
                  <p className="text-xs font-medium leading-relaxed" style={{ color: "var(--app-fg)" }}>{correction.parecer}</p>
                </section>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: "var(--card-border)" }}>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 px-3 py-1.5 rounded-xl transition-all"
                  style={{ 
                    color: confirmDelete ? "var(--accent-red)" : "var(--muted-text)",
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {confirmDelete ? "Confirmar?" : "Excluir"}
                </button>

                <button
                  onClick={() => onReanalyze(answer)}
                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all"
                  style={{ 
                    background: "var(--primary)",
                    color: "var(--primary-fg, white)"
                  }}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reanalisar com IA
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Modal */}
      <Dialog open={showImageModal} onOpenChange={setShowImageModal}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden bg-black/95 border-none backdrop-blur-xl">
          <div className="relative w-full h-full flex items-center justify-center p-4">
            <button 
              onClick={() => setShowImageModal(false)}
              className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all backdrop-blur-md"
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
    </motion.div>
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
    <div className="space-y-6">
      {/* Header & Stats Dock */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-[var(--stat-bg)] border border-[var(--card-border)] rounded-[2rem] p-6 backdrop-blur-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/20">
              <PenLine className="w-5 h-5 text-black" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight" style={{ color: "var(--app-fg)" }}>
                Repositório Subjetivo
              </h2>
              <p className="text-[11px] font-bold uppercase tracking-widest opacity-40" style={{ color: "var(--muted-text)" }}>
                Gestão de Discursivas e Redações
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1" style={{ color: "var(--muted-text)" }}>Performance Média</p>
            <div className="flex items-baseline justify-end gap-2">
              <span className="text-4xl font-black tabular-nums" style={{ color: scoreColor(avg) }}>
                {avg.toFixed(1)}
              </span>
              <span className="text-xs font-bold opacity-40" style={{ color: "var(--muted-text)" }}>/ 10.0</span>
            </div>
          </div>
          
          <button 
            onClick={() => (window as any).dispatchEvent(new CustomEvent('soe-open-ai-modal'))} 
            className="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all hover:bg-[var(--stat-bg)] group"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center border border-[var(--card-border)] group-hover:scale-110 transition-transform" style={{ color: savedKey ? "var(--accent-green)" : "var(--muted-text)" }}>
              <Key className="w-4 h-4" />
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: savedKey ? "var(--accent-green)" : "var(--muted-text)" }}>
              {savedKey ? "IA Ativa" : "Configurar"}
            </span>
          </button>
        </div>
      </div>

      {/* Filters Dock */}
      {usedBancas.length > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-full bg-[var(--stat-bg)] border border-[var(--card-border)] w-fit">
          <button
            onClick={() => setFilterBanca("all")}
            className="px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
            style={{
              background: filterBanca === "all" ? "var(--primary)" : "transparent",
              color: filterBanca === "all" ? "var(--primary-fg, white)" : "var(--muted-text)",
            }}
          >
            Todas
          </button>
          {usedBancas.map(b => (
            <button
              key={b}
              onClick={() => setFilterBanca(b)}
              className="px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
              style={{
                background: filterBanca === b ? "var(--primary)" : "transparent",
                color: filterBanca === b ? "var(--primary-fg, white)" : "var(--muted-text)",
              }}
            >
              {b}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="py-24 text-center">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="w-10 h-10 border-4 border-t-transparent rounded-full mx-auto mb-4" 
            style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} 
          />
          <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Consultando Banco Local...</p>
        </div>
      ) : filtered.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-20 text-center rounded-[2.5rem] border-2 border-dashed flex flex-col items-center" 
          style={{ borderColor: "var(--card-border)", background: "var(--stat-bg)" }}
        >
          <div className="w-16 h-16 rounded-[2rem] flex items-center justify-center bg-white/5 mb-4">
            <ImageOff className="w-8 h-8 opacity-20" />
          </div>
          <p className="text-sm font-black uppercase tracking-tight" style={{ color: "var(--app-fg)" }}>Sem Correções no Momento</p>
          <p className="text-[11px] font-medium opacity-50 mt-2 max-w-[200px]">
            {filterBanca === "all" ? "Suas avaliações de redação aparecerão aqui após serem corrigidas pela IA." : "Nenhuma correção encontrada para este filtro."}
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map(a => (
              <AnswerCard 
                key={a.id} 
                answer={a} 
                onDelete={handleDelete} 
                onReanalyze={handleReanalyze}
              />
            ))}
          </AnimatePresence>
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
