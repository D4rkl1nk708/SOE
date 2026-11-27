import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { MicroWorld } from "./SandboxFrame";
import type { GenerationProvider } from "./useGenerationJob";
import type { ReadingSection } from "./readingModel";

export type SectionQuestion = {
  question: string;
  answerKey: string[];
  pageFrom: number;
  pageTo: number;
};

export type Analogy = {
  analogy: string;
  mapping: string[];
  breaks: string;
  bestFor: string;
};

function normalizeProvider(value: unknown): GenerationProvider {
  return ["claude", "gemini", "openai"].includes(String(value))
    ? (String(value) as GenerationProvider)
    : "gemini";
}

/**
 * Estado compartilhado do Caderno Vivo.
 *
 * Existe para o leitor novo (layout focado) e o clássico serem a MESMA tela com
 * duas apresentações: as queries, as mutações de leitura ativa e a seleção de
 * documento/seção vivem aqui, não em cada layout. Assim o clássico continua
 * funcionando exatamente como antes e o novo não duplica regra.
 */
export function useCadernoVivo() {
  const utils = trpc.useUtils();
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const settings = ((stats as any)?.settings ?? {}) as Record<string, any>;

  const apiKey = String(settings.aiApiKey || "");
  const provider = normalizeProvider(settings.aiProvider);
  const isFocused = (settings.uiMode ?? "focused") !== "complete";

  const { data: docs = [] } = trpc.learning.list.useQuery();
  const [docId, setDocId] = useState<string | null>(null);
  const { data: doc } = trpc.learning.get.useQuery(
    { docId: docId! },
    { enabled: !!docId },
  );

  const [sectionIndex, setSectionIndex] = useState(0);
  // v6.9.11 (B7/4.11): micro-recuperação por seção.
  const [recallGate, setRecallGate] = useState(false);
  const [recallText, setRecallText] = useState("");
  const [pendingSection, setPendingSection] = useState<number | null>(null);
  const [questions, setQuestions] = useState<SectionQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [analogies, setAnalogies] = useState<Analogy[] | null>(null);
  const [chosenAnalogy, setChosenAnalogy] = useState<number | null>(null);
  const [whyItWorks, setWhyItWorks] = useState("");
  const [world, setWorld] = useState<MicroWorld | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Primeiro documento da lista abre sozinho; documento apagado sai da seleção.
  useEffect(() => {
    if (docs.length === 0) {
      if (docId) setDocId(null);
      return;
    }
    if (!docId || !docs.some((item) => item.id === docId)) {
      setDocId(docs[0].id);
      setSectionIndex(0);
    }
  }, [docs, docId]);

  const sections = doc?.sectionsData ?? [];
  const section = (sections[sectionIndex] ?? null) as ReadingSection | null;

  const { data: sectionRecalls = [] } = trpc.learning.sectionRecalls.useQuery(
    { docId: docId || "" },
    { enabled: !!docId },
  );
  const saveSectionRecall = trpc.learning.saveSectionRecall.useMutation({
    onSuccess: async () => {
      await utils.learning.sectionRecalls.invalidate();
      setRecallGate(false);
      const target = pendingSection ?? sectionIndex + 1;
      setPendingSection(null);
      setRecallText("");
      setSectionIndex(target);
      resetSectionState();
    },
    onError: (error) => toast.error(error.message),
  });
  const currentSectionHasRecall = (sectionRecalls as any[]).some(
    (item) => item.sectionIndex === sectionIndex,
  );
  const recallQuestion = `O que esta seção afirma sobre ${
    section?.title || "o tema"
  }?`;
  const submitSectionRecall = (selfRated: "acertei" | "nao_soube") => {
    if (!doc || !section) return;
    saveSectionRecall.mutate({
      docId: doc.id,
      sectionIndex,
      sectionTitle: section.title,
      question: recallQuestion,
      answer: recallText.trim() || undefined,
      selfRated,
    });
  };
  const cancelRecallGate = () => {
    setRecallGate(false);
    const target = pendingSection;
    setPendingSection(null);
    setRecallText("");
    if (target != null) {
      setSectionIndex(target);
      resetSectionState();
    }
  };

  const resetSectionState = () => {
    setQuestions(null);
    setAnalogies(null);
    setWorld(null);
    setAnswers({});
    setRevealed({});
    setChosenAnalogy(null);
  };

  const importPdf = trpc.learning.importPdf.useMutation({
    onSuccess: async (meta) => {
      toast.success(`${meta.title} importado: ${meta.sections} seções.`);
      await utils.learning.list.invalidate();
      setDocId(meta.id);
      setSectionIndex(0);
      resetSectionState();
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

  const { data: savedAnalogies = [] } = trpc.learning.analogiesFor.useQuery(
    { topicName: section?.title },
    { enabled: !!section?.title },
  );

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

  const openFilePicker = () => fileRef.current?.click();

  const selectDoc = (id: string) => {
    setDocId(id);
    setSectionIndex(0);
    resetSectionState();
  };

  const selectSection = (index: number) => {
    // v6.9.11 (B7): avançar sem recuperar a seção atual abre a pergunta.
    if (
      index > sectionIndex &&
      sections.length > 0 &&
      !currentSectionHasRecall
    ) {
      setPendingSection(index);
      setRecallText("");
      setRecallGate(true);
      return;
    }
    setSectionIndex(index);
    resetSectionState();
  };

  const goToSection = (index: number) => {
    const total = sections.length;
    if (total === 0) return;
    const next = Math.min(total - 1, Math.max(0, index));
    if (next === sectionIndex) return;
    selectSection(next);
  };

  const answeredCount = useMemo(
    () =>
      questions?.filter((_, index) => (answers[index] || "").trim()).length ??
      0,
    [questions, answers],
  );

  const runQuestions = () => {
    if (!requireKey() || !doc) return;
    askQuestions.mutate({
      docId: doc.id,
      sectionIndex,
      apiKey,
      provider,
    });
  };

  const runAnalogies = () => {
    if (!requireKey() || !section) return;
    askAnalogies.mutate({
      topicName: section.title,
      context: section.text.slice(0, 2000),
      apiKey,
      provider,
    });
  };

  const runWorld = () => {
    if (!requireKey() || !section) return;
    askWorld.mutate({
      topicName: section.title,
      apiKey,
      provider,
    });
  };

  const chooseAnalogy = (item: Analogy, index: number) => {
    if (!section) return;
    setChosenAnalogy(index);
    saveAnalogy.mutate({
      topicName: section.title,
      analogy: item.analogy,
      mapping: item.mapping,
      breaks: item.breaks,
      bestFor: item.bestFor,
      whyItWorks: whyItWorks.trim() || undefined,
    });
  };

  return {
    // configuração
    apiKey,
    provider,
    isFocused,
    hasKey: Boolean(apiKey),
    // documentos e seção
    docs,
    doc: doc ?? null,
    docId,
    section,
    sections,
    sectionIndex,
    savedAnalogies,
    fileRef,
    openFilePicker,
    handleFile,
    importPdf,
    removeDoc,
    selectDoc,
    selectSection,
    goToSection,
    hasPrevSection: sectionIndex > 0,
    hasNextSection: sectionIndex + 1 < sections.length,
    // v6.9.11 (B7/4.11): gate de micro-recuperação por seção.
    recallGate,
    recallText,
    recallQuestion,
    setRecallText,
    submitSectionRecall,
    cancelRecallGate,
    saveSectionRecall,
    sectionRecalls,
    // leitura ativa (mutações antigas — usadas pelo layout clássico)
    questions,
    answers,
    revealed,
    answeredCount,
    analogies,
    chosenAnalogy,
    whyItWorks,
    world,
    setAnswers,
    setRevealed,
    setWhyItWorks,
    resetSectionState,
    runQuestions,
    runAnalogies,
    runWorld,
    chooseAnalogy,
    askQuestions,
    askAnalogies,
    askWorld,
    saveAnalogy,
  };
}

export type CadernoVivoState = ReturnType<typeof useCadernoVivo>;
