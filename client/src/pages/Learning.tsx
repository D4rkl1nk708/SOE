import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import SandboxFrame, {
  type MicroWorld,
} from "@/components/learning/SandboxFrame";
import { toast } from "sonner";
import {
  BookOpen,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  HelpCircle,
  GitCompareArrows,
  Boxes,
  ChevronRight,
} from "lucide-react";

type SectionQuestion = {
  question: string;
  answerKey: string[];
  pageFrom: number;
  pageTo: number;
};

type Analogy = {
  analogy: string;
  mapping: string[];
  breaks: string;
  bestFor: string;
};

export default function Learning() {
  const utils = trpc.useUtils();
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const apiKey = ((stats?.settings as any)?.aiApiKey as string) || "";
  const provider = ((stats?.settings as any)?.aiProvider as string) || "gemini";

  const { data: docs = [] } = trpc.learning.list.useQuery();
  const [docId, setDocId] = useState<string | null>(null);
  const { data: doc } = trpc.learning.get.useQuery(
    { docId: docId! },
    { enabled: !!docId },
  );

  const [sectionIndex, setSectionIndex] = useState(0);
  const [questions, setQuestions] = useState<SectionQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [analogies, setAnalogies] = useState<Analogy[] | null>(null);
  const [chosenAnalogy, setChosenAnalogy] = useState<number | null>(null);
  const [whyItWorks, setWhyItWorks] = useState("");
  const [world, setWorld] = useState<MicroWorld | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const importPdf = trpc.learning.importPdf.useMutation({
    onSuccess: async (meta) => {
      toast.success(`${meta.title} importado: ${meta.sections} seções.`);
      await utils.learning.list.invalidate();
      setDocId(meta.id);
      setSectionIndex(0);
    },
    onError: (error) => toast.error(error.message),
  });

  const removeDoc = trpc.learning.remove.useMutation({
    onSuccess: async () => {
      toast.success("Documento removido.");
      setDocId(null);
      await utils.learning.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const askQuestions = trpc.learning.sectionQuestions.useMutation({
    onSuccess: (data) => {
      setQuestions(data.questions);
      setAnswers({});
      setRevealed({});
    },
    onError: (error) => toast.error(error.message),
  });

  const askAnalogies = trpc.learning.analogies.useMutation({
    onSuccess: (data) => {
      setAnalogies(data.analogies);
      setChosenAnalogy(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const saveAnalogy = trpc.learning.saveAnalogy.useMutation({
    onSuccess: async () => {
      toast.success("Analogia salva no tema — o mentor passa a usá-la.");
      setWhyItWorks("");
      await utils.learning.analogiesFor.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const saveWorld = trpc.learning.saveMicroWorld.useMutation({
    onError: (error) => toast.error(error.message),
  });

  const askWorld = trpc.learning.microWorld.useMutation({
    onSuccess: async (data) => {
      setWorld(data as MicroWorld);
      // Micro-mundo fica salvo no tópico (um por tema).
      saveWorld.mutate({
        topicName: section?.title || data.title,
        title: data.title,
        html: data.html,
        controls: data.controls,
        challenges: data.challenges,
        limits: data.limits,
      });
      await utils.learning.microWorldsFor.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const section = doc?.sectionsData?.[sectionIndex];
  const { data: savedAnalogies = [] } = trpc.learning.analogiesFor.useQuery(
    { topicName: section?.title },
    { enabled: !!section?.title },
  );
  const providerSafe = ["claude", "gemini", "openai"].includes(provider)
    ? (provider as "claude" | "gemini" | "openai")
    : "gemini";

  const requireKey = () => {
    if (!apiKey) {
      toast.error("Configure a chave de IA no Perfil para usar esta leitura.");
      return false;
    }
    return true;
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result || "");
      if (!base64.includes("base64,")) {
        toast.error("Não consegui ler o arquivo.");
        return;
      }
      importPdf.mutate({ base64, fileName: file.name });
    };
    reader.onerror = () => toast.error("Falha ao ler o arquivo.");
    reader.readAsDataURL(file);
  };

  const resetSectionState = () => {
    setQuestions(null);
    setAnalogies(null);
    setWorld(null);
    setAnswers({});
    setRevealed({});
    setChosenAnalogy(null);
  };

  const answeredCount = useMemo(
    () =>
      questions?.filter((_, index) => (answers[index] || "").trim()).length ??
      0,
    [questions, answers],
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-14">
      <PageHeader
        eyebrow="Leitura ativa"
        title="Caderno Vivo"
        description="Importe o PDF e leia em seções: perguntas de recuperação, analogias e micro-mundos."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => fileRef.current?.click()}
              disabled={importPdf.isPending}
            >
              {importPdf.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="mr-2 h-3.5 w-3.5" />
              )}
              Importar PDF
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFile(file);
                event.target.value = "";
              }}
            />
          </>
        }
      />

      {docs.length === 0 && (
        <div className="soe-card p-8 text-center">
          <BookOpen className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">Nenhum PDF importado.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Importe um material seu. O texto é dividido em seções e cada seção
            vira uma sessão de estudo.
          </p>
        </div>
      )}

      {docs.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-2">
            {docs.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 rounded-[10px] border px-3 py-2 transition-colors ${
                  docId === item.id
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-card hover:bg-secondary/40"
                }`}
              >
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    setDocId(item.id);
                    setSectionIndex(0);
                    resetSectionState();
                  }}
                >
                  <p className="truncate text-[12.5px] font-medium">
                    {item.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {item.pages} páginas · {item.sections} seções
                  </p>
                </button>
                <button
                  aria-label={`Remover ${item.title}`}
                  onClick={() => removeDoc.mutate({ docId: item.id })}
                  className="text-muted-foreground/50 transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </aside>

          <div className="min-w-0 space-y-4">
            {doc && (
              <>
                <div className="soe-card overflow-hidden">
                  <div className="flex items-center justify-between px-4 pb-1.5 pt-3.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Seções
                    </p>
                    <span className="text-[10px] text-muted-foreground">
                      {sectionIndex + 1} de {doc.sectionsData.length}
                    </span>
                  </div>
                  <div className="max-h-40 overflow-y-auto border-t border-border">
                    {doc.sectionsData.map((item, index) => (
                      <button
                        key={`${item.title}-${index}`}
                        onClick={() => {
                          setSectionIndex(index);
                          resetSectionState();
                        }}
                        className={`flex w-full items-center gap-2 px-4 py-2 text-left transition-colors ${
                          index === sectionIndex
                            ? "bg-primary/10"
                            : "hover:bg-secondary/40"
                        }`}
                      >
                        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-[12px]">
                          {item.title}
                        </span>
                        <span className="shrink-0 text-[9.5px] tabular-nums text-muted-foreground">
                          p. {item.startPage}–{item.endPage}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {section && (
                  <>
                    <div className="soe-card p-5">
                      <h2 className="text-[15px] font-semibold">
                        {section.title}
                      </h2>
                      <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                        páginas {section.startPage}–{section.endPage}
                      </p>
                      <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">
                        {section.text.slice(0, 12000)}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={askQuestions.isPending}
                          onClick={() => {
                            if (!requireKey()) return;
                            askQuestions.mutate({
                              docId: doc.id,
                              sectionIndex,
                              apiKey,
                              provider: providerSafe,
                            });
                          }}
                        >
                          {askQuestions.isPending ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <HelpCircle className="mr-2 h-3.5 w-3.5" />
                          )}
                          Perguntas de recuperação
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={askAnalogies.isPending}
                          onClick={() => {
                            if (!requireKey()) return;
                            askAnalogies.mutate({
                              topicName: section.title,
                              context: section.text.slice(0, 2000),
                              apiKey,
                              provider: providerSafe,
                            });
                          }}
                        >
                          {askAnalogies.isPending ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <GitCompareArrows className="mr-2 h-3.5 w-3.5" />
                          )}
                          Analogias
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={askWorld.isPending}
                          onClick={() => {
                            if (!requireKey()) return;
                            askWorld.mutate({
                              topicName: section.title,
                              apiKey,
                              provider: providerSafe,
                            });
                          }}
                        >
                          {askWorld.isPending ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Boxes className="mr-2 h-3.5 w-3.5" />
                          )}
                          Micro-mundo
                        </Button>
                      </div>
                    </div>

                    {questions && (
                      <div className="soe-card p-5">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                            Responda de cabeça
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            {answeredCount}/{questions.length} respondidas
                          </span>
                        </div>
                        <div className="mt-3 space-y-4">
                          {questions.map((item, index) => (
                            <div
                              key={item.question}
                              className="rounded-md border border-border bg-secondary/20 p-3"
                            >
                              <p className="text-[12.5px] font-medium">
                                {index + 1}. {item.question}
                              </p>
                              <textarea
                                value={answers[index] || ""}
                                onChange={(event) =>
                                  setAnswers((previous) => ({
                                    ...previous,
                                    [index]: event.target.value,
                                  }))
                                }
                                rows={3}
                                placeholder="Sua resposta, sem consultar..."
                                className="mt-2 w-full resize-y rounded-md border border-border bg-background/40 p-2 text-[11.5px] leading-relaxed outline-none focus:border-primary/50"
                              />
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    setRevealed((previous) => ({
                                      ...previous,
                                      [index]: !previous[index],
                                    }))
                                  }
                                >
                                  {revealed[index] ? "Ocultar" : "Conferir"}
                                </Button>
                                <span className="text-[9.5px] text-muted-foreground">
                                  fonte: p. {item.pageFrom}–{item.pageTo}
                                </span>
                              </div>
                              {revealed[index] && (
                                <ul className="mt-2 space-y-1 text-[11.5px] text-muted-foreground">
                                  {item.answerKey.map((point) => (
                                    <li key={point}>• {point}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {analogies && (
                      <div className="soe-card p-5">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          Escolha a analogia que funciona para você
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Comparar duas analogias fixa o princípio. Escolha uma
                          e note onde ela quebra.
                        </p>
                        {savedAnalogies.length > 0 && (
                          <div className="mt-3 rounded-md border border-emerald-500/25 bg-emerald-500/10 p-3">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-500">
                              Sua analogia salva neste tema
                            </p>
                            <p className="mt-1 text-[12px] font-medium">
                              {savedAnalogies[0].analogy}
                            </p>
                            {savedAnalogies[0].whyItWorks && (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                Por que funciona: {savedAnalogies[0].whyItWorks}
                              </p>
                            )}
                          </div>
                        )}
                        <textarea
                          value={whyItWorks}
                          onChange={(event) =>
                            setWhyItWorks(event.target.value)
                          }
                          rows={2}
                          placeholder="Ao escolher, escreva em uma frase por que ela funciona para você..."
                          className="mt-3 w-full resize-y rounded-md border border-border bg-background/40 p-2 text-[11.5px] leading-relaxed outline-none focus:border-primary/50"
                        />
                        <div className="mt-3 space-y-2">
                          {analogies.map((item, index) => (
                            <div
                              key={item.analogy}
                              className={`rounded-md border p-3 ${
                                chosenAnalogy === index
                                  ? "border-primary/40 bg-primary/10"
                                  : "border-border bg-secondary/20"
                              }`}
                            >
                              <p className="text-[12.5px] font-medium">
                                {item.analogy}
                              </p>
                              {item.bestFor && (
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  Ilumina: {item.bestFor}
                                </p>
                              )}
                              {item.mapping.length > 0 && (
                                <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                                  {item.mapping.map((line) => (
                                    <li key={line}>→ {line}</li>
                                  ))}
                                </ul>
                              )}
                              {item.breaks && (
                                <p className="mt-1 text-[11px] text-amber-500">
                                  Onde quebra: {item.breaks}
                                </p>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="mt-1"
                                disabled={saveAnalogy.isPending}
                                onClick={() => {
                                  setChosenAnalogy(index);
                                  saveAnalogy.mutate({
                                    topicName: section?.title || "Tema",
                                    analogy: item.analogy,
                                    mapping: item.mapping,
                                    breaks: item.breaks,
                                    bestFor: item.bestFor,
                                    whyItWorks: whyItWorks.trim() || undefined,
                                  });
                                }}
                              >
                                {saveAnalogy.isPending &&
                                chosenAnalogy === index
                                  ? "Salvando..."
                                  : chosenAnalogy === index
                                    ? "Escolhida"
                                    : "Ficar com esta"}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {world && <SandboxFrame world={world} />}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
