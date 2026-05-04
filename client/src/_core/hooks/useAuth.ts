import { getLoginUrl, isLocalMode } from "@/const";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

// Default local user for offline mode
const LOCAL_USER = {
  id: 1,
  openId: "local-user",
  name: "Usuário Local",
  email: "local@estudos.local",
  loginMethod: "local",
  role: "admin" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
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
    // In local mode, we don't need to fetch from server
    enabled: !localMode,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, undefined);
    },
  });

  // Track Supabase session manually to ensure react-query is in sync
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        utils.auth.me.setData(undefined, undefined);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        meQuery.refetch();
      } else {
        utils.auth.me.setData(undefined, undefined);
      }
    });

    return () => subscription.unsubscribe();
  }, [utils]);

  const logout = useCallback(async () => {
    if (localMode) {
      // In local mode, just refresh the page
      window.location.reload();
      return;
    }

    try {
      await supabase.auth.signOut();
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
    // In local mode, always return the local user ONLY IF we don't have a supabase session.
    // Actually, let's stop forcing LOCAL_USER if the user wants Supabase.
    // We will rely on meQuery.data.

    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify(meQuery.data),
    );
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
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
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    localMode,
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => (localMode ? Promise.resolve() : meQuery.refetch()),
    logout,
    isLocalMode: localMode,
  };
}
