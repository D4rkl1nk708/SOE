/**
 * Segurança de HTML vindo de dados do usuário/IA.
 *
 * `dangerouslySetInnerHTML` com texto de card, redação ou enunciado raspado do
 * TEC abre XSS: um `<img onerror>` no conteúdo executaria código dentro do app
 * e poderia ler o localStorage (onde ficava a chave da IA).
 *
 * Aqui escapamos tudo primeiro e depois aplicamos só as marcas que o app gera.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPES[ch] || ch);
}

/** Escapa, converte `**negrito**` e quebras de linha — nada de HTML cru. */
export function formatPlainTextHtml(value: unknown): string {
  const safe = escapeHtml(value);
  return safe
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\r?\n/g, "<br/>");
}
