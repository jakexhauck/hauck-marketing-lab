import { getServiceClient } from "./supabase";
import type { Env } from "./env";
import { logErrorBestEffort } from "./errorLog";

// Login rate limiting: a sliding window of failed attempts per client IP.
//
// Two layers, both best-effort but together solid enough for a shared-password
// app:
//  - Supabase login_attempts table (migration 0006): durable, shared across
//    every isolate and PoP. The real limiter when Supabase is configured.
//  - In-memory per-isolate map: free, instant, and still slows a single-source
//    brute force when Supabase is unconfigured or unreachable.
//
// Fail open on infrastructure errors, ON PURPOSE: a Supabase outage must not
// lock every client out of the app. What changed is that the degraded state is
// now LOUD: each durable-layer failure drops an error_log receipt, so a limiter
// running on memory alone for hours shows up in the admin errors surface and
// the health probe instead of passing unnoticed.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

const memory = new Map<string, number[]>();

function memoryFailures(ip: string, now: number): number[] {
  const cutoff = now - WINDOW_MS;
  const kept = (memory.get(ip) ?? []).filter((t) => t > cutoff);
  memory.set(ip, kept);
  return kept;
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** True when this IP has exhausted its failed-attempt budget. */
export async function isLoginRateLimited(
  env: Env,
  ip: string,
): Promise<boolean> {
  const now = Date.now();
  if (memoryFailures(ip, now).length >= MAX_FAILURES) return true;

  const client = getServiceClient(env);
  if (!client) return false;
  try {
    const { count, error } = await client
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gt("created_at", new Date(now - WINDOW_MS).toISOString());
    if (error) {
      logErrorBestEffort(env, "ratelimit", `durable check refused: ${error.message}`);
      return false;
    }
    return (count ?? 0) >= MAX_FAILURES;
  } catch (err) {
    logErrorBestEffort(env, "ratelimit", `durable check failed: ${(err as Error)?.message ?? err}`);
    return false;
  }
}

/** Record a failed login for this IP, in both layers. */
export async function recordLoginFailure(env: Env, ip: string): Promise<void> {
  const now = Date.now();
  memoryFailures(ip, now).push(now);

  const client = getServiceClient(env);
  if (!client) return;
  try {
    await client.from("login_attempts").insert({ ip });
    // Opportunistic cleanup so the table never grows unbounded; rows outside
    // the window carry no signal.
    await client
      .from("login_attempts")
      .delete()
      .lt("created_at", new Date(now - WINDOW_MS * 4).toISOString());
  } catch {
    // best effort
  }
}

// Staff login adds a second dimension: the email being targeted. A brute force
// that rotates IPs is still slowed because every attempt against one email is
// counted under the `identifier` column (0007). Limited when EITHER the IP or
// the email has exhausted its budget.
export async function isStaffLoginRateLimited(
  env: Env,
  ip: string,
  identifier: string,
): Promise<boolean> {
  const now = Date.now();
  if (memoryFailures(ip, now).length >= MAX_FAILURES) return true;
  if (memoryFailures(`id:${identifier}`, now).length >= MAX_FAILURES) return true;

  const client = getServiceClient(env);
  if (!client) return false;
  try {
    const since = new Date(now - WINDOW_MS).toISOString();
    const [byIp, byId] = await Promise.all([
      client
        .from("login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .gt("created_at", since),
      client
        .from("login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("identifier", identifier)
        .gt("created_at", since),
    ]);
    if (!byIp.error && (byIp.count ?? 0) >= MAX_FAILURES) return true;
    if (!byId.error && (byId.count ?? 0) >= MAX_FAILURES) return true;
    return false;
  } catch {
    return false;
  }
}

export async function recordStaffLoginFailure(
  env: Env,
  ip: string,
  identifier: string,
): Promise<void> {
  const now = Date.now();
  memoryFailures(ip, now).push(now);
  memoryFailures(`id:${identifier}`, now).push(now);

  const client = getServiceClient(env);
  if (!client) return;
  try {
    await client.from("login_attempts").insert({ ip, identifier });
  } catch {
    // best effort
  }
}
