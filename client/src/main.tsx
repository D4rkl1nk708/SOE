import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { Capacitor } from "@capacitor/core";
import App from "./App";
import { getLoginUrl } from "./const";
import { createLocalLink } from "./lib/localLink";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  const loginUrl = getLoginUrl();
  if (window.location.pathname === loginUrl) return;

  window.location.href = loginUrl;
};

queryClient.getQueryCache().subscribe((event) => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe((event) => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const isStandalone = Capacitor.isNativePlatform();

const apiBase = (import.meta.env.VITE_API_URL as string) || "";
const trpcUrl = apiBase
  ? `${apiBase.replace(/\/$/, "")}/api/trpc`
  : "/api/trpc";

const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: () => isStandalone,
      true: createLocalLink(),
      false: httpBatchLink({
        url: trpcUrl,
        transformer: superjson,
        fetch(input, init) {
          const authString = localStorage.getItem(
            "sb-nhdsmlbybipchjmcrida-auth-token",
          );
          let token = "";
          if (authString) {
            try {
              const parsed = JSON.parse(authString);
              token = parsed.access_token;
            } catch (e) {}
          }
          return globalThis.fetch(input, {
            ...(init ?? {}),
            headers: {
              ...(init?.headers ?? {}),
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            credentials: "omit", // Using JWT instead of cookies
          });
        },
      }),
    }),
  ],
});

// Listener para salvar dados antes de fechar o Electron
if (typeof window !== "undefined" && (window as any).electron) {
  const { ipcRenderer } = (window as any).electron;
  if (ipcRenderer) {
    ipcRenderer.on("app-closing", async () => {
      // Invalidar todas as queries para forçar salvamento
      await queryClient.invalidateQueries();
      // Dar um tempo para as requisições serem completadas
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
  }
}

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>,
);
