import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import { verifySession } from "./session";
import { getServiceClient } from "./supabase";

// Shared guard for the Drive API routes: confirm a valid admin session and hand
// back a service-role Supabase client. Returns a ready-to-send Response on any
// failure so callers can `if (ctx instanceof Response) return ctx;`.
export async function requireAdmin(
  req: Request,
  env: Env,
): Promise<{ adminId: string; supabase: SupabaseClient } | Response> {
  const session = await verifySession(req, env);
  if (!session?.adminId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const supabase = getServiceClient(env);
  if (!supabase) return Response.json({ error: "service unavailable" }, { status: 503 });
  return { adminId: session.adminId, supabase };
}

// Map a thrown Drive error to an HTTP response. DriveNotConnectedError → 409 so
// the UI can show the "Connect Google" banner instead of a generic failure.
export function driveErrorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof Error && err.name === "DriveNotConnectedError") {
    return Response.json({ error: message, code: "not_connected" }, { status: 409 });
  }
  return Response.json({ error: message }, { status: 502 });
}
