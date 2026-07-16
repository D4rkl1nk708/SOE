/**
 * SubjectiveAnswersTab
 * --------------------
 * Lista todas as respostas subjetivas corrigidas pela IA,
 * com filtros por banca e disciplina, preview da imagem,
 * transcrição, nota e parecer completo.
 */

import { useState, useEffect } from "react";
import {
  PenLine,
  Trash2,
  ChevronDown,
  ChevronUp,
  Calendar,
  SlidersHorizontal,
  ImageOff,
  Key,
  Maximize2,
  RefreshCw,
  X,
  Award,
  Target,
  MessageSquare,
  BarChart2,
  AlertTriangle,
  FileText,
  Star,
  Clock,
  Zap,
  CheckCircle2,
  Wand2,
  Loader2,
  Sparkles,
  Shuffle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  localGetSubjectiveAnswers,
  localDeleteSubjectiveAnswer,
  type SubjectiveAnswer,
} from "@/lib/localDb";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SubjectiveEssayModal, {
  BANCAS,
} from "@/components/SubjectiveEssayModal";
import { trpc } from "@/lib/trpc";
import { callAiProvider } from "@/lib/aiHelpers";

type ParsedCorrection = {
  transcricao?: string;
  erros_encontrados?: string[];
  pontos_positivos?: string[];
  analise_conteudo?: string;
  analise_forma?: string;
  deducoes?: { motivo: string; pontos: number }[];
  nota_final?: number;
  parecer?: string;
  desvios?: {
    tipo: string;
    trecho_original: string;
    sugestao: string;
    explicacao: string;
  }[];
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
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="soe-card p-4 flex flex-col items-center justify-center gap-1 bg-white/[0.02]">
      <span
        className="text-2xl font-black tabular-nums"
        style={{ color: "var(--app-fg)" }}
      >
        {value}
      </span>
      <span className="text-[9px] font-black uppercase tracking-widest opacity-40 text-center">
        {label}
      </span>
    </div>
  );
}

export function HighlightedText({
  text,
  desvios,
}: {
  text: string;
  desvios?: any[];
}) {
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
            <span
              key={i}
              className="relative group/desvio cursor-help transition-all"
              style={{
                textDecoration: "underline wavy var(--accent-red)",
                textUnderlineOffset: 4,
                textDecorationThickness: 1.5,
                background:
                  "color-mix(in srgb, var(--accent-red) 15%, transparent)",
                borderRadius: 4,
                padding: "0 2px",
              }}
            >
              {desvio.trecho_original}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-2xl bg-slate-900 text-white text-[10px] opacity-0 group-hover/desvio:opacity-100 pointer-events-none transition-opacity z-10 shadow-2xl border border-white/10">
                <p className="font-black text-rose-400 mb-1.5 uppercase tracking-widest">
                  {desvio.tipo}
                </p>
                <p className="opacity-90 leading-tight mb-2.5 text-xs">
                  {desvio.explicacao}
                </p>
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
  answer,
  onDelete,
  onReanalyze,
}: {
  answer: SubjectiveAnswer & { id: number };
  onDelete: (id: number) => void;
  onReanalyze: (answer: SubjectiveAnswer & { id: number }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "nota" | "desvios" | "comentarios" | "estat" | "texto"
  >("nota");

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
        border: expanded
          ? "1px solid var(--primary)"
          : "1px solid var(--card-border)",
        boxShadow: expanded ? "0 8px 30px rgba(0,0,0,0.12)" : "none",
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
            <ImageOff
              className="w-6 h-6 opacity-30"
              style={{ color: "var(--muted-text)" }}
            />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest bg-white/5 border border-white/5"
              style={{ color: "var(--muted-text)" }}
            >
              {answer.banca}
            </span>
            <span
              className="text-[9px] font-bold uppercase tracking-widest opacity-40"
              style={{ color: "var(--muted-text)" }}
            >
              {answer.disciplineName}
            </span>
          </div>
          <h3
            className="text-sm font-black tracking-tight line-clamp-1"
            style={{ color: "var(--app-fg)" }}
          >
            {answer.topicName}
          </h3>
          <div className="flex items-center gap-2 mt-1.5 opacity-60">
            <Calendar
              className="w-3 h-3"
              style={{ color: "var(--muted-text)" }}
            />
            <span
              className="text-[10px] font-bold"
              style={{ color: "var(--muted-text)" }}
            >
              {formatDate(answer.createdAt)}
            </span>
          </div>
        </div>

        {/* Score badge */}
        <div className="flex-shrink-0 flex flex-col items-center justify-center bg-[var(--stat-bg)] rounded-2xl p-2 min-w-[64px] border border-[var(--card-border)]">
          <span
            className="text-2xl font-black tabular-nums leading-none"
            style={{ color: scoreColor(score) }}
          >
            {score.toFixed(1)}
          </span>
          <span
            className="text-[8px] font-black uppercase tracking-tighter mt-1"
            style={{ color: scoreColor(score) }}
          >
            {scoreLabel(score)}
          </span>
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-colors border-t"
        style={{
          borderColor: "var(--card-border)",
          color: expanded ? "var(--primary)" : "var(--muted-text)",
          background: expanded
            ? "color-mix(in srgb, var(--primary) 4%, var(--stat-bg))"
            : "var(--stat-bg)",
        }}
      >
        <span>{expanded ? "Recolher Detalhes" : "Ver Correção da IA"}</span>
        {expanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
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
                {
                  id: "desvios",
                  icon: AlertTriangle,
                  label: "Inadequações",
                  badge: correction.desvios?.length,
                },
                {
                  id: "comentarios",
                  icon: MessageSquare,
                  label: "Parecer Técnico",
                },
                { id: "estat", icon: BarChart2, label: "Métricas Textuais" },
                { id: "texto", icon: FileText, label: "Raio-X do Texto" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 min-w-[120px] text-[10px] font-black uppercase tracking-widest transition-colors border-b-2"
                  style={{
                    color:
                      activeTab === t.id
                        ? "var(--app-fg)"
                        : "var(--muted-text)",
                    borderColor:
                      activeTab === t.id ? "var(--primary)" : "transparent",
                    background:
                      activeTab === t.id
                        ? "color-mix(in srgb, var(--primary) 4%, transparent)"
                        : "transparent",
                  }}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                  {t.badge ? (
                    <span className="bg-rose-500 text-white px-1.5 py-0.5 rounded-full text-[8px] ml-1">
                      {t.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <div
              className="p-6 space-y-6"
              style={{
                background:
                  "color-mix(in srgb, var(--stat-bg) 50%, transparent)",
              }}
            >
              {activeTab === "nota" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex flex-col items-center justify-center py-6">
                    <div
                      className="w-32 h-32 rounded-full border-[6px] flex flex-col items-center justify-center shadow-lg bg-[var(--app-bg)] relative"
                      style={{ borderColor: scoreColor(score) }}
                    >
                      <span
                        className="text-4xl font-black tabular-nums"
                        style={{ color: scoreColor(score) }}
                      >
                        {score.toFixed(1)}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
                        nota final
                      </span>
                    </div>
                    <p
                      className="mt-4 text-sm font-bold opacity-80"
                      style={{ color: "var(--app-fg)" }}
                    >
                      {score >= 8
                        ? "Mandou bem!!! 🎉🚀"
                        : score >= 6
                          ? "Bom trabalho, mas pode melhorar! 👍"
                          : "Precisa de mais foco! 🧐"}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(correction.deducoes?.length ?? 0) > 0 && (
                      <section className="soe-card p-4">
                        <h4
                          className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2"
                          style={{ color: "var(--accent-amber)" }}
                        >
                          <AlertTriangle className="w-3 h-3" /> Deduções de
                          Pontuação
                        </h4>
                        <div className="space-y-2">
                          {correction.deducoes!.map((d, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2 border border-white/5"
                            >
                              <span
                                className="text-[11px] font-medium"
                                style={{ color: "var(--app-fg)" }}
                              >
                                {d.motivo}
                              </span>
                              <span
                                className="text-[11px] font-black whitespace-nowrap"
                                style={{ color: "var(--accent-amber)" }}
                              >
                                {d.pontos > 0 ? "-" : ""}
                                {Math.abs(d.pontos)} pt
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    <div className="space-y-4">
                      {(correction.pontos_positivos?.length ?? 0) > 0 && (
                        <section
                          className="soe-card p-4"
                          style={{
                            borderColor:
                              "color-mix(in srgb, var(--accent-green) 20%, var(--card-border))",
                          }}
                        >
                          <h4
                            className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 mb-3"
                            style={{ color: "var(--accent-green)" }}
                          >
                            <Award className="w-3 h-3" /> Pontos Fortes
                          </h4>
                          <ul className="space-y-1.5">
                            {correction.pontos_positivos!.map((p, i) => (
                              <li
                                key={i}
                                className="text-[11px] font-medium flex items-start gap-2 leading-tight"
                                style={{ color: "var(--app-fg)" }}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-500" />{" "}
                                {p}
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
                      <p className="text-sm font-bold">
                        Nenhuma inadequação estrutural ou gramatical detectada!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {correction.desvios.map((d, i) => (
                        <div
                          key={i}
                          className="soe-card p-5 border-l-4"
                          style={{ borderLeftColor: "var(--accent-red)" }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-red-500" />
                              <span
                                className="text-[10px] font-black uppercase tracking-widest"
                                style={{ color: "var(--muted-text)" }}
                              >
                                {d.tipo}
                              </span>
                            </div>
                          </div>
                          <p
                            className="text-xs font-medium mb-4 opacity-90 leading-relaxed"
                            style={{ color: "var(--app-fg)" }}
                          >
                            {d.explicacao}
                          </p>
                          <div className="flex flex-col sm:flex-row items-stretch gap-3">
                            <div className="flex-1 w-full bg-rose-500/10 text-rose-500 px-4 py-3 rounded-2xl text-xs font-medium border border-rose-500/20 line-through decoration-rose-500/50 flex items-center justify-center text-center">
                              {d.trecho_original}
                            </div>
                            <div className="hidden sm:flex items-center justify-center opacity-30">
                              <span className="text-xl font-black">→</span>
                            </div>
                            <div className="flex-1 w-full bg-emerald-500/10 text-emerald-500 px-4 py-3 rounded-2xl text-xs font-bold border border-emerald-500/20 flex items-center justify-center gap-2 text-center shadow-lg shadow-emerald-500/5">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />{" "}
                              {d.sugestao}
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
                    <section
                      className="soe-card p-5"
                      style={{
                        background:
                          "color-mix(in srgb, var(--primary) 4%, var(--app-bg))",
                        borderColor:
                          "color-mix(in srgb, var(--primary) 20%, var(--card-border))",
                      }}
                    >
                      <h4
                        className="text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2"
                        style={{ color: "var(--primary)" }}
                      >
                        <Zap className="w-3 h-3" /> Parecer Estratégico Geral
                      </h4>
                      <p
                        className="text-sm font-medium leading-relaxed opacity-90"
                        style={{ color: "var(--app-fg)" }}
                      >
                        {correction.parecer}
                      </p>
                    </section>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {correction.analise_conteudo && (
                      <section className="soe-card p-5">
                        <h4 className="text-[10px] font-black uppercase tracking-widest mb-3 text-emerald-500">
                          Análise de Conteúdo
                        </h4>
                        <p
                          className="text-xs leading-relaxed opacity-80"
                          style={{ color: "var(--app-fg)" }}
                        >
                          {correction.analise_conteudo}
                        </p>
                      </section>
                    )}
                    {correction.analise_forma && (
                      <section className="soe-card p-5">
                        <h4 className="text-[10px] font-black uppercase tracking-widest mb-3 text-blue-500">
                          Análise de Forma
                        </h4>
                        <p
                          className="text-xs leading-relaxed opacity-80"
                          style={{ color: "var(--app-fg)" }}
                        >
                          {correction.analise_forma}
                        </p>
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
                      <p className="text-sm font-bold">
                        Métricas detalhadas indisponíveis nesta correção.
                      </p>
                    </div>
                  ) : (
                    <>
                      <section className="space-y-3">
                        <h4
                          className="text-[10px] font-black uppercase tracking-widest"
                          style={{ color: "var(--muted-text)" }}
                        >
                          Métricas Gerais do Texto
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                          <StatBox
                            label="Caracteres"
                            value={correction.estatisticas.caracteres}
                          />
                          <StatBox
                            label="Palavras"
                            value={correction.estatisticas.palavras}
                          />
                          <StatBox
                            label="Frases"
                            value={correction.estatisticas.frases}
                          />
                          <StatBox
                            label="Parágrafos"
                            value={correction.estatisticas.paragrafos}
                          />
                          <StatBox
                            label="Conectivos"
                            value={correction.estatisticas.conectivos}
                          />
                        </div>
                      </section>
                      <section className="space-y-3">
                        <h4
                          className="text-[10px] font-black uppercase tracking-widest"
                          style={{ color: "var(--muted-text)" }}
                        >
                          Legibilidade
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="soe-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                            <span
                              className="text-xs font-bold opacity-60"
                              style={{ color: "var(--app-fg)" }}
                            >
                              Tempo de Leitura Estimado
                            </span>
                            <div className="flex items-center gap-1.5 font-black text-lg text-blue-400">
                              <Clock className="w-4 h-4" />
                              {Math.floor(
                                correction.estatisticas.tempo_leitura_segundos /
                                  60,
                              )}
                              m{" "}
                              {correction.estatisticas.tempo_leitura_segundos %
                                60}
                              s
                            </div>
                          </div>
                          <div className="soe-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                            <span
                              className="text-xs font-bold opacity-60"
                              style={{ color: "var(--app-fg)" }}
                            >
                              Nível de Complexidade
                            </span>
                            <span className="font-black text-lg text-purple-400 uppercase tracking-wider">
                              {correction.estatisticas.nivel_complexidade ||
                                "N/A"}
                            </span>
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
                    <div
                      className="text-sm font-medium leading-[2.5] whitespace-pre-wrap"
                      style={{ color: "var(--app-fg)" }}
                    >
                      <HighlightedText
                        text={
                          correction.transcricao ||
                          "Transcrição não disponível."
                        }
                        desvios={correction.desvios}
                      />
                    </div>
                  </div>
                  {correction.desvios && correction.desvios.length > 0 && (
                    <p className="text-[10px] font-bold text-center mt-4 opacity-50 uppercase tracking-widest flex items-center justify-center gap-2">
                      <AlertTriangle className="w-3 h-3 text-rose-500" />
                      Passe o mouse sobre os trechos sublinhados para ver as
                      sugestões
                    </p>
                  )}
                </div>
              )}

              {/* Actions footer inside expanded */}
              <div
                className="flex items-center justify-between pt-6 border-t"
                style={{ borderColor: "var(--card-border)" }}
              >
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 px-4 py-2 rounded-xl transition-all"
                  style={{
                    color: confirmDelete
                      ? "var(--accent-red)"
                      : "var(--muted-text)",
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {confirmDelete ? "Confirmar Exclusão?" : "Excluir Registro"}
                </button>
                <button
                  onClick={() => onReanalyze(answer)}
                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-2xl transition-all shadow-lg active:scale-95"
                  style={{
                    background: "var(--primary)",
                    color: "white",
                    boxShadow:
                      "0 4px 15px color-mix(in srgb, var(--primary) 30%, transparent)",
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

// ─── Daily Challenge ────────────────────────────────────────────────────────
function DailySubjectiveChallenge({
  onStartWriting,
  onDraftSaved,
  savedKey,
  savedProvider,
}: {
  onStartWriting: (
    topicId: number,
    topicName: string,
    disciplineId: number,
    disciplineName: string,
    questionStatement: string,
    banca: string,
  ) => void;
  onDraftSaved: () => void;
  savedKey: string;
  savedProvider: string;
}) {
  const [focusDiscIds, setFocusDiscIds] = useState<number[]>(() => {
    const saved = localStorage.getItem("soe_subj_focus_discs");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [banca, setBanca] = useState<string>("CESPE/CEBRASPE");
  const [generating, setGenerating] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);
  const [activeTopic, setActiveTopic] = useState<any>(null);
  const [selectionReason, setSelectionReason] = useState<string | null>(null);
  const [isInitialDropdownOpen, setIsInitialDropdownOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const { data: disciplines } = trpc.discipline.list.useQuery();
  const { data: topicsData } = trpc.topic.list.useQuery();

  const toggleDisc = (id: number) => {
    const next = focusDiscIds.includes(id)
      ? focusDiscIds.filter((x) => x !== id)
      : [...focusDiscIds, id];
    setFocusDiscIds(next);
    localStorage.setItem("soe_subj_focus_discs", JSON.stringify(next));
    setQuestion(null);
    setActiveTopic(null);
    setSelectionReason(null);
  };

  const generateQuestion = async (
    mode: "recommended" | "random" = "recommended",
  ) => {
    if (focusDiscIds.length === 0 || !topicsData?.topics?.length) {
      toast.error(
        "Escolha pelo menos uma disciplina e certifique-se de que ela tenha temas.",
      );
      return;
    }
    if (!savedKey) {
      toast.error("Configure sua chave de IA primeiro clicando em Configurar!");
      return;
    }
    setGenerating(true);
    setQuestion(null);
    setSelectionReason(null);
    try {
      const candidateTopics = topicsData.topics.filter((t) =>
        focusDiscIds.includes(t.disciplineId),
      );
      if (candidateTopics.length === 0) {
        throw new Error("Nenhum tema encontrado nas disciplinas selecionadas.");
      }

      const topicsContext = candidateTopics.map((t) => {
        const d = (disciplines as any[])?.find((x) => x.id === t.disciplineId);
        return {
          id: t.id,
          nome: t.name,
          disciplina: d?.name || "",
          acertos: t.performance?.correctCount || 0,
          erros: t.performance?.errorCount || 0,
          revisoes: 0,
        };
      });

      const bancaStyleGuide: Record<string, string> = {
        "CESPE/CEBRASPE": `FORMATO OBRIGATÓRIO CESPE/CEBRASPE:
- Apresente um TEXTO MOTIVADOR de 3 a 5 linhas contextualizando a situação (pode ser um trecho de lei, doutrina, notícia ou caso hipotético).
- Após o texto motivador, insira a frase: "Considerando o texto acima e com base nos conhecimentos correlatos, redija um texto dissertativo acerca do seguinte tema:"
- Em seguida, apresente o TEMA CENTRAL em negrito/destaque.
- Logo abaixo, liste de 2 a 4 TÓPICOS OBRIGATÓRIOS numerados que o candidato deve abordar. Use o formato: "Ao elaborar seu texto, atenda, necessariamente, ao que se pede a seguir:" seguido de "1 >" "2 >" etc.
- Inclua ao final: "Extensão: mínimo de 20 e máximo de 30 linhas."
- O CESPE distribui pontos por tópicos individuais. O estilo é técnico, formal e exige que o candidato responda EXATAMENTE cada sub-item.
- NÃO faça perguntas diretas ("O que é...?"). Use comandos como "discorra sobre", "apresente", "explique", "diferencie".`,

        FGV: `FORMATO OBRIGATÓRIO FGV:
- Apresente um CENÁRIO ou SITUAÇÃO HIPOTÉTICA detalhada (5 a 8 linhas) que contextualize o problema.
- A questão deve exigir FUNDAMENTAÇÃO TÉCNICA/LEGAL obrigatória (citação de artigos de lei, princípios, doutrina).
- Divida a questão em ITENS (a), (b), (c) — cada item valendo uma parte da nota.
- Cada item deve pedir uma análise específica diferente: conceito, aplicação ao caso, consequências jurídicas/técnicas, etc.
- Inclua ao final: "Limite: até 30 linhas."
- O estilo FGV é analítico e valoriza profundidade argumentativa com referências normativas.`,

        VUNESP: `FORMATO OBRIGATÓRIO VUNESP:
- Apresente uma PROPOSTA DE REDAÇÃO com tema claramente delimitado.
- Inclua um ou dois TEXTOS DE APOIO curtos (2-3 linhas cada) com perspectivas diferentes sobre o tema para servir de base.
- Solicite um texto dissertativo-argumentativo em que o candidato demonstre posicionamento claro.
- A VUNESP valoriza estrutura lógica rígida: introdução com tese, desenvolvimento com argumentos e conclusão com proposta.
- Inclua: "Extensão: entre 20 e 30 linhas. A redação deve ser redigida em prosa."
- VUNESP penaliza textos em tópicos quando se pede texto corrido e valoriza linguagem formal e adequação vocabular.`,

        FCC: `FORMATO OBRIGATÓRIO FCC:
- Apresente um ESTUDO DE CASO com cenário detalhado e realista (problema administrativo, técnico ou jurídico).
- Formule a questão com TÓPICOS ESPECÍFICOS letrados: a), b), c) — cada tópico solicita uma análise distinta.
- A FCC exige que o candidato aplique teoria ao caso concreto, citando legislação quando pertinente.
- Inclua ao final: "Responda de forma fundamentada, utilizando no máximo 30 linhas."
- O espelho de correção da FCC distribui pontos rigorosamente por tópico — se o candidato ignorar um item, perde a nota integral daquele item.`,

        ESAF: `FORMATO OBRIGATÓRIO ESAF:
- Formule uma questão TÉCNICA DIRETA focada em conceitos administrativos, financeiros ou tributários.
- Apresente o tema de forma concisa e solicite que o candidato DISCORRA tecnicamente, com uso obrigatório de terminologia específica da área.
- Divida em 2 a 3 sub-itens com comandos como "conceitue", "diferencie", "analise criticamente", "apresente as consequências".
- ESAF pune imprecisão mesmo quando o candidato demonstra entendimento parcial.
- Inclua: "Extensão: até 30 linhas."`,

        IADES: `FORMATO OBRIGATÓRIO IADES:
- Apresente um contexto breve seguido de uma questão discursiva direta.
- Solicite texto dissertativo com fundamentação técnica.
- Inclua 2 a 3 aspectos obrigatórios que devem ser abordados.
- Inclua: "Extensão: entre 15 e 30 linhas."`,

        IDECAN: `FORMATO OBRIGATÓRIO IDECAN:
- Apresente um texto motivador curto ou uma situação-problema.
- Formule a questão com foco em análise prática.
- Solicite que o candidato aborde pelo menos 2 aspectos técnicos específicos.
- Inclua: "Extensão: entre 20 e 30 linhas."`,

        QUADRIX: `FORMATO OBRIGATÓRIO QUADRIX:
- Apresente um tema de forma objetiva com contexto breve.
- Solicite uma redação dissertativo-argumentativa.
- Inclua aspectos específicos que devem ser contemplados.
- Inclua: "Extensão: entre 20 e 30 linhas."`,

        AOCP: `FORMATO OBRIGATÓRIO AOCP:
- Apresente um tema técnico com cenário contextualizado.
- Formule questão discursiva com itens específicos (a, b, c) para resposta.
- AOCP valoriza conhecimento técnico aplicado ao cargo.
- Inclua: "Extensão: até 30 linhas."`,

        IBFC: `FORMATO OBRIGATÓRIO IBFC:
- Apresente uma situação-problema ou tema contextualizado.
- Solicite dissertação argumentativa com posicionamento claro.
- Inclua: "Extensão: entre 15 e 30 linhas."`,

        IBADE: `FORMATO OBRIGATÓRIO IBADE:
- Apresente um texto motivador e formule a questão discursiva.
- Solicite análise técnica com fundamentação.
- Inclua: "Extensão: até 30 linhas."`,

        FUNRIO: `FORMATO OBRIGATÓRIO FUNRIO:
- Apresente tema com contextualização objetiva.
- Solicite texto dissertativo com argumentação técnica.
- Inclua: "Extensão: entre 20 e 30 linhas."`,
      };

      const styleGuide =
        bancaStyleGuide[banca] || bancaStyleGuide["CESPE/CEBRASPE"];

      let prompt = "";
      let clientSelectedTopic: any = null;

      if (mode === "random") {
        clientSelectedTopic =
          candidateTopics[Math.floor(Math.random() * candidateTopics.length)];
        prompt = `Você é um elaborador de provas de concurso da banca ${banca}. Sua tarefa é produzir uma questão discursiva AUTÊNTICA especificamente sobre o tema "${clientSelectedTopic.name}".

${styleGuide}

REGRAS INVIOLÁVEIS:
- A questão deve ser INDISTINGUÍVEL de uma questão real da banca ${banca}.
- O enunciado deve parecer extraído diretamente de um caderno de provas oficial.
- NÃO invente siglas, leis ou artigos inexistentes. Use apenas referências reais e corretas.
- O nível de dificuldade deve ser compatível com provas de nível superior.

Retorne APENAS um JSON válido (sem markdown, sem blocos de código) no formato:
{
  "topicId": ${clientSelectedTopic.id},
  "question": "<enunciado COMPLETO da questão no formato exato da banca. USE \\n para separar parágrafos: texto motivador em um bloco, comando da questão em outro, cada tópico/item em linha separada, extensão em linha final separada>",
  "reason": "Tema selecionado de forma aleatória para garantir diversidade e rodízio nos seus estudos."
}`;
      } else {
        prompt = `Você é um elaborador de provas de concurso da banca ${banca}. Sua tarefa é produzir uma questão discursiva AUTÊNTICA, baseando-se no histórico de desempenho do aluno para escolher o tema mais crítico.

DADOS DO ALUNO:
${JSON.stringify(topicsContext)}

${styleGuide}

REGRAS INVIOLÁVEIS:
- A questão deve ser INDISTINGUÍVEL de uma questão real da banca ${banca}.
- O enunciado deve parecer extraído diretamente de um caderno de provas oficial.
- NÃO invente siglas, leis ou artigos inexistentes. Use apenas referências reais e corretas.
- O nível de dificuldade deve ser compatível com provas de nível superior.
- ESCOLHA o tema onde o aluno tem pior desempenho (mais erros acumulados em relação aos acertos). 
- No campo "reason", explique formalmente a justificativa baseada nos dados do aluno. Exemplos: "Recomendado por ser um tema crítico no qual você possui X erros e Y acertos", "Recomendado por ser um tema crítico onde você ainda não realizou questões."

Retorne APENAS um JSON válido (sem markdown, sem blocos de código) no formato:
{
  "topicId": <ID numérico do tema escolhido da lista>,
  "question": "<enunciado COMPLETO da questão no formato exato da banca. USE \\n para separar parágrafos: texto motivador em um bloco, comando da questão em outro, cada tópico/item em linha separada, extensão em linha final separada>",
  "reason": "<Justificativa personalizada citando o histórico de desempenho do aluno no tema escolhido>"
}`;
      }

      const rawResponse = await callAiProvider(
        savedProvider as any,
        savedKey,
        prompt,
        2500,
      );
      let parsed;
      try {
        const jsonStr = rawResponse
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        throw new Error("Falha ao entender a resposta da IA. Tente novamente.");
      }

      const selectedTopic =
        mode === "random"
          ? clientSelectedTopic
          : candidateTopics.find((t) => t.id === parsed.topicId);
      if (!selectedTopic) throw new Error("A IA selecionou um tema inválido.");

      setActiveTopic(selectedTopic);
      setQuestion(parsed.question.trim());
      setSelectionReason(parsed.reason);
    } catch (e: any) {
      toast.error("Erro ao gerar questão: " + e.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="soe-card p-6 border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent relative overflow-hidden mb-6">
      <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
        <Target className="w-32 h-32 text-emerald-500" />
      </div>

      <div className="flex items-center gap-3 mb-6 relative z-10">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-emerald-500/20 text-emerald-500 border border-emerald-500/20">
          <Zap className="w-5 h-5" />
        </div>
        <div>
          <h3
            className="text-lg font-black tracking-tight"
            style={{ color: "var(--app-fg)" }}
          >
            Treino Subjetivo Diário
          </h3>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 text-emerald-500">
            A IA gera uma discursiva inédita todo dia
          </p>
        </div>
      </div>

      <div className="relative z-10 space-y-5">
        <div className="space-y-3">
          <p
            className="text-sm font-medium opacity-80"
            style={{ color: "var(--app-fg)" }}
          >
            Selecione as disciplinas para o rodízio de discursivas:
          </p>
          <div className="flex flex-wrap gap-2 max-w-3xl">
            {(disciplines as any[])?.map((d) => {
              const isSelected = focusDiscIds.includes(d.id);
              return (
                <button
                  key={d.id}
                  onClick={() => toggleDisc(d.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 flex items-center gap-2 ${isSelected ? "shadow-lg" : "hover:bg-white/5"}`}
                  style={{
                    background: isSelected ? d.color : "transparent",
                    color: isSelected ? "white" : "var(--app-fg)",
                    borderColor: isSelected ? d.color : "var(--card-border)",
                  }}
                >
                  {isSelected && <CheckCircle2 className="w-3 h-3" />}
                  {d.name}
                </button>
              );
            })}
          </div>
        </div>

        {focusDiscIds.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between pt-4 border-t border-white/5">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-60 text-emerald-500">
              {focusDiscIds.length} disciplina
              {focusDiscIds.length > 1 ? "s" : ""} no radar da IA
            </div>

            {!question && (
              <div className="flex items-center gap-2 w-full sm:w-auto relative">
                <select
                  className="px-3 py-2 rounded-lg text-xs font-bold border outline-none bg-white/5"
                  style={{
                    borderColor: "var(--card-border)",
                    color: "var(--app-fg)",
                  }}
                  value={banca}
                  onChange={(e) => setBanca(e.target.value)}
                >
                  {BANCAS.map((b) => (
                    <option key={b.id} value={b.id} className="bg-slate-900">
                      {b.label}
                    </option>
                  ))}
                </select>

                <div className="relative flex">
                  <button
                    onClick={() => generateQuestion("recommended")}
                    disabled={generating}
                    className="px-4 py-2 rounded-l-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 border-r border-white/10"
                    style={{ background: "var(--primary)", color: "white" }}
                  >
                    {generating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4" />
                    )}
                    Gerar Questão
                  </button>
                  <button
                    onClick={() =>
                      setIsInitialDropdownOpen(!isInitialDropdownOpen)
                    }
                    disabled={generating}
                    className="px-2 py-2 rounded-r-xl text-xs flex items-center justify-center shadow-lg hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                    style={{ background: "var(--primary)", color: "white" }}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  {isInitialDropdownOpen && (
                    <div className="absolute top-full mt-2 right-0 w-60 bg-[#09090b] border border-white/10 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      <button
                        onClick={() => {
                          setIsInitialDropdownOpen(false);
                          generateQuestion("recommended");
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold hover:bg-white/5 flex items-center gap-2 transition-colors"
                        style={{ color: "var(--app-fg)" }}
                      >
                        <Sparkles className="w-4 h-4 text-emerald-500" />
                        <div>
                          <div className="font-black">Recomendada (IA)</div>
                          <div className="text-[10px] opacity-40 font-medium">
                            Analisa suas fraquezas
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          setIsInitialDropdownOpen(false);
                          generateQuestion("random");
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold hover:bg-white/5 flex items-center gap-2 transition-colors mt-1"
                        style={{ color: "var(--app-fg)" }}
                      >
                        <Shuffle className="w-4 h-4 text-amber-500" />
                        <div>
                          <div className="font-black">Aleatória</div>
                          <div className="text-[10px] opacity-40 font-medium">
                            Sorteia um tema livre
                          </div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {question && activeTopic && (
          <div className="mt-4 p-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
                <Target className="w-3 h-3" />
                Tema Selecionado: {activeTopic.name}
              </div>
              {selectionReason && (
                <div className="group relative flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center cursor-help">
                    <span className="text-[10px] font-bold text-emerald-500">
                      ?
                    </span>
                  </div>
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 p-2 bg-black text-white text-[10px] font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    {selectionReason}
                    <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-black"></div>
                  </div>
                </div>
              )}
            </div>
            <div
              className="text-sm font-medium leading-relaxed space-y-3"
              style={{ color: "var(--app-fg)" }}
            >
              {question
                .split("\n")
                .filter(Boolean)
                .map((paragraph, i) => {
                  const isTopicLine = /^\s*(\d+\s*[>.)\-]|[a-z]\s*[).])/i.test(
                    paragraph.trim(),
                  );
                  const isExtensionLine = /extens[aã]o|linhas|limite/i.test(
                    paragraph.trim(),
                  );
                  const isCommandLine =
                    /considerando|redija|elabor|atenda|responda/i.test(
                      paragraph.trim(),
                    );

                  if (isExtensionLine) {
                    return (
                      <p
                        key={i}
                        className="text-xs font-bold uppercase tracking-wide mt-4 pt-3 border-t border-emerald-500/10"
                        style={{ color: "var(--muted-text)" }}
                      >
                        {paragraph.trim()}
                      </p>
                    );
                  }
                  if (isTopicLine) {
                    return (
                      <p
                        key={i}
                        className="pl-4 border-l-2 border-emerald-500/30 text-sm"
                      >
                        {paragraph.trim()}
                      </p>
                    );
                  }
                  if (isCommandLine) {
                    return (
                      <p
                        key={i}
                        className="font-bold text-sm italic"
                        style={{ color: "var(--app-fg)" }}
                      >
                        {paragraph.trim()}
                      </p>
                    );
                  }
                  return (
                    <p key={i} className="text-sm leading-relaxed">
                      {paragraph.trim()}
                    </p>
                  );
                })}
            </div>
            <div className="pt-2 flex justify-end gap-2 relative">
              <div className="relative">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="px-4 py-3 rounded-2xl font-bold text-xs bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-2"
                  style={{ color: "var(--app-fg)" }}
                >
                  Gerar Outra <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                </button>

                {isDropdownOpen && (
                  <div className="absolute bottom-full mb-2 right-0 w-60 bg-[#09090b] border border-white/10 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        generateQuestion("recommended");
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold hover:bg-white/5 flex items-center gap-2 transition-colors"
                      style={{ color: "var(--app-fg)" }}
                    >
                      <Sparkles className="w-4 h-4 text-emerald-500" />
                      <div>
                        <div className="font-black">Recomendada (IA)</div>
                        <div className="text-[10px] opacity-40 font-medium">
                          Analisa suas fraquezas
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        generateQuestion("random");
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold hover:bg-white/5 flex items-center gap-2 transition-colors mt-1"
                      style={{ color: "var(--app-fg)" }}
                    >
                      <Shuffle className="w-4 h-4 text-amber-500" />
                      <div>
                        <div className="font-black">Aleatória</div>
                        <div className="text-[10px] opacity-40 font-medium">
                          Sorteia um tema livre
                        </div>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  try {
                    const saved = localStorage.getItem("soe_subjective_drafts");
                    let draftsData = [];
                    if (saved) {
                      draftsData = JSON.parse(saved);
                    }
                    const newDraft = {
                      id: String(Date.now()),
                      topicId: activeTopic.id,
                      topicName: activeTopic.name,
                      disciplineName:
                        (disciplines as any[])?.find(
                          (d) => d.id === activeTopic.disciplineId,
                        )?.name || "",
                      banca,
                      questionStatement: question,
                      createdAt: new Date().toISOString(),
                    };
                    draftsData.push(newDraft);
                    localStorage.setItem(
                      "soe_subjective_drafts",
                      JSON.stringify(draftsData),
                    );
                    onDraftSaved();
                    setQuestion(null);
                    setActiveTopic(null);
                    setSelectionReason(null);
                    toast.success("Salvo nos rascunhos!");
                  } catch (e) {
                    toast.error("Erro ao salvar rascunho.");
                  }
                }}
                className="px-4 py-3 rounded-2xl font-bold text-xs bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-2"
                style={{ color: "var(--app-fg)" }}
              >
                Salvar Rascunho
              </button>

              <button
                onClick={() =>
                  onStartWriting(
                    activeTopic.id,
                    activeTopic.name,
                    activeTopic.disciplineId,
                    (disciplines as any[])?.find(
                      (d) => d.id === activeTopic.disciplineId,
                    )?.name || "",
                    question,
                    banca,
                  )
                }
                className="px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-xl shadow-emerald-500/20"
                style={{ background: "var(--accent-green)", color: "white" }}
              >
                <PenLine className="w-4 h-4" /> Responder Agora
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab container ────────────────────────────────────────────────────────────
export default function SubjectiveAnswersTab() {
  const { data: user } = trpc.auth.me.useQuery();
  const { data: disciplines } = trpc.discipline.list.useQuery();
  const { data: topicsData } = trpc.topic.list.useQuery();
  const [answers, setAnswers] = useState<(SubjectiveAnswer & { id: number })[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [filterBanca, setFilterBanca] = useState<string>("all");

  const savedKey =
    (user?.settings as any)?.aiApiKey ||
    localStorage.getItem("soe_ai_apikey") ||
    "";
  const savedProvider =
    (user?.settings as any)?.aiProvider ||
    localStorage.getItem("soe_ai_provider") ||
    "gemini";

  const [reanalyzeTarget, setReanalyzeTarget] = useState<
    (SubjectiveAnswer & { id: number }) | null
  >(null);
  const [newEssayData, setNewEssayData] = useState<{
    topicId: number;
    topicName: string;
    disciplineId: number;
    disciplineName: string;
    questionStatement: string;
    banca: string;
    draftId?: string;
    transcription?: string;
  } | null>(null);

  const [drafts, setDrafts] = useState<any[]>([]);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualDisciplineId, setManualDisciplineId] = useState<number | "">("");
  const [manualTopicId, setManualTopicId] = useState<number | "">("");
  const [manualBanca, setManualBanca] = useState<string>("CESPE/CEBRASPE");
  const [manualQuestion, setManualQuestion] = useState("");

  const loadAnswers = () => {
    localGetSubjectiveAnswers().then((data) => {
      setAnswers(data);
      setLoading(false);
    });
  };

  const loadDrafts = () => {
    try {
      const saved = localStorage.getItem("soe_subjective_drafts");
      if (saved) {
        setDrafts(JSON.parse(saved));
      } else {
        setDrafts([]);
      }
    } catch {
      setDrafts([]);
    }
  };

  const handleDeleteDraft = (id: string) => {
    try {
      const saved = localStorage.getItem("soe_subjective_drafts");
      if (saved) {
        const draftsData = JSON.parse(saved);
        const filtered = draftsData.filter((d: any) => d.id !== id);
        localStorage.setItem("soe_subjective_drafts", JSON.stringify(filtered));
        loadDrafts();
        toast.success("Rascunho removido.");
      }
    } catch {
      toast.error("Erro ao remover rascunho.");
    }
  };

  useEffect(() => {
    loadAnswers();
    loadDrafts();
  }, []);

  const filtered =
    filterBanca === "all"
      ? answers
      : answers.filter((a) => a.banca === filterBanca);

  const usedBancas = Array.from(new Set(answers.map((a) => a.banca)));

  const handleDelete = (id: number) => {
    setAnswers((prev) => prev.filter((a) => a.id !== id));
  };

  const handleReanalyze = (answer: SubjectiveAnswer & { id: number }) => {
    setReanalyzeTarget(answer);
  };

  // Stats
  const avg =
    filtered.length > 0
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
              <h2
                className="text-2xl font-black tracking-tight"
                style={{ color: "var(--app-fg)" }}
              >
                Repositório Subjetivo
              </h2>
              <p
                className="text-[11px] font-bold uppercase tracking-widest opacity-40"
                style={{ color: "var(--muted-text)" }}
              >
                Gestão de Discursivas e Redações
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-right">
            <p
              className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1"
              style={{ color: "var(--muted-text)" }}
            >
              Performance Média
            </p>
            <div className="flex items-baseline justify-end gap-2">
              <span
                className="text-4xl font-black tabular-nums"
                style={{ color: scoreColor(avg) }}
              >
                {avg.toFixed(1)}
              </span>
              <span
                className="text-xs font-bold opacity-40"
                style={{ color: "var(--muted-text)" }}
              >
                / 10.0
              </span>
            </div>
          </div>
        </div>
      </div>

      <DailySubjectiveChallenge
        savedKey={savedKey}
        savedProvider={savedProvider}
        onDraftSaved={loadDrafts}
        onStartWriting={(
          topicId,
          topicName,
          disciplineId,
          disciplineName,
          questionStatement,
          banca,
        ) => {
          setNewEssayData({
            topicId,
            topicName,
            disciplineId,
            disciplineName,
            questionStatement,
            banca,
          });
        }}
      />

      {/* Rascunhos e Questões Salvas */}
      <div className="soe-card p-6 border-white/5 bg-white/[0.02] rounded-[2rem] border relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3
              className="text-base font-black tracking-tight flex items-center gap-2"
              style={{ color: "var(--app-fg)" }}
            >
              <FileText className="w-4 h-4 text-amber-500" />
              Rascunhos & Questões Salvas
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
              Questões salvas para responder depois ou criadas manualmente
            </p>
          </div>
          <button
            onClick={() => setIsManualModalOpen(true)}
            className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center gap-2"
            style={{ color: "var(--app-fg)" }}
          >
            <PenLine className="w-4 h-4 text-emerald-500" /> Criar Questão
            Manual
          </button>
        </div>

        {drafts.length === 0 ? (
          <p className="text-xs text-center py-6 opacity-40">
            Nenhum rascunho salvo no momento. Use o treino diário ou crie uma
            manual!
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {drafts.map((d) => (
              <div
                key={d.id}
                className="p-4 rounded-2xl border border-white/5 bg-black/20 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest bg-white/5 border border-white/5"
                      style={{ color: "var(--muted-text)" }}
                    >
                      {d.banca}
                    </span>
                    <span
                      className="text-[9px] font-bold uppercase tracking-widest opacity-40"
                      style={{ color: "var(--muted-text)" }}
                    >
                      {d.disciplineName}
                    </span>
                  </div>
                  <h4
                    className="text-xs font-black tracking-tight"
                    style={{ color: "var(--app-fg)" }}
                  >
                    {d.topicName}
                  </h4>
                  <p className="text-xs opacity-70 line-clamp-3 leading-relaxed">
                    {d.questionStatement}
                  </p>
                  {d.transcription && (
                    <div className="bg-white/5 p-2 rounded-xl border border-white/5 text-[11px] opacity-60 truncate">
                      <strong>Rascunho do texto:</strong> {d.transcription}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <button
                    onClick={() => handleDeleteDraft(d.id)}
                    className="text-[10px] font-black uppercase tracking-widest text-rose-500 hover:underline"
                  >
                    Excluir
                  </button>
                  <button
                    onClick={() => {
                      setNewEssayData({
                        topicId: d.topicId,
                        topicName: d.topicName,
                        disciplineId: 0,
                        disciplineName: d.disciplineName,
                        questionStatement: d.questionStatement,
                        banca: d.banca,
                        draftId: d.id,
                        transcription: d.transcription,
                      });
                    }}
                    className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-[var(--primary)] hover:opacity-90 transition-all text-white flex items-center gap-1.5"
                  >
                    <PenLine className="w-3.5 h-3.5" /> Responder
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filters Dock */}
      {usedBancas.length > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-full bg-[var(--stat-bg)] border border-[var(--card-border)] w-fit">
          <button
            onClick={() => setFilterBanca("all")}
            className="px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
            style={{
              background:
                filterBanca === "all" ? "var(--primary)" : "transparent",
              color:
                filterBanca === "all"
                  ? "var(--primary-fg, white)"
                  : "var(--muted-text)",
            }}
          >
            Todas
          </button>
          {usedBancas.map((b) => (
            <button
              key={b}
              onClick={() => setFilterBanca(b)}
              className="px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
              style={{
                background:
                  filterBanca === b ? "var(--primary)" : "transparent",
                color:
                  filterBanca === b
                    ? "var(--primary-fg, white)"
                    : "var(--muted-text)",
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
            style={{
              borderColor: "var(--primary)",
              borderTopColor: "transparent",
            }}
          />
          <p className="text-[10px] font-black uppercase tracking-widest opacity-40">
            Consultando Banco Local...
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-20 text-center rounded-[2.5rem] border-2 border-dashed flex flex-col items-center"
          style={{
            borderColor: "var(--card-border)",
            background: "var(--stat-bg)",
          }}
        >
          <div className="w-16 h-16 rounded-[2rem] flex items-center justify-center bg-white/5 mb-4">
            <ImageOff className="w-8 h-8 opacity-20" />
          </div>
          <p
            className="text-sm font-black uppercase tracking-tight"
            style={{ color: "var(--app-fg)" }}
          >
            Sem Correções no Momento
          </p>
          <p className="text-[11px] font-medium opacity-50 mt-2 max-w-[200px]">
            {filterBanca === "all"
              ? "Suas avaliações de redação aparecerão aqui após serem corrigidas pela IA."
              : "Nenhuma correção encontrada para este filtro."}
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((a) => (
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
      {(reanalyzeTarget || newEssayData) && (
        <SubjectiveEssayModal
          open={!!reanalyzeTarget || !!newEssayData}
          onClose={() => {
            setReanalyzeTarget(null);
            setNewEssayData(null);
          }}
          revisionId={
            reanalyzeTarget?.revisionId ||
            (newEssayData?.draftId ? Number(newEssayData.draftId) : Date.now())
          }
          topicId={reanalyzeTarget?.topicId || newEssayData?.topicId || 0}
          topicName={
            reanalyzeTarget?.topicName || newEssayData?.topicName || ""
          }
          disciplineName={
            reanalyzeTarget?.disciplineName ||
            newEssayData?.disciplineName ||
            ""
          }
          revisionLabel={
            reanalyzeTarget
              ? "Reanálise de Resposta"
              : "Treino Subjetivo Diário"
          }
          questionStatement={newEssayData?.questionStatement}
          initialTranscription={newEssayData?.transcription}
          onMarkCompleted={() => {
            loadAnswers();
            loadDrafts();
            setReanalyzeTarget(null);
            setNewEssayData(null);
          }}
        />
      )}

      {/* Manual Question Dialog */}
      <Dialog open={isManualModalOpen} onOpenChange={setIsManualModalOpen}>
        <DialogContent className="max-w-xl bg-[#09090b] border border-white/10 rounded-[2rem] p-6 text-left">
          <DialogHeader>
            <DialogTitle
              className="text-lg font-black tracking-tight flex items-center gap-2"
              style={{ color: "var(--app-fg)" }}
            >
              <PenLine className="w-5 h-5 text-emerald-500" />
              Criar Questão Subjetiva Manual
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <label
                className="text-[10px] font-black uppercase tracking-widest opacity-60"
                style={{ color: "var(--app-fg)" }}
              >
                Disciplina
              </label>
              <select
                value={manualDisciplineId}
                onChange={(e) => {
                  setManualDisciplineId(Number(e.target.value) || "");
                  setManualTopicId("");
                }}
                className="w-full px-3 py-2.5 rounded-xl text-xs font-bold border outline-none bg-white/5"
                style={{
                  borderColor: "var(--card-border)",
                  color: "var(--app-fg)",
                }}
              >
                <option value="" className="bg-slate-900">
                  Selecione uma disciplina...
                </option>
                {(disciplines as any[])?.map((d) => (
                  <option key={d.id} value={d.id} className="bg-slate-900">
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                className="text-[10px] font-black uppercase tracking-widest opacity-60"
                style={{ color: "var(--app-fg)" }}
              >
                Tema / Assunto
              </label>
              <select
                value={manualTopicId}
                onChange={(e) => setManualTopicId(Number(e.target.value) || "")}
                disabled={!manualDisciplineId}
                className="w-full px-3 py-2.5 rounded-xl text-xs font-bold border outline-none bg-white/5 disabled:opacity-40"
                style={{
                  borderColor: "var(--card-border)",
                  color: "var(--app-fg)",
                }}
              >
                <option value="" className="bg-slate-900">
                  Selecione um tema...
                </option>
                {topicsData?.topics
                  ?.filter((t) => t.disciplineId === manualDisciplineId)
                  ?.map((t) => (
                    <option key={t.id} value={t.id} className="bg-slate-900">
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  className="text-[10px] font-black uppercase tracking-widest opacity-60"
                  style={{ color: "var(--app-fg)" }}
                >
                  Banca Examinadora
                </label>
                <select
                  value={manualBanca}
                  onChange={(e) => setManualBanca(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-xs font-bold border outline-none bg-white/5"
                  style={{
                    borderColor: "var(--card-border)",
                    color: "var(--app-fg)",
                  }}
                >
                  {BANCAS.map((b) => (
                    <option key={b.id} value={b.id} className="bg-slate-900">
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                className="text-[10px] font-black uppercase tracking-widest opacity-60"
                style={{ color: "var(--app-fg)" }}
              >
                Enunciado / Pergunta da Questão
              </label>
              <textarea
                value={manualQuestion}
                onChange={(e) => setManualQuestion(e.target.value)}
                placeholder="Digite o enunciado completo da questão discursiva aqui..."
                className="w-full h-36 p-3 rounded-xl text-xs border outline-none bg-white/5 focus:ring-1 focus:ring-emerald-500"
                style={{
                  borderColor: "var(--card-border)",
                  color: "var(--app-fg)",
                }}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end mt-6">
            <button
              onClick={() => setIsManualModalOpen(false)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold border bg-white/5 border-white/10 hover:bg-white/10 transition-colors"
              style={{ color: "var(--app-fg)" }}
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                if (
                  !manualDisciplineId ||
                  !manualTopicId ||
                  !manualQuestion.trim()
                ) {
                  toast.error("Preencha todos os campos obrigatórios.");
                  return;
                }
                const disc = (disciplines as any[])?.find(
                  (d) => d.id === manualDisciplineId,
                );
                const topic = topicsData?.topics?.find(
                  (t) => t.id === manualTopicId,
                );
                if (!disc || !topic) {
                  toast.error("Disciplina ou Tema inválido.");
                  return;
                }
                try {
                  const saved = localStorage.getItem("soe_subjective_drafts");
                  let draftsData = [];
                  if (saved) {
                    draftsData = JSON.parse(saved);
                  }
                  const newDraft = {
                    id: String(Date.now()),
                    topicId: topic.id,
                    topicName: topic.name,
                    disciplineName: disc.name,
                    banca: manualBanca,
                    questionStatement: manualQuestion,
                    createdAt: new Date().toISOString(),
                  };
                  draftsData.push(newDraft);
                  localStorage.setItem(
                    "soe_subjective_drafts",
                    JSON.stringify(draftsData),
                  );
                  loadDrafts();
                  setIsManualModalOpen(false);
                  toast.success("Questão manual salva nos rascunhos!");
                } catch (e) {
                  toast.error("Erro ao salvar questão manual.");
                }
              }}
              className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white hover:opacity-90 transition-all flex items-center gap-1.5"
              style={{ background: "var(--primary)" }}
            >
              Salvar Questão
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
