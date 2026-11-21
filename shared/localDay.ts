/**
 * "Hoje" é sempre dia LOCAL (v6.9.8, item 2.2).
 *
 * Antes, 33 pontos do app calculavam o dia com `toISOString().split("T")[0]`
 * — que é UTC. Depois das 21h em Brasília (UTC-3) o app achava que já era
 * amanhã: revisão de amanhã aparecia como vencida, o registro de sono caía no
 * dia errado e o plano do dia trocava sozinho.
 *
 * Este módulo é a única fonte de verdade para:
 *  - dia local de um instante (`localDayISO` / `localDayFrom`);
 *  - comparação de dias (`isSameLocalDay`);
 *  - aritmética de dias (`addLocalDays`, `localDaysBetween`).
 *
 * Timestamps persistidos (`createdAt`, `completedAt`, `updatedAt`) continuam
 * em ISO/UTC — só o *dia* com que o aluno se importa é local.
 */

/** Data `YYYY-MM-DD` no fuso do aparelho. */
export function localDayISO(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Dia local de uma data já formatada (`YYYY-MM-DD`, devolvida como está) ou de
 * um timestamp ISO (`2026-11-21T02:30:00.000Z` → dia local correspondente).
 */
export function localDayFrom(
  value: string | Date | null | undefined,
): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : localDayISO(value);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : localDayISO(parsed);
}

/** Mesmo dia local? Aceita `YYYY-MM-DD`, ISO completo ou Date. */
export function isSameLocalDay(
  a: string | Date | null | undefined,
  b: string | Date | null | undefined,
): boolean {
  const left = localDayFrom(a);
  const right = localDayFrom(b);
  return Boolean(left) && left === right;
}

/**
 * Soma (ou subtrai) dias a um dia local. Usa meio-dia local para não escorregar
 * em dia de horário de verão.
 */
export function addLocalDays(dayIso: string, days: number): string {
  const day = localDayFrom(dayIso);
  if (!day) return "";
  const [year, month, date] = day.split("-").map(Number);
  const base = new Date(year, (month || 1) - 1, date || 1, 12, 0, 0, 0);
  base.setDate(base.getDate() + Math.trunc(days));
  return localDayISO(base);
}

/**
 * Diferença em dias inteiros entre dois dias locais (`to - from`).
 * Positivo quando `to` é depois. `NaN` quando alguma data é inválida.
 */
export function localDaysBetween(fromIso: string, toIso: string): number {
  const from = localDayFrom(fromIso);
  const to = localDayFrom(toIso);
  if (!from || !to) return Number.NaN;
  const fromMs = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  );
  const toMs = Date.UTC(
    Number(to.slice(0, 4)),
    Number(to.slice(5, 7)) - 1,
    Number(to.slice(8, 10)),
  );
  return Math.round((toMs - fromMs) / 86_400_000);
}
