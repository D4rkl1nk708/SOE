import { getLoginUrl, isLocalMode } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const localMode = isLocalMode();

  const {
    redirectOnUnauthenticated = false,
    redirectPath = localMode ? "" : getLoginUrl(),
  } = options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    // In local mode, we don't need to fetch from server as we'll mock it
    enabled: !localMode,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, undefined);
    },
  });

  const logout = useCallback(async () => {
    if (localMode) {
      window.location.reload();
      return;
    }

    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, undefined);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils, localMode]);

  const state = useMemo(() => {
    // Se estiver no modo offline forçado, usamos dados mocados ou confiamos no contexto do servidor
    const defaultUser = {
      id: 1,
      openId: "local-user",
      name: "Usuário Local",
      email: "local@estudos.local",
      loginMethod: "local",
      role: "admin",
      settings: {
        theme: "light",
        studyStreak: { current: 0, best: 0, lastStudyDate: null },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSignedIn: new Date().toISOString(),
    };

    const user = localMode ? defaultUser : (meQuery.data ?? null);

    localStorage.setItem("manus-runtime-user-info", JSON.stringify(user));
    return {
      user: user,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(user),
    };
  }, [
    localMode,
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    // Skip redirect in local mode
    if (localMode) return;
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;

    if (meQuery.isError) {
      const error = meQuery.error as any;
      const isConnectionError =
        error?.data?.code === "TIMEOUT" ||
        error?.data?.code === "SERVICE_UNAVAILABLE" ||
        error?.message?.includes("fetch");

      if (isConnectionError) {
        console.warn(
          "[Auth] Falha temporária de conexão. Mantendo sessão ativa...",
        );
        return;
      }
    }

    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    localMode,
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    meQuery.isError,
    meQuery.error,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => (localMode ? Promise.resolve() : meQuery.refetch()),
    logout,
    isLocalMode: localMode,
  };
}
