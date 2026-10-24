import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  PenLine,
  FileText,
  Camera,
  Wand2,
  Brain,
  Send,
  Eye,
  Trash2,
  Clock,
  Sparkles,
  ArrowRight,
  Plus,
  X,
  ChevronLeft,
  CheckCircle,
  RotateCcw,
  Star,
  AlertTriangle,
  MessageSquare,
  BarChart2,
  Target,
  CheckCircle2,
} from "lucide-react";
import SubjectiveAnswersTab, {
  HighlightedText,
} from "@/components/SubjectiveAnswersTab";

export function EssaysTab() {
  const [isCreating, setIsCreating] = useState(false);
  const [selectedEssay, setSelectedEssay] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [banca, setBanca] = useState("CESPE");
  const [transcription, setTranscription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [disciplineId, setDisciplineId] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [activeEssayTab, setActiveEssayTab] = useState<
    "nota" | "desvios" | "comentarios" | "estat" | "texto"
  >("nota");

  const utils = trpc.useContext();
  const disciplines = trpc.discipline.list.useQuery();
  const essays = trpc.essay.list.useQuery();
  const saveEssay = trpc.essay.save.useMutation();
  const analyzeEssay = trpc.essay.analyze.useMutation();
  const transcribeEssay = trpc.essay.transcribe.useMutation();
  const deleteEssay = trpc.essay.delete.useMutation();

  const handleTranscribe = async (img: string) => {
    if (!img) return;
    setIsTranscribing(true);
    try {
      const user = await utils.auth.me.fetch();
      const apiKey = user?.settings?.aiApiKey || "";
      const provider = user?.settings?.aiProvider || "gemini";

      if (!apiKey) {
        toast.error(
          "Chave API não configurada. Transcrição não pôde ser iniciada.",
        );
        return;
      }

      const res = await transcribeEssay.mutateAsync({
        image: img,
        apiKey,
        provider,
      });
      setTranscription(res.transcription);
      toast.success("Transcrição automática concluída!");
    } catch (e: any) {
      toast.error("Falha na transcrição: " + e.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setImage(base64);
        handleTranscribe(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreate = async () => {
    if (!title || !disciplineId) {
      toast.error("Preencha o tema e selecione a disciplina.");
      return;
    }
    try {
      const isDraft = !transcription;
      const res = await saveEssay.mutateAsync({
        disciplineId,
        title,
        banca,
        transcription,
        originalImage: image || undefined,
        status: isDraft ? "draft" : "pending",
      });

      if (isDraft) {
        toast.success(
          "Redação salva como rascunho! Transcreva o texto para solicitar a correção.",
        );
      } else {
        toast.success("Redação salva! Iniciando correção...");
        handleAnalyze(res.id);
      }
      setIsCreating(false);
    } catch {
      toast.error("Erro ao salvar redação.");
    }
  };

  const handleAnalyze = async (id: number) => {
    setIsAnalyzing(true);
    try {
      const user = await utils.auth.me.fetch();
      const apiKey = user?.settings?.aiApiKey || "";
      const provider = user?.settings?.aiProvider || "gemini";

      if (!apiKey) {
        toast.error("Chave API não configurada no Perfil.");
        return;
      }

      await analyzeEssay.mutateAsync({ id, apiKey, provider });
      toast.success("Correção finalizada!");
      utils.essay.list.invalidate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir esta redação?")) return;
    await deleteEssay.mutateAsync({ id });
    utils.essay.list.invalidate();
    if (selectedEssay?.id === id) setSelectedEssay(null);
  };

  if (isCreating) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsCreating(false)}
            className="flex items-center gap-2 text-sm opacity-50 hover:opacity-100"
          >
            <ChevronLeft size={16} /> Voltar
          </button>
          <h2 className="text-xl font-black uppercase tracking-tighter">
            Nova Redação
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-4">
            <div className="soe-card p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase opacity-40">
                  Disciplina
                </label>
                <select
                  value={disciplineId}
                  onChange={(e) => setDisciplineId(Number(e.target.value))}
                  className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--primary)] transition-all"
                >
                  <option value={0}>Selecionar...</option>
                  {disciplines.data?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase opacity-40">
                  Banca Examinadora
                </label>
                <select
                  value={banca}
                  onChange={(e) => setBanca(e.target.value)}
                  className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--primary)] transition-all"
                >
                  <option value="CESPE">CESPE / Cebraspe</option>
                  <option value="FCC">FCC</option>
                  <option value="FGV">FGV</option>
                  <option value="VUNESP">VUNESP</option>
                  <option value="Outra">Outra</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase opacity-40">
                  Imagem da Redação (Opcional)
                </label>
                <div className="relative group">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    id="essay-image"
                  />
                  <label
                    htmlFor="essay-image"
                    className="flex flex-col items-center justify-center gap-3 w-full h-48 border-2 border-dashed border-border rounded-2xl cursor-pointer hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all"
                  >
                    {image ? (
                      <img
                        src={image}
                        className="w-full h-full object-cover rounded-2xl"
                      />
                    ) : (
                      <>
                        <Camera className="w-8 h-8 opacity-20" />
                        <span className="text-xs font-bold opacity-40">
                          Tirar foto ou Upload
                        </span>
                      </>
                    )}
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="soe-card p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase opacity-40">
                  Tema da Redação
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Os desafios da segurança pública no Brasil..."
                  className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-[var(--primary)] transition-all"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase opacity-40">
                    Transcrição do Texto
                  </label>
                  <button
                    onClick={() => image && handleTranscribe(image)}
                    disabled={!image || isTranscribing}
                    className="text-[10px] font-black uppercase text-[var(--primary)] flex items-center gap-1 hover:opacity-70 disabled:opacity-30 transition-all"
                  >
                    {isTranscribing ? (
                      <RotateCcw size={12} className="animate-spin" />
                    ) : (
                      <Wand2 size={12} />
                    )}
                    {isTranscribing
                      ? "Transcrevendo..."
                      : "Transcrever via IA (Beta)"}
                  </button>
                </div>
                <div className="relative">
                  <textarea
                    value={transcription}
                    onChange={(e) => setTranscription(e.target.value)}
                    rows={20}
                    placeholder={
                      isTranscribing
                        ? "Aguarde, a IA está lendo sua imagem..."
                        : "Escreva ou cole aqui o texto da sua redação para correção..."
                    }
                    className={`w-full bg-secondary/40 border border-border rounded-xl px-6 py-5 text-base leading-relaxed focus:outline-none focus:border-[var(--primary)] transition-all min-h-[500px] resize-none ${isTranscribing ? "animate-pulse opacity-50" : ""}`}
                  />
                  {isTranscribing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-secondary/30 rounded-xl">
                      <div className="bg-black/60 px-6 py-3 rounded-full flex items-center gap-3 backdrop-blur-md border border-border">
                        <RotateCcw
                          className="animate-spin text-[var(--primary)]"
                          size={16}
                        />
                        <span className="text-xs font-black uppercase tracking-widest">
                          IA Transcrevendo...
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={saveEssay.isPending || isTranscribing}
                className="w-full py-4 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-[var(--primary-shadow)] hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saveEssay.isPending ? (
                  <RotateCcw className="animate-spin" />
                ) : isTranscribing ? (
                  <>
                    <RotateCcw className="animate-spin" size={18} /> Aguarde a
                    Transcrição...
                  </>
                ) : (
                  <>
                    <Send size={18} /> Salvar e Corrigir
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderFeedback = (text: string) =>
    text
      .split(/\n+/)
      .filter((l) => l.trim())
      .map((line, i) => {
        const clean = line
          .replace(/^#{1,4}\s/, "")
          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
          .replace(/^[-*] /, "");
        if (line.startsWith("### "))
          return (
            <h3
              key={i}
              className="text-base font-black text-[var(--primary)] mt-5 mb-1"
              dangerouslySetInnerHTML={{ __html: clean }}
            />
          );
        if (line.startsWith("#### "))
          return (
            <h4
              key={i}
              className="text-xs font-black uppercase opacity-50 mt-3 mb-1"
              dangerouslySetInnerHTML={{ __html: clean }}
            />
          );
        if (line.match(/^[-*] /))
          return (
            <div key={i} className="flex gap-2 text-sm">
              <span className="text-[var(--primary)] shrink-0">▸</span>
              <span dangerouslySetInnerHTML={{ __html: clean }} />
            </div>
          );
        if (line.startsWith("> "))
          return (
            <blockquote
              key={i}
              className="border-l-2 border-[var(--primary)] pl-3 text-xs opacity-60 italic"
              dangerouslySetInnerHTML={{ __html: line.replace(/^> /, "") }}
            />
          );
        return (
          <p
            key={i}
            className="text-sm leading-relaxed opacity-80"
            dangerouslySetInnerHTML={{ __html: clean }}
          />
        );
      });

  const scoreColor = (s: number) =>
    s >= 8
      ? "from-green-500 to-emerald-600"
      : s >= 6
        ? "from-yellow-500 to-orange-500"
        : "from-red-500 to-rose-600";

  return (
    <>
      {/* ── MODAL ─────────────────────────────── */}
      {selectedEssay && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedEssay(null);
          }}
        >
          <div className="w-full max-w-4xl my-8 rounded-3xl bg-[#0f0f13] border border-border shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal header */}
            <div className="flex items-start justify-between gap-4 p-6 border-b border-border/70">
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-black uppercase">
                    {selectedEssay.banca}
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black uppercase ${selectedEssay.status === "corrected" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}
                  >
                    {selectedEssay.status === "corrected"
                      ? "✓ Corrigida"
                      : selectedEssay.status === "pending"
                        ? "⏳ Processando"
                        : "✏️ Rascunho"}
                  </span>
                  <span className="text-xs opacity-30">
                    {new Date(selectedEssay.createdAt).toLocaleDateString(
                      "pt-BR",
                    )}
                  </span>
                </div>
                <h2 className="text-xl font-black leading-tight">
                  {selectedEssay.title}
                </h2>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {selectedEssay.correction && (
                  <div
                    className={`w-20 h-20 rounded-full bg-gradient-to-br ${scoreColor(selectedEssay.correction.score)} flex flex-col items-center justify-center shadow-lg`}
                  >
                    <span className="text-3xl font-black leading-none">
                      {selectedEssay.correction.score}
                    </span>
                    <span className="text-xs opacity-70 font-bold">/10</span>
                  </div>
                )}
                <button
                  onClick={() => setSelectedEssay(null)}
                  className="p-2 rounded-xl hover:bg-secondary/60 transition-colors"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Loading state */}
              {(selectedEssay.status === "pending" || isAnalyzing) && (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <RotateCcw className="w-10 h-10 animate-spin text-[var(--primary)]" />
                  <p className="font-bold text-sm animate-pulse">
                    A IA está analisando sua redação...
                  </p>
                </div>
              )}
              {/* Request correction CTA */}
              {!selectedEssay.correction &&
                selectedEssay.status === "draft" &&
                !isAnalyzing && (
                  <button
                    onClick={() => handleAnalyze(selectedEssay.id)}
                    className="w-full py-8 rounded-2xl border-2 border-dashed border-[var(--primary)]/40 hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all flex flex-col items-center gap-3"
                  >
                    <Wand2 className="w-10 h-10 text-[var(--primary)] opacity-60" />
                    <span className="font-black text-sm uppercase tracking-widest">
                      Solicitar Correção pela IA
                    </span>
                    <span className="text-xs opacity-40">
                      Certifique-se de que há texto transcrito abaixo
                    </span>
                  </button>
                )}
              {/* Tab Navigation */}
              {selectedEssay.correction && (
                <>
                  <div className="flex border-b border-border overflow-x-auto no-scrollbar mb-4">
                    {[
                      { id: "nota", icon: Star, label: "Resultado Estimado" },
                      {
                        id: "desvios",
                        icon: AlertTriangle,
                        label: "Inadequações",
                        badge: (
                          selectedEssay.correction.desvios ||
                          selectedEssay.correction.errors
                        )?.length,
                      },
                      {
                        id: "comentarios",
                        icon: MessageSquare,
                        label: "Parecer Técnico",
                      },
                      {
                        id: "estat",
                        icon: BarChart2,
                        label: "Métricas Textuais",
                      },
                      { id: "texto", icon: FileText, label: "Raio-X do Texto" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setActiveEssayTab(t.id as any)}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 min-w-[120px] text-[10px] font-black uppercase tracking-widest transition-colors border-b-2 ${activeEssayTab === t.id ? "border-[var(--primary)] text-white bg-secondary/40" : "border-transparent opacity-50 hover:opacity-100"}`}
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

                  <div className="space-y-6">
                    {activeEssayTab === "nota" && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {selectedEssay.correction.gradeBreakdown && (
                          <div className="space-y-4">
                            <p className="text-sm font-black uppercase tracking-widest opacity-50">
                              📊 Notas por Critério
                            </p>
                            {(() => {
                              const entries = Object.entries(
                                selectedEssay.correction.gradeBreakdown,
                              );
                              const total = entries.reduce(
                                (s, [, v]) => s + Number(v),
                                0,
                              );
                              const max = total <= 12 ? 2 : 10;
                              return entries.map(([key, val]: [any, any]) => {
                                const pct = Math.min(
                                  100,
                                  Math.round((Number(val) / max) * 100),
                                );
                                const barColor =
                                  pct >= 70
                                    ? "bg-green-500"
                                    : pct >= 40
                                      ? "bg-yellow-400"
                                      : "bg-red-500";
                                const just = (selectedEssay.correction as any)
                                  .gradeJustification?.[key];
                                return (
                                  <div key={key} className="space-y-1.5">
                                    <div className="flex justify-between items-baseline">
                                      <span className="text-base font-semibold">
                                        {key}
                                      </span>
                                      <span className="text-base font-black tabular-nums">
                                        {val}
                                        <span className="text-sm opacity-30">
                                          /{max}
                                        </span>
                                      </span>
                                    </div>
                                    <div className="h-3 w-full rounded-full bg-secondary/60">
                                      <div
                                        className={`h-full rounded-full ${barColor}`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    {just && (
                                      <p className="text-sm opacity-50 leading-relaxed">
                                        {just}
                                      </p>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {selectedEssay.correction.strengths?.length > 0 && (
                            <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5 space-y-3">
                              <p className="text-sm font-black uppercase text-green-400 tracking-widest">
                                ✅ Pontos Positivos
                              </p>
                              {selectedEssay.correction.strengths.map(
                                (s: string, i: number) => (
                                  <div
                                    key={i}
                                    className="flex gap-3 text-sm leading-relaxed"
                                  >
                                    <span className="text-green-400 shrink-0 mt-0.5 text-base">
                                      ▸
                                    </span>
                                    <span className="opacity-80">{s}</span>
                                  </div>
                                ),
                              )}
                            </div>
                          )}
                          {selectedEssay.correction.improvementPlan?.length >
                            0 && (
                            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 space-y-3">
                              <p className="text-sm font-black uppercase text-blue-400 tracking-widest">
                                🎯 Plano de Melhoria
                              </p>
                              {selectedEssay.correction.improvementPlan.map(
                                (s: string, i: number) => (
                                  <div
                                    key={i}
                                    className="flex gap-3 text-sm leading-relaxed"
                                  >
                                    <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/30 text-blue-400 flex items-center justify-center text-xs font-black mt-0.5">
                                      {i + 1}
                                    </span>
                                    <span className="opacity-80">{s}</span>
                                  </div>
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {activeEssayTab === "desvios" && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {!(
                          selectedEssay.correction.desvios ||
                          selectedEssay.correction.errors
                        )?.length ? (
                          <div className="py-10 text-center opacity-50 flex flex-col items-center">
                            <Target className="w-8 h-8 mb-2" />
                            <p className="text-sm font-bold">
                              Nenhuma inadequação estrutural ou gramatical
                              detectada!
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {(
                              selectedEssay.correction.desvios ||
                              selectedEssay.correction.errors
                            ).map((err: any, i: number) => (
                              <div
                                key={i}
                                className="soe-card p-5 border-l-4"
                                style={{
                                  borderLeftColor: "var(--accent-red)",
                                  background: "var(--card-bg)",
                                }}
                              >
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="w-2 h-2 rounded-full bg-red-500" />
                                  <span
                                    className="text-[10px] font-black uppercase tracking-widest"
                                    style={{ color: "var(--muted-text)" }}
                                  >
                                    {err.type || err.tipo}
                                  </span>
                                </div>
                                <p
                                  className="text-xs font-medium mb-4 opacity-90 leading-relaxed"
                                  style={{ color: "var(--app-fg)" }}
                                >
                                  {err.description || err.explicacao}
                                </p>
                                <div className="flex flex-col sm:flex-row items-stretch gap-3">
                                  {err.trecho_original && (
                                    <>
                                      <div className="flex-1 w-full bg-rose-500/10 text-rose-500 px-4 py-3 rounded-2xl text-xs font-medium border border-rose-500/20 line-through decoration-rose-500/50 flex items-center justify-center text-center">
                                        {err.trecho_original}
                                      </div>
                                      <div className="hidden sm:flex items-center justify-center opacity-30">
                                        <span className="text-xl font-black">
                                          →
                                        </span>
                                      </div>
                                    </>
                                  )}
                                  {(err.suggestion || err.sugestao) && (
                                    <div className="flex-1 w-full bg-emerald-500/10 text-emerald-500 px-4 py-3 rounded-2xl text-xs font-bold border border-emerald-500/20 flex items-center justify-center gap-2 text-center shadow-lg shadow-emerald-500/5">
                                      <CheckCircle2 className="w-4 h-4 shrink-0" />{" "}
                                      {err.suggestion || err.sugestao}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {activeEssayTab === "comentarios" && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {selectedEssay.correction.feedback && (
                          <div className="space-y-4">
                            <div className="space-y-3">
                              {renderFeedback(
                                selectedEssay.correction.feedback,
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeEssayTab === "estat" && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {!selectedEssay.correction.estatisticas ? (
                          <div className="py-10 text-center opacity-50 flex flex-col items-center">
                            <BarChart2 className="w-8 h-8 mb-2" />
                            <p className="text-sm font-bold">
                              Métricas detalhadas indisponíveis nesta correção.
                              Reavalie para gerar.
                            </p>
                          </div>
                        ) : (
                          <>
                            <section className="space-y-3">
                              <h4 className="text-[10px] font-black uppercase tracking-widest opacity-50">
                                Métricas Gerais
                              </h4>
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                {[
                                  {
                                    label: "Caracteres",
                                    value:
                                      selectedEssay.correction.estatisticas
                                        .caracteres,
                                  },
                                  {
                                    label: "Palavras",
                                    value:
                                      selectedEssay.correction.estatisticas
                                        .palavras,
                                  },
                                  {
                                    label: "Frases",
                                    value:
                                      selectedEssay.correction.estatisticas
                                        .frases,
                                  },
                                  {
                                    label: "Parágrafos",
                                    value:
                                      selectedEssay.correction.estatisticas
                                        .paragrafos,
                                  },
                                  {
                                    label: "Conectivos",
                                    value:
                                      selectedEssay.correction.estatisticas
                                        .conectivos,
                                  },
                                ].map((s, i) => (
                                  <div
                                    key={i}
                                    className="soe-card p-4 flex flex-col items-center justify-center gap-1 bg-secondary/20"
                                  >
                                    <span className="text-2xl font-black tabular-nums">
                                      {s.value}
                                    </span>
                                    <span className="text-[9px] font-black uppercase tracking-widest opacity-40 text-center">
                                      {s.label}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </section>
                            <section className="space-y-3">
                              <h4 className="text-[10px] font-black uppercase tracking-widest opacity-50">
                                Legibilidade
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="soe-card p-5 flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold opacity-60">
                                    Tempo de Leitura
                                  </span>
                                  <div className="flex items-center gap-1.5 font-black text-lg text-blue-400">
                                    <Clock className="w-4 h-4" />{" "}
                                    {
                                      selectedEssay.correction.estatisticas
                                        .tempoLeitura
                                    }
                                  </div>
                                </div>
                                <div className="soe-card p-5 flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold opacity-60">
                                    Complexidade
                                  </span>
                                  <span className="font-black text-lg text-purple-400 uppercase tracking-wider">
                                    {
                                      selectedEssay.correction.estatisticas
                                        .nivelComplexidade
                                    }
                                  </span>
                                </div>
                              </div>
                            </section>
                          </>
                        )}
                      </div>
                    )}

                    {activeEssayTab === "texto" && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="soe-card p-8 bg-[var(--app-bg)] shadow-inner">
                          <div
                            className="text-sm font-medium leading-[2.5] whitespace-pre-wrap"
                            style={{ color: "var(--app-fg)" }}
                          >
                            <HighlightedText
                              text={
                                selectedEssay.transcription ||
                                "Sem transcrição."
                              }
                              desvios={
                                selectedEssay.correction.desvios ||
                                selectedEssay.correction.errors
                              }
                            />
                          </div>
                        </div>
                        {(
                          selectedEssay.correction.desvios ||
                          selectedEssay.correction.errors
                        )?.length > 0 && (
                          <p className="text-[10px] font-bold text-center mt-4 opacity-50 uppercase tracking-widest flex items-center justify-center gap-2">
                            <AlertTriangle className="w-3 h-3 text-rose-500" />
                            Passe o mouse sobre os trechos sublinhados para ver
                            as sugestões
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}{" "}
            </div>

            {/* Modal footer */}
            <div className="p-5 border-t border-border/70 flex items-center justify-between gap-3">
              <button
                onClick={() => handleDelete(selectedEssay.id)}
                className="flex items-center gap-2 text-sm text-red-400 hover:bg-red-500/10 px-4 py-2.5 rounded-xl transition-colors font-bold"
              >
                <Trash2 size={16} /> Excluir
              </button>
              {!selectedEssay.correction &&
                selectedEssay.status === "draft" &&
                !isAnalyzing && (
                  <button
                    onClick={() => handleAnalyze(selectedEssay.id)}
                    className="flex items-center gap-2 text-sm bg-[var(--primary)] text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest hover:opacity-90 transition-all"
                  >
                    <Wand2 size={16} /> Corrigir com IA
                  </button>
                )}
              <button
                onClick={() => setSelectedEssay(null)}
                className="text-sm opacity-50 hover:opacity-100 px-4 py-2.5 rounded-xl hover:bg-secondary/40 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PAGE ─────────────────────────────── */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter">
              Minhas Redações
            </h2>
            <p className="text-xs opacity-40 font-bold mt-0.5">
              Corrija suas produções com IA especialista em bancas.
            </p>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="px-5 py-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all"
          >
            <Plus size={15} /> Nova Redação
          </button>
        </div>

        {essays.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-44 rounded-2xl bg-secondary/40 animate-pulse"
              />
            ))}
          </div>
        ) : essays.data?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 opacity-20">
            <FileText className="w-16 h-16" />
            <p className="font-bold text-sm">
              Nenhuma redação ainda. Clique em "Nova Redação" para começar.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {essays.data?.map((essay) => (
              <div
                key={essay.id}
                onClick={() => setSelectedEssay(essay)}
                className="group soe-card p-5 cursor-pointer hover:border-[var(--primary)]/50 hover:bg-[var(--primary)]/5 transition-all border border-transparent rounded-2xl space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 rounded-full bg-[var(--primary)]/20 text-[var(--primary)] text-[9px] font-black uppercase">
                      {essay.banca}
                    </span>
                    {essay.status === "corrected" && (
                      <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-[9px] font-black">
                        ✓ Corrigida
                      </span>
                    )}
                    {essay.status === "draft" && (
                      <span className="px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground text-[9px] font-black">
                        Rascunho
                      </span>
                    )}
                    {essay.status === "pending" && (
                      <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-[9px] font-black">
                        ⏳ Processando
                      </span>
                    )}
                  </div>
                  {essay.correction && (
                    <div
                      className={`shrink-0 w-10 h-10 rounded-full bg-gradient-to-br ${scoreColor(essay.correction.score)} flex items-center justify-center shadow-md`}
                    >
                      <span className="text-xs font-black">
                        {essay.correction.score}
                      </span>
                    </div>
                  )}
                </div>
                <h3 className="font-bold text-sm leading-snug line-clamp-2 group-hover:text-foreground transition-colors">
                  {essay.title}
                </h3>
                <div className="flex items-center justify-between text-[10px] opacity-30">
                  <span>
                    {new Date(essay.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                  <span className="flex items-center gap-1">
                    Ver correção <ArrowRight size={10} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
