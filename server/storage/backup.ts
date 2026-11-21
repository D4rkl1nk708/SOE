import * as fs from "fs";
import * as path from "path";

/**
 * v6.9.7: carimbo com milissegundos + sufixo quando colide. Antes duas mesclas
 * no mesmo segundo gravavam no MESMO arquivo e o segundo backup apagava o
 * primeiro — consolidar 5 disciplinas deixava 1 cópia só.
 */
function uniqueStampedPath(dir: string, base: string, ext: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
  let target = path.join(dir, `${base}-${stamp}${ext}`);
  let attempt = 1;
  while (fs.existsSync(target)) {
    target = path.join(dir, `${base}-${stamp}-${attempt}${ext}`);
    attempt += 1;
  }
  return target;
}

/**
 * Backup automático antes de migração de dados.
 *
 * Toda migração destrutiva (sair de `settings.questionAttempts`, mover o edital
 * para dentro do concurso, mesclar disciplinas) precisa deixar uma cópia em
 * `data/backups/` ANTES de gravar. O retorno é o caminho gerado (ou null quando
 * não havia arquivo para copiar).
 */
export function backupBeforeMigration(
  sourceFile: string,
  dataDir: string,
  reason: string,
): string | null {
  try {
    if (!sourceFile || !fs.existsSync(sourceFile)) return null;
    const dir = path.join(dataDir, "backups");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeReason = String(reason || "migracao")
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const ext = path.extname(sourceFile) || ".json";
    const base = path.basename(sourceFile, ext);
    const target = uniqueStampedPath(dir, `${base}-before-${safeReason}`, ext);
    fs.copyFileSync(sourceFile, target);
    console.log(`[storage] Backup criado antes da migração: ${target}`);
    return target;
  } catch (error) {
    console.error("[storage] Falha ao criar backup antes da migração:", error);
    return null;
  }
}

/** Backup de um payload em memória (mesclar disciplinas, por exemplo). */
export function backupJsonPayload(
  dataDir: string,
  reason: string,
  payload: unknown,
): string | null {
  try {
    const dir = path.join(dataDir, "backups");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeReason = String(reason || "migracao")
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const target = uniqueStampedPath(dir, safeReason, ".json");
    fs.writeFileSync(target, JSON.stringify(payload, null, 2), "utf-8");
    return target;
  } catch (error) {
    console.error("[storage] Falha ao criar backup em JSON:", error);
    return null;
  }
}
