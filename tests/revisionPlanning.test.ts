/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  backlogSummary,
  daysBetween,
  planSessionReschedule,
  selectBacklog,
  suggestBacklogAction,
  type Rev,
} from "../server/revisionPlanning";

const TODAY = "2026-06-15";

/** Desloca uma data ISO em dias — só para montar fixtures legíveis. */
function shift(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

let nextId = 1;
function rev(overrides: Partial<Rev> = {}): Rev {
  return {
    id: nextId++,
    topicId: 1,
    scheduledDate: TODAY,
    completed: false,
    ignored: false,
    ...overrides,
  };
}

describe("daysBetween", () => {
  it("retorna 0 para a mesma data", () => {
    expect(daysBetween(TODAY, TODAY)).toBe(0);
  });

  it("conta dias positivos para frente e negativos para trás", () => {
    expect(daysBetween("2026-01-10", "2026-03-05")).toBe(54);
    expect(daysBetween("2026-03-05", "2026-01-10")).toBe(-54);
  });

  it("atravessa virada de mês e de ano", () => {
    expect(daysBetween("2026-01-31", "2026-02-01")).toBe(1);
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
    expect(daysBetween("2025-12-30", "2026-01-02")).toBe(3);
  });

  it("respeita fevereiro de ano bissexto", () => {
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2023-02-28", "2023-03-01")).toBe(1);
    expect(daysBetween("2024-01-01", "2025-01-01")).toBe(366);
    expect(daysBetween("2025-01-01", "2026-01-01")).toBe(365);
  });

  it("não desloca a contagem em dias de mudança de fuso/DST", () => {
    // Um dia de cada mês de 2026, sempre 1 — sem hora local envolvida.
    for (const [from, to] of [
      ["2026-02-15", "2026-02-16"],
      ["2026-03-15", "2026-03-16"],
      ["2026-10-17", "2026-10-18"],
      ["2026-11-07", "2026-11-08"],
    ]) {
      expect(daysBetween(from, to)).toBe(1);
    }
  });

  it("retorna NaN para data malformada em vez de inventar dias", () => {
    expect(Number.isNaN(daysBetween("15/06/2026", TODAY))).toBe(true);
    expect(Number.isNaN(daysBetween(TODAY, "2026-13-01"))).toBe(true);
    expect(Number.isNaN(daysBetween(TODAY, "2026-02-30"))).toBe(true);
  });
});

describe("selectBacklog", () => {
  it("mantém só pendentes e acima do corte de dias", () => {
    const antiga = rev({ scheduledDate: shift(TODAY, -100) });
    const recente = rev({ scheduledDate: shift(TODAY, -5) });
    const feita = rev({ scheduledDate: shift(TODAY, -120), completed: true });
    const ignorada = rev({
      scheduledDate: shift(TODAY, -130),
      ignored: true,
    });
    const futura = rev({ scheduledDate: shift(TODAY, 10) });

    const backlog = selectBacklog(
      [recente, feita, antiga, ignorada, futura],
      TODAY,
      30,
    );

    expect(backlog.map((r) => r.id)).toEqual([antiga.id]);
  });

  it("ordena da mais antiga para a mais nova", () => {
    const a = rev({ scheduledDate: shift(TODAY, -60) });
    const b = rev({ scheduledDate: shift(TODAY, -200) });
    const c = rev({ scheduledDate: shift(TODAY, -90) });

    expect(selectBacklog([a, b, c], TODAY, 30).map((r) => r.id)).toEqual([
      b.id,
      c.id,
      a.id,
    ]);
  });

  it("com corte 0 inclui o que vence hoje e exclui o futuro", () => {
    const hoje = rev({ scheduledDate: TODAY });
    const futura = rev({ scheduledDate: shift(TODAY, 1) });

    expect(selectBacklog([hoje, futura], TODAY, 0).map((r) => r.id)).toEqual([
      hoje.id,
    ]);
  });

  it("não altera o array recebido", () => {
    const lista = [
      rev({ scheduledDate: shift(TODAY, -10) }),
      rev({ scheduledDate: shift(TODAY, -80) }),
    ];
    const antes = [...lista];
    selectBacklog(lista, TODAY, 30);
    expect(lista).toEqual(antes);
  });

  it("retorna vazio quando tudo está concluído ou ignorado", () => {
    const lista = [
      rev({ scheduledDate: shift(TODAY, -300), completed: true }),
      rev({ scheduledDate: shift(TODAY, -300), ignored: true }),
    ];
    expect(selectBacklog(lista, TODAY, 0)).toEqual([]);
  });
});

describe("backlogSummary", () => {
  it("zera tudo quando não há revisões", () => {
    expect(backlogSummary([], TODAY)).toEqual({
      total: 0,
      overdue: 0,
      veryOld: 0,
      oldestDays: 0,
      oldestTopicIds: [],
    });
  });

  it("conta pendentes, vencidas e muito antigas (>= 90 dias)", () => {
    const lista = [
      rev({ topicId: 10, scheduledDate: shift(TODAY, -400) }), // muito antiga
      rev({ topicId: 11, scheduledDate: shift(TODAY, -90) }), // limite exato
      rev({ topicId: 12, scheduledDate: shift(TODAY, -89) }),
      rev({ topicId: 13, scheduledDate: TODAY }),
      rev({ topicId: 14, scheduledDate: shift(TODAY, 20) }), // futura, pendente
      rev({ topicId: 15, scheduledDate: shift(TODAY, -500), completed: true }),
      rev({ topicId: 16, scheduledDate: shift(TODAY, -600), ignored: true }),
    ];

    const summary = backlogSummary(lista, TODAY);

    expect(summary.total).toBe(5); // concluída e ignorada ficam de fora
    expect(summary.overdue).toBe(3); // -400, -90, -89
    expect(summary.veryOld).toBe(2); // -400, -90
    expect(summary.oldestDays).toBe(400);
    expect(summary.oldestTopicIds).toEqual([10, 11, 12, 13, 14]);
  });

  it("lista tópicos distintos, no máximo 10, das mais antigas", () => {
    const lista: Rev[] = [];
    for (let i = 0; i < 12; i += 1) {
      lista.push(
        rev({ topicId: 100 + i, scheduledDate: shift(TODAY, -(i + 1)) }),
      );
    }
    // duplicata de tópico: a mais antiga continua valendo uma vez só
    lista.push(rev({ topicId: 111, scheduledDate: shift(TODAY, -30) }));

    const summary = backlogSummary(lista, TODAY);

    expect(summary.oldestTopicIds).toHaveLength(10);
    expect(summary.oldestTopicIds).toEqual([
      111, 110, 109, 108, 107, 106, 105, 104, 103, 102,
    ]);
    expect(summary.oldestDays).toBe(30);
  });

  it("oldestDays é 0 quando só há pendências futuras", () => {
    const summary = backlogSummary(
      [rev({ scheduledDate: shift(TODAY, 5) })],
      TODAY,
    );
    expect(summary.oldestDays).toBe(0);
    expect(summary.overdue).toBe(0);
    expect(summary.total).toBe(1);
  });
});

describe("suggestBacklogAction", () => {
  it("arquiva quando o muito antigo chega a 300", () => {
    const out = suggestBacklogAction({ overdue: 900, veryOld: 300 });
    expect(out.action).toBe("arquivar");
    expect(out.why).toContain("300");
  });

  it("reagenda quando há 30+ vencidas sem backlog arqueológico", () => {
    const out = suggestBacklogAction({ overdue: 30, veryOld: 299 });
    expect(out.action).toBe("reagendar");
    expect(out.why.toLowerCase()).toContain("reagende");
  });

  it("não sugere nada abaixo dos limites", () => {
    expect(suggestBacklogAction({ overdue: 29, veryOld: 0 }).action).toBe(
      "nenhuma",
    );
    expect(suggestBacklogAction({ overdue: 0, veryOld: 0 }).action).toBe(
      "nenhuma",
    );
  });

  it("sempre devolve um motivo em português", () => {
    for (const summary of [
      { overdue: 0, veryOld: 0 },
      { overdue: 50, veryOld: 0 },
      { overdue: 50, veryOld: 400 },
    ]) {
      const { why } = suggestBacklogAction(summary);
      expect(why.length).toBeGreaterThan(10);
    }
  });
});

describe("planSessionReschedule", () => {
  it("retorna null sem topicId", () => {
    const lista = [rev({ topicId: 1, scheduledDate: shift(TODAY, -10) })];
    expect(planSessionReschedule(lista, undefined, TODAY, TODAY)).toBeNull();
  });

  it("retorna null quando o tópico não tem pendência", () => {
    const lista = [
      rev({ topicId: 7, scheduledDate: shift(TODAY, -10), completed: true }),
      rev({ topicId: 8, scheduledDate: shift(TODAY, -10) }),
    ];
    expect(planSessionReschedule(lista, 7, shift(TODAY, 3), TODAY)).toBeNull();
  });

  it("escolhe a revisão pendente mais antiga do tópico", () => {
    const maisVelha = rev({ topicId: 3, scheduledDate: shift(TODAY, -120) });
    const meio = rev({ topicId: 3, scheduledDate: shift(TODAY, -60) });
    const outra = rev({ topicId: 9, scheduledDate: shift(TODAY, -300) });

    const plano = planSessionReschedule(
      [meio, outra, maisVelha],
      3,
      shift(TODAY, 7),
      TODAY,
    );

    expect(plano).toEqual({
      revisionId: maisVelha.id,
      newDate: shift(TODAY, 7),
    });
  });

  it("nunca move a data para o passado", () => {
    const vencida = rev({ topicId: 5, scheduledDate: shift(TODAY, -45) });

    const plano = planSessionReschedule(
      [vencida],
      5,
      shift(TODAY, -20), // sugestão no passado
      TODAY,
    );

    expect(plano).toEqual({ revisionId: vencida.id, newDate: TODAY });
    expect(daysBetween(TODAY, plano!.newDate)).toBeGreaterThanOrEqual(0);
  });

  it("não adia para além da data sugerida", () => {
    const vencida = rev({ topicId: 5, scheduledDate: shift(TODAY, -45) });
    const sugerida = shift(TODAY, 10);

    const plano = planSessionReschedule([vencida], 5, sugerida, TODAY);

    expect(plano!.newDate).toBe(sugerida);
    expect(daysBetween(sugerida, plano!.newDate)).toBeLessThanOrEqual(0);
  });

  it("aceita a própria data de hoje como sugestão", () => {
    const vencida = rev({ topicId: 5, scheduledDate: shift(TODAY, -45) });
    expect(planSessionReschedule([vencida], 5, TODAY, TODAY)!.newDate).toBe(
      TODAY,
    );
  });

  it("considera pendência ainda no futuro e mantém a data sugerida", () => {
    const futura = rev({ topicId: 6, scheduledDate: shift(TODAY, 14) });
    const sugerida = shift(TODAY, 3);

    const plano = planSessionReschedule([futura], 6, sugerida, TODAY);

    expect(plano).toEqual({ revisionId: futura.id, newDate: sugerida });
  });

  it("não cria revisão nem muta a lista", () => {
    const lista = [rev({ topicId: 5, scheduledDate: shift(TODAY, -45) })];
    const antes = JSON.parse(JSON.stringify(lista));

    planSessionReschedule(lista, 5, shift(TODAY, 2), TODAY);

    expect(lista).toEqual(antes);
    expect(lista).toHaveLength(1);
  });
});
