/**
 * Jobs de geração por IA, em memória.
 *
 * O problema real: a chamada de IA leva ~30 s e a tela ficava parada; quando
 * falhava, o aluno lia "JSON truncado". Aqui a geração vira um job com id,
 * estágio, % e mensagem — o cliente consulta o status e consegue cancelar.
 *
 * Regras que os testes cobrem:
 *  - progresso é monotônico (nunca volta para menos);
 *  - 100% só existe junto com o resultado;
 *  - cancelar libera o slot do usuário (máx. 2 jobs simultâneos);
 *  - job desconhecido/expirado vira 404 claro;
 *  - erro é sempre código + mensagem legível (sem stack trace).
 */

export type GenerationKind =
  | "questions"
  | "analogies"
  | "microWorld"
  | "lesson";

export type GenerationStage =
  | "preparando"
  | "enviando ao modelo"
  | "gerando"
  | "validando artefato"
  | "pronto"
  | "cancelado"
  | "erro";

export type GenerationStatus = "running" | "done" | "error" | "cancelled";

export type GenerationErrorCode =
  | "NO_KEY"
  | "QUOTA_EXCEEDED"
  | "TIMEOUT"
  | "INVALID_JSON"
  | "INVALID_ARTIFACT"
  | "NOT_FOUND"
  | "NETWORK"
  | "CANCELLED"
  | "UNKNOWN";

export type GenerationError = { code: GenerationErrorCode; message: string };

export type GenerationJob = {
  id: string;
  userId: number;
  kind: GenerationKind;
  status: GenerationStatus;
  stage: GenerationStage;
  percent: number;
  message: string;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  result?: unknown;
  error?: GenerationError;
};

/** TTL do job em memória: depois disso ele nem é encontrado (404). */
export const JOB_TTL_MS = 10 * 60 * 1000;
/** Slots simultâneos por usuário. */
export const MAX_CONCURRENT_JOBS = 2;

const jobs = new Map<string, GenerationJob>();
const timers = new Map<string, ReturnType<typeof setInterval>>();
let sequence = 0;

export const STAGE_LABELS: Record<GenerationStage, string> = {
  preparando: "Preparando o material",
  "enviando ao modelo": "Enviando ao modelo",
  gerando: "Gerando",
  "validando artefato": "Validando o artefato",
  pronto: "Pronto",
  cancelado: "Cancelado",
  erro: "Erro na geração",
};

export const ERROR_MESSAGES: Record<GenerationErrorCode, string> = {
  NO_KEY:
    "Nenhuma chave de IA configurada. Salve sua chave em Ajustes e tente de novo.",
  QUOTA_EXCEEDED:
    "Cota da IA esgotada nesta chave. Troque de chave em Ajustes ou tente mais tarde.",
  TIMEOUT: "A IA demorou demais. Tente de novo.",
  INVALID_JSON: "A IA devolveu algo ilegível — tente de novo.",
  INVALID_ARTIFACT:
    "A IA devolveu um artefato fora do contrato (sem passos, com rede ou sem acessibilidade) — tente de novo.",
  NOT_FOUND: "Geração não encontrada ou expirada. Comece outra.",
  NETWORK:
    "Não consegui falar com a IA (rede). Verifique a conexão e tente de novo.",
  CANCELLED: "Geração cancelada.",
  UNKNOWN: "A geração falhou. Tente de novo.",
};

/**
 * Traduz um erro qualquer (provedor, parser, artefato) em código + frase que o
 * aluno lê. Nunca devolve stack trace.
 */
export function mapGenerationError(error: unknown): GenerationError {
  const raw = error as any;
  const message = String(raw?.message ?? raw ?? "");
  const lower = message.toLowerCase();
  const code = String(raw?.code || "");

  if (code === "CANCELLED") {
    return { code: "CANCELLED", message: ERROR_MESSAGES.CANCELLED };
  }
  if (
    code === "QUOTA_EXCEEDED" ||
    lower.includes("quota_exceeded") ||
    lower.includes("quota") ||
    lower.includes("resource_exhausted") ||
    lower.includes("rate limit") ||
    lower.includes("429")
  ) {
    return { code: "QUOTA_EXCEEDED", message: ERROR_MESSAGES.QUOTA_EXCEEDED };
  }
  if (
    code === "INVALID_ARTIFACT" ||
    lower.includes("artefato") ||
    lower.includes("prefers-reduced-motion")
  ) {
    return {
      code: "INVALID_ARTIFACT",
      message: ERROR_MESSAGES.INVALID_ARTIFACT,
    };
  }
  if (
    code === "INVALID_JSON" ||
    lower.includes("json") ||
    lower.includes("ilegível") ||
    lower.includes("ilegivel") ||
    lower.includes("unexpected token")
  ) {
    return { code: "INVALID_JSON", message: ERROR_MESSAGES.INVALID_JSON };
  }
  if (
    code === "TIMEOUT" ||
    lower.includes("sem resposta em") ||
    lower.includes("timeout") ||
    lower.includes("demorou demais") ||
    lower.includes("aborted") ||
    lower.includes("aborterror") ||
    lower.includes("etimedout")
  ) {
    return { code: "TIMEOUT", message: ERROR_MESSAGES.TIMEOUT };
  }
  if (
    lower.includes("api key") ||
    lower.includes("chave") ||
    lower.includes("nenhuma api key") ||
    lower.includes("expirada ou inválida")
  ) {
    return { code: "NO_KEY", message: ERROR_MESSAGES.NO_KEY };
  }
  if (
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("network")
  ) {
    return { code: "NETWORK", message: ERROR_MESSAGES.NETWORK };
  }
  return { code: "UNKNOWN", message: ERROR_MESSAGES.UNKNOWN };
}

function makeJobId(): string {
  sequence += 1;
  return `job-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

/** Remove jobs terminados há mais de `JOB_TTL_MS`. */
export function pruneJobs(at = Date.now()): void {
  for (const [id, job] of jobs) {
    const expired = at - job.updatedAt > JOB_TTL_MS;
    if (expired) {
      stopTimer(id);
      jobs.delete(id);
    }
  }
}

function stopTimer(jobId: string): void {
  const timer = timers.get(jobId);
  if (timer) {
    clearInterval(timer);
    timers.delete(jobId);
  }
}

export function getJob(jobId: string): GenerationJob | undefined {
  pruneJobs();
  return jobs.get(jobId);
}

/** Jobs que ainda ocupam slot do usuário (running). */
export function activeJobCount(userId: number): number {
  pruneJobs();
  let count = 0;
  for (const job of jobs.values()) {
    if (job.userId === userId && job.status === "running") count += 1;
  }
  return count;
}

/**
 * Avança o progresso sem nunca regredir. Quando o resultado ainda não existe,
 * o teto é 99%: só `finishJob` escreve 100.
 */
export function advanceJob(
  job: GenerationJob,
  percent: number,
  stage?: GenerationStage,
  message?: string,
  at = Date.now(),
): GenerationJob {
  if (job.status !== "running") return job;
  const ceiling = job.result ? 100 : 99;
  const next = Math.max(job.percent, Math.min(ceiling, Math.round(percent)));
  job.percent = Math.max(0, Math.min(100, next));
  if (stage) job.stage = stage;
  if (message) job.message = message;
  job.updatedAt = at;
  return job;
}

function stageMessage(stage: GenerationStage): string {
  return STAGE_LABELS[stage];
}

function startEstimateTicker(job: GenerationJob): void {
  stopTimer(job.id);
  const started = Date.now();
  const timer = setInterval(() => {
    if (job.status !== "running") {
      stopTimer(job.id);
      return;
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    // Sem streaming do provedor, o avanço é por tempo e a mensagem diz isso.
    const estimated = 18 + Math.min(66, seconds * 1.6);
    advanceJob(job, estimated, "gerando", `estimativa — gerando (${seconds}s)`);
  }, 1000);
  timer.unref?.();
  timers.set(job.id, timer);
}

export type JobHandle = {
  job: GenerationJob;
  /** Relata progresso (só avança, nunca volta). */
  report: (percent: number, stage?: GenerationStage, message?: string) => void;
  /** O aluno cancelou: o runner deve abandonar o resultado. */
  isCancelled: () => boolean;
};

/** Conclui o job com resultado — é o único caminho para 100%. */
export function finishJob(job: GenerationJob, result: unknown): GenerationJob {
  if (job.status !== "running") return job;
  if (result === undefined || result === null) {
    return failJob(job, { code: "UNKNOWN", message: ERROR_MESSAGES.UNKNOWN });
  }
  stopTimer(job.id);
  job.result = result;
  job.status = "done";
  job.stage = "pronto";
  job.percent = 100;
  job.message = "Pronto — já pode usar.";
  job.finishedAt = Date.now();
  job.updatedAt = job.finishedAt;
  return job;
}

export function failJob(job: GenerationJob, error: unknown): GenerationJob {
  if (job.status !== "running") return job;
  stopTimer(job.id);
  const mapped =
    error &&
    typeof error === "object" &&
    "code" in (error as any) &&
    "message" in (error as any)
      ? (error as GenerationError)
      : mapGenerationError(error);
  job.status = "error";
  job.stage = "erro";
  job.error = mapped;
  job.message = mapped.message;
  job.finishedAt = Date.now();
  job.updatedAt = job.finishedAt;
  return job;
}

/** Cancelar libera o slot na hora; o runner pode terminar e ser descartado. */
export function cancelJob(job: GenerationJob): GenerationJob {
  if (job.status !== "running") return job;
  stopTimer(job.id);
  job.status = "cancelled";
  job.stage = "cancelado";
  job.message = "Geração cancelada.";
  job.finishedAt = Date.now();
  job.updatedAt = job.finishedAt;
  return job;
}

export type GenerationRunner = (handle: JobHandle) => Promise<unknown>;

/**
 * Cria e dispara o job. O runner recebe o handle para reportar progresso; o
 * resultado (ou erro) é aplicado aqui, nunca dentro do runner.
 */
export function startGenerationJob(
  userId: number,
  kind: GenerationKind,
  runner: GenerationRunner,
): GenerationJob {
  pruneJobs();
  const now = Date.now();
  const job: GenerationJob = {
    id: makeJobId(),
    userId,
    kind,
    status: "running",
    stage: "preparando",
    percent: 5,
    message: stageMessage("preparando"),
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(job.id, job);

  const handle: JobHandle = {
    job,
    report: (percent, stage, message) =>
      advanceJob(
        job,
        percent,
        stage,
        message ?? (stage ? stageMessage(stage) : undefined),
      ),
    isCancelled: () => job.status !== "running",
  };

  // Primeiro avança para "enviando ao modelo" e só então começa a estimativa
  // por tempo — o runner sinaliza 15% quando a chamada de IA realmente sai.
  Promise.resolve()
    .then(() => runner(handle))
    .then((result) => {
      if (job.status !== "running") return; // cancelado: descarta o resultado
      finishJob(job, result);
    })
    .catch((error) => {
      if (job.status !== "running") return;
      failJob(job, error);
    });

  return job;
}

/** Chamado pelo runner logo antes da chamada de IA (liga o relógio honesto). */
export function beginModelCall(job: GenerationJob): void {
  advanceJob(job, 15, "enviando ao modelo", STAGE_LABELS["enviando ao modelo"]);
  advanceJob(job, 18, "gerando", "estimativa — gerando (0s)");
  startEstimateTicker(job);
}

export type GenerationStatusView = {
  jobId: string;
  kind: GenerationKind;
  status: GenerationStatus;
  stage: GenerationStage;
  percent: number;
  message: string;
  elapsedSeconds: number;
  result?: unknown;
  error?: GenerationError;
};

export function viewJob(
  job: GenerationJob,
  at = Date.now(),
): GenerationStatusView {
  const end = job.finishedAt ?? at;
  return {
    jobId: job.id,
    kind: job.kind,
    status: job.status,
    stage: job.stage,
    percent: job.percent,
    message: job.message,
    elapsedSeconds: Math.max(0, Math.round((end - job.createdAt) / 1000)),
    ...(job.result !== undefined ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

/** Só para testes: zera o registro e os relógios. */
export function __resetJobsForTests(): void {
  for (const id of timers.keys()) stopTimer(id);
  jobs.clear();
  sequence = 0;
}
