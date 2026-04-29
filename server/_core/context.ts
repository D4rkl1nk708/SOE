import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../jsonStorage";
import { sdk } from "./sdk";
import { ENV } from "./env";
import * as storage from "../jsonStorage";

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
  const userId = (opts.req.headers["x-user-id"] as string) || "anonymous";
  storage.setDbUser(userId);

  let user: User | null = null;

  // Since we are in hybrid mode, we trust the x-user-id header for DB isolation.
  // We'll also try to fetch/create the user record in that specific DB file.
  const dbUser = await storage.getUserByOpenId(userId);
  if (dbUser) {
    user = {
      ...dbUser,
      id: dbUser.openId as any, // Force UUID as the main ID for tRPC procedures
    };
  } else {
    // Auto-create local record for this Supabase user if not exists
    await storage.upsertUser({
      openId: userId,
      name: "Usuário SOE",
      email:
        userId === "anonymous"
          ? "anonymous@soe.local"
          : `${userId}@supabase.soe`,
      loginMethod: "supabase",
      role: "user",
    });
    const newUser = await storage.getUserByOpenId(userId);
    user = newUser
      ? {
          ...newUser,
          id: newUser.openId as any,
        }
      : null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
