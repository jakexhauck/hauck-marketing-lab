import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient } from "../../../lib/supabase";
import { logAdminAction } from "../../../lib/adminAuth";
import { pushScrapedLead } from "../../../lib/leadHandoff";
import {
  partitionForSend,
  zoneForState,
  type Channel,
  type ScrapedLead,
} from "../../../lib/leadScraper";
import { toScrapedLead } from "./index";

// POST /api/admin/leads/send -> hand ticked leads to Cold Call or SMS.
//
// Three things happen per lead, in this order, and the order is the point:
//
//   1. the GoHighLevel contact is created and tagged (state, city, niche, source,
//      batch date, score band, channel)
//   2. for Cold Call, a row is added to the prospect book so it can be dialed
//   3. only then is send_status stamped
//
// Stamping last is what the SOP's exporter does when it writes the CSV as .part
// and promotes it only after marking the rows. A lead marked sent whose push
// failed is a lead that silently never gets contacted; a lead pushed twice is
// merely untidy, and GoHighLevel's own duplicate rule absorbs it.
//
// Nothing here is bulk. A batch of 200 is 200 sequential pushes because GHL rate
// limits and because a per-lead result is what lets the page say exactly which
// ones did not make it.

const MAX_PER_SEND = 200;
const CHANNELS = new Set<Channel>(["cold_call", "sms"]);

// One literal, not a concatenation: supabase-js infers the row type from this
// string, and a joined expression collapses it to an error type.
const SEND_SELECT =
  "id, business_name, phone_e164, city, state, website, rating, review_count, icp_score, icp_flags, send_status, sent_to, run_id, niche_id";

interface PostBody {
  ids?: unknown;
  channel?: unknown;
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
  run_id: string | null;
  niche_id: string | null;
}

// The label written into send_status. Mirrors the SOP's "<series>_<n>_queued"
// shape so a row sent from the page and a row exported to CSV read the same way.
export function sendLabel(channel: Channel, date: Date): string {
  const stamp = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `${channel}_${stamp}_queued`;
}

/**
 * Put a lead in the Cold Call prospect book.
 *
 * Keyed on the phone: the book is the list Jake dials, and the same business
 * arriving twice from two runs would be two dials at the same desk. Returns
 * whether a row was added, so "already in the book" reads differently from "added".
 */
async function addToProspectBook(
  client: NonNullable<ReturnType<typeof getServiceClient>>,
  lead: ScrapedLead,
  adminId: string,
  ghlContactId: string | null,
): Promise<{ added: boolean; error: string | null }> {
  const { data: existing } = await client
    .from("leads")
    .select("id")
    .eq("phone", lead.phoneE164)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return { added: false, error: null };

  const { error } = await client.from("leads").insert({
    first_name: "",
    last_name: "",
    business_name: (lead.businessName ?? "").trim(),
    phone: lead.phoneE164,
    website: (lead.website ?? "").trim(),
    email: "",
    // So the call card can show the prospect's local time rather than a blank.
    timezone: zoneForState(lead.state),
    status: "New",
    source: "Lead scraper",
    notes: "",
    admin_id: adminId,
    ghl_contact_id: ghlContactId,
  });

  if (error) {
    console.error("[leads/send] prospect book insert failed", error.message);
    return { added: false, error: "Could not add it to the call list." };
  }
  return { added: true, error: null };
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = await readJsonBody<PostBody>(ctx.request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const channel = body.channel as Channel;
  if (!CHANNELS.has(channel)) {
    return Response.json({ error: "Pick Cold Call or SMS." }, { status: 400 });
  }

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
  const sent: string[] = [];
  const failures: { id: string; reason: string }[] = [];
  let addedToBook = 0;
  let notConfigured = false;

  for (const lead of sendable) {
    const row = rowById.get(lead.id)!;
    const run = (row.run_id && runsById.get(row.run_id)) || {
      // A lead with no run (a direct import, say) still deserves honest tags:
      // its niche if it has one, and no batch date rather than a fabricated one.
      nicheId: row.niche_id ?? "unknown",
      createdAt: "",
    };

    const push = await pushScrapedLead(ctx.env, lead, run, channel);
    if (push.notConfigured) {
      notConfigured = true;
      failures.push({ id: lead.id, reason: "GoHighLevel is not connected." });
      continue;
    }
    if (!push.ok) {
      failures.push({ id: lead.id, reason: push.error ?? "GoHighLevel refused it." });
      continue;
    }

    if (channel === "cold_call") {
      const book = await addToProspectBook(client, lead, ctx.data.admin!.id, push.contactId);
      if (book.error) {
        failures.push({ id: lead.id, reason: book.error });
        continue;
      }
      if (book.added) addedToBook += 1;
    }

    sent.push(lead.id);
  }

  // Stamped last, and only for the ones that actually landed.
  if (sent.length > 0) {
    const { error: stampErr } = await client
      .from("cold_sms_outreach_numbers")
      .update({ send_status: label, sent_to: channel, sent_at: new Date().toISOString() })
      .in("id", sent);
    if (stampErr) {
      console.error("[leads/send] stamp failed", stampErr.message);
      return Response.json(
        {
          error:
            "The leads went out but could not be marked as sent. Check before sending again.",
        },
        { status: 500 },
      );
    }

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
    requested: ids.length,
    sent: sent.length,
    failed: failures.length,
  });

  return Response.json({
    channel,
    label,
    sent: sent.length,
    addedToProspectBook: addedToBook,
    // Everything that did not go, and why. Refused before the push and failed
    // during it are both here, because from the page they are the same question.
    skipped: [...rejected, ...failures],
    notConfigured,
  });
};
