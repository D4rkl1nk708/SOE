/**
 * Convenção de notificação do SOE (v6.9.8, item 2.5): uma ação, um toast.
 *
 * O aluno via dois "Revisão concluída." porque dois caminhos avisavam a mesma
 * conclusão. Aqui o `id` é estável por ação — o sonner substitui em vez de
 * empilhar — e uma janela curta bloqueia o eco do mesmo clique.
 */
import { toast } from "sonner";

export interface NotifyOptions {
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
  variant?: "success" | "error" | "info" | "warning";
}

/** Janela anti-duplicata do mesmo id (ms). */
export const NOTIFY_WINDOW_MS = 1500;

const recent = new Map<string, number>();

function show(id: string, message: string, options: NotifyOptions): void {
  const payload = {
    id,
    description: options.description,
    duration: options.duration,
    action: options.action,
  };
  const variant = options.variant ?? "success";
  if (variant === "error") toast.error(message, payload);
  else if (variant === "info") toast(message, payload);
  else if (variant === "warning") toast.warning(message, payload);
  else toast.success(message, payload);
}

export const notify = {
  /**
   * Mostra o toast uma única vez por ação. Devolve `true` quando mostrou e
   * `false` quando era eco (duplicata) e nada apareceu na tela.
   */
  once(id: string, message: string, options: NotifyOptions = {}): boolean {
    const nowMs = Date.now();
    const last = recent.get(id);
    if (typeof last === "number" && nowMs - last < NOTIFY_WINDOW_MS) {
      return false;
    }
    recent.set(id, nowMs);
    show(id, message, options);
    return true;
  },

  /** Limpa o histórico da janela (usado nos testes e ao trocar de sessão). */
  reset(): void {
    recent.clear();
  },
};
