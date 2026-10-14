// Shaping a client's GHL contacts into the rows their Google Sheet lead
// tracker reads. See docs/build-plans/willis-lead-tracker-sheet.md.
//
// One row per contact, not per opportunity. The owner works a person, not a
// card, and a contact with no opportunity yet is still a lead they must ring.
//
// Everything here is pure so it can be tested without GHL. The fetching lives
// in api/sheets/leads.ts.

import { pickAppointment, type WhenEvent } from "./leadWhen";
import { firstTouchAttribution } from "./adAttribution";
import type { CustomFieldDef, GhlContactRecord } from "./ghl";

// The bulk contacts list carries more than GhlContactRecord declares: the
// address block and the location's custom-field values. Both are optional
// because GHL omits them on contacts that have neither.
export interface SheetContact extends GhlContactRecord {
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  customFields?: { id?: string; value?: unknown }[];
}

export interface SheetLeadRow {
  contactId: string;
  // ISO. The sheet turns these into real dates so its own sorting works.
  dateIn: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  homeType: string;
  timeline: string;
  offer: string;
  source: string;
  campaign: string;
  ad: string;
  // Empty string, never null: the sheet writes these straight into cells and a
  // null would print as "null".
  apptId: string;
  apptAt: string;
  apptTitle: string;
}

// Custom fields are matched by TOKEN, against both the fieldKey and the human
// name, because the GHL workflow that writes them has not been built yet and
// nobody knows whether Jake will name the field "Home Type", "home_type" or
// "Type of Home". Matching one spelling would mean a column that is silently
// empty forever.
function token(value: string): string {
  return value.toLowerCase().replace(/^contact\./, "").replace(/[^a-z0-9]/g, "");
}

const SURVEY_TOKENS = {
  homeType: ["hometype", "typeofhome", "homestories"],
  timeline: ["timeline", "timeframe"],
  offer: ["offer", "promotion", "promo"],
} as const;

export type SurveyAnswers = Record<keyof typeof SURVEY_TOKENS, string>;

// A custom field's id mapped to every token it answers to (its key and its
// name, which are usually two spellings of the same thing).
export function fieldTokens(defs: CustomFieldDef[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const def of defs) {
    if (!def.id) continue;
    const tokens: string[] = [];
    if (def.fieldKey) tokens.push(token(def.fieldKey));
    if (def.name) tokens.push(token(def.name));
    map.set(def.id, tokens.filter(Boolean));
  }
  return map;
}

// GHL custom-field values are string, number, or an array for multi-select.
export function fieldValueText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((v) => fieldValueText(v))
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

// How well one field token answers to one concept. An exact token beats a
// field that merely contains it, which is what keeps "Home Type" ahead of a
// hypothetical "Home Type Notes".
//
// Contains-matching is not optional. Willis's live location holds the window
// cleaning timeline in a field called "What Is Your Timeline For The Window
// Cleaning" and a second called "Cleaning Timeline"; an exact match on
// "timeline" finds neither, and the column reads empty on 199 real contacts
// while the answer sits in GHL.
function scoreToken(fieldToken: string, candidate: string): number {
  if (fieldToken === candidate) return 2;
  if (fieldToken.includes(candidate)) return 1;
  return 0;
}

export function surveyAnswers(
  contact: SheetContact,
  tokensById: Map<string, string[]>,
): SurveyAnswers {
  const out: SurveyAnswers = { homeType: "", timeline: "", offer: "" };
  const best: Record<keyof SurveyAnswers, { score: number; length: number }> = {
    homeType: { score: 0, length: Infinity },
    timeline: { score: 0, length: Infinity },
    offer: { score: 0, length: Infinity },
  };

  for (const field of contact.customFields ?? []) {
    if (!field?.id) continue;
    const tokens = tokensById.get(field.id);
    if (!tokens?.length) continue;
    const text = fieldValueText(field.value);
    if (!text) continue;

    for (const key of Object.keys(out) as (keyof SurveyAnswers)[]) {
      for (const fieldToken of tokens) {
        for (const candidate of SURVEY_TOKENS[key] as readonly string[]) {
          const score = scoreToken(fieldToken, candidate);
          if (!score) continue;
          // Same quality of match: the shorter field name is the more
          // specific one, so "Cleaning Timeline" wins over "What Is Your
          // Timeline For The Window Cleaning".
          const better =
            score > best[key].score ||
            (score === best[key].score && fieldToken.length < best[key].length);
          if (better) {
            best[key] = { score, length: fieldToken.length };
            out[key] = text;
          }
        }
      }
    }
  }
  return out;
}

// Street, city, then state and zip together. Whatever GHL is missing is left
// out rather than printed as a gap, so a contact with only a city reads as
// "Berkley, MI" and not ", Berkley, MI ".
export function oneLineAddress(contact: SheetContact): string {
  const stateZip = [contact.state, contact.postalCode]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return [contact.address1, contact.city, stateZip]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

export function contactName(contact: SheetContact): string {
  const joined = [contact.firstName, contact.lastName]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return (contact.contactName ?? "").trim() || joined;
}

export function toSheetRow(
  contact: SheetContact,
  tokensById: Map<string, string[]>,
  appointments: WhenEvent[],
  now: number,
): SheetLeadRow {
  const survey = surveyAnswers(contact, tokensById);
  const attribution = firstTouchAttribution(contact.attributions);
  const appt = pickAppointment(appointments, now);

  return {
    contactId: contact.id,
    dateIn: (contact.dateAdded ?? "").trim(),
    name: contactName(contact),
    phone: (contact.phone ?? "").trim(),
    email: (contact.email ?? "").trim(),
    address: oneLineAddress(contact),
    homeType: survey.homeType,
    timeline: survey.timeline,
    offer: survey.offer,
    source: (contact.source ?? "").trim(),
    campaign: attribution?.campaignName ?? "",
    ad: attribution?.adName ?? "",
    apptId: appt?.id ?? "",
    apptAt: appt?.startTime ?? "",
    apptTitle: appt?.title ?? "",
  };
}

// Newest first. The sheet inserts new rows at the top, so this is the order
// they arrive in and the order they stay in.
export function buildSheetRows(
  contacts: SheetContact[],
  defs: CustomFieldDef[],
  appointmentsByContact: Map<string, WhenEvent[]>,
  now: number,
): SheetLeadRow[] {
  const tokensById = fieldTokens(defs);
  const rows = contacts
    .filter((c) => c?.id)
    .map((c) => toSheetRow(c, tokensById, appointmentsByContact.get(c.id) ?? [], now));

  rows.sort((a, b) => {
    const at = Date.parse(a.dateIn);
    const bt = Date.parse(b.dateIn);
    // A contact with no dateAdded sorts last rather than to the top, where it
    // would look like the newest lead of the day.
    if (!Number.isFinite(at)) return 1;
    if (!Number.isFinite(bt)) return -1;
    return bt - at;
  });
  return rows;
}
