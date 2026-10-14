import { ghlJson, type GhlContext } from "../../lib/ghl";
import { agencyGhlUserId } from "../../lib/agencyGhl";
import type { Env } from "../../lib/env";
import { tagsForSalesCall } from "../../lib/salesCallTags";
import { putOpportunity } from "./writes";
import { resolveAgencySalesPipeline } from "./agencySales";

// What a sales-call button actually does to GoHighLevel.
//
// ONE TAG on the contact, and nothing else. Jake's workflow reads the tag and
// moves (or creates) the opportunity. This replaced routeSalesCall, which PUT a
// stage and a won/lost status straight onto the card: see
// docs/build-plans/sales-call-tags.md for why.
//
// The single exception is the money. No workflow can know what was collected on
// the call, so a close ALSO writes the amount onto whichever card the workflow
// made. That write touches `monetaryValue` and nothing else, so it cannot move
// a card the workflow has just placed.
//
// Nothing here throws at the caller. The meeting happened; a CRM that did not
// keep up is recorded on the row and shown in the console, never turned into a
// failure that loses the outcome somebody just recorded.

export interface TagResult {
  // The tag that landed, or null when nothing was written.
  tag: string | null;
  // The card the money was written to, when there was money and a card.
  opportunityId: string | null;
  // In words fit to sit under a prospect's name in the console. Null on success
  // and on "not connected", which is a state of the install rather than a fact
  // about this meeting.
  error: string | null;
}

export interface TagInput {
  contactId: string | null;
  // An outcome, or "booked".
  event: string;
  // Money taken on the call. Only ever sent with a close; null skips the
  // opportunity write entirely.
  cash?: number | null;
  // The card this meeting is already known to own, if any. Saves a lookup.
  opportunityId?: string | null;
}

export async function pushSalesCallTag(
  gctx: GhlContext,
  input: TagInput,
): Promise<TagResult> {
  const tags = tagsForSalesCall(input.event);
  if (!tags) {
    return {
      tag: null,
      opportunityId: input.opportunityId ?? null,
      error: `"${input.event}" has no meaning in GoHighLevel, so nothing was tagged.`,
    };
  }
  if (!input.contactId) {
    // A meeting synced off a calendar can arrive without a contact. Not an
    // error worth alarming anybody about; there is simply nobody to tag.
    return {
      tag: null,
      opportunityId: input.opportunityId ?? null,
      error: "No GoHighLevel contact on this meeting, so no tag was applied.",
    };
  }

  const contactId = input.contactId;
  try {
    // On before off. If the second call fails the contact carries two sc tags
    // for a moment, which is untidy; the other way round would leave it with
    // none at all, which is a meeting no workflow can see.
    await ghlJson(gctx, `/contacts/${encodeURIComponent(contactId)}/tags`, {
      method: "POST",
      body: JSON.stringify({ tags: [tags.tag] }),
    });
    if (tags.removeTags.length) {
      await ghlJson(gctx, `/contacts/${encodeURIComponent(contactId)}/tags`, {
        method: "DELETE",
        body: JSON.stringify({ tags: tags.removeTags }),
      });
    }
  } catch (err) {
    return {
      tag: null,
      opportunityId: input.opportunityId ?? null,
      error: readableError(err),
    };
  }

  // The tag is the important half and it has landed. Everything below is the
  // money, and a failure there is reported without taking the tag down with it.
  const cash = typeof input.cash === "number" && input.cash > 0 ? input.cash : null;
  if (cash === null) {
    return { tag: tags.tag, opportunityId: input.opportunityId ?? null, error: null };
  }

  const money = await writeDealValue(gctx, contactId, cash, input.opportunityId ?? null);
  return { tag: tags.tag, opportunityId: money.opportunityId, error: money.error };
}

interface MoneyResult {
  opportunityId: string | null;
  error: string | null;
}

// Put the cash figure on this contact's card on the Sales board.
//
// The app does not create the card, so there may not be one yet: the workflow
// that makes it runs on its own schedule and may not have fired in the second
// between the button and this call. That is reported plainly rather than
// treated as a failure, because the number is safe on our side either way and
// the console shows it.
async function writeDealValue(
  gctx: GhlContext,
  contactId: string,
  cash: number,
  knownOpportunityId: string | null,
): Promise<MoneyResult> {
  try {
    let opportunityId = knownOpportunityId;

    if (!opportunityId) {
      const pipeline = await resolveAgencySalesPipeline(gctx);
      if (!pipeline) {
        return {
          opportunityId: null,
          error: `The amount was not written to a card: no board named "Sales" was found in GoHighLevel.`,
        };
      }
      const found = await ghlJson<{ opportunities?: { id?: string }[] }>(
        gctx,
        `/opportunities/search?location_id=${encodeURIComponent(gctx.locationId)}` +
          `&pipeline_id=${encodeURIComponent(pipeline.id)}` +
          `&contact_id=${encodeURIComponent(contactId)}&limit=1`,
      );
      opportunityId = found.opportunities?.[0]?.id ?? null;
    }

    if (!opportunityId) {
      return {
        opportunityId: null,
        error:
          "The amount was not written to a card: this contact has no opportunity on the Sales board yet. It will appear once the tag's workflow creates one.",
      };
    }

    // monetaryValue ONLY. No pipelineId, no stage, no status: the workflow owns
    // where the card sits, and re-asserting a stage here would be this app
    // moving it back to wherever it was a moment ago.
    const put = await putOpportunity(gctx, opportunityId, { monetaryValue: cash });
    if (!put.ok) {
      return { opportunityId, error: describeFailure(put.status, put.body) };
    }
    return { opportunityId, error: null };
  } catch (err) {
    return { opportunityId: knownOpportunityId, error: readableError(err) };
  }
}

// A GHL failure in words fit to sit under a prospect's name in the console.
function describeFailure(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "GoHighLevel refused the request. The agency token may have expired.";
  }
  if (status === 404) return "That card is no longer in GoHighLevel.";
  const detail = extractMessage(body);
  return detail ? `GoHighLevel said: ${detail}` : `GoHighLevel returned ${status}.`;
}

// GHL puts the useful sentence in `message`, sometimes as an array. Everything
// else in the body is noise nobody reading the console needs.
function extractMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    const msg = parsed.message;
    if (typeof msg === "string") return msg.slice(0, 160);
    if (Array.isArray(msg) && typeof msg[0] === "string") return msg[0].slice(0, 160);
  } catch {
    // Not JSON. Fall through to the raw text, trimmed.
  }
  return body.trim().slice(0, 160);
}

export function readableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.split("\n")[0].slice(0, 200) || "GoHighLevel could not be reached.";
}

// A task in GoHighLevel for a promised follow-up.
//
// The console now lists these itself (the "Due back" group), but a list only
// works for somebody sitting in the console. A cold-call callback has put a
// real task on the contact since 0052, and a sales follow-up is the same
// promise to the same kind of person: it should reach Jake wherever he works,
// including his phone.
//
// Best effort and never throws. The outcome is already recorded by the time
// this runs; losing the answer because a task would not create is the wrong
// trade.
export async function createFollowUpTask(
  env: Env,
  gctx: GhlContext,
  input: { contactId: string; name: string; phone: string; followUpAt: string },
): Promise<string | null> {
  const due = Date.parse(input.followUpAt);
  if (Number.isNaN(due)) return "That follow-up date could not be read, so no task was created.";

  try {
    await ghlJson(gctx, `/contacts/${encodeURIComponent(input.contactId)}/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title: `Follow up: ${input.name || "sales call"}`,
        body: `Agreed on the call. ${input.phone || ""}`.trim(),
        dueDate: new Date(due).toISOString(),
        completed: false,
        assignedTo: agencyGhlUserId(env),
      }),
    });
    return null;
  } catch (err) {
    return readableError(err);
  }
}
