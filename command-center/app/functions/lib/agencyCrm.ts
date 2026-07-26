import type { Env } from "./env";
import { ghlJson } from "./ghl";
import {
  agencyGhlUserId,
  agencyTimezone,
  getAgencyGhlContext,
  isAgencyGhlConfigured,
  tagsForOutcome,
} from "./agencyGhl";
import { zonedTimeToUtcMs } from "./tz";

// Pushing the agency's own cold calling into its GoHighLevel account.
//
// The app does exactly three things over there and no more:
//
//   1. makes sure the prospect exists as a contact,
//   2. leaves ONE "cc " tag on them saying what just happened,
//   3. drops a task on the contact when a callback is agreed.
//
// It does not create opportunities, move stages or close anything. Jake runs
// every automation and every pipeline move from the tags inside GHL, and two
// systems moving the same card is how a pipeline starts lying about itself.
//
// Nothing here throws at the caller. The call has already happened by the time
// this runs, so a failure is recorded on the lead and shown in the console
// rather than turned into an error somebody has to read mid-conversation. And
// nothing here deletes a contact: removing records stays a human decision made
// inside GHL, where it can be seen.

export interface LeadForPush {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  source: string;
  ghlContactId: string | null;
}

export interface PushResult {
  ok: boolean;
  contactId: string | null;
  // Plain enough to show a caller. Null when the push worked.
  error: string | null;
  // True when the agency account simply is not connected, which is a
  // configuration state rather than a failure worth alarming anyone about.
  notConfigured?: boolean;
}

export function displayName(lead: LeadForPush): string {
  const name = `${lead.firstName} ${lead.lastName}`.trim();
  return name || lead.phone || "Unnamed prospect";
}

// GHL rejects a malformed number outright, which would fail the whole push for
// a lead whose only problem is punctuation. Send E.164 when we can build one and
// leave the field out entirely otherwise.
export function toE164(phone: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 11) return `+${digits}`;
  return null;
}

interface ContactResponse {
  contact?: { id?: string };
}

// Create or find the contact. Upsert rather than create: the account's own
// duplicate rule keys on phone and email, so re-importing a list updates the
// prospect who is already there instead of doubling them.
export async function upsertAgencyContact(
  env: Env,
  lead: LeadForPush,
): Promise<PushResult> {
  if (!isAgencyGhlConfigured(env)) {
    return { ok: false, contactId: null, error: null, notConfigured: true };
  }

  const ctx = getAgencyGhlContext(env);
  const phone = toE164(lead.phone);
  const email = lead.email.trim();

  // With neither a phone nor an email there is nothing for GHL to key on, and a
  // nameless contact would be created fresh on every single call.
  if (!phone && !email) {
    return {
      ok: false,
      contactId: null,
      error: "No phone or email to identify this prospect in GoHighLevel.",
    };
  }

  try {
    const body: Record<string, unknown> = {
      locationId: ctx.locationId,
      firstName: lead.firstName || undefined,
      lastName: lead.lastName || undefined,
      name: displayName(lead),
      source: lead.source || "Cold call list",
    };
    if (phone) body.phone = phone;
    if (email) body.email = email;

    const res = await ghlJson<ContactResponse>(ctx, "/contacts/upsert", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const contactId = res.contact?.id ?? null;
    if (!contactId) {
      return {
        ok: false,
        contactId: null,
        error: "GoHighLevel accepted the contact but returned no id.",
      };
    }
    return { ok: true, contactId, error: null };
  } catch (err) {
    return { ok: false, contactId: lead.ghlContactId, error: readableError(err) };
  }
}

export interface OutcomePushInput {
  lead: LeadForPush;
  outcome: string;
  // Which no-answer this is for this prospect (1 = the first). Counted from the
  // recorded dials, never typed.
  attempt?: number;
  // The agreed callback date, "YYYY-MM-DD". Only meaningful for a callback, and
  // what turns it into a task in GHL.
  followUpDate?: string | null;
}

// One press of an outcome button, in GHL terms.
export async function pushColdCallOutcome(
  env: Env,
  input: OutcomePushInput,
): Promise<PushResult> {
  const { lead, outcome, attempt = 1 } = input;

  const tags = tagsForOutcome(outcome, attempt);
  if (!tags) {
    return {
      ok: false,
      contactId: lead.ghlContactId,
      error: `"${outcome}" has no meaning in GoHighLevel.`,
    };
  }

  const contactResult = lead.ghlContactId
    ? { ok: true, contactId: lead.ghlContactId, error: null }
    : await upsertAgencyContact(env, lead);
  if (!contactResult.ok || !contactResult.contactId) return contactResult;

  const ctx = getAgencyGhlContext(env);
  const contactId = contactResult.contactId;

  try {
    // On before off. If the second call fails the contact carries two cc tags
    // for a moment, which is untidy; doing it the other way round would leave a
    // prospect with none at all, which is a prospect nobody's automation can
    // see.
    if (tags.tag) {
      await ghlJson(ctx, `/contacts/${contactId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags: [tags.tag] }),
      });
    }
    if (tags.removeTags.length) {
      await ghlJson(ctx, `/contacts/${contactId}/tags`, {
        method: "DELETE",
        body: JSON.stringify({ tags: tags.removeTags }),
      });
    }

    if (outcome === "callback" && input.followUpDate) {
      await createCallbackTask(env, ctx, contactId, lead, input.followUpDate);
    }

    return { ok: true, contactId, error: null };
  } catch (err) {
    return { ok: false, contactId, error: readableError(err) };
  }
}

// A task on the contact, due the morning of the agreed day, so the callback
// exists in Jake's GHL task list and not only in this app.
//
// 9am in the AGENCY's timezone, not the server's and not the prospect's: it is
// Jake's working day the task lands in.
async function createCallbackTask(
  env: Env,
  ctx: ReturnType<typeof getAgencyGhlContext>,
  contactId: string,
  lead: LeadForPush,
  followUpDate: string,
): Promise<void> {
  const dueMs = zonedTimeToUtcMs(agencyTimezone(env), followUpDate, 9, 0);
  if (dueMs === null) return;

  await ghlJson(ctx, `/contacts/${contactId}/tasks`, {
    method: "POST",
    body: JSON.stringify({
      title: `Call back: ${displayName(lead)}`,
      body: `Agreed on the phone. ${lead.phone || ""}`.trim(),
      dueDate: new Date(dueMs).toISOString(),
      completed: false,
      assignedTo: agencyGhlUserId(env),
    }),
  });
}

// GHL's errors arrive as a status line with a JSON body glued on. Keep the
// useful half and drop the rest: this string is shown in the admin console.
export function readableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const match = raw.match(/"message":"([^"]+)"/);
  if (match) return match[1];
  return raw.length > 160 ? `${raw.slice(0, 157)}...` : raw;
}


// The tag every imported prospect gets. GoHighLevel decides what it means: a
// workflow over there is what moves the contact onto the Cold Calling board.
// This app only ever writes the tag, exactly as it does for the call outcomes.
export const NEW_LEAD_TAG = "cc new lead";

// Put an imported prospect into GoHighLevel and mark it new.
//
// Upsert first, tag second, and a failed tag is still reported as a failure:
// a contact that exists but carries no tag is invisible to the workflow, which
// is worse than not importing it, because nobody goes looking for it.
export async function pushImportedLead(env: Env, lead: LeadForPush): Promise<PushResult> {
  const upserted = await upsertAgencyContact(env, lead);
  if (!upserted.ok || !upserted.contactId) return upserted;

  try {
    const ctx = getAgencyGhlContext(env);
    await ghlJson(ctx, `/contacts/${upserted.contactId}/tags`, {
      method: "POST",
      body: JSON.stringify({ tags: [NEW_LEAD_TAG] }),
    });
    return upserted;
  } catch (err) {
    return { ok: false, contactId: upserted.contactId, error: readableError(err) };
  }
}
