import type { SupabaseClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL } from "./claude";
import {
  normaliseItems,
  type CopyItem,
  type CopyKind,
  type CopyRecord,
  type CopySettings,
} from "../../src/lib/followUpCopy";

// Reading and writing client_copy (0141), and logging Claude calls to ai_runs.
// Shared by the Follow-up Texts endpoints so the shape on the wire is one thing.

export async function readCopy(
  client: SupabaseClient,
  tenantId: string,
  kind: CopyKind,
  businessName: string,
): Promise<CopyRecord> {
  const { data, error } = await client
    .from("client_copy")
    .select("items, settings, written_at, edited_at")
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as {
    items?: CopyItem[];
    settings?: CopySettings;
    written_at?: string | null;
    edited_at?: string | null;
  } | null;
  return {
    kind,
    items: normaliseItems(kind, Array.isArray(row?.items) ? row!.items! : [], businessName),
    settings: row?.settings ?? {},
    writtenAt: row?.written_at ?? null,
    editedAt: row?.edited_at ?? null,
  };
}

export async function saveCopy(
  client: SupabaseClient,
  tenantId: string,
  kind: CopyKind,
  patch: { items: CopyItem[]; settings: CopySettings; written?: boolean },
): Promise<void> {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    tenant_id: tenantId,
    kind,
    items: patch.items,
    settings: patch.settings,
  };
  if (patch.written) row.written_at = now;
  else row.edited_at = now;
  const { error } = await client.from("client_copy").upsert(row, { onConflict: "tenant_id,kind" });
  if (error) throw new Error(error.message);
}

export async function logAiRun(
  client: SupabaseClient,
  run: { tenantId: string; kind: string; ok: boolean; error?: string; input?: number; output?: number },
): Promise<void> {
  // Never let the log break the request it is logging.
  await client
    .from("ai_runs")
    .insert({
      tenant_id: run.tenantId,
      kind: run.kind,
      model: CLAUDE_MODEL,
      input_tokens: run.input ?? 0,
      output_tokens: run.output ?? 0,
      ok: run.ok,
      error: run.error ?? null,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

/** Clean one text from the browser: a string, capped, control characters flattened (newlines kept). */
export function cleanText(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/\r\n?/g, "\n").slice(0, 2000);
}
