import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../jsonStorage";
import { ENV } from "./env";
import * as storage from "../jsonStorage";
import * as db from "../db";

// Check if running in local mode (no OAuth configured)
function isLocalMode(): boolean {
  return true;
}

// Ensure local user exists in DB (only called once)
let localUserEnsured = false;
async function ensureLocalUser() {
  if (localUserEnsured) return;
  localUserEnsured = true;
  try {
    await db.upsertUser({
      openId: "local-user",
      name: "Usuário Local",
      email: "local@estudos.local",
      loginMethod: "local",
      role: "admin",
      lastSignedIn: new Date().toISOString(),
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

  if (isLocalMode()) {
    await ensureLocalUser();
    user = (await db.getUserByOpenId("local-user")) || null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
