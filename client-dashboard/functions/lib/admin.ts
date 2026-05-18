import type { Env } from "./env";
import { admin } from "./supabase-admin";

interface CacheEntry {
  isAdmin: boolean;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

export async function isUserAdmin(
  userId: string,
  env: Env,
): Promise<boolean> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.isAdmin;

  const { data, error } = await admin(env)
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  const isAdmin = !error && Boolean(data);
  cache.set(userId, { isAdmin, expiresAt: Date.now() + TTL_MS });
  return isAdmin;
}
