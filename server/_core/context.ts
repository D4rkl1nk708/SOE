import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../jsonStorage";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { supabase } from "../supabase";
import * as storage from "../jsonStorage";
import * as db from "../db";

// Default local user for offline mode (when OAuth is not configured)
const LOCAL_USER: User = {
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

// Check if running in local mode (no OAuth configured)
function isLocalMode(): boolean {
  return !ENV.oAuthServerUrl || !ENV.appId;
}

// Ensure local user exists in DB (only called once)
let localUserEnsured = false;
async function ensureLocalUser() {
  if (localUserEnsured) return;
  localUserEnsured = true;
  try {
    await storage.upsertUser({
      openId: "local-user",
      name: "Usuário Local",
      email: "local@estudos.local",
      loginMethod: "local",
      role: "admin",
    });
  } catch (e) {
    console.error("Error ensuring local user:", e);
  }
}

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  supabaseError?: boolean;
};

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  let user: User | null = null;
  let supabaseError = false;

  const authHeader = opts.req.headers.authorization;
  if (authHeader?.startsWith("Bearer ") && supabase) {
    const token = authHeader.split(" ")[1];

    if (token) {
      try {
        const { data: authData, error: authError } =
          await supabase.auth.getUser(token);

        if (authError) {
          console.warn("[Auth] Token inválido ou expirado:", authError.message);
        } else if (authData.user) {
          const authUser = authData.user;
          const dbUser = await db.getUserByOpenId(authUser.id);
          if (dbUser) {
            user = dbUser;
          } else {
            // Auto-register user from Supabase if not in local DB
            await db.upsertUser({
              openId: authUser.id,
              name: authUser.user_metadata?.full_name || authUser.email,
              email: authUser.email,
              loginMethod: "supabase",
              role: "user",
              lastSignedIn: new Date().toISOString(),
            });
            user = (await db.getUserByOpenId(authUser.id)) || null;
          }
        }
      } catch (err: any) {
        const isConnectionError =
          err.message?.includes("fetch") || err.message?.includes("timeout");
        console.error(
          `[Auth] ${isConnectionError ? "Timeout" : "Erro"} de conexão com Supabase:`,
          err.message,
        );
        if (isConnectionError) supabaseError = true;
      }
    }
  }

  if (!user && authHeader && !supabaseError) {
    console.log("[Auth] Usuário não encontrado no DB para o token fornecido.");
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    supabaseError,
  };
}
