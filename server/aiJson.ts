/**
 * Leitura tolerante de JSON gerado por IA.
 *
 * Modelos devolvem cercas de markdown, texto antes/depois, quebras de linha
 * cruas dentro de strings e — quando estouram o limite de saída — JSON cortado
 * no meio. Antes disso, qualquer um desses casos virava "Não foi possível
 * recuperar o JSON da resposta truncada." e o usuário perdia a geração inteira.
 */

function stripFences(text: string): string {
  const fence = /```(?:json|javascript|html)?\s*([\s\S]*?)```/i.exec(text);
  return fence ? fence[1] : text;
}

/** Objeto/array balanceado mais externo, respeitando strings e escapes. */
function sliceBalanced(text: string): string | null {
  const startIdx = text.search(/[[{]/);
  if (startIdx < 0) return null;
  const open = text[startIdx];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIdx; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(startIdx, i + 1);
    }
  }
  return null;
}

/** Conserta controle cru (quebra de linha/tab) dentro de string JSON. */
function escapeControlCharsInStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inString = false;
        continue;
      }
      if (ch === "\n") {
        out += "\\n";
        continue;
      }
      if (ch === "\r") {
        continue;
      }
      if (ch === "\t") {
        out += "\\t";
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

/**
 * Último recurso: pega campo por campo com regex, aceitando o valor até a
 * próxima aspa não escapada. Marca `truncated` quando algum campo foi cortado.
 */
export function salvageJson(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const fieldRe = /"([A-Za-z0-9_]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = fieldRe.exec(text))) {
    const value = match[2]
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\");
    result[match[1]] = value;
  }
  const arrayRe = /"([A-Za-z0-9_]+)"\s*:\s*\[([\s\S]*?)\]/g;
  while ((match = arrayRe.exec(text))) {
    try {
      result[match[1]] = JSON.parse(`[${match[2]}]`);
    } catch {
      /* ignora */
    }
  }
  // Campo de texto aberto e não fechado (corte no meio do HTML/string).
  if (typeof result.html !== "string" || result.html === "") {
    const open = /"html"\s*:\s*"([\s\S]*)$/.exec(text);
    if (open && open[1].length > 20) {
      result.html = open[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/["\\]+$/, "");
      result.truncated = true;
    }
  }
  return result;
}

export function parseAiJson<T = Record<string, unknown>>(raw: string): T {
  if (!raw || typeof raw !== "string") {
    throw new Error("Resposta de IA vazia (sem JSON).");
  }
  const cleaned = stripFences(raw).trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* segue */
  }

  const balanced = sliceBalanced(cleaned);
  if (balanced) {
    try {
      return JSON.parse(balanced) as T;
    } catch {
      try {
        return JSON.parse(escapeControlCharsInStrings(balanced)) as T;
      } catch {
        /* segue */
      }
    }
  }

  const salvaged = salvageJson(cleaned);
  if (Object.keys(salvaged).length > 0) {
    if (salvaged.truncated !== true) salvaged.truncated = true;
    return salvaged as T;
  }

  throw new Error("A IA não devolveu um JSON legível. Gere novamente.");
}
