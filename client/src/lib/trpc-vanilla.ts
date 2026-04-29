import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../../server/routers";
import superjson from "superjson";
import { supabase } from "./supabase";

const trpcUrl = import.meta.env.VITE_TRPC_URL || "/api/trpc";

export const trpcVanilla = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: trpcUrl,
      transformer: superjson,
      async fetch(input, init) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        return fetch(input, {
          ...(init ?? {}),
          headers: {
            ...(init?.headers ?? {}),
            "x-user-id": session?.user?.id || "anonymous",
          },
        });
      },
    }),
  ],
});
