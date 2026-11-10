/**
 * Estado de sincronização do Edital compartilhado entre o componente que edita
 * (`EditalTab`) e o que mantém as linhas (`Edital`).
 *
 * Existe para resolver dois bugs:
 * 1. gravar o documento inteiro a cada tecla;
 * 2. um refetch do dashboard sobrescrever a linha que o usuário está editando.
 */
export const editalSync = {
  /** JSON das linhas já enviadas ao servidor (para ignorar o "eco" do refetch). */
  lastSavedJson: "",
  /** Há uma escrita nossa em voo: não adotar o estado do servidor agora. */
  pending: false,
};

/** Serializa apenas os campos persistidos, na mesma ordem usada pelo save. */
export function serializeEditalRows(
  rows: Array<{
    id: string;
    discipline: string;
    topic: string;
    completed?: boolean;
    notes?: string;
    incidencia?: unknown;
    quantidade?: unknown;
    acerto?: number;
    revisar?: boolean;
    avancar?: boolean;
    discursiva?: boolean;
    isHeader?: boolean;
  }>,
): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      discipline: r.discipline,
      topic: r.topic,
      completed: !!r.completed,
      notes: r.notes || "",
      incidencia: r.incidencia,
      quantidade: r.quantidade,
      acerto: r.acerto,
      revisar: r.revisar,
      avancar: r.avancar,
      discursiva: r.discursiva,
      isHeader: r.isHeader,
    })),
  );
}
