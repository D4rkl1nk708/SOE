/**
 * Extração de PDF no servidor (Node).
 *
 * A divisão em seções é pura e vive em `shared/pdfSections.ts`, para o APK usar
 * exatamente a mesma regra. Aqui só coletamos o texto por página com o
 * pdf-parse e delegamos.
 */
// @ts-ignore - pdf-parse 1.1.1 não publica tipos para o entry interno; o entry
// público (`pdf-parse`) executa um bloco de debug quando `module.parent` não
// existe (caso do ESM), então importamos o módulo real.
import pdf from "pdf-parse/lib/pdf-parse.js";
import {
  FALLBACK_TITLE,
  splitIntoSections,
  titleFromFileName,
} from "../shared/pdfSections";
import type { PdfDocument } from "../shared/pdfSections";

export type {
  PdfDocument,
  PdfPageSpan,
  PdfSection,
} from "../shared/pdfSections";
export { isSectionTitle, splitIntoSections } from "../shared/pdfSections";

type PdfPageProxy = {
  getTextContent: (options?: {
    normalizeWhitespace?: boolean;
    disableCombineTextItems?: boolean;
  }) => Promise<{ items?: Array<{ str?: string; transform?: number[] }> }>;
};

export async function extractPdf(
  buffer: Buffer,
  fileName?: string,
): Promise<PdfDocument> {
  if (!buffer || buffer.length === 0) {
    throw new Error("Buffer de PDF vazio.");
  }

  const pages: string[] = [];
  const parsed = await pdf(buffer, {
    pagerender: async (pageData: PdfPageProxy) => {
      const content = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });

      let text = "";
      let lastY: number | undefined;
      for (const item of content.items ?? []) {
        const str = typeof item?.str === "string" ? item.str : "";
        const y = Array.isArray(item?.transform)
          ? item.transform[5]
          : undefined;
        if (text.length === 0) {
          text = str;
        } else if (y !== undefined && y === lastY) {
          text += str;
        } else {
          text += `\n${str}`;
        }
        if (y !== undefined) lastY = y;
      }

      pages.push(text);
      return text;
    },
  });

  const declaredPages = Number((parsed as { numpages?: number }).numpages) || 0;
  const totalPages = Math.max(declaredPages, pages.length);

  const sections = splitIntoSections(pages);
  const detectedTitle = sections.find(
    (section) => section.title !== FALLBACK_TITLE,
  )?.title;
  const title = (
    detectedTitle ??
    titleFromFileName(fileName) ??
    "Documento"
  ).trim();

  return { pages: totalPages, title, sections };
}
