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
};

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  let user: User | null = null;

  const authHeader = opts.req.headers.authorization;
  if (authHeader?.startsWith("Bearer ") && supabase) {
    const token = authHeader.split(" ")[1];
    try {
      const {
        data: { user: authUser },
        error,
      } = await supabase.auth.getUser(token);

      if (authUser && !error) {
        const dbUser = await db.getUserByOpenId(authUser.id);
        if (dbUser) {
          user = dbUser;
        } else {
          await db.upsertUser({
            openId: authUser.id,
            name: authUser.user_metadata?.full_name || authUser.email,
            email: authUser.email,
            loginMethod: "supabase",
            role: "user",
            lastSignedIn: new Date().toISOString(),
          });
          const newDbUser = await db.getUserByOpenId(authUser.id);
          if (newDbUser) {
            user = newDbUser;
          }
        }
      }
    } catch (err) {
      console.error(
        "[Auth] Erro de conexão com Supabase:",
        err instanceof Error ? err.message : err,
      );
      // Mantém user como null para não travar o servidor
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
