import path from "path";

/**
 * Erro lançado quando um caminho recebido do cliente tentaria sair do diretório
 * base (path traversal, ex.: "../../etc/passwd").
 */
export class UnsafePathError extends Error {
  constructor(public readonly attempted: string) {
    super(`Caminho de arquivo não permitido: ${attempted}`);
    this.name = "UnsafePathError";
  }
}

/**
 * Resolve `segments` dentro de `baseDir` garantindo que o resultado final
 * permaneça dentro de `baseDir`.
 *
 * Use sempre que o nome do arquivo vier do cliente (tRPC input, query string,
 * corpo de requisição) em vez de `path.join(baseDir, name)`.
 */
export function safeJoin(baseDir: string, ...segments: string[]): string {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, ...segments);

  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new UnsafePathError(segments.join("/"));
  }

  return target;
}

/** Extrai apenas o nome do arquivo, descartando qualquer diretório embutido. */
export function safeBasename(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/"));
  if (!base || base === "." || base === "..") {
    throw new UnsafePathError(name);
  }
  return base;
}
