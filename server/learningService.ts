import * as fs from "fs";
import * as path from "path";
import { getUploadsDir } from "./mediaStorage";
import { extractPdf, type PdfSection } from "./pdfExtract";
import * as storage from "./jsonStorage";

export type LearningDocMeta = {
  id: string;
  title: string;
  pages: number;
  sections: number;
  createdAt: string;
  lastOpenedAt?: string;
};

export type LearningDoc = LearningDocMeta & {
  sectionsData: PdfSection[];
};

function learningDir(): string {
  const dir = path.join(getUploadsDir(), "learning");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function docPath(docId: string): string {
  if (!/^[a-zA-Z0-9_-]{4,64}$/.test(docId)) {
    throw new Error("Identificador de documento inválido.");
  }
  return path.join(learningDir(), `${docId}.json`);
}

function makeId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  ).toLowerCase();
}

async function readIndex(userId: number): Promise<LearningDocMeta[]> {
  const settings = await storage.getUserSettings(userId);
  return (settings as any)?.learningDocs ?? [];
}

async function writeIndex(
  userId: number,
  docs: LearningDocMeta[],
): Promise<void> {
  await storage.updateUserSettings(userId, {
    learningDocs: docs.slice(0, 60),
  } as any);
}

/** Importa o PDF, extrai as seções e indexa no usuário. */
export async function importDocument(
  userId: number,
  base64: string,
  fileName = "documento.pdf",
): Promise<LearningDocMeta> {
  const clean = base64.includes(",") ? base64.split(",").pop()! : base64;
  const buffer = Buffer.from(clean, "base64");
  if (buffer.length === 0) throw new Error("Arquivo vazio.");
  if (buffer.length > 40 * 1024 * 1024) {
    throw new Error("PDF acima de 40 MB. Divida o arquivo antes de importar.");
  }

  const extracted = await extractPdf(buffer, fileName);
  const id = makeId();
  const meta: LearningDocMeta = {
    id,
    title: extracted.title || fileName.replace(/\.pdf$/i, ""),
    pages: extracted.pages,
    sections: extracted.sections.length,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    docPath(id),
    JSON.stringify({ ...meta, sectionsData: extracted.sections }),
    "utf8",
  );

  const index = await readIndex(userId);
  await writeIndex(userId, [meta, ...index]);
  return meta;
}

export async function listDocuments(
  userId: number,
): Promise<LearningDocMeta[]> {
  return readIndex(userId);
}

export async function getDocument(
  userId: number,
  docId: string,
): Promise<LearningDoc | null> {
  const index = await readIndex(userId);
  if (!index.some((doc) => doc.id === docId)) return null;
  const file = docPath(docId);
  if (!fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as LearningDoc;
  return parsed;
}

export async function touchDocument(
  userId: number,
  docId: string,
): Promise<void> {
  const index = await readIndex(userId);
  const next = index.map((doc) =>
    doc.id === docId ? { ...doc, lastOpenedAt: new Date().toISOString() } : doc,
  );
  await writeIndex(userId, next);
}

export async function deleteDocument(
  userId: number,
  docId: string,
): Promise<void> {
  const index = await readIndex(userId);
  await writeIndex(
    userId,
    index.filter((doc) => doc.id !== docId),
  );
  const file = docPath(docId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

/** Texto da seção, cortado para não estourar o prompt da IA. */
export function sectionPromptText(section: PdfSection, limit = 6000): string {
  return section.text.slice(0, limit);
}
