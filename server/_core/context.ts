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
  settings: { theme: "light", studyStreak: { current: 0, best: 0, lastStudyDate: null } },
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
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // In local mode, always use the local user
  if (isLocalMode()) {
    await ensureLocalUser();
    // Get the actual user from DB to use their real ID
    const dbUser = await storage.getUserByOpenId("local-user");
    user = dbUser ? {
      id: dbUser.id,
      openId: dbUser.openId,
      name: dbUser.name,
      email: dbUser.email,
      loginMethod: dbUser.loginMethod,
      role: dbUser.role as "user" | "admin",
      settings: dbUser.settings,
      createdAt: dbUser.createdAt,
      updatedAt: dbUser.updatedAt,
      lastSignedIn: dbUser.lastSignedIn,
    } : LOCAL_USER;
  } else {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
