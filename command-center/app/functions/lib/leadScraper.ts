// Pure compute for Acquisition > Leads. No fetching, no Supabase, no GoHighLevel:
// everything here is a function of its arguments, so the tag scheme, the score
// bands and the CSV shape can be pinned down in tests without a network.
//
// The scraper itself lives at command-center/lead-scraper and is the LIIGO SOP
// ported whole. This module is the app's half: what a scraped row becomes when
// Jake ticks it and hands it to a channel.

// What the SOP's exporter gates on. Kept here as well as in the runner because
// the CSV button and the in-app send must agree about what "qualified" means; if
// these two ever drift, one path hands out numbers the other rejects.
export const EXPORT_THRESHOLD = 50;

// The one tag that MOVES a prospect: a GoHighLevel workflow watches for it and
// creates the opportunity on the Cold Calling pipeline at New Lead. Every other
// tag this module writes is descriptive.
//
// It lives here, in the pure module, because this file owns the tag scheme and
// is where that scheme is unit tested. agencyCrm imports it rather than spelling
// it again: two spellings is one pipeline that quietly stops filling.
export const NEW_LEAD_TAG = "cc new lead";

export type Channel = "cold_call" | "sms";

export interface ScrapedLead {
  id: string;
  businessName: string | null;
  phoneE164: string;
  city: string | null;
  state: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  icpScore: number | null;
  icpFlags: string[];
  sendStatus: string;
  sentTo: string | null;
}

export interface RunForTags {
  nicheId: string;
  createdAt: string;
}

// --- score bands -------------------------------------------------------------

export type ScoreBand = "high" | "medium" | "low";

// Three bands, drawn off the SOP's own threshold rather than round numbers. Below
// 50 never exports at all, so "low" here means a row that only just qualified.
export function scoreBand(score: number | null | undefined): ScoreBand {
  const n = typeof score === "number" ? score : 0;
  if (n >= 90) return "high";
  if (n >= 65) return "medium";
  return "low";
}

export function isQualified(score: number | null | undefined): boolean {
  return typeof score === "number" && score >= EXPORT_THRESHOLD;
}

// --- tags --------------------------------------------------------------------

// GoHighLevel tags are matched literally by every workflow that reads them, so a
// stray capital or space silently creates a second tag nobody is filtering on.
// Lowercase, hyphenated, ASCII, and never empty.
export function slugify(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// The date half of an ISO timestamp, for the batch tag. Falsy or unparseable
// input yields "" rather than today: a wrong date on a contact is worse than a
// missing one, because it silently misattributes a batch.
export function batchDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * The tags a scraped lead carries into GoHighLevel.
 *
 * Jake asked for state and city, plus the niche, the source, the run date and the
 * score band. Every one is prefixed, so the tag list stays sortable and a filter
 * on "state-" can never collide with a tag somebody typed by hand.
 *
 * Empty parts are dropped rather than tagged blank: "city-" on a lead whose city
 * Google did not return is a tag that means nothing and matches everything.
 *
 * A cold-call lead also gets NEW_LEAD_TAG, and that is the one that MOVES it.
 * The rest are descriptive: they say what the lead is, and no workflow watches
 * them. Without it a lead sent from the Leads tab became a GoHighLevel contact
 * and never reached the Cold Calling board at all, while the same business
 * pushed from Assign leads did, because pushImportedLead has always applied it.
 * Two send paths, two different outcomes, and the quiet one was the default.
 */
export function tagsForLead(lead: ScrapedLead, run: RunForTags, channel: Channel): string[] {
  const tags = ["source-scraper"];

  const niche = slugify(run.nicheId);
  if (niche) tags.push(`niche-${niche}`);

  const state = slugify(lead.state ?? "");
  if (state) tags.push(`state-${state}`);

  const city = slugify(lead.city ?? "");
  if (city) tags.push(`city-${city}`);

  const date = batchDate(run.createdAt);
  if (date) tags.push(`scrape-${date}`);

  tags.push(`score-${scoreBand(lead.icpScore)}`);
  tags.push(channel === "cold_call" ? "channel-cold-call" : "channel-sms");

  // The tag a GoHighLevel workflow watches for, to create the opportunity on the
  // Cold Calling pipeline at New Lead.
  if (channel === "cold_call") tags.push(NEW_LEAD_TAG);

  // De-duplicated but order-stable: the tag list reads the same on every contact,
  // which matters when you are eyeballing two of them side by side.
  return [...new Set(tags)];
}

// --- the score, in English ---------------------------------------------------

// icp_flags is the SOP's record of why a row scored what it did. It is stored raw
// so the reasoning survives a rubric change; this turns it into something Jake can
// read at a glance without learning the flag vocabulary.
export function explainFlags(flags: string[]): string[] {
  return (flags ?? []).map((flag) => {
    const [key, detail] = flag.split(":");
    switch (key) {
      case "core_primary":
        return `Its main category is ${detail}`;
      case "core_secondary":
        return `Lists ${detail} as a category`;
      case "name":
        return `"${detail}" in the business name`;
      case "weak":
        return `Weak name hint (${detail})`;
      case "weak_only":
        return "Nothing but a weak name hint";
      case "reviews_1_80":
        return "A believable review count";
      case "rating_4.3_up":
        return "Rated 4.3 or better";
      case "website":
        return "Has a live website";
      case "no_web_no_reviews":
        return "No website and no reviews";
      case "certified_directory":
        return "Listed in a trade body's directory";
      case "toll_free":
        return "Toll-free number";
      case "deny":
        return `Rejected: ${detail}`;
      case "exclude":
        return `Rejected as a recurring service: ${detail}`;
      case "primary_off_niche":
        return `Rejected: main category is ${detail}`;
      default:
        return flag;
    }
  });
}

// --- timezone ----------------------------------------------------------------

// The Cold Call card shows the prospect's local time so nobody dials a Californian
// at 6am. The scraper knows the state, which is enough for every state that keeps
// one zone. The split states resolve to their majority zone, which is a deliberate
// approximation: being an hour out on a sliver of Idaho is better than a blank.
const STATE_ZONES: Record<string, string> = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix",
  AR: "America/Chicago", CA: "America/Los_Angeles", CO: "America/Denver",
  CT: "America/New_York", DE: "America/New_York", DC: "America/New_York",
  FL: "America/New_York", GA: "America/New_York", HI: "Pacific/Honolulu",
  ID: "America/Boise", IL: "America/Chicago", IN: "America/Indiana/Indianapolis",
  IA: "America/Chicago", KS: "America/Chicago", KY: "America/New_York",
  LA: "America/Chicago", ME: "America/New_York", MD: "America/New_York",
  MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago",
  MS: "America/Chicago", MO: "America/Chicago", MT: "America/Denver",
  NE: "America/Chicago", NV: "America/Los_Angeles", NH: "America/New_York",
  NJ: "America/New_York", NM: "America/Denver", NY: "America/New_York",
  NC: "America/New_York", ND: "America/Chicago", OH: "America/New_York",
  OK: "America/Chicago", OR: "America/Los_Angeles", PA: "America/New_York",
  RI: "America/New_York", SC: "America/New_York", SD: "America/Chicago",
  TN: "America/Chicago", TX: "America/Chicago", UT: "America/Denver",
  VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles",
  WV: "America/New_York", WI: "America/Chicago", WY: "America/Denver",
};

export function zoneForState(state: string | null | undefined): string {
  const key = (state ?? "").trim().toUpperCase().slice(0, 2);
  return STATE_ZONES[key] ?? "";
}

// --- CSV ---------------------------------------------------------------------

// The SOP's four columns, in the SOP's order, so a file exported from the page and
// a file written by export_sms.py import into the same SMS platform identically.
export const CSV_HEADER = ["Phone", "Company Name", "City", "State"];

function csvCell(value: string): string {
  const v = value ?? "";
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(leads: ScrapedLead[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const lead of leads) {
    lines.push([
      csvCell(lead.phoneE164),
      csvCell(lead.businessName ?? ""),
      csvCell(lead.city ?? ""),
      csvCell(lead.state ?? ""),
    ].join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

// --- what may be sent --------------------------------------------------------

export interface SendRejection {
  id: string;
  reason: string;
}

/**
 * Split a tick-list into what may actually go out and what may not.
 *
 * The same three rules the SOP's exporter enforces, applied here so the in-app
 * send cannot hand out a number the CSV path would have refused: it must be
 * qualified, it must not already have been sent, and it must have a business name
 * (a nameless row is a row nobody can open a conversation with).
 */
export function partitionForSend(
  leads: ScrapedLead[],
  suppressed: Set<string> = new Set(),
): { sendable: ScrapedLead[]; rejected: SendRejection[] } {
  const sendable: ScrapedLead[] = [];
  const rejected: SendRejection[] = [];
  const seen = new Set<string>();

  for (const lead of leads) {
    if (!isQualified(lead.icpScore)) {
      rejected.push({ id: lead.id, reason: `Scored below ${EXPORT_THRESHOLD}` });
    } else if (lead.sendStatus !== "pending") {
      rejected.push({ id: lead.id, reason: "Already sent" });
    } else if (!(lead.businessName ?? "").trim()) {
      rejected.push({ id: lead.id, reason: "No business name" });
    } else if (suppressed.has(lead.phoneE164)) {
      rejected.push({ id: lead.id, reason: "On the do-not-contact list" });
    } else if (seen.has(lead.phoneE164)) {
      rejected.push({ id: lead.id, reason: "Duplicate number in this batch" });
    } else {
      seen.add(lead.phoneE164);
      sendable.push(lead);
    }
  }
  return { sendable, rejected };
}
