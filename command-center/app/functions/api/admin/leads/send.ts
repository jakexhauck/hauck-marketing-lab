import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { pushScrapedLead } from "../../../lib/leadHandoff";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import { ghlJson } from "../../../lib/ghl";
import { POWER_DIALER_TAG } from "../../../lib/coldCallTags";
import {
  DNC_REASON,
  partitionForSend,
  zoneForState,
  type Channel,
  type ScrapedLead,
} from "../../../lib/leadScraper";
import { toScrapedLead } from "./index";
import { LEAD_STATUSES } from "../tracker/leads";

// POST /api/admin/leads/send -> hand ticked leads to Cold Call or SMS.
//
// Three things happen, in this order, and the order is the point:
//
//   1. the GoHighLevel contact is created and tagged (state, city, niche, source,
//      batch date, score band, channel, and the dialer if this is a dialer send)
//   2. for Cold Call, rows are added to the prospect book so they can be dialed
//   3. only then is send_status stamped
//
// Stamping AFTER the push is what the SOP's exporter does when it writes the CSV
// as .part and promotes it only after marking the rows. A lead marked sent whose
// push failed is a lead that silently never gets contacted; a lead pushed twice
// is merely untidy, and GoHighLevel's own duplicate rule absorbs it.
//
// THE BUDGET IS FIFTY OUTBOUND CALLS. Pages Functions on the free plan cut a
// request off at fifty, and this handler is the heaviest in the app, so every
// call it makes is counted here rather than discovered later:
//
//   3 fixed reads   the ticked rows, the book phones in this batch, the runs
//   2 per lead      the contact upsert, and one call carrying every tag
//   2 batch writes  the book insert, and the stamp
//   4 tail          the run tally read and write, and the admin log
//
// A batch of eight is about twenty-four. It used to be six calls a lead: a second
// tag call for the dialer, a per-lead lookup against the book, a per-lead insert
// and a per-lead stamp. Ten leads asked for sixty-five, which is why a full batch
// died past the eighth lead while the ones before it were already in GoHighLevel
// (Jake, 21 August 2026). Anything added to the per-lead loop is multiplied by the
// batch size, so add it to a fixed read or a batch write instead.
//
// Still sequential, because GoHighLevel rate limits per location, and because a
// per-lead result is what lets the page say exactly which ones did not make it.

const MAX_PER_SEND = 200;
const CHANNELS = new Set<Channel>(["cold_call", "sms"]);

// One literal, not a concatenation: supabase-js infers the row type from this
// string, and a joined expression collapses it to an error type.
const SEND_SELECT =
  "id, business_name, phone_e164, city, state, website, rating, review_count, icp_score, icp_flags, send_status, sent_to, line_type, run_id, niche_id";

interface PostBody {
  ids?: unknown;
  channel?: unknown;
  // Cold Call, and straight onto GoHighLevel's power dialer: the same send,
  // plus the `Power Dialer` tag on each contact, which is what Jake's workflow
  // watches for. Not a third channel on purpose. A channel decides where a lead
  // lives; this decides only what happens to it next, and the book, the tags and
  // the stamp must stay identical either way or the two roads diverge.
  powerDialer?: unknown;
}

interface LeadRowForSend {
  id: string;
  business_name: string | null;
  phone_e164: string;
  city: string | null;
  state: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  icp_score: number | null;
  icp_flags: string[] | null;
  send_status: string;
  sent_to: string | null;
  line_type: string | null;
  run_id: string | null;
  niche_id: string | null;
}

// The label written into send_status. Mirrors the SOP's "<series>_<n>_queued"
// shape so a row sent from the page and a row exported to CSV read the same way.
export function sendLabel(channel: Channel, date: Date): string {
  const stamp = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `${channel}_${stamp}_queued`;
}

// Put the dialer's tag on a prospect who is NOT being pushed by this run.
//
// The send deliberately skips a lead it has sent before, or one already in the
// book, because sending it twice would double the record. Tagging it is a
// different question: those are exactly the people somebody wants on the phone
// today, and refusing them the tag is how "send these to the dialer" ends up
// putting a third of them on the list (Jake, 2026-08-18).
//
// So the contact is found rather than made: they already exist over there, and
// an upsert would rewrite fields and re-apply the import's tags, which for a
// prospect who has since been called five times would say something false.
//
// Best effort by design. It returns whether the tag landed, and the caller
// counts rather than fails: the lead is where it was either way.
async function tagExistingForPowerDialer(env: Env, phoneE164: string): Promise<boolean> {
  const phone = (phoneE164 ?? "").trim();
  if (!phone || !isAgencyGhlConfigured(env)) return false;
  const ctx = getAgencyGhlContext(env);
  try {
    const found = await ghlJson<{ contact?: { id?: string } }>(
      ctx,
      `/contacts/search/duplicate?locationId=${encodeURIComponent(ctx.locationId)}&number=${encodeURIComponent(phone)}`,
    );
    const contactId = found.contact?.id;
    if (!contactId) return false;
    await ghlJson(ctx, `/contacts/${encodeURIComponent(contactId)}/tags`, {
      method: "POST",
      body: JSON.stringify({ tags: [POWER_DIALER_TAG] }),
    });
    return true;
  } catch (err) {
    console.error("[leads/send] power dialer tag failed", phone, err);
    return false;
  }
}

/**
 * The prospect book rows for a batch, written in ONE insert.
 *
 * It used to be two calls per lead, a lookup on the phone and then the insert.
 * The lookup is gone because the caller has already read every phone in this
 * batch that the book knows about, so asking again per lead was asking a question
 * we had the answer to. The insert is one call for the whole batch for the same
 * reason the stamp is: fifty outbound calls is the entire budget for one request.
 *
 * Postgres inserts the batch or none of it, so a failure fails the whole batch,
 * and the caller stamps nothing. That is the safe direction: nothing is marked
 * sent that is not in the book.
 */
async function addToProspectBook(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  rows: BookRow[],
): Promise<string | null> {
  if (rows.length === 0) return null;
  const { error } = await client.from("leads").insert(rows);
  if (error) {
    console.error("[leads/send] prospect book insert failed", error.message);
    return "Could not add it to the call list.";
  }
  return null;
}

interface BookRow {
  first_name: string;
  last_name: string;
  business_name: string;
  phone: string;
  website: string;
  email: string;
  timezone: string;
  status: string;
  source: string;
  notes: string;
  admin_id: string;
  ghl_contact_id: string | null;
}

function bookRowFor(lead: ScrapedLead, adminId: string, ghlContactId: string | null): BookRow {
  return {
    first_name: "",
    last_name: "",
    business_name: (lead.businessName ?? "").trim(),
    phone: lead.phoneE164,
    website: (lead.website ?? "").trim(),
    email: "",
    // So the call card can show the prospect's local time rather than a blank.
    timezone: zoneForState(lead.state),
    // The book's first stage, by its real name. This was the literal "New" until
    // 15 August 2026, which the status constraint had stopped accepting at 0076,
    // so every Cold Call send created the GoHighLevel contact and then failed
    // here: nothing reached the book by this path, and nothing was stamped, so
    // the same leads sat on the Leads page to be sent again.
    status: LEAD_STATUSES[0],
    source: "Lead scraper",
    notes: "",
    admin_id: adminId,
    ghl_contact_id: ghlContactId,
  };
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<PostBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const channel = body.channel as Channel;
  if (!CHANNELS.has(channel)) {
    return Response.json({ error: "Pick Cold Call or SMS." }, { status: 400 });
  }

  // Only Cold Call can go to the dialer. An SMS lead has no place on a phone
  // list, and silently tagging one would put it there.
  const toPowerDialer = body.powerDialer === true && channel === "cold_call";

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.map((v) => String(v ?? "").trim()).filter(Boolean))]
    : [];
  if (ids.length === 0) {
    return Response.json({ error: "Tick at least one lead." }, { status: 400 });
  }
  if (ids.length > MAX_PER_SEND) {
    return Response.json(
      { error: `That is more than ${MAX_PER_SEND} at once. Send them in smaller batches.` },
      { status: 400 },
    );
  }

  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data, error } = await client
    .from("cold_sms_outreach_numbers")
    .select(SEND_SELECT)
    .in("id", ids);

  if (error) {
    console.error("[leads/send] read failed", error.message);
    return Response.json({ error: "could not read those leads" }, { status: 500 });
  }

  const rows = (data ?? []) as LeadRowForSend[];
  const leads = rows.map((r) => toScrapedLead(r as never));

  // The same three rules the SOP's exporter enforces, so the in-app send can never
  // hand out a number the CSV path would have refused.
  const { sendable, rejected } = partitionForSend(leads);

  // Belt and braces on top of send_status: a business already in the call book
  // is one somebody may already have dialled, and send_status is a flag that can
  // be lost (it was, on 1 August, for 200 leads). The book is the fact.
  //
  // Matched on the phone because that is what the book is keyed on and what a
  // caller actually rings.
  //
  // Asked ONLY about the phones in this batch. It used to read the whole book on
  // every request, which was a growing answer to a fixed question: at 444 rows it
  // worked, and it would have started silently missing duplicates the moment the
  // book outgrew one page of results.
  const phonesInBatch = [...new Set(leads.map((l) => l.phoneE164).filter(Boolean))];
  const inBook = new Set<string>();
  if (phonesInBatch.length > 0) {
    const { data: bookPhones } = await client
      .from("leads")
      .select("phone")
      .is("deleted_at", null)
      .in("phone", phonesInBatch);
    for (const r of (bookPhones ?? []) as { phone: string | null }[]) {
      const phone = (r.phone ?? "").trim();
      if (phone) inBook.add(phone);
    }
  }

  const alreadyDialing: { id: string; reason: string }[] = [];
  const fresh = sendable.filter((lead) => {
    if (!inBook.has(lead.phoneE164)) return true;
    alreadyDialing.push({
      id: lead.id,
      reason: "Already in the call list, so it was not sent again.",
    });
    return false;
  });

  // Every run touched by this batch, for the tags. Read once rather than per lead.
  const runIds = [...new Set(rows.map((r) => r.run_id).filter(Boolean))] as string[];
  const runsById = new Map<string, { nicheId: string; createdAt: string }>();
  if (runIds.length > 0) {
    const { data: runRows } = await client
      .from("scrape_runs")
      .select("id, niche_id, created_at")
      .in("id", runIds);
    for (const r of (runRows ?? []) as { id: string; niche_id: string; created_at: string }[]) {
      runsById.set(r.id, { nicheId: r.niche_id, createdAt: r.created_at });
    }
  }
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const label = sendLabel(channel, new Date());

  // A lead skipped for already being in the book is STAMPED anyway, and that is
  // the point of the guard rather than an afterthought. Leaving it "pending"
  // would put it straight back on the Leads page for somebody to tick again
  // tomorrow, which is the loop this whole change exists to close. It gets its
  // own label so the record says what actually happened.
  if (alreadyDialing.length > 0) {
    const { error } = await client
      .from("cold_sms_outreach_numbers")
      .update({
        send_status: `${label}_already_in_book`,
        sent_to: channel,
        sent_at: new Date().toISOString(),
      })
      .in(
        "id",
        alreadyDialing.map((a) => a.id),
      );
    if (error) console.error("[leads/send] could not stamp already-in-book leads", error.message);
  }

  const pushed: string[] = [];
  const bookRows: BookRow[] = [];
  const failures: { id: string; reason: string }[] = [];
  // How many prospects came out of this carrying the dialer's tag, pushed or
  // not. The number the page reports, because it is the one that decides how
  // long the dialer's list is.
  let taggedForDialer = 0;
  let notConfigured = false;
  // A stamp that would not write. Reported rather than swallowed: the lead IS in
  // GoHighLevel, so the page must not imply it can simply be sent again.
  let stampFailed = false;

  for (const lead of fresh) {
    const row = rowById.get(lead.id)!;
    const run = (row.run_id && runsById.get(row.run_id)) || {
      // A lead with no run (a direct import, say) still deserves honest tags:
      // its niche if it has one, and no batch date rather than a fabricated one.
      nicheId: row.niche_id ?? "unknown",
      createdAt: "",
    };

    // The dialer's tag goes on in the SAME call as the run's tags. It was a
    // request of its own until 21 August, which spent a sixth of this handler's
    // whole budget saying one more word to an endpoint we were already
    // mid-sentence with.
    const extraTags = toPowerDialer ? [POWER_DIALER_TAG] : [];
    const push = await pushScrapedLead(ctx.env, lead, run, channel, extraTags);
    if (push.notConfigured) {
      notConfigured = true;
      failures.push({ id: lead.id, reason: "GoHighLevel is not connected." });
      // Nothing later in this batch will fare any differently, and every attempt
      // is two more outbound calls against a budget of fifty.
      break;
    }
    if (!push.ok) {
      failures.push({ id: lead.id, reason: push.error ?? "GoHighLevel refused it." });
      continue;
    }
    if (toPowerDialer) taggedForDialer += 1;

    if (channel === "cold_call") {
      bookRows.push(bookRowFor(lead, ctx.data.admin!.id, push.contactId));
    }
    pushed.push(lead.id);
  }

  // The book, then the stamp, and that is every write this batch makes: two for
  // the whole batch rather than two per lead.
  //
  // The old loop stamped each lead the moment it landed, so a run that died
  // mid-batch kept what it had done. Runs died mid-batch because this handler
  // spent six outbound calls a lead against a ceiling of fifty; at two, a batch
  // of eight costs about twenty-four all in and has room to spare. What is left
  // of that window is one batch, and a lead caught in it is offered again and
  // pushed again, which GoHighLevel's upsert absorbs.
  let sent = pushed;
  if (bookRows.length > 0) {
    const bookError = await addToProspectBook(client, bookRows);
    if (bookError) {
      // All or nothing, so nothing reached the book and nothing may be stamped.
      // They stay on the page, which is where a lead nobody can ring belongs.
      for (const id of pushed) failures.push({ id, reason: bookError });
      sent = [];
    }
  }
  const addedToBook = sent.length > 0 ? bookRows.length : 0;

  if (sent.length > 0) {
    const { error: stampErr } = await client
      .from("cold_sms_outreach_numbers")
      .update({ send_status: label, sent_to: channel, sent_at: new Date().toISOString() })
      .in("id", sent);
    if (stampErr) {
      console.error("[leads/send] stamp failed", stampErr.message);
      stampFailed = true;
    }
  }

  // Everybody else who was ticked. A lead skipped for having been sent before,
  // or for already being in the book, is still somebody this press asked to put
  // on the phone, and their contact is already over there waiting for the tag.
  //
  // The do-not-contact list is the one refusal that survives this: it is a
  // refusal to ring them at all, which a dialer list is precisely a way of doing.
  if (toPowerDialer && !notConfigured) {
    // `pushed`, not `sent`. They differ only when the book insert failed, and in
    // that case the contacts still went to GoHighLevel carrying the tag: going
    // round again would spend two more calls each to re-apply a tag they have
    // and would count every one of them twice.
    const tagged = new Set(pushed);
    const refusedDnc = new Set(
      rejected.filter((r) => r.reason === DNC_REASON).map((r) => r.id),
    );
    for (const lead of leads) {
      if (tagged.has(lead.id) || refusedDnc.has(lead.id)) continue;
      if (await tagExistingForPowerDialer(ctx.env, lead.phoneE164)) taggedForDialer += 1;
    }
  }

  if (sent.length > 0) {
    // Keep the run's tally in step so the history means something.
    const perRun = new Map<string, number>();
    for (const id of sent) {
      const runId = rowById.get(id)?.run_id;
      if (runId) perRun.set(runId, (perRun.get(runId) ?? 0) + 1);
    }
    for (const [runId, n] of perRun) {
      const { data: current } = await client
        .from("scrape_runs")
        .select("sent_count")
        .eq("id", runId)
        .maybeSingle();
      await client
        .from("scrape_runs")
        .update({ sent_count: ((current as { sent_count: number } | null)?.sent_count ?? 0) + n })
        .eq("id", runId);
    }
  }

  await logAdminAction(client, ctx.data.admin!.id, "leads.send", null, {
    channel,
    powerDialer: toPowerDialer,
    taggedForDialer,
    requested: ids.length,
    sent: sent.length,
    failed: failures.length,
  });

  return Response.json({
    channel,
    label,
    sent: sent.length,
    addedToProspectBook: addedToBook,
    // Only meaningful on a power dialer send, and 0 otherwise.
    taggedForDialer,
    // Everything that did not go, and why. Refused before the push and failed
    // during it are both here, because from the page they are the same question.
    skipped: [...rejected, ...alreadyDialing, ...failures],
    notConfigured,
    // A lead reached GoHighLevel but could not be marked as sent here. Surfaced
    // rather than swallowed: it is the one state where the page and the CRM
    // disagree, and the page must not quietly offer to send it again.
    stampFailed,
  });
};
