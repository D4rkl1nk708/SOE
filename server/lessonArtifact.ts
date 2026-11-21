/**
 * Validação de artefatos gerados por IA (micro-mundo e aula interativa).
 *
 * O HTML roda em iframe `sandbox="allow-scripts"`, sem rede por política do
 * sandbox — mas o artefato também não pode *tentar* falar com a rede, nem
 * depender de CDN, fonte externa ou imagem remota. Aqui a checagem é estática e
 * barata: se falhar, a geração é rejeitada com uma mensagem que o aluno entende.
 */
import type {
  LessonQuestion,
  LessonStep,
  SavedLesson,
} from "../shared/topicLessons";

export type ArtifactProblem = {
  code:
    | "EMPTY"
    | "NO_HTML"
    | "NO_SCRIPT"
    | "NETWORK"
    | "EXTERNAL_SOURCE"
    | "IFRAME"
    | "NO_REDUCED_MOTION"
    | "SHORT";
  message: string;
};

export type ArtifactCheck = { ok: boolean; problems: ArtifactProblem[] };

const NETWORK_PATTERNS: Array<{
  re: RegExp;
  code: ArtifactProblem["code"];
  message: string;
}> = [
  {
    re: /\bfetch\s*\(/i,
    code: "NETWORK",
    message: "O artefato tentou chamar fetch() (rede).",
  },
  {
    re: /XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon/i,
    code: "NETWORK",
    message: "O artefato tentou abrir conexão de rede.",
  },
  {
    re: /https?:\/\//i,
    code: "NETWORK",
    message: "O artefato referencia um endereço http(s) externo.",
  },
  {
    re: /<script[^>]*\bsrc\s*=/i,
    code: "EXTERNAL_SOURCE",
    message: "O artefato carrega um script externo (script src).",
  },
  {
    re: /<link[^>]*\bhref\s*=/i,
    code: "EXTERNAL_SOURCE",
    message: "O artefato carrega um recurso externo (link href).",
  },
  {
    re: /\bsrc\s*=/i,
    code: "EXTERNAL_SOURCE",
    message: "O artefato usa src= (imagem/áudio/fonte externa).",
  },
  {
    re: /@import\s+/i,
    code: "EXTERNAL_SOURCE",
    message: "O artefato importa CSS externo (@import).",
  },
  {
    re: /<iframe/i,
    code: "IFRAME",
    message: "O artefato abre um iframe (proibido dentro do sandbox).",
  },
];

/**
 * Checagem mínima de qualquer artefato HTML: é um documento, tem script inline
 * e não tenta rede nem dependência externa.
 */
export function checkArtifactHtml(
  html: string,
  options: { requireScript?: boolean } = {},
): ArtifactCheck {
  const requireScript = options.requireScript !== false;
  const problems: ArtifactProblem[] = [];
  const text = String(html || "").trim();

  if (text.length === 0) {
    return {
      ok: false,
      problems: [{ code: "EMPTY", message: "O artefato veio vazio." }],
    };
  }

  if (!/<html[\s>]/i.test(text)) {
    problems.push({
      code: "NO_HTML",
      message: "O artefato não é um documento HTML completo (falta <html>).",
    });
  }

  if (requireScript && !/<script[\s>]/i.test(text)) {
    problems.push({
      code: "NO_SCRIPT",
      message: "O artefato não tem script — sem isso não há animação.",
    });
  }

  if (text.length < 400) {
    problems.push({
      code: "SHORT",
      message: "O artefato é curto demais para ensinar o conceito.",
    });
  }

  for (const pattern of NETWORK_PATTERNS) {
    if (pattern.re.test(text)) {
      problems.push({ code: pattern.code, message: pattern.message });
    }
  }

  return { ok: problems.length === 0, problems };
}

/** Mensagem única e legível para mostrar ao aluno. */
export function describeArtifactProblems(check: ArtifactCheck): string {
  if (check.ok) return "";
  const first = check.problems[0]?.message || "Artefato inválido.";
  return `${first} Gere de novo.`;
}

function normalizeSteps(value: unknown): LessonStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => ({
      title: String(item?.title ?? "").trim(),
      text: String(item?.text ?? "").trim(),
    }))
    .filter((step) => step.title.length > 0 && step.text.length > 0)
    .slice(0, 6);
}

function normalizeQuestion(value: unknown): LessonQuestion | null {
  const raw = value as any;
  if (!raw || typeof raw !== "object") return null;
  const prompt = String(raw.prompt ?? raw.question ?? "").trim();
  const options = Array.isArray(raw.options)
    ? raw.options
        .map((option: unknown) => String(option).trim())
        .filter(Boolean)
    : [];
  if (!prompt || options.length < 2) return null;
  const correctIndexRaw = Number(raw.correctIndex ?? raw.answerIndex ?? 0);
  const correctIndex = Number.isFinite(correctIndexRaw)
    ? Math.min(options.length - 1, Math.max(0, Math.floor(correctIndexRaw)))
    : 0;
  return {
    prompt,
    options: options.slice(0, 6),
    correctIndex,
    feedback: String(raw.feedback ?? raw.explanation ?? "").trim(),
  };
}

export type LessonParseResult =
  | { ok: true; lesson: Omit<SavedLesson, "id" | "createdAt"> }
  | { ok: false; message: string };

/**
 * Contrato da aula interativa: documento + 3–6 passos narrados + 1 interação +
 * 1 pergunta de verificação + limites declarados + redução de movimento.
 */
export function parseLessonArtifact(
  parsed: any,
  fallback: { topicName: string; disciplineName?: string; topicId?: number },
): LessonParseResult {
  const html = String(parsed?.html || "").trim();
  const htmlCheck = checkArtifactHtml(html);
  if (!htmlCheck.ok) {
    return { ok: false, message: describeArtifactProblems(htmlCheck) };
  }

  const steps = normalizeSteps(parsed?.steps);
  if (steps.length < 3) {
    return {
      ok: false,
      message:
        "A aula veio sem os 3 a 6 passos narrados. Gere de novo para ter a narração.",
    };
  }

  const question = normalizeQuestion(parsed?.question);
  if (!question) {
    return {
      ok: false,
      message:
        "A aula veio sem a pergunta de verificação (com 2 a 4 alternativas).",
    };
  }

  const limits = Array.isArray(parsed?.limits)
    ? parsed.limits.map((item: unknown) => String(item).trim()).filter(Boolean)
    : [];
  if (limits.length === 0) {
    return {
      ok: false,
      message: "A aula não declarou o que ignora. Todo modelo tem limite.",
    };
  }

  const interaction = String(parsed?.interaction || "").trim();
  if (!interaction) {
    return {
      ok: false,
      message: "A aula não trouxe a interação para explorar o conceito.",
    };
  }

  if (!/prefers-reduced-motion/i.test(html)) {
    return {
      ok: false,
      message:
        "A aula ignorou prefers-reduced-motion (acessibilidade). Gere de novo.",
    };
  }

  return {
    ok: true,
    lesson: {
      topicId: fallback.topicId,
      topicName: fallback.topicName,
      disciplineName: fallback.disciplineName || "",
      title: String(parsed?.title || fallback.topicName).trim(),
      html,
      steps,
      interaction,
      question,
      limits,
    },
  };
}
