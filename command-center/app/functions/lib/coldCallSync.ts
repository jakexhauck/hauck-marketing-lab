import { shapeOpportunity, type RawOpportunity } from "./agencyPipelines";

// Pulling prospects OUT of the agency's GoHighLevel account and into the lead
// book.
//
// The push (agencyCrm.ts) has always been one-way: the console tags a contact,
// and Jake's workflows over there decide what the tag means. That leaves a hole,
// which this closes: a prospect created IN GoHighLevel, by a form, an import or
// by hand, existed nowhere the console could see. It was not in the book, so it
// was in no queue, no count and no caller's day.
//
// This is deliberately still not two-way. Nothing here writes to GoHighLevel and
// nothing here moves a stage. It reads the board and adds what the book is
// missing, which is the one direction that was absent.
//
// Pure: no network, no Supabase. The endpoint gathers the inputs and performs
// the insert; every rule about what may land is decided and tested here.

// Compare numbers by their digits alone, so "(555) 010-9999", "555-010-9999"
// and "5550109999" are one prospect rather than three.
//
// The leading US country code is dropped as well, which the CSV importer's
// version does not do and does not need to: a bought list is typed one way
// throughout. Here the two sides genuinely disagree. GoHighLevel stores E.164
// ("+13135550177") and the book holds whatever a human typed
// ("(313) 555-0177"). Without this, every prospect Jake had already entered by
// hand would be imported a second time and dialed twice.
export function phoneKey(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

interface NamedPipeline {
  name: string;
  stages: { id: string; name: string }[];
}

function key(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Which of the account's pipelines is the cold calling one.
//
// By overlap rather than by name, because the pipeline can be called anything
// and the stages are the thing being matched: whichever board shares the most
// stage names with the console is the board the console is about. A name match
// is only the tie-break, for the case where drift is severe enough that overlap
// is low.
//
// Lives here rather than in src/lib/stageDrift.ts (its first home) so the server
// and the browser cannot disagree about which board is being talked about.
export function pickColdCallPipeline<T extends NamedPipeline>(
  pipelines: T[],
  stageLabels: readonly string[],
): T | null {
  if (pipelines.length === 0) return null;

  const wanted = new Set(stageLabels.map(key));
  let best: T | null = null;
  let bestScore = -1;

  for (const p of pipelines) {
    const overlap = p.stages.filter((s) => wanted.has(key(s.name))).length;
    const named = key(p.name).includes("cold") ? 1 : 0;
    const score = overlap * 10 + named;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  // Nothing matched on either count: refusing to guess is more useful than
  // pulling an unrelated board's contacts into the dialing queue.
  return bestScore > 0 ? best : null;
}

// A prospect already in the book, in the two ways one can be recognised.
export interface ExistingLead {
  phone: string | null;
  ghl_contact_id?: string | null;
}

export interface SyncPlan {
  // Ready to hand to the insert, in GoHighLevel's own order.
  insert: Record<string, unknown>[];
  // Everything not inserted, counted rather than silently dropped: a sync that
  // says "3 added" while quietly ignoring 40 is worse than one that says why.
  skippedExisting: number;
  skippedNoPhone: number;
  // Stage names GoHighLevel has that the console has no status for. Named, not
  // counted, because the fix is Jake adding the page or renaming the stage.
  skippedStages: string[];
}

// The dial stages carry their own attempt count: a card parked in "2nd Dial
// (Day 2)" has been rung twice without an answer. Importing it as 0 attempts
// would put a prospect who has been chased for two days at the front of a
// fresh queue.
const DIAL_COUNTS: Record<string, number> = {
  "1st Dial (Day 1)": 1,
  "2nd Dial (Day 2)": 2,
};

// Split a display name into first + rest, so "Ana Maria Del Toro" keeps the
// surname whole instead of losing everything after the second word.
export function splitName(full: string): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

// Who the prospect IS, which is not the same as what the card is called.
//
// GoHighLevel names an opportunity for the board it sits on: a booked one comes
// back as "Rosa Petrov - Tuesday, July 28, 2026 1:30 AM EDT". That reads fine as
// a card and is nonsense as a surname on a call screen. The contact's own name
// is the person; the card title is only the fallback for a board where nobody
// filled the contact in.
function personName(raw: RawOpportunity, cardName: string): string {
  const contact = (raw.contact?.name ?? "").trim();
  if (contact) return contact;
  return cardName === "Unnamed" ? "" : cardName;
}

export function planLeadSync(
  opportunities: RawOpportunity[],
  stageNameById: Map<string, string>,
  statuses: readonly string[],
  existing: ExistingLead[],
  now: string,
): SyncPlan {
  const known = new Set(statuses);

  // Both ways a prospect can already be here. The contact id is the stronger
  // signal (it is the same record over there); the phone catches the prospect
  // who was typed into the book by hand and pushed later.
  const seenPhones = new Set<string>();
  const seenContacts = new Set<string>();
  for (const row of existing) {
    const k = phoneKey(row.phone ?? "");
    if (k) seenPhones.add(k);
    if (row.ghl_contact_id) seenContacts.add(row.ghl_contact_id);
  }

  const plan: SyncPlan = {
    insert: [],
    skippedExisting: 0,
    skippedNoPhone: 0,
    skippedStages: [],
  };
  const unknownStages = new Set<string>();

  for (const raw of opportunities) {
    const card = shapeOpportunity(raw);
    const stage = stageNameById.get(card.stageId) ?? "";
    if (!known.has(stage)) {
      // A stage with no page here: importing it would violate the status CHECK
      // constraint, and guessing the nearest stage would move somebody's
      // prospect without being asked.
      if (stage) unknownStages.add(stage);
      continue;
    }

    // This is a dialing list. A prospect with no number is not a lead, it is a
    // gap in the queue somebody has to notice mid-shift.
    const k = phoneKey(card.phone);
    if (!k) {
      plan.skippedNoPhone += 1;
      continue;
    }

    if (seenPhones.has(k) || (card.contactId && seenContacts.has(card.contactId))) {
      plan.skippedExisting += 1;
      continue;
    }
    // Guards against the same prospect appearing twice on the board, too.
    seenPhones.add(k);
    if (card.contactId) seenContacts.add(card.contactId);

    const { first, last } = splitName(personName(raw, card.name));

    plan.insert.push({
      first_name: first,
      last_name: last,
      phone: card.phone,
      email: card.email,
      timezone: "",
      status: stage,
      // first_contact_date and last_contact stay null: they mean OUR first dial,
      // and this prospect has never been called from the console.
      first_contact_date: null,
      last_contact: null,
      follow_up_date: null,
      appointment_date: null,
      no_answer: DIAL_COUNTS[stage] ?? 0,
      source: "GoHighLevel",
      notes: "",
      // Unassigned: who dials this is a decision the owner makes in the book,
      // not something a sync should decide on his behalf.
      assigned_to: null,
      ghl_contact_id: card.contactId,
      ghl_synced_at: now,
    });
  }

  plan.skippedStages = [...unknownStages].sort();
  return plan;
}
