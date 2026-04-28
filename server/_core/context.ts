import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../jsonStorage";
import { supabase } from "../supabase";
import * as db from "../db";
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

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // Supabase Auth Integration
  const authHeader = opts.req.headers.authorization;
  if (authHeader?.startsWith("Bearer ") && supabase) {
    const token = authHeader.split(" ")[1];
    const { data: { user: authUser }, error } = await supabase.auth.getUser(token);
    
    if (authUser && !error) {
      const dbUser = await db.getUserByOpenId(authUser.id);
      if (dbUser) {
        user = {
          id: dbUser.id,
          openId: dbUser.open_id,
          name: dbUser.name,
          email: dbUser.email,
          loginMethod: dbUser.login_method,
          role: dbUser.role as "user" | "admin",
          settings: dbUser.settings,
          createdAt: dbUser.created_at,
          updatedAt: dbUser.updated_at,
          lastSignedIn: dbUser.last_signed_in,
        };
      } else {
        await db.upsertUser({
          openId: authUser.id,
          name: authUser.user_metadata?.full_name || authUser.email,
          email: authUser.email,
          loginMethod: "supabase",
          role: "user",
          lastSignedIn: new Date().toISOString()
        });
        const newDbUser = await db.getUserByOpenId(authUser.id);
        if (newDbUser) {
          user = {
            id: newDbUser.id,
            openId: newDbUser.open_id,
            name: newDbUser.name,
            email: newDbUser.email,
            loginMethod: newDbUser.login_method,
            role: newDbUser.role as "user" | "admin",
            settings: newDbUser.settings,
            createdAt: newDbUser.created_at,
            updatedAt: newDbUser.updated_at,
            lastSignedIn: newDbUser.last_signed_in,
          };
        }
      }
    }
  }

  // Fallback to local mode only in development
  if (!user && process.env.NODE_ENV === "development" && !process.env.VERCEL) {
    let dbUser;
    try {
      dbUser = await db.getUserByOpenId("local-user");
    } catch(e) {}
    
    if (!dbUser) {
      await db.upsertUser({
        openId: "local-user",
        name: "Usuário Local",
        email: "local@estudos.local",
        loginMethod: "local",
        role: "admin",
      });
      dbUser = await db.getUserByOpenId("local-user");
    }
    if (dbUser) {
      user = {
        id: dbUser.id,
        openId: dbUser.open_id,
        name: dbUser.name,
        email: dbUser.email,
        loginMethod: dbUser.login_method,
        role: dbUser.role as "user" | "admin",
        settings: dbUser.settings,
        createdAt: dbUser.created_at,
        updatedAt: dbUser.updated_at,
        lastSignedIn: dbUser.last_signed_in,
      };
    } else {
      user = LOCAL_USER;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
