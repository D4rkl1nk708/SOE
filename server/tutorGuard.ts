/**
 * A2 — Guarda do tutor (v6.9.12).
 *
 * A instrução no prompt não é confiável sozinha: enquanto o aluno não tem três
 * tentativas, o gabarito NÃO pode nem chegar ao modelo. `buildTutorContext`
 * monta o contexto da tutoria removendo, quando `move.mayRevealAnswer` é false:
 *  - a alternativa correta (o campo `correctAnswer` e o texto daquela opção);
 *  - o gabarito em qualquer forma (`correctAnswer`, `answer`, `gabarito`);
 *  - a explicação oficial (`explanation`, `officialExplanation`, ...).
 *
 * Ou seja: a "coleira" é estrutural — o modelo não consegue entregar o que não
 * recebeu. Ver `tests/tutorGuard.test.ts`.
 */
import type { TutorMove } from "../shared/tutorPolicy";

export interface TutorAlternativeLike {
  letter?: string | null;
  text?: string | null;
}

export interface TutorQuestionLike {
  id?: string | number | null;
  statement?: string | null;
  alternatives?: TutorAlternativeLike[] | null;
  correctAnswer?: string | null;
  explanation?: string | null;
  topicName?: string | null;
  disciplineName?: string | null;
  /**
   * Campos legados/alternativos que também podem carregar a resposta. Eles
   * existem no tipo só para o TypeScript aceitar o payload — nunca são lidos
   * para o prompt (e, por segurança, viram `[omitido]` se aparecerem no texto).
   */
  answer?: string | null;
  answerText?: string | null;
  officialExplanation?: string | null;
}

export interface BuildTutorContextInput {
  question?: TutorQuestionLike | null;
  move: TutorMove;
  studentText?: string | null;
}

const OMITTED = "[omitido pela política de tutoria]";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normLetter(value: unknown): string {
  return clean(value).toUpperCase();
}

/**
 * Remove do texto qualquer segredo que tenha escapado (enunciado que repete a
 * alternativa, payload com campo extra etc.). Última linha de defesa.
 */
function redact(text: string, secrets: string[]): string {
  let output = text;
  for (const secret of secrets) {
    const trimmed = clean(secret);
    if (trimmed.length < 8) continue; // letra solta ("B") não é segredo pesquisável
    if (!output.includes(trimmed)) continue;
    output = output.split(trimmed).join(OMITTED);
  }
  return output;
}

/** Pergunta padrão devolvida quando não há chave de IA (ou a IA falhou). */
export function fallbackTutorReply(move: TutorMove): string {
  switch (move.kind) {
    case "refuse_and_hint":
      return "Não vou entregar a resposta antes de você tentar: qual é o primeiro passo que o enunciado pede? Escreva sua tentativa (mesmo errada) e eu devolvo uma dica do próximo passo.";
    case "hint":
      return "Antes da dica: com suas palavras, o que o enunciado está pedindo? Escreva o que você já sabe que não fecha e eu aponto o próximo passo.";
    case "socratic_question":
      return "Explique com as próprias palavras, sem jargão: como você definiria esse conceito para um colega que nunca estudou o tema?";
    case "principle":
      return "Você já tentou duas vezes; vamos pelo princípio. Qual regra da matéria rege esse caso? Aplique-a na opção que você marcou e me diga onde ela quebra.";
    case "full_explanation":
    default:
      return "Você já tentou três vezes, então a explicação completa está liberada. Antes de eu detalhar: qual foi o raciocínio que te travou na última tentativa?";
  }
}

/**
 * Monta o prompt da tutoria já com a guarda aplicada.
 *
 * Nunca inclui `answer`, `answerText`, `officialExplanation` nem qualquer
 * campo não listado aqui — o payload do cliente não define o que o modelo vê.
 */
export function buildTutorContext(input: BuildTutorContextInput): string {
  const move = input.move;
  const question = input.question ?? null;
  const reveal = move.mayRevealAnswer === true;
  const lines: string[] = [];

  lines.push("[POLÍTICA DE TUTORIA — OBRIGATÓRIA]");
  lines.push(clean(move.instruction));
  lines.push(
    reveal
      ? "Solução completa: LIBERADA nesta resposta."
      : "Solução completa: PROIBIDA nesta resposta. Não confirme qual opção está certa e não resolva a questão por ele.",
  );
  if (move.mustAskBack) {
    lines.push("Termine devolvendo uma pergunta ao aluno.");
  }

  if (question) {
    const discipline = clean(question.disciplineName);
    const topic = clean(question.topicName);
    const statement = clean(question.statement);
    const alternatives = Array.isArray(question.alternatives)
      ? question.alternatives
      : [];
    const correctLetter = normLetter(question.correctAnswer);
    const correctAlt = alternatives.find(
      (item) => normLetter(item?.letter) === correctLetter && correctLetter,
    );
    const correctText = clean(correctAlt?.text);

    lines.push("");
    lines.push("[QUESTÃO]");
    if (discipline || topic) {
      const label = [discipline, topic].filter(Boolean).join(" › ");
      lines.push(`Onde: ${label}`);
    }
    if (statement) lines.push(`Enunciado: ${statement}`);

    const visibleAlternatives = alternatives
      .map((item) => ({
        letter: clean(item?.letter),
        text: clean(item?.text),
      }))
      .filter((item) => item.text)
      .filter((item) => {
        if (reveal) return true;
        if (correctLetter && item.letter.toUpperCase() === correctLetter) {
          return false;
        }
        if (correctText && item.text === correctText) return false;
        return true;
      });

    if (visibleAlternatives.length > 0) {
      lines.push(
        reveal
          ? "Alternativas:"
          : "Alternativas disponíveis (a política de tutoria removeu uma das opções):",
      );
      for (const item of visibleAlternatives) {
        lines.push(`${item.letter}) ${item.text}`);
      }
    }

    if (reveal) {
      const explanation = clean(question.explanation);
      lines.push("");
      lines.push(`Gabarito: ${correctLetter || "—"}`);
      if (correctText) {
        lines.push(`Alternativa correta: ${correctLetter}) ${correctText}`);
      }
      if (explanation) lines.push(`Explicação oficial: ${explanation}`);
    }
  }

  const studentText = clean(input.studentText);
  lines.push("");
  lines.push("[O QUE O ALUNO ESCREVEU AGORA]");
  lines.push(studentText || "(mensagem vazia)");

  const output = lines.join("\n");
  if (reveal) return output;

  // Cinto e suspensório: mesmo que um segredo tenha entrado por outro caminho
  // (enunciado que repete a alternativa, campo extra do payload), ele sai.
  const secrets: string[] = [];
  if (question) {
    secrets.push(clean(question.explanation));
    secrets.push(clean(question.officialExplanation));
    secrets.push(clean(question.answerText));
    const alternatives = Array.isArray(question.alternatives)
      ? question.alternatives
      : [];
    const correctLetter = normLetter(question.correctAnswer);
    const correctAlt = alternatives.find(
      (item) => normLetter(item?.letter) === correctLetter && correctLetter,
    );
    secrets.push(clean(correctAlt?.text));
  }
  const redacted = redact(output, secrets);
  if (redacted !== output) {
    // Se o enunciado repete a alternativa correta, o texto fica com o marcador
    // mas o prompt segue útil e sem a resposta.
    return redacted;
  }
  return output;
}
