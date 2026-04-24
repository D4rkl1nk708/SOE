/**
 * SubjectiveEssayModal
 * --------------------
 * Fluxo completo de correção de redação/dissertativa subjetiva:
 *  1. Câmera (Android/mobile) ou Upload de foto (desktop)
 *  2. Recorte/ajuste da imagem (canvas drag+pinch)
 *  3. Transcrição automática via IA (OCR)
 *  4. Revisão e edição do texto pelo usuário
 *  5. Seleção de banca
 *  6. Envio para IA → correção estilo banca baseada no texto revisado
 *  7. Salvamento em localDb.subjectiveAnswers
 *  8. Callback para marcar revisão como concluída
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Camera,
  Upload,
  Crop,
  Send,
  X,
  ChevronLeft,
  CheckCircle2,
  BookOpen,
  AlertCircle,
  Loader2,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Edit3,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { localSaveSubjectiveAnswer } from "@/lib/localDb";
import { trpc } from "@/lib/trpc";

// ─── Bancas ──────────────────────────────────────────────────────────────────
export const BANCAS = [
  { id: "CESPE/CEBRASPE", label: "CESPE / CEBRASPE" },
  { id: "FGV", label: "FGV" },
  { id: "VUNESP", label: "VUNESP" },
  { id: "FCC", label: "FCC" },
  { id: "ESAF", label: "ESAF" },
  { id: "IADES", label: "IADES" },
  { id: "IDECAN", label: "IDECAN" },
  { id: "QUADRIX", label: "QUADRIX" },
  { id: "AOCP", label: "AOCP" },
  { id: "IBFC", label: "IBFC" },
  { id: "IBADE", label: "IBADE" },
  { id: "FUNRIO", label: "FUNRIO" },
  { id: "OUTRA", label: "Outra / Não sei" },
];

function buildBancaPrompt(banca: string, text: string): string {
  const shared = `
Você é um corretor especialista em provas de concurso público, atuando como avaliador rigoroso da banca ${banca}.
Sua missão é corrigir a resposta abaixo com profundidade técnica e imparcialidade absoluta, simulando a banca ${banca}.

**TEXTO DO CANDIDATO:**
"""
${text}
"""

**REGRAS GERAIS DE CORREÇÃO (obrigatórias):**
- Identifique TODOS os erros gramaticais, ortográficos e de pontuação.
- Avalie a coerência, coesão, argumentação e domínio do conteúdo.
- Pontue de forma proporcional — não inflacione nem deflacione.
- Aponte explicitamente cada ponto deduzido e o motivo.
- Use linguagem técnica e objetiva.
- Ao final, forneça uma **nota final estimada** no formato usado pela banca e um **parecer conclusivo** com os principais pontos fortes e fracos.
`;

  const bancaRules: Record<string, string> = {
    "CESPE/CEBRASPE": `
**CRITÉRIOS ESPECÍFICOS CESPE/CEBRASPE:**
- Pontuação por linhas preenchidas: avalie a diluição do conteúdo ao longo das linhas. O CESPE distribui pontos por faixas de linhas (ex: 1–5 linhas = até X pontos, 6–10 linhas = até Y pontos). Identifique se o candidato utilizou o espaço de forma eficiente ou desperdiçou linhas com conteúdo redundante ou vago.
- Verifique se o candidato respondeu EXATAMENTE o que foi perguntado (CESPE pune tangenciamento).
- Analise extensão: respostas muito curtas perdem pontos mesmo que corretas em essência; respostas longas e vagas também.
- Observe o uso de linguagem técnica pertinente ao cargo.
- Penalize erros graves de português conforme tabela CESPE (ortografia grave = -0,5; coesão ruim = -0,25 por ocorrência típica).
- Escala: geralmente 0 a 10 pontos por item. Informe a nota em décimos.
`,
    FGV: `
**CRITÉRIOS ESPECÍFICOS FGV:**
- FGV valoriza estrutura dissertativa clara: introdução, desenvolvimento, conclusão.
- Avalie a profundidade da argumentação jurídica/técnica.
- Penalize lacunas conceituais e imprecisões terminológicas.
- Verifique se citações de lei/doutrina estão corretas (FGV exige precisão).
- Escala: 0 a 10 ou 0 a 5 dependendo do certame. Indique a nota justificada.
`,
    VUNESP: `
**CRITÉRIOS ESPECÍFICOS VUNESP:**
- VUNESP é rigorosa com linguagem formal e estrutura lógica.
- Avalie se o candidato respondeu todos os subitens solicitados.
- Penalize respostas em tópicos sem desenvolvimento quando se pede texto discursivo.
- Analise adequação vocabular ao cargo.
- Escala geralmente 0 a 10. Indique nota decimal.
`,
    FCC: `
**CRITÉRIOS ESPECÍFICOS FCC:**
- FCC valoriza conhecimento de legislação e doutrina majoritária.
- Penalize ausência de fundamento legal quando a questão exige.
- Avalie organização e objetividade.
- Escala geralmente 0 a 10.
`,
    ESAF: `
**CRITÉRIOS ESPECÍFICOS ESAF:**
- ESAF é extremamente rigorosa com conteúdo técnico-administrativo.
- Avalie domínio de conceitos de Direito Administrativo, Financeiro e Tributário conforme pertinente.
- Penalize imprecisões mesmo que o candidato demonstre entendimento parcial.
- Escala geralmente 0 a 10.
`,
    OUTRA: `
**CRITÉRIOS GENÉRICOS DE BANCA NÃO ESPECIFICADA:**
- Aplique critérios gerais de correção de concurso público: coerência, coesão, domínio do conteúdo, linguagem formal.
- Escala de 0 a 10. Indique nota e justificativa completa.
`,
  };

  const specific = bancaRules[banca] || bancaRules["OUTRA"];

  return `${shared}${specific}

**FORMATO DE RESPOSTA OBRIGATÓRIO (responda em JSON válido):**
{
  "nota_final": <número de 0 a 10>,
  "parecer": "<parecer conclusivo curto e direto>",
  "deducoes": [{"motivo": "<motivo>", "pontos": <valor numérico negativo>}],
  "erros_encontrados": ["<erro 1>", "<erro 2>", ...],
  "pontos_positivos": ["<ponto 1>", "<ponto 2>", ...],
  "analise_conteudo": "<análise técnica do conteúdo>",
  "analise_forma": "<análise da forma e estrutura>",
  "desvios": [
    {
      "tipo": "<Categoria: Concordância, Ortografia, Expressão prolixa, etc>",
      "trecho_original": "<Trecho exato do texto (curto) que contém o erro para ser sublinhado>",
      "sugestao": "<Sugestão de correção ou troca de pronome/palavra>",
      "explicacao": "<Por que está errado ou como melhorar>"
    }
  ],
  "estatisticas": {
    "caracteres": <numero total de caracteres>,
    "palavras": <numero total de palavras>,
    "frases": <numero total de frases>,
    "paragrafos": <numero de parágrafos>,
    "conectivos": <numero de conectivos identificados>,
    "tempo_leitura_segundos": <tempo estimado em segundos>,
    "nivel_complexidade": "<Baixo | Médio | Alto>"
  }
}

**IMPORTANTE:** Comece o JSON obrigatoriamente pela nota, parecer e deduções. Deixe as análises extensas para o final. Se o texto for muito longo, a IA pode ser cortada, então garanta que o início seja completo. Responda APENAS com o JSON, sem markdown.`;
}

// ─── Crop canvas ─────────────────────────────────────────────────────────────
interface CropState {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

function CropCanvas({
  src,
  onCropped,
}: {
  src: string;
  onCropped: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<CropState>({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
  });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    cropX: number;
    cropY: number;
  } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      draw({ x: 0, y: 0, scale: 1, rotation: 0 });
    };
    img.src = src;
  }, [src]);

  const draw = useCallback((c: CropState) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width,
      H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + c.x, H / 2 + c.y);
    ctx.rotate((c.rotation * Math.PI) / 180);
    ctx.scale(c.scale, c.scale);
    const iw = img.naturalWidth,
      ih = img.naturalHeight;
    const fit = Math.min(W / iw, H / ih);
    ctx.drawImage(img, (-iw * fit) / 2, (-ih * fit) / 2, iw * fit, ih * fit);
    ctx.restore();
  }, []);

  useEffect(() => {
    draw(crop);
  }, [crop, draw]);

  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      cropX: crop.x,
      cropY: crop.y,
    };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setCrop((c) => {
      const nc = {
        ...c,
        x: dragRef.current!.cropX + dx,
        y: dragRef.current!.cropY + dy,
      };
      draw(nc);
      return nc;
    });
  };
  const onMouseUp = () => {
    dragRef.current = null;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1)
      dragRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        cropX: crop.x,
        cropY: crop.y,
      };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragRef.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragRef.current.startX;
    const dy = e.touches[0].clientY - dragRef.current.startY;
    setCrop((c) => {
      const nc = {
        ...c,
        x: dragRef.current!.cropX + dx,
        y: dragRef.current!.cropY + dy,
      };
      draw(nc);
      return nc;
    });
  };

  const confirm = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onCropped(canvas.toDataURL("image/jpeg", 0.85));
  };

  return (
    <div className="flex flex-col gap-3">
      <canvas
        ref={canvasRef}
        width={360}
        height={280}
        className="rounded-xl border w-full cursor-grab active:cursor-grabbing"
        style={{
          border: "1px solid var(--card-border)",
          background: "#111",
          maxHeight: 280,
          objectFit: "contain",
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onMouseUp}
      />
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <button
          onClick={() =>
            setCrop((c) => {
              const n = { ...c, scale: Math.max(0.3, c.scale - 0.15) };
              draw(n);
              return n;
            })
          }
          className="p-2 rounded-lg hover:opacity-70"
          style={{
            border: "1px solid var(--card-border)",
            color: "var(--muted-text)",
          }}
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() =>
            setCrop((c) => {
              const n = { ...c, scale: Math.min(4, c.scale + 0.15) };
              draw(n);
              return n;
            })
          }
          className="p-2 rounded-lg hover:opacity-70"
          style={{
            border: "1px solid var(--card-border)",
            color: "var(--muted-text)",
          }}
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() =>
            setCrop((c) => {
              const n = { ...c, rotation: (c.rotation + 90) % 360 };
              draw(n);
              return n;
            })
          }
          className="p-2 rounded-lg hover:opacity-70"
          style={{
            border: "1px solid var(--card-border)",
            color: "var(--muted-text)",
          }}
        >
          <RotateCw className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setCrop({ x: 0, y: 0, scale: 1, rotation: 0 });
          }}
          className="px-3 py-2 rounded-lg text-xs hover:opacity-70"
          style={{
            border: "1px solid var(--card-border)",
            color: "var(--muted-text)",
          }}
        >
          Resetar
        </button>
        <button
          onClick={confirm}
          className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5"
          style={{ background: "var(--primary)", color: "white" }}
        >
          <Crop className="w-4 h-4" /> Confirmar recorte
        </button>
      </div>
    </div>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────────────────
type Step =
  | "capture"
  | "crop"
  | "transcribing"
  | "review"
  | "banca"
  | "correcting"
  | "result";

interface Props {
  open: boolean;
  onClose: () => void;
  revisionId: number;
  topicId: number;
  topicName: string;
  disciplineName: string;
  revisionLabel: string;
  onMarkCompleted: () => void;
}

export default function SubjectiveEssayModal({
  open,
  onClose,
  revisionId,
  topicId,
  topicName,
  disciplineName,
  revisionLabel,
  onMarkCompleted,
}: Props) {
  const [step, setStep] = useState<Step>("capture");
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string>("");
  const [banca, setBanca] = useState<string>("");
  const [result, setResult] = useState<{
    erros_encontrados: string[];
    pontos_positivos: string[];
    analise_conteudo: string;
    analise_forma: string;
    deducoes: { motivo: string; pontos: number }[];
    nota_final: number;
    parecer: string;
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
      nivel_complexidade: string;
    };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile =
    typeof navigator !== "undefined" &&
    /android|iphone|ipad/i.test(navigator.userAgent);

  const transcribeMut = trpc.mentor.transcribeSubjectiveEssay.useMutation();
  const analyzeMut = trpc.mentor.analyzeSubjectiveEssay.useMutation();

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep("capture");
      setRawImage(null);
      setCroppedImage(null);
      setTranscription("");
      setBanca("");
      setResult(null);
      setError(null);
    }
  }, [open]);

  const handleFileCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setRawImage(ev.target?.result as string);
      setStep("crop");
    };
    reader.readAsDataURL(file);
  };

  const handleCropped = async (dataUrl: string) => {
    setCroppedImage(dataUrl);
    setStep("transcribing");
    setError(null);
    try {
      const savedKey = localStorage.getItem("soe_ai_apikey") || "";
      const savedProvider =
        (localStorage.getItem("soe_ai_provider") as any) || "gemini";

      if (!savedKey) {
        throw new Error(
          "Chave de API não configurada. Configure-a na aba 'Questões' > 'Subjetivas' ou no ícone de chave.",
        );
      }

      const { transcription: text } = await transcribeMut.mutateAsync({
        apiKey: savedKey,
        provider: savedProvider,
        imageBase64: dataUrl,
      });

      setTranscription(text);
      setStep("review");
    } catch (err: any) {
      setError(err?.message || "Erro na transcrição. Tente novamente.");
      setStep("crop");
    }
  };

  const handleCorrect = async () => {
    if (!transcription || !banca) return;
    setStep("correcting");
    setError(null);
    try {
      const savedKey = localStorage.getItem("soe_ai_apikey") || "";
      const savedProvider =
        (localStorage.getItem("soe_ai_provider") as any) || "gemini";

      const parsed = (await analyzeMut.mutateAsync({
        apiKey: savedKey,
        provider: savedProvider,
        imageBase64: croppedImage!,
        prompt: buildBancaPrompt(banca, transcription),
      })) as any;

      setResult(parsed);

      // Save to DB
      await localSaveSubjectiveAnswer({
        revisionId,
        topicId,
        topicName,
        disciplineName,
        banca,
        imageDataUrl: croppedImage!,
        transcription: transcription,
        correction: JSON.stringify({ ...parsed, transcricao: transcription }),
        score: parsed.nota_final,
      });

      // Mark revision as completed
      onMarkCompleted();
      setStep("result");
      toast.success("Redação corrigida e revisão marcada como concluída!");
    } catch (err: any) {
      setError(err?.message || "Erro ao corrigir. Tente novamente.");
      setStep("banca");
    }
  };

  const scoreColor = (n: number) =>
    n >= 8
      ? "#16a34a"
      : n >= 6
        ? "var(--gold)"
        : n >= 4
          ? "#f97316"
          : "#dc2626";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="w-[96vw] max-w-lg"
        style={{
          maxHeight: "92vh",
          overflowY: "auto",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
        }}
      >
        <DialogHeader>
          <DialogTitle
            className="text-base font-bold flex items-center gap-2"
            style={{ color: "var(--app-fg)" }}
          >
            <BookOpen className="w-4 h-4" style={{ color: "var(--gold)" }} />
            Correção de Resposta Subjetiva
          </DialogTitle>
          <DialogDescription
            className="text-xs"
            style={{ color: "var(--muted-text)" }}
          >
            {revisionLabel} · {topicName} · {disciplineName}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 text-[10px] font-medium py-1 overflow-x-auto no-scrollbar">
          {(["capture", "crop", "review", "banca", "result"] as Step[]).map(
            (s, i) => {
              const labels = [
                "Foto",
                "Recorte",
                "Revisão",
                "Banca",
                "Resultado",
              ];
              const stepOrder = [
                "capture",
                "crop",
                "transcribing",
                "review",
                "banca",
                "correcting",
                "result",
              ];
              const stepIndex = stepOrder.indexOf(step);
              const currentStepInLabels = [
                "capture",
                "crop",
                "review",
                "banca",
                "result",
              ].indexOf(s);

              // Lógica simplificada para o indicador visual
              let active = false;
              let done = false;

              if (step === "transcribing" && s === "review") active = true;
              else if (step === "correcting" && s === "banca") active = true;
              else {
                const labelIndex = [
                  "capture",
                  "crop",
                  "review",
                  "banca",
                  "result",
                ].indexOf(step as any);
                if (labelIndex !== -1) {
                  active = currentStepInLabels === labelIndex;
                  done = currentStepInLabels < labelIndex;
                } else {
                  // Se estiver em transcribing ou correcting, marca os anteriores como done
                  const virtualIndex = step === "transcribing" ? 2 : 4;
                  active = currentStepInLabels === virtualIndex;
                  done = currentStepInLabels < virtualIndex;
                }
              }

              return (
                <div key={s} className="flex items-center gap-1 flex-shrink-0">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px]"
                    style={{
                      background: done
                        ? "#16a34a"
                        : active
                          ? "var(--primary)"
                          : "var(--stat-bg)",
                      color: done || active ? "white" : "var(--muted-text)",
                      border: `1px solid ${done ? "#16a34a" : active ? "var(--primary)" : "var(--card-border)"}`,
                    }}
                  >
                    {done ? "✓" : i + 1}
                  </div>
                  <span
                    style={{
                      color: active ? "var(--app-fg)" : "var(--muted-text)",
                      opacity: active ? 1 : 0.6,
                    }}
                  >
                    {labels[i]}
                  </span>
                  {i < 4 && (
                    <div
                      className="w-3 h-px"
                      style={{ background: "var(--card-border)" }}
                    />
                  )}
                </div>
              );
            },
          )}
        </div>

        {/* ── STEP: CAPTURE ── */}
        {step === "capture" && (
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm" style={{ color: "var(--muted-text)" }}>
              Tire uma foto da sua resposta escrita à mão ou faça upload de uma
              imagem.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture={isMobile ? "environment" : undefined}
              className="hidden"
              onChange={handleFileCapture}
            />
            {isMobile ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-3 w-full py-6 rounded-2xl font-semibold text-base"
                style={{ background: "var(--primary)", color: "white" }}
              >
                <Camera className="w-6 h-6" />
                Tirar foto da resposta
              </button>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-3 w-full py-6 rounded-2xl font-semibold text-base border-2 border-dashed"
                style={{
                  borderColor: "var(--card-border)",
                  color: "var(--muted-text)",
                  background: "var(--stat-bg)",
                }}
              >
                <Upload className="w-6 h-6" />
                Fazer upload da imagem
              </button>
            )}
            <p
              className="text-[11px] text-center"
              style={{ color: "var(--muted-text)" }}
            >
              Certifique-se de que a escrita esteja legível e bem iluminada.
            </p>
          </div>
        )}

        {/* ── STEP: CROP ── */}
        {step === "crop" && rawImage && (
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm" style={{ color: "var(--muted-text)" }}>
              Arraste para reposicionar. Use os botões para zoom e rotação.
            </p>
            <CropCanvas src={rawImage} onCropped={handleCropped} />
            <button
              onClick={() => {
                setStep("capture");
                setRawImage(null);
              }}
              className="flex items-center gap-1.5 text-sm mx-auto hover:opacity-70"
              style={{ color: "var(--muted-text)" }}
            >
              <ChevronLeft className="w-4 h-4" /> Trocar imagem
            </button>
          </div>
        )}

        {/* ── STEP: TRANSCRIBING ── */}
        {step === "transcribing" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2
              className="w-10 h-10 animate-spin"
              style={{ color: "var(--primary)" }}
            />
            <div className="text-center">
              <p className="font-semibold" style={{ color: "var(--app-fg)" }}>
                Transcrevendo imagem…
              </p>
              <p
                className="text-sm mt-1"
                style={{ color: "var(--muted-text)" }}
              >
                A IA está convertendo sua escrita em texto.
                <br />
                Isso permite que você revise antes da correção.
              </p>
            </div>
          </div>
        )}

        {/* ── STEP: REVIEW ── */}
        {step === "review" && (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center justify-between">
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--app-fg)" }}
              >
                Revise a transcrição:
              </p>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{
                  background: "var(--stat-bg)",
                  color: "var(--muted-text)",
                }}
              >
                Edite se necessário
              </span>
            </div>

            <div className="relative">
              <textarea
                value={transcription}
                onChange={(e) => setTranscription(e.target.value)}
                className="w-full h-48 p-3 rounded-xl text-sm border focus:ring-2 focus:ring-primary outline-none transition-all"
                style={{
                  background: "var(--stat-bg)",
                  color: "var(--app-fg)",
                  borderColor: "var(--card-border)",
                }}
                placeholder="O texto transcrito aparecerá aqui..."
              />
              <Edit3 className="absolute bottom-3 right-3 w-4 h-4 opacity-30" />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep("crop")}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm hover:opacity-70"
                style={{
                  border: "1px solid var(--card-border)",
                  color: "var(--muted-text)",
                }}
              >
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
              <button
                onClick={() => setStep("banca")}
                disabled={!transcription.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: transcription.trim()
                    ? "var(--primary)"
                    : "var(--stat-bg)",
                  color: transcription.trim() ? "white" : "var(--muted-text)",
                }}
              >
                <CheckCircle2 className="w-4 h-4" /> Tudo certo, prosseguir
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: BANCA ── */}
        {step === "banca" && (
          <div className="flex flex-col gap-4 py-2">
            <div>
              <p
                className="text-sm font-semibold mb-2"
                style={{ color: "var(--app-fg)" }}
              >
                Selecione a banca examinadora:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {BANCAS.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setBanca(b.id)}
                    className="py-2.5 px-3 rounded-xl text-sm font-medium text-left transition-all"
                    style={{
                      border: `2px solid ${banca === b.id ? "var(--primary)" : "var(--card-border)"}`,
                      background:
                        banca === b.id
                          ? "color-mix(in srgb, var(--primary) 10%, var(--stat-bg))"
                          : "var(--stat-bg)",
                      color:
                        banca === b.id ? "var(--primary)" : "var(--app-fg)",
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div
                className="flex items-start gap-2 rounded-xl p-3 text-sm"
                style={{
                  background: "color-mix(in srgb, #dc2626 10%, var(--stat-bg))",
                  color: "#dc2626",
                }}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep("review")}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm hover:opacity-70"
                style={{
                  border: "1px solid var(--card-border)",
                  color: "var(--muted-text)",
                }}
              >
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
              <button
                onClick={handleCorrect}
                disabled={!banca}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: banca ? "var(--primary)" : "var(--stat-bg)",
                  color: banca ? "white" : "var(--muted-text)",
                  cursor: banca ? "pointer" : "not-allowed",
                }}
              >
                <Send className="w-4 h-4" />
                Enviar para correção IA
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: CORRECTING ── */}
        {step === "correcting" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2
              className="w-10 h-10 animate-spin"
              style={{ color: "var(--primary)" }}
            />
            <div className="text-center">
              <p className="font-semibold" style={{ color: "var(--app-fg)" }}>
                Corrigindo sua resposta…
              </p>
              <p
                className="text-sm mt-1"
                style={{ color: "var(--muted-text)" }}
              >
                A IA está avaliando seu texto como a banca {banca}.<br />
                Isso pode levar alguns segundos.
              </p>
            </div>
          </div>
        )}

        {/* ── STEP: RESULT ── */}
        {step === "result" && result && (
          <div className="flex flex-col gap-4 py-2">
            <div
              className="flex flex-col items-center gap-2 py-4 rounded-2xl"
              style={{ background: "var(--stat-bg)" }}
            >
              <span
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: "var(--muted-text)" }}
              >
                Nota Estimada
              </span>
              <div
                className="text-5xl font-black"
                style={{ color: scoreColor(result.nota_final) }}
              >
                {result.nota_final.toFixed(1)}
              </div>
              <span
                className="text-xs font-medium"
                style={{ color: "var(--muted-text)" }}
              >
                Banca {banca}
              </span>
            </div>

            <div className="space-y-4">
              <section>
                <h4
                  className="text-sm font-bold flex items-center gap-2 mb-2"
                  style={{ color: "var(--app-fg)" }}
                >
                  <CheckCircle2 className="w-4 h-4 text-green-500" /> Pontos
                  Positivos
                </h4>
                <ul className="space-y-1">
                  {result.pontos_positivos.map((p, i) => (
                    <li
                      key={i}
                      className="text-xs flex items-start gap-2"
                      style={{ color: "var(--muted-text)" }}
                    >
                      <div
                        className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0"
                        style={{ background: "var(--primary)" }}
                      />
                      {p}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h4
                  className="text-sm font-bold flex items-center gap-2 mb-2"
                  style={{ color: "var(--app-fg)" }}
                >
                  <AlertCircle className="w-4 h-4 text-orange-500" /> Erros e
                  Melhorias
                </h4>
                <ul className="space-y-1">
                  {result.erros_encontrados.map((p, i) => (
                    <li
                      key={i}
                      className="text-xs flex items-start gap-2"
                      style={{ color: "var(--muted-text)" }}
                    >
                      <div
                        className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0"
                        style={{ background: "#dc2626" }}
                      />
                      {p}
                    </li>
                  ))}
                </ul>
              </section>

              <section
                className="p-3 rounded-xl border"
                style={{
                  borderColor: "var(--card-border)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <h4
                  className="text-xs font-bold uppercase tracking-wider mb-2"
                  style={{ color: "var(--muted-text)" }}
                >
                  Parecer do Especialista
                </h4>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "var(--app-fg)" }}
                >
                  {result.parecer}
                </p>
              </section>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-bold text-sm mt-2"
              style={{ background: "var(--primary)", color: "white" }}
            >
              Concluir Revisão
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
