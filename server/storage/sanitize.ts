import type { Database } from "../../shared/types";

/**
 * Credenciais nunca saem do aparelho — nem em export, nem em sync, nem no
 * auto-backup. `aiApiKey` e `pushToken` moram dentro de `users[].settings`.
 */
export const SECRET_SETTINGS_KEYS = ["aiApiKey", "pushToken"] as const;

export function redactSettings<T extends Record<string, unknown>>(
  settings: T | undefined | null,
): T {
  if (!settings) return {} as T;
  const clone: Record<string, unknown> = { ...settings };
  for (const key of SECRET_SETTINGS_KEYS) delete clone[key];
  return clone as T;
}

/** Cópia do usuário sem segredos (export/sync/backup). */
export function withoutSecrets<T extends { settings?: unknown }>(user: T): T {
  if (!user || !user.settings) return user;
  return {
    ...user,
    settings: redactSettings(user.settings as Record<string, unknown>),
  };
}

/** Cópia do banco inteiro sem segredos, pronta para ir para o disco/nuvem. */
export function sanitizeDatabaseForBackup(db: Database): Database {
  return {
    ...db,
    users: (db.users || []).map((user) => withoutSecrets(user)),
  };
}
