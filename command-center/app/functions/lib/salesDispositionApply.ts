import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDispositionPatch,
  isAllowedFormUrl,
  patchIsEmpty,
  pickTargetCall,
  type DispositionPatch,
  type TargetableCall,
} from "./salesDisposition";
import type { GhlWebhookEvent } from "./ghlEvents";

// The I/O half of the disposition form. Everything here is called off the
// webhook's response path (ctx.waitUntil) by api/webhook.ts, so a slow or
// failing write can never delay GHL's 200; the caller wraps both functions in
// its own catch -> logErrorBestEffort, and this file only throws.
//
// The rules these two enforce are documented where they are decided, in
// salesDisposition.ts. This file is: find the row, write the patch, say so.

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

interface SalesCallsDbRow extends TargetableCall {
  scratchpad?: string | null;
}

const SCRATCHPAD_CAP = 4000;

async function candidatesFor(
  client: SupabaseClient,
  contactId: string,
  phone: string,
): Promise<SalesCallsDbRow[]> {
  // Contact id first: it is exact and cannot collide. Phone second, both in the
  // shape the workflow sends and as bare digits, because sales_calls.phone was
  // copied from GHL at booking time and may carry formatting either way. The
  // picker normalises again on top of whatever comes back.
  if (contactId) {
    const { data, error } = await client
      .from("sales_calls")
      .select("id, ghl_contact_id, phone, outcome, scheduled_at")
      .eq("ghl_contact_id", contactId)
      .order("scheduled_at", { ascending: false })
      .limit(50);
    if (!error && data && data.length > 0) return data;
    if (error) console.error("[sales-disposition] candidate read failed", error.message);
  }

  if (phone) {
    const digits = phone.replace(/\D/g, "");
    const shapes = [...new Set([phone, digits].filter(Boolean))];
    const { data, error } = await client
      .from("sales_calls")
      .select("id, ghl_contact_id, phone, outcome, scheduled_at")
      .in("phone", shapes)
      .order("scheduled_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("[sales-disposition] phone read failed", error.message);
      return [];
    }
    return data ?? [];
  }

  return [];
}

// PostCallForm: stamp the prefilled widget URL onto that contact's open
// meeting, so Sales Data renders an Open form link and Jake works the call
// from there. Foreign hosts never reach the database; a duplicate event finds
// every meeting recorded or stamped and no-ops.
export async function stampPostCallForm(
  client: SupabaseClient,
  event: GhlWebhookEvent,
): Promise<void> {
  const url = str(event.formUrl);
  if (!url) return;
  if (!isAllowedFormUrl(url)) {
    console.warn("[sales-disposition] dropped foreign form URL:", url.slice(0, 120));
    return;
  }

  const rows = await candidatesFor(client, str(event.contactId), str(event.phone));
  const target = pickTargetCall(rows, str(event.contactId), str(event.phone));
  if (!target) {
    // Normal: nothing confirmed-and-open for this prospect, or everything
    // already worked. Logged rather than errored, so the health board shows a
    // quiet ack instead of a failure nobody can act on.
    console.log(
      "[sales-disposition] post-call form: no open meeting for",
      str(event.contactId) || str(event.phone),
    );
    return;
  }

  const { error } = await client
    .from("sales_calls")
    .update({ post_call_form_url: url })
    .eq("id", target.id);
  if (error) throw new Error(`form URL update failed: ${error.message}`);

  console.log("[sales-disposition] stamped form URL on", target.id);
}

function appendNotes(existing: string | null, feedback: string): string {
  if (!feedback) return existing ?? "";
  if (!existing || !existing.trim()) return feedback;
  // Oldest first, newest last: a meeting's notes read like a diary. Capped at
  // the same ceiling recordSalesCall uses, dropping from the FRONT, because the
  // latest answer to "what happened" matters more than the first.
  const merged = `${existing}\n${feedback}`;
  return merged.length > SCRATCHPAD_CAP
    ? merged.slice(merged.length - SCRATCHPAD_CAP)
    : merged;
}

async function writePatch(
  client: SupabaseClient,
  id: string,
  patch: DispositionPatch,
  notes: string,
): Promise<void> {
  const update: Record<string, unknown> = { ...patch };
  delete update.feedback;
  if (notes) update.scratchpad = notes;

  const { error } = await client.from("sales_calls").update(update).eq("id", id);
  if (error) throw new Error(`disposition update failed: ${error.message}`);
}

// SalesDisposition: the form's answers land on that contact's most recent
// unrecorded meeting. Unknown radio values stamp free text only; a submission
// with nothing usable at all is acked and dropped without touching the row.
export async function applyDisposition(
  client: SupabaseClient,
  event: GhlWebhookEvent,
): Promise<void> {
  const fields = {
    status: event.status,
    cashCollected: event.cashCollected,
    revenueGenerated: event.revenueGenerated,
    paymentPlatform: event.paymentPlatform,
    recordingLink: event.recordingLink,
    feedback: event.feedback,
  };

  const patch = buildDispositionPatch(fields);
  if (patchIsEmpty(patch)) {
    console.log("[sales-disposition] submission had nothing usable; dropped");
    return;
  }

  const contactId = str(event.contactId);
  const phone = str(event.phone);
  const rows = await candidatesFor(client, contactId, phone);

  // The disposition needs the existing scratchpad too, which the plain
  // candidate list does not carry. Re-read just the target row for it: one
  // extra round trip on the rare path a note actually arrived.
  const target = pickTargetCall(rows, contactId, phone);
  if (!target) {
    console.log(
      "[sales-disposition] disposition: no open meeting for",
      contactId || phone,
    );
    return;
  }

  let existing: string | null = null;
  if (patch.feedback) {
    const { data, error } = await client
      .from("sales_calls")
      .select("scratchpad")
      .eq("id", target.id)
      .maybeSingle();
    if (error) console.error("[sales-disposition] scratchpad read failed", error.message);
    else existing = (data?.scratchpad as string | null) ?? null;
  }

  await writePatch(client, target.id, patch, appendNotes(existing, patch.feedback));

  console.log(
    "[sales-disposition]",
    target.id,
    "->",
    patch.outcome ?? patch.appointment_status ?? "free text only",
  );
}
