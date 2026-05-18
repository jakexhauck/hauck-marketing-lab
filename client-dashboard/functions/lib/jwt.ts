import type { Env } from "./env";
import { admin } from "./supabase-admin";

export interface AuthedUser {
  userId: string;
  email: string;
}

interface CacheEntry {
  user: AuthedUser;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30_000;

export async function verifyBearer(
  req: Request,
  env: Env,
): Promise<AuthedUser | null> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  const hit = cache.get(token);
  if (hit && hit.expiresAt > Date.now()) return hit.user;

  const { data, error } = await admin(env).auth.getUser(token);
  if (error || !data.user) return null;

  const user: AuthedUser = {
    userId: data.user.id,
    email: data.user.email ?? "",
  };
  cache.set(token, { user, expiresAt: Date.now() + TTL_MS });
  return user;
}
