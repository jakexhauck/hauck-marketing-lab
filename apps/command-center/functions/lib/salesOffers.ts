// The offers Jake puts on the table, and what was actually quoted.
//
// Every one of them is a range ("5 to 10%", "$99 to $250 an appointment"), and
// most come in two shapes, with a setup fee and without. Recording "performance
// based" and stopping there would lose the only part worth knowing later:
// whether the 7% closes better than the 10%, and whether charging the setup fee
// costs the deal.
//
// So an offer is a VARIANT (one of ten, picked) plus TERMS (the numbers, typed
// where a range exists). Both are stored, and neither is required: an outcome
// recorded in a hurry with no offer at all is still an outcome, and refusing it
// to protect a statistic would be the wrong trade.
//
// Pure: no Supabase, no React. Shared by the endpoint that stores an offer and
// the panel that asks for it, so the two can never disagree about what the
// terms of a variant are.

// What a number on an offer means, which decides how it is drawn and what is
// sensible to type.
export type OfferUnit = "money" | "percent" | "days" | "count";

export interface OfferTermDef {
  key: string;
  label: string;
  unit: OfferUnit;
  // What Jake usually says. Shown as the box's placeholder, never stored on his
  // behalf: a default that saved itself would fill a year of calls with a
  // number nobody actually quoted.
  typical: number;
}

export type OfferFamilyId =
  | "free_trial"
  | "performance"
  | "pay_per_lead"
  | "pay_per_appointment"
  | "paid_in_full"
  | "retainer";

export interface OfferFamilyDef {
  id: OfferFamilyId;
  label: string;
}

// What signing THIS offer actually collects, which decides which money boxes
// the close panel asks for.
//
// The panel used to ask all three on every close, which was right when there
// was one offer and is wrong now: a fully performance-based deal takes nothing
// at signing, so a Monthly box beside it is a box whose only possible honest
// answer is blank. Worse, a leftover figure in one is revenue on a deal that
// never had any.
//
//   monthly  a recurring fee. Only the retainers have one.
//   months   the term that recurring fee runs for.
//   cash     money that changed hands on the call: a setup fee, an upfront, or
//            the whole thing paid in full.
export type OfferCollects = "monthly" | "months" | "cash";

export interface OfferVariantDef {
  id: string;
  family: OfferFamilyId;
  // How it reads on the button. Written the way Jake says it out loud.
  label: string;
  terms: OfferTermDef[];
  // Which money boxes a close on this offer should ask for. Empty means it
  // takes nothing at signing, which is the whole point of half of them.
  collects: OfferCollects[];
  // What to call the cash box on this offer. A setup fee and a paid-in-full are
  // both "cash collected" to the database and are not the same sentence to a
  // person.
  cashLabel?: string;
}

export const OFFER_FAMILIES: OfferFamilyDef[] = [
  { id: "free_trial", label: "Free trial" },
  { id: "performance", label: "Performance based" },
  { id: "pay_per_lead", label: "Pay per lead" },
  { id: "pay_per_appointment", label: "Pay per appointment" },
  { id: "paid_in_full", label: "Paid in full" },
  { id: "retainer", label: "Monthly retainer" },
];

// In the order Jake wrote them. The id is stored, so renaming a label later is
// free and reordering this list changes nothing about the history.
export const OFFER_VARIANTS: OfferVariantDef[] = [
  {
    id: "free_trial",
    family: "free_trial",
    label: "Free, they cover ad spend",
    terms: [{ key: "days", label: "Days", unit: "days", typical: 14 }],
    // Nothing at all. They pay Meta, not us.
    collects: [],
  },

  {
    id: "performance_no_setup",
    family: "performance",
    label: "$0 setup, then a cut of each new client",
    terms: [{ key: "rate", label: "Cut", unit: "percent", typical: 10 }],
    // The entire point of the offer: no money changes hands at signing.
    collects: [],
  },
  {
    id: "performance_setup",
    family: "performance",
    label: "Setup fee, then a cut of each new client",
    terms: [
      { key: "setup", label: "Setup", unit: "money", typical: 250 },
      { key: "rate", label: "Cut", unit: "percent", typical: 10 },
    ],
    collects: ["cash"],
    cashLabel: "Setup collected",
  },

  {
    id: "ppl_no_upfront",
    family: "pay_per_lead",
    label: "$0 upfront, then per lead",
    terms: [{ key: "perLead", label: "Per lead", unit: "money", typical: 50 }],
    collects: [],
  },
  {
    id: "ppl_upfront",
    family: "pay_per_lead",
    label: "Upfront, then per lead",
    terms: [
      { key: "upfront", label: "Upfront", unit: "money", typical: 50 },
      { key: "perLead", label: "Per lead", unit: "money", typical: 50 },
    ],
    collects: ["cash"],
    cashLabel: "Upfront collected",
  },

  {
    id: "ppa_no_upfront",
    family: "pay_per_appointment",
    label: "$0 upfront, then per appointment",
    terms: [{ key: "perAppt", label: "Per appt", unit: "money", typical: 150 }],
    collects: [],
  },
  {
    id: "ppa_upfront",
    family: "pay_per_appointment",
    label: "Upfront, then per appointment",
    terms: [
      { key: "upfront", label: "Upfront", unit: "money", typical: 150 },
      { key: "perAppt", label: "Per appt", unit: "money", typical: 150 },
    ],
    collects: ["cash"],
    cashLabel: "Upfront collected",
  },

  {
    id: "paid_in_full",
    family: "paid_in_full",
    label: "Paid in full for 90 days, ROI guarantee",
    terms: [{ key: "total", label: "Total", unit: "money", typical: 3000 }],
    // The whole fee on the call. No monthly: it is bought outright, and
    // recording $1,000 a month for three months would invent a retainer that
    // does not exist and put it in a monthly revenue figure.
    collects: ["cash"],
    cashLabel: "Paid today",
  },

  {
    id: "retainer_no_guarantee",
    family: "retainer",
    label: "Monthly, no guarantee",
    terms: [{ key: "monthly", label: "A month", unit: "money", typical: 1500 }],
    collects: ["monthly", "months", "cash"],
  },
  {
    id: "retainer_guarantee",
    family: "retainer",
    label: "Monthly for a set number of appointments, refund on the shortfall",
    terms: [
      { key: "monthly", label: "A month", unit: "money", typical: 1500 },
      { key: "appointments", label: "Appts", unit: "count", typical: 15 },
      { key: "refundPerAppt", label: "Back each", unit: "money", typical: 100 },
    ],
    collects: ["monthly", "months", "cash"],
  },
];

// Every money box, which is what a close asks for when no offer was picked.
// Not knowing which offer it was is not the same as knowing it took nothing,
// and hiding the boxes on that basis would quietly lose a retainer.
const ALL_COLLECTS: OfferCollects[] = ["monthly", "months", "cash"];

export function collectsFor(variantId: unknown): OfferCollects[] {
  const variant = offerVariant(variantId);
  return variant ? variant.collects : ALL_COLLECTS;
}

// What to call the cash box on a given offer.
export function cashLabelFor(variantId: unknown): string {
  return offerVariant(variantId)?.cashLabel ?? "Cash today";
}

export const OFFER_VARIANT_IDS = OFFER_VARIANTS.map((v) => v.id);

export function offerVariant(id: unknown): OfferVariantDef | null {
  return typeof id === "string" ? (OFFER_VARIANTS.find((v) => v.id === id) ?? null) : null;
}

export function variantsOfFamily(family: OfferFamilyId): OfferVariantDef[] {
  return OFFER_VARIANTS.filter((v) => v.family === family);
}

// ===== What is stored =====

export interface StoredOffer {
  variant: string;
  // Only the terms that variant defines, and only the ones actually filled in.
  // A term left blank is absent rather than zero: "he did not write it down" and
  // "he quoted nothing" are different facts, and zero would read as the second.
  terms: Record<string, number>;
}

// The trust boundary for an offer arriving from a browser.
//
// An unknown variant is refused outright. Unknown term keys are DROPPED rather
// than refused, because the honest cause is a browser holding a bundle from
// before a variant's terms changed, and losing one number is better than losing
// the outcome it came with.
export function cleanOffer(variantId: unknown, rawTerms: unknown): StoredOffer | null {
  const variant = offerVariant(variantId);
  if (!variant) return null;

  const terms: Record<string, number> = {};
  if (rawTerms && typeof rawTerms === "object") {
    const source = rawTerms as Record<string, unknown>;
    for (const def of variant.terms) {
      const raw = source[def.key];
      if (raw === undefined || raw === null || raw === "") continue;
      const n = Number(raw);
      // Negative money is not a quote, it is a typo. Zero is allowed: "$0
      // upfront" is a real thing Jake says.
      if (!Number.isFinite(n) || n < 0) continue;
      terms[def.key] = n;
    }
  }

  return { variant: variant.id, terms };
}

// Reading one back off a row. Same shape check in the other direction: a row
// written before a variant was renamed comes back null rather than as a button
// that lights up nothing.
export function parseOffer(variantId: unknown, rawTerms: unknown): StoredOffer | null {
  return cleanOffer(variantId, rawTerms);
}

// ===== Saying it back =====

function unitText(value: number, unit: OfferUnit): string {
  if (unit === "money") return `$${value.toLocaleString("en-US")}`;
  if (unit === "percent") return `${value}%`;
  if (unit === "days") return `${value} days`;
  return String(value);
}

// One line describing what was quoted, for a row, a note or an audit line.
// Falls back to the variant's own label when no numbers were typed, so it
// always says something rather than trailing off.
export function offerSummary(offer: StoredOffer | null): string {
  const variant = offer && offerVariant(offer.variant);
  if (!variant || !offer) return "";

  const parts = variant.terms
    .filter((def) => offer.terms[def.key] !== undefined)
    .map((def) => `${def.label.toLowerCase()} ${unitText(offer.terms[def.key], def.unit)}`);

  const family = OFFER_FAMILIES.find((f) => f.id === variant.family)?.label ?? variant.family;
  return parts.length > 0 ? `${family}: ${parts.join(", ")}` : `${family}: ${variant.label}`;
}
