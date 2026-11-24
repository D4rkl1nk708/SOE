/**
 * Extração de PDF no próprio aparelho (APK).
 *
 * O servidor usa o `pdf-parse`; no celular não existe Node, então usamos o
 * pdf.js dentro do WebView. O texto por página é montado com a mesma regra do
 * servidor (itens na mesma coordenada vertical viram a mesma linha) e a divisão
 * em seções vem de `shared/pdfSections`, igual para os dois.
 */
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {
  splitIntoSections,
  titleFromFileName,
  type PdfDocument,
} from "@shared/pdfSections";

type PdfTextItem = { str?: string; transform?: number[] };

/** `data:application/pdf;base64,....` ou só o conteúdo base64. */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.includes(",") ? base64.split(",").pop()! : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Mesma junção de linhas do servidor (agrupa por eixo Y do item). */
function pageTextFromItems(items: PdfTextItem[]): string {
  let text = "";
  let lastY: number | undefined;
  for (const item of items) {
    const str = typeof item?.str === "string" ? item.str : "";
    const y = Array.isArray(item?.transform) ? item.transform[5] : undefined;
    if (text.length === 0) {
      text = str;
    } else if (y !== undefined && y === lastY) {
      text += str;
    } else {
      text += `\n${str}`;
    }
    if (y !== undefined) lastY = y;
  }
  return text;
}

/** Texto de cada página, na ordem do documento. */
export async function extractPagesFromBase64(
  base64: string,
): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = pdfjs.GlobalWorkerOptions;
  // No Node (testes) o pdf.js usa o fake worker; no WebView precisa do worker real.
  if (typeof window !== "undefined" && !worker.workerSrc) {
    worker.workerSrc = workerSrc;
  }
  const doc = await pdfjs.getDocument({
    data: base64ToBytes(base64),
    isEvalSupported: false,
    useWorkerFetch: false,
  }).promise;

  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(pageTextFromItems(content.items as PdfTextItem[]));
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}

/** Documento completo (páginas, título e seções), do jeito que o leitor consome. */
export async function extractPdfOnDevice(
  base64: string,
  fileName?: string,
): Promise<PdfDocument> {
  const pages = await extractPagesFromBase64(base64);
  const nonEmpty = pages.filter((page) => page.trim().length > 0);
  if (nonEmpty.length === 0) {
    throw new Error(
      "Este PDF não tem texto selecionável (parece digitalizado). O leitor precisa de texto para dividir em seções.",
    );
  }
  const sections = splitIntoSections(pages);
  const detected = sections.find(
    (section) => section.title !== "Documento inteiro",
  )?.title;
  const title = (detected ?? titleFromFileName(fileName) ?? "Documento").trim();
  return { pages: pages.length, title, sections };
}
