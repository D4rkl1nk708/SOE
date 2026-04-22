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
  Maximize2, RefreshCw, X, Award, Target, MessageSquare,
  BarChart2, AlertTriangle, FileText, Star, Clock, Zap, CheckCircle2
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
  desvios?: { tipo: string; trecho_original: string; sugestao: string; explicacao: string }[];
  estatisticas?: {
    caracteres: number;
    palavras: number;
    frases: number;
    paragrafos: number;
    conectivos: number;
    tempo_leitura_segundos: number;
    nivel_complexidade?: string;
  };
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

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="soe-card p-4 flex flex-col items-center justify-center gap-1 bg-white/[0.02]">
      <span className="text-2xl font-black tabular-nums" style={{ color: "var(--app-fg)" }}>{value}</span>
      <span className="text-[9px] font-black uppercase tracking-widest opacity-40 text-center">{label}</span>
    </div>
  );
}

export function HighlightedText({ text, desvios }: { text: string; desvios?: any[] }) {
  if (!desvios || desvios.length === 0 || !text) return <span>{text}</span>;
  
  let highlighted = text;
  desvios.forEach((d, i) => {
    if (d.trecho_original && d.trecho_original.length > 2) {
      const parts = highlighted.split(d.trecho_original);
      if (parts.length > 1) {
         highlighted = parts.join(`___MARK_${i}___`);
      }
    }
  });

  const parts = highlighted.split(/___MARK_(\d+)___/);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 1) {
           const desvio = desvios[parseInt(p)];
           return (
             <span key={i} className="relative group/desvio cursor-help transition-all" style={{ textDecoration: "underline wavy var(--accent-red)", textUnderlineOffset: 4, textDecorationThickness: 1.5, background: "color-mix(in srgb, var(--accent-red) 15%, transparent)", borderRadius: 4, padding: "0 2px" }}>
               {desvio.trecho_original}
               <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-2xl bg-slate-900 text-white text-[10px] opacity-0 group-hover/desvio:opacity-100 pointer-events-none transition-opacity z-10 shadow-2xl border border-white/10">
                 <p className="font-black text-rose-400 mb-1.5 uppercase tracking-widest">{desvio.tipo}</p>
                 <p className="opacity-90 leading-tight mb-2.5 text-xs">{desvio.explicacao}</p>
                 <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-2 rounded-xl text-xs font-bold flex items-center gap-2">
                   <CheckCircle2 className="w-3.5 h-3.5" /> {desvio.sugestao}
                 </div>
                 <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-slate-900" />
               </div>
             </span>
           );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
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
  const [activeTab, setActiveTab] = useState<"nota" | "desvios" | "comentarios" | "estat" | "texto">("nota");
  
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
            <div className="flex border-t border-[var(--card-border)] overflow-x-auto no-scrollbar">
              {[
                { id: "nota", icon: Star, label: "Resultado Estimado" },
                { id: "desvios", icon: AlertTriangle, label: "Inadequações", badge: correction.desvios?.length },
                { id: "comentarios", icon: MessageSquare, label: "Parecer Técnico" },
                { id: "estat", icon: BarChart2, label: "Métricas Textuais" },
                { id: "texto", icon: FileText, label: "Raio-X do Texto" }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 min-w-[120px] text-[10px] font-black uppercase tracking-widest transition-colors border-b-2"
                  style={{
                    color: activeTab === t.id ? "var(--app-fg)" : "var(--muted-text)",
                    borderColor: activeTab === t.id ? "var(--primary)" : "transparent",
                    background: activeTab === t.id ? "color-mix(in srgb, var(--primary) 4%, transparent)" : "transparent"
                  }}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                  {t.badge ? (
                    <span className="bg-rose-500 text-white px-1.5 py-0.5 rounded-full text-[8px] ml-1">{t.badge}</span>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-6" style={{ background: "color-mix(in srgb, var(--stat-bg) 50%, transparent)" }}>
              {activeTab === "nota" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex flex-col items-center justify-center py-6">
                    <div className="w-32 h-32 rounded-full border-[6px] flex flex-col items-center justify-center shadow-lg bg-[var(--app-bg)] relative"
                         style={{ borderColor: scoreColor(score) }}>
                      <span className="text-4xl font-black tabular-nums" style={{ color: scoreColor(score) }}>
                        {score.toFixed(1)}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-60">nota final</span>
                    </div>
                    <p className="mt-4 text-sm font-bold opacity-80" style={{ color: "var(--app-fg)" }}>
                      {score >= 8 ? "Mandou bem!!! 🎉🚀" : score >= 6 ? "Bom trabalho, mas pode melhorar! 👍" : "Precisa de mais foco! 🧐"}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(correction.deducoes?.length ?? 0) > 0 && (
                      <section className="soe-card p-4">
                        <h4 className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: "var(--accent-amber)" }}>
                           <AlertTriangle className="w-3 h-3" /> Deduções de Pontuação
                        </h4>
                        <div className="space-y-2">
                          {correction.deducoes!.map((d, i) => (
                            <div key={i} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2 border border-white/5">
                              <span className="text-[11px] font-medium" style={{ color: "var(--app-fg)" }}>{d.motivo}</span>
                              <span className="text-[11px] font-black whitespace-nowrap" style={{ color: "var(--accent-amber)" }}>
                                {d.pontos > 0 ? "-" : ""}{Math.abs(d.pontos)} pt
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                    
                    <div className="space-y-4">
                      {(correction.pontos_positivos?.length ?? 0) > 0 && (
                        <section className="soe-card p-4" style={{ borderColor: "color-mix(in srgb, var(--accent-green) 20%, var(--card-border))" }}>
                          <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 mb-3" style={{ color: "var(--accent-green)" }}>
                            <Award className="w-3 h-3" /> Pontos Fortes
                          </h4>
                          <ul className="space-y-1.5">
                            {correction.pontos_positivos!.map((p, i) => (
                              <li key={i} className="text-[11px] font-medium flex items-start gap-2 leading-tight" style={{ color: "var(--app-fg)" }}>
                                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-500" /> {p}
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "desvios" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {!correction.desvios || correction.desvios.length === 0 ? (
                    <div className="py-10 text-center opacity-50 flex flex-col items-center">
                      <Target className="w-8 h-8 mb-2" />
                      <p className="text-sm font-bold">Nenhuma inadequação estrutural ou gramatical detectada!</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {correction.desvios.map((d, i) => (
                        <div key={i} className="soe-card p-5 border-l-4" style={{ borderLeftColor: "var(--accent-red)" }}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-red-500" />
                              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--muted-text)" }}>{d.tipo}</span>
                            </div>
                          </div>
                          <p className="text-xs font-medium mb-4 opacity-90 leading-relaxed" style={{ color: "var(--app-fg)" }}>{d.explicacao}</p>
                          <div className="flex flex-col sm:flex-row items-stretch gap-3">
                            <div className="flex-1 w-full bg-rose-500/10 text-rose-500 px-4 py-3 rounded-2xl text-xs font-medium border border-rose-500/20 line-through decoration-rose-500/50 flex items-center justify-center text-center">
                              {d.trecho_original}
                            </div>
                            <div className="hidden sm:flex items-center justify-center opacity-30">
                              <span className="text-xl font-black">→</span>
                            </div>
                            <div className="flex-1 w-full bg-emerald-500/10 text-emerald-500 px-4 py-3 rounded-2xl text-xs font-bold border border-emerald-500/20 flex items-center justify-center gap-2 text-center shadow-lg shadow-emerald-500/5">
                              <CheckCircle2 className="w-4 h-4 shrink-0" /> {d.sugestao}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "comentarios" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {correction.parecer && (
                    <section className="soe-card p-5" style={{ background: "color-mix(in srgb, var(--primary) 4%, var(--app-bg))", borderColor: "color-mix(in srgb, var(--primary) 20%, var(--card-border))" }}>
                      <h4 className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: "var(--primary)" }}>
                        <Zap className="w-3 h-3" /> Parecer Estratégico Geral
                      </h4>
                      <p className="text-sm font-medium leading-relaxed opacity-90" style={{ color: "var(--app-fg)" }}>{correction.parecer}</p>
                    </section>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {correction.analise_conteudo && (
                      <section className="soe-card p-5">
                        <h4 className="text-[10px] font-black uppercase tracking-widest mb-3 text-emerald-500">Análise de Conteúdo</h4>
                        <p className="text-xs leading-relaxed opacity-80" style={{ color: "var(--app-fg)" }}>{correction.analise_conteudo}</p>
                      </section>
                    )}
                    {correction.analise_forma && (
                      <section className="soe-card p-5">
                        <h4 className="text-[10px] font-black uppercase tracking-widest mb-3 text-blue-500">Análise de Forma</h4>
                        <p className="text-xs leading-relaxed opacity-80" style={{ color: "var(--app-fg)" }}>{correction.analise_forma}</p>
                      </section>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "estat" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {!correction.estatisticas ? (
                    <div className="py-10 text-center opacity-50 flex flex-col items-center">
                      <BarChart2 className="w-8 h-8 mb-2" />
                      <p className="text-sm font-bold">Métricas detalhadas indisponíveis nesta correção.</p>
                    </div>
                  ) : (
                    <>
                      <section className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--muted-text)" }}>Métricas Gerais do Texto</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                          <StatBox label="Caracteres" value={correction.estatisticas.caracteres} />
                          <StatBox label="Palavras" value={correction.estatisticas.palavras} />
                          <StatBox label="Frases" value={correction.estatisticas.frases} />
                          <StatBox label="Parágrafos" value={correction.estatisticas.paragrafos} />
                          <StatBox label="Conectivos" value={correction.estatisticas.conectivos} />
                        </div>
                      </section>
                      <section className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--muted-text)" }}>Legibilidade</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="soe-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                            <span className="text-xs font-bold opacity-60" style={{ color: "var(--app-fg)" }}>Tempo de Leitura Estimado</span>
                            <div className="flex items-center gap-1.5 font-black text-lg text-blue-400">
                              <Clock className="w-4 h-4" />
                              {Math.floor(correction.estatisticas.tempo_leitura_segundos / 60)}m {correction.estatisticas.tempo_leitura_segundos % 60}s
                            </div>
                          </div>
                          <div className="soe-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                            <span className="text-xs font-bold opacity-60" style={{ color: "var(--app-fg)" }}>Nível de Complexidade</span>
                            <span className="font-black text-lg text-purple-400 uppercase tracking-wider">{correction.estatisticas.nivel_complexidade || "N/A"}</span>
                          </div>
                        </div>
                      </section>
                    </>
                  )}
                </div>
              )}

              {activeTab === "texto" && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="soe-card p-8 bg-[var(--app-bg)] shadow-inner">
                    <div className="text-sm font-medium leading-[2.5] whitespace-pre-wrap" style={{ color: "var(--app-fg)" }}>
                      <HighlightedText text={correction.transcricao || "Transcrição não disponível."} desvios={correction.desvios} />
                    </div>
                  </div>
                  {correction.desvios && correction.desvios.length > 0 && (
                    <p className="text-[10px] font-bold text-center mt-4 opacity-50 uppercase tracking-widest flex items-center justify-center gap-2">
                      <AlertTriangle className="w-3 h-3 text-rose-500" />
                      Passe o mouse sobre os trechos sublinhados para ver as sugestões
                    </p>
                  )}
                </div>
              )}

              {/* Actions footer inside expanded */}
              <div className="flex items-center justify-between pt-6 border-t" style={{ borderColor: "var(--card-border)" }}>
                <button onClick={handleDelete}
                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 px-4 py-2 rounded-xl transition-all"
                  style={{ color: confirmDelete ? "var(--accent-red)" : "var(--muted-text)" }}>
                  <Trash2 className="w-3.5 h-3.5" />
                  {confirmDelete ? "Confirmar Exclusão?" : "Excluir Registro"}
                </button>
                <button onClick={() => onReanalyze(answer)}
                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-2xl transition-all shadow-lg active:scale-95"
                  style={{ background: "var(--primary)", color: "white", boxShadow: "0 4px 15px color-mix(in srgb, var(--primary) 30%, transparent)" }}>
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
