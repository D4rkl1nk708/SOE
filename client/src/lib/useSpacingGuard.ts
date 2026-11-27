import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { localDayISO } from "@shared/localDay";

const STORAGE_KEY = "soe_spacing_guard_day";

/**
 * Guard de espaçamento (v6.9.11, A1/4.2) — UI.
 *
 * Uma vez por dia ao abrir o app (`force=false`) e SEMPRE ao entrar em
 * /revisions (`force=true`). Reagendar revisão só acontece no servidor via
 * `revision.applySpacingGuard` (backup + evento `spacing-guard`); aqui a UI só
 * dispara e conta o que mudou.
 */
export function useSpacingGuard(force = false) {
  const utils = trpc.useUtils();
  const running = useRef(false);

  const mutation = trpc.revision.applySpacingGuard.useMutation({
    onSuccess: (data: any) => {
      running.current = false;
      localStorage.setItem(STORAGE_KEY, localDayISO());
      if (data?.moved > 0) {
        toast.success(
          `${data.moved} revisão(ões) reagendada(s) para respeitar ${data.minGapDays} dias entre recuperações.`,
        );
        void utils.revision.list.invalidate();
        void utils.study.overview.invalidate();
      }
    },
    onError: () => {
      running.current = false;
    },
  });

  useEffect(() => {
    const today = localDayISO();
    if (!force && localStorage.getItem(STORAGE_KEY) === today) return;
    if (running.current) return;
    running.current = true;
    mutation.mutate({ today });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [force]);
}
