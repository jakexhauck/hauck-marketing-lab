import type { Env } from "./env";
import { getServiceClient } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

// Receipts for background failures (0119).
//
// The app's fire-and-forget work (webhook side effects, cron-driven syncs,
// push sends) has always failed into console.error and vanished. This writer
// turns those failures into error_log rows so the admin errors API and the
// health probe can surface them.
//
// Deliberately best-effort to the point of paranoia: logging is never allowed
// to become THE failure. Every path is guarded, everything truncates, and the
// retention delete rides along on the write exactly like login_attempts.

const MAX_SOURCE = 60;
const MAX_MESSAGE = 500;
const RETENTION_DAYS = 14;

/** True when the row was written; false when Supabase is absent or refused. */
export async function logError(
  env: Env,
  source: string,
  message: string,
  context?: Record<string, unknown>,
  injected?: SupabaseClient,
): Promise<boolean> {
  const client = injected ?? getServiceClient(env);
  if (!client) return false;

  // Context must serialize or it must not go in. A circular payload from some
  // vendor SDK must not take the receipt down with it.
  let safeContext: Record<string, unknown> | null = null;
  if (context) {
    try {
      safeContext = JSON.parse(JSON.stringify(context)) as Record<string, unknown>;
    } catch {
      safeContext = { note: "context was not serializable" };
    }
  }

  try {
    const { error } = await client.from("error_log").insert({
      source: source.slice(0, MAX_SOURCE),
      message: String(message ?? "unknown error").slice(0, MAX_MESSAGE),
      ...(safeContext ? { context: safeContext } : {}),
    });
    if (error) {
      console.warn("[errorLog] insert refused:", error.message);
      return false;
    }
    await client
      .from("error_log")
      .delete()
      .lt(
        "created_at",
        new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      );
    return true;
  } catch (err) {
    console.warn("[errorLog] insert threw", err);
    return false;
  }
}

// Fire-and-forget flavour for call sites that are already inside a catch
// block and have no waitUntil of their own.
export function logErrorBestEffort(
  env: Env,
  source: string,
  message: string,
  context?: Record<string, unknown>,
): void {
  void logError(env, source, message, context).catch(() => {});
}
