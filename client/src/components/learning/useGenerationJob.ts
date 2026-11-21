import { useCallback, useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Geração de IA com progresso real: pede um job ao servidor, consulta o status
 * até terminar, deixa cancelar e repetir.
 *
 * O job vive no servidor (10 min): se a aba perder o foco, o trabalho continua e
 * o retorno do foco consulta o status (o app inteiro usa `staleTime: 30s`, por
 * isso aqui o poll declara `staleTime: 0` — sem isso, a barra ficaria congelada
 * no primeiro valor em cache enquanto a geração seguia no servidor).
 *
 * O que este hook NÃO faz é fingir progresso: o número vem do servidor, que
 * avança por tempo quando o provedor não entrega chunks e diz isso na mensagem
 * ("estimativa — gerando (12s)").
 */

export type GenerationKind =
  | "questions"
  | "analogies"
  | "microWorld"
  | "lesson";
export type GenerationProvider = "claude" | "gemini" | "openai";

export type GenerationPayload = {
  kind: GenerationKind;
  topicName: string;
  docId?: string;
  sectionIndex?: number;
  disciplineName?: string;
  topicId?: number;
  context?: string;
  provider: GenerationProvider;
  apiKey?: string;
};

export type GenerationErrorView = { code: string; message: string };

export type GenerationView = {
  jobId: string;
  kind: GenerationKind;
  status: "running" | "done" | "error" | "cancelled";
  stage: string;
  percent: number;
  message: string;
  elapsedSeconds: number;
  result?: any;
  error?: GenerationErrorView;
};

const POLL_MS = 900;
const INITIAL_MESSAGE = "Preparando o material";

export function useGenerationJob() {
  const startMutation = trpc.learning.startGeneration.useMutation();
  const cancelMutation = trpc.learning.cancelGeneration.useMutation();

  const [jobId, setJobId] = useState<string | null>(null);
  const [payload, setPayload] = useState<GenerationPayload | null>(null);
  const [localView, setLocalView] = useState<GenerationView | null>(null);
  const [startError, setStartError] = useState<GenerationErrorView | null>(
    null,
  );
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState(0);

  const statusQuery = trpc.learning.generationStatus.useQuery(
    { jobId: jobId ?? "" },
    {
      enabled: Boolean(jobId),
      staleTime: 0,
      retry: false,
      refetchOnWindowFocus: true,
      refetchInterval: (query) => {
        const data = query.state.data as GenerationView | undefined;
        if (!data) return POLL_MS;
        return data.status === "running" ? POLL_MS : false;
      },
    },
  );

  const serverView = (statusQuery.data ?? null) as GenerationView | null;
  const view = serverView ?? localView;
  const running = view?.status === "running";

  const reset = useCallback(() => {
    setJobId(null);
    setLocalView(null);
    setPayload(null);
    setStartError(null);
    setElapsed(0);
  }, []);

  const start = useCallback(
    async (next: GenerationPayload) => {
      setStartError(null);
      setPayload(next);
      setElapsed(0);
      setStartedAt(Date.now());
      try {
        const started = await startMutation.mutateAsync({
          kind: next.kind,
          topicName: next.topicName,
          docId: next.docId,
          sectionIndex: next.sectionIndex,
          disciplineName: next.disciplineName,
          topicId: next.topicId,
          context: next.context,
          provider: next.provider,
          apiKey: next.apiKey,
        } as any);
        setJobId(started.jobId);
        setLocalView({
          jobId: started.jobId,
          kind: next.kind,
          status: "running",
          stage: "preparando",
          percent: 5,
          message: INITIAL_MESSAGE,
          elapsedSeconds: 0,
        });
      } catch (error: any) {
        const message =
          String(error?.message || "").trim() ||
          "Não consegui começar a geração. Tente de novo.";
        setStartError({ code: "START_FAILED", message });
        setLocalView(null);
        setJobId(null);
      }
    },
    [startMutation],
  );

  const retry = useCallback(async () => {
    if (!payload) return;
    await start(payload);
  }, [payload, start]);

  const cancel = useCallback(async () => {
    if (!jobId) return;
    try {
      await cancelMutation.mutateAsync({ jobId });
    } catch {
      /* o job pode já ter terminado — o status resolvido abaixo mostra o real */
    }
    setLocalView((previous) =>
      previous && previous.status === "running"
        ? {
            ...previous,
            status: "cancelled",
            stage: "cancelado",
            message: "Geração cancelada.",
          }
        : previous,
    );
    setJobId(null);
  }, [cancelMutation, jobId]);

  // Erro de consulta (ex.: job expirado): vira erro legível, com "tentar de novo".
  useEffect(() => {
    const error = statusQuery.error as any;
    if (!error || !jobId) return;
    const message =
      String(error?.message || "").trim() ||
      "Geração não encontrada ou expirada. Comece outra.";
    setLocalView((previous) =>
      previous
        ? {
            ...previous,
            status: "error",
            stage: "erro",
            message,
            error: { code: "NOT_FOUND", message },
          }
        : previous,
    );
  }, [statusQuery.error, jobId]);

  // Relógio local: mostra o tempo andando entre um poll e outro.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [running, startedAt]);

  const result = view?.status === "done" ? view.result : null;
  const error =
    startError || (view?.status === "error" ? view.error || null : null);

  return useMemo(
    () => ({
      view,
      result,
      error,
      running,
      percent: view?.percent ?? 0,
      stage: view?.stage ?? "",
      message: error?.message || view?.message || "",
      elapsedSeconds: Math.max(elapsed, view?.elapsedSeconds ?? 0),
      kind: view?.kind ?? payload?.kind ?? null,
      start,
      retry,
      cancel,
      reset,
      canRetry:
        Boolean(payload) &&
        !running &&
        (view?.status === "error" ||
          view?.status === "cancelled" ||
          Boolean(startError)),
      isStarting: startMutation.isPending,
    }),
    [
      view,
      result,
      error,
      running,
      elapsed,
      payload,
      start,
      retry,
      cancel,
      reset,
      startError,
      startMutation.isPending,
    ],
  );
}

export type GenerationJobState = ReturnType<typeof useGenerationJob>;
