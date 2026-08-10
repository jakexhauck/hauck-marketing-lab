// Conversion assets: shape and input cleaning (0093, 0095, 0096).
//
// A conversion asset is a page a follow-up text sends a lead to. Every client
// gets the SAME THREE, which is the whole point of this file: not a library to
// pick from, a checklist to fill.
//
//   recent-work        new lead, text 1    proof, before they have met you
//   owner-story        new lead, text 2    who they are hiring, plus the gift
//   unique-mechanism   estimate reminder   their process, named
//
// The first two book. The third does not: it rides along with the estimate
// reminders, so its reader already has an appointment.
//
// THE SMS IS NOT HERE, DELIBERATELY. The follow-up messages are universal now:
// written once, living in GHL, sent to every client's leads. Nothing about the
// message is a per-client decision, so nothing about it is captured here. What
// IS per-client is the page the message points at, and that is all this holds.
//
// The paths are fixed for the same reason. One universal message body carries
// one path; only the domain in front of it changes per client. A per-client
// slug would mean editing the universal message per client, which is the thing
// being removed.
//
// our-work is the odd one and most of the branching below bends around it. The
// lead has already booked, so the page asks for NOTHING: no calendar, no CTA.
// It nurtures. Every "unless the kind is our-work" in this file is that.
//
// Every field is plain text and is rendered as text. The cleaners here are the
// whole trust boundary: they cap length and flatten control characters. There
// is no HTML, no markdown and no sanitizer.
//
// calendar_embed is the one exception and it is deliberate. It is a GHL embed
// snippet, so it IS markup, it is written by an operator (never a client, never
// a lead), and it is only ever emitted into a built page file that a human
// reviews before it ships. It is stored close to verbatim and cleaned only of
// control characters. It must never be rendered into the admin app's own DOM.
//
// The table is still `followup_pages` and the route is still `/followups`. Those
// names are historical. Renaming a live table and a live route buys nothing that
// a comment does not.
//
// Imported by the browser too, so the form and the server cannot disagree about
// what an asset is or how long a field may be.

import { cleanBlock, cleanLine, cleanUrl } from "./adWorkspace";

export { cleanBlock, cleanLine, cleanUrl };

// The three, in send order. Growing this list is a code change on purpose: a
// fourth asset is a change to how every client is worked, not a one-off page
// somebody invented.
export const ASSET_KINDS = ["recent-work", "owner-story", "unique-mechanism"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  "recent-work": "Recent Work",
  "owner-story": "Owner Story",
  "unique-mechanism": "Unique Mechanism",
};

// When the text that points here goes out. Shown on the slot cards, because
// "which of these three is this" is answered by when it is sent, not by a name.
export const ASSET_KIND_SENT: Record<AssetKind, string> = {
  "recent-work": "New lead, text 1",
  "owner-story": "New lead, text 2",
  "unique-mechanism": "Estimate reminder",
};

// The universal text that sends the lead here, word for word.
//
// These are CONSTANTS, not fields. The messages are written once and live in
// GHL, identical for every client, which is the entire reason this app stopped
// collecting copy. They are here so the PAGE can be built to pay off exactly
// what the message promised: a page whose first screen answers a different
// question than the text asked is a bounced click.
//
// Change one here only when it has already been changed in GHL.
export const ASSET_KIND_SMS: Record<AssetKind, string> = {
  "recent-work":
    "Hey {{contact.first_name}}, a lot of companies talk about how great their " +
    "work is but never actually show customers REAL work lol. So here's some of " +
    "our recent work we've gotten done:",
  "owner-story":
    "Yo {{contact.first_name}}, I saw you came to us through facebook and just " +
    "wanted to send you over my personal story and how I started the business. " +
    "P.S there's also a small gift for you on the page:",
  "unique-mechanism":
    "also, since your booked in now. I wanted to send over a page that goes over " +
    "how our process actually works and how we ensure a 100% satisfaction rate " +
    "on ALL of our jobs:",
};

// What the page is FOR, in one line. This is the sentence the built page has to
// pay off, and it is the closest thing to a brief that exists before the
// operator has typed anything.
export const ASSET_KIND_JOB: Record<AssetKind, string> = {
  "recent-work": "Proof, before they have met anybody",
  "owner-story": "Who they are hiring, and the gift they were promised",
  "unique-mechanism": "Their process, named, so nobody else is doing it",
};

// The fixed path, per kind. See the note at the top about why these are not
// per-client.
export const ASSET_KIND_PATHS: Record<AssetKind, string> = {
  "recent-work": "recent-work",
  "owner-story": "meet-the-owner",
  "unique-mechanism": "our-process",
};

// Does this asset try to book anything?
//
// unique-mechanism does not, and that is the single most load-bearing fact in
// this file. It rides along with the ESTIMATE REMINDERS, so everybody reading
// it already has an appointment. A calendar there is at best noise and at worst
// an invitation to move a booking that was already made.
export function asksForBooking(kind: AssetKind): boolean {
  return kind !== "unique-mechanism";
}

// ---------------------------------------------------------------------------

// One job: what it looked like, what we did, and a line about it.
//
// A job is a PAIR. Storing the two photos as two unlabelled rows is how a
// slider ends up cropping the wrong way round with nothing downstream able to
// tell which was which.
export interface Job {
  before: string;
  after: string;
  caption: string;
}

// A review, pasted in by hand. Not pulled from Google: that integration is
// still waiting on approval, and an asset that cannot ship until it lands is an
// asset that does not ship.
export interface Review {
  text: string;
  name: string;
  // 0 means "not given" rather than "zero stars". A review nobody rated still
  // reads fine; a one-star badge on a trust page does not.
  stars: number;
}

// The fixed six. Same questions for every client, so a thin page is visibly
// thin rather than differently shaped.
//
// licensed and insured are yes/no. The other four carry a value, and an empty
// one means "do not put this on the page" rather than "unknown": there is no
// third state worth storing.
export interface Trust {
  licensed: boolean;
  insured: boolean;
  years: string;
  jobsCompleted: string;
  warranty: string;
  serviceArea: string;
}

export const TRUST_FIELDS = [
  { key: "years", label: "Years in business", placeholder: "12" },
  { key: "jobsCompleted", label: "Jobs completed", placeholder: "800+" },
  { key: "warranty", label: "Warranty", placeholder: "2 year workmanship" },
  { key: "serviceArea", label: "Service area", placeholder: "Cape May County" },
] as const;

// The gift. The universal text for the owner story PROMISES something on the
// website, so the page has to hand it over. That makes the offer the only
// required thing on that page besides the owner themselves.
//
// The amount is a field rather than a constant because a client can decide
// their own discount, but it starts where the message says it is.
export const DEFAULT_COUPON_OFFER = "10% off";

// How many jobs each kind draws. Only recent-work carries any: the owner story
// is a person, and the mechanism is a process.
export const JOB_CAP: Record<AssetKind, number> = {
  "recent-work": 5,
  "owner-story": 0,
  "unique-mechanism": 0,
};

// Past six, a trust page is a scroll nobody finishes.
export const REVIEW_CAP = 6;

// Where an uploaded file lands in the bucket. Not part of the data model: the
// url that comes back is what gets stored. This exists so somebody opening the
// Supabase console can tell what they are looking at, and so an arbitrary
// string from a form cannot become a folder name. Anything else becomes
// "extra".
export const UPLOAD_FOLDERS = ["logo", "kit", "owner", "before", "after"] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

// ---------------------------------------------------------------------------

// Where the look comes from. 'default' still asks which colours to use: the
// Willis look is a starting point, not a decision already made.
export const DESIGN_SOURCES = ["website", "kit", "default"] as const;
export type DesignSource = (typeof DESIGN_SOURCES)[number];

export const DESIGN_SOURCE_LABELS: Record<DesignSource, string> = {
  website: "Pull from their website",
  kit: "Use a design kit",
  default: "Default",
};

// Where the colours come from when the look is pulled from a website. Lifting
// a site's palette and being handed exact hexes are different instructions,
// and a page built from the wrong one looks like a different company.
export const COLOR_SOURCES = ["website", "custom"] as const;
export type ColorSource = (typeof COLOR_SOURCES)[number];

export const COLOR_SOURCE_LABELS: Record<ColorSource, string> = {
  website: "Use the colours on their site",
  custom: "Pick colours",
};

// Whether this design source needs the colour question at all.
//
// A design kit IS the answer, so asking after one has been uploaded is asking
// somebody to repeat themselves. A default still asks: a default is a starting
// point, not a decision already made. A website asks only when the operator
// said they want specific colours rather than the site's own.
export function needsColors(source: DesignSource, colorSource: ColorSource): boolean {
  if (source === "kit") return false;
  if (source === "website") return colorSource === "custom";
  return true;
}

export const STATUSES = ["draft", "built", "live"] as const;
export type ConversionAssetStatus = (typeof STATUSES)[number];

export interface ConversionAsset {
  id: string;
  tenantId: string;
  // "" only on a row written before 0096. The wizard always sets one.
  kind: AssetKind | "";
  slug: string;

  designSource: DesignSource;
  designRef: string;
  colorSource: ColorSource;
  colors: string[];
  designKitUrl: string;
  logoUrl: string;

  ownerName: string;
  ownerPhotoUrl: string;
  storyNotes: string;
  // The gift the owner-story text promised. See DEFAULT_COUPON_OFFER.
  couponOffer: string;
  couponCode: string;
  couponTerms: string;
  // Blank means the skill invents one. See the note on contentIsComplete.
  mechanismName: string;
  mechanismNotes: string;
  jobs: Job[];
  reviews: Review[];
  trust: Trust;

  appointmentType: string;
  calendarEmbed: string;

  status: ConversionAssetStatus;
  // True when a built page body exists. The body itself is never sent to the
  // browser: it is a whole file, the admin app has no use for it, and shipping
  // it would put a page's full source into every list response.
  hasSource: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

// Caps. Generous enough that nobody meets them writing normally, tight enough
// that a paste of a whole webpage cannot land in the table.
export const LIMITS = {
  slug: 120,
  designRef: 500,
  ownerName: 120,
  // Bullet notes to steer the writing, not the finished story. Four thousand is
  // several screens of notes and far past what anybody types.
  storyNotes: 4000,
  couponOffer: 80,
  couponCode: 40,
  couponTerms: 300,
  mechanismName: 120,
  mechanismNotes: 4000,
  caption: 200,
  reviewText: 800,
  reviewName: 120,
  trustValue: 200,
  appointmentType: 200,
  // A GHL calendar embed is an iframe plus a script. 20k is far past any real
  // one and exists only so a malformed body cannot write an unbounded column.
  calendarEmbed: 20000,
  colors: 8,
  // The hard ceiling on the jobs array, independent of the per-kind cap. The
  // per-kind cap is the rule; this is the backstop on a hand-written body.
  jobs: 5,
  reviews: REVIEW_CAP,
  // A built page file. The Willis funnel's quote.js is 61k, and an asset page
  // is a fraction of that, but the cap has to clear the largest thing that
  // could legitimately be built.
  pageSource: 400000,
} as const;

// The slug is the page's identity on the client's GHL domain, so it is
// normalised hard rather than trusted: lowercase, words joined by single
// hyphens, nothing else survives. A leading slash is accepted because that is
// how it gets pasted.
export function cleanSlug(value: unknown): string {
  return cleanLine(value, LIMITS.slug)
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.slug);
}

// A colour, stored as a 6-digit hex. Anything else is dropped rather than
// saved: a colour that does not parse is a swatch that renders as black and
// reads as the app losing the value.
export function cleanColor(value: unknown): string {
  const raw = cleanLine(value, 32).replace(/^#/, "");
  // #abc is what a lot of brand docs use. Expand it rather than reject it.
  const expanded = /^[0-9a-f]{3}$/i.test(raw)
    ? raw
        .split("")
        .map((c) => c + c)
        .join("")
    : raw;
  return /^[0-9a-f]{6}$/i.test(expanded) ? `#${expanded.toLowerCase()}` : "";
}

export function cleanColors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.slice(0, LIMITS.colors)) {
    const color = cleanColor(raw);
    // The same colour twice is a double-click, not two decisions.
    if (color && !seen.has(color)) {
      seen.add(color);
      out.push(color);
    }
  }
  return out;
}

// A job counts when it has BOTH photos. A caption is optional; half a pair is
// not a job, it is an upload that was interrupted.
export function jobIsWhole(job: Job): boolean {
  return !!job.before && !!job.after;
}

export function wholeJobs(jobs: Job[]): Job[] {
  return jobs.filter(jobIsWhole);
}

// Half-filled rows SURVIVE cleaning. The operator uploads the before photo,
// the row saves, and they upload the after a moment later; dropping the
// incomplete row on the way through would delete the first upload in front of
// them. Completeness is judged by jobIsWhole at the point it matters.
export function cleanJobs(value: unknown): Job[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, LIMITS.jobs)
    .map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      return {
        before: cleanUrl(row.before),
        after: cleanUrl(row.after),
        caption: cleanLine(row.caption, LIMITS.caption),
      };
    })
    // A row with neither photo nor caption is a row somebody added and left.
    .filter((j) => j.before || j.after || j.caption);
}

export function cleanReviews(value: unknown): Review[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, LIMITS.reviews)
    .map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      const stars = typeof row.stars === "number" && Number.isFinite(row.stars)
        ? Math.min(Math.max(Math.round(row.stars), 0), 5)
        : 0;
      return {
        text: cleanBlock(row.text, LIMITS.reviewText),
        name: cleanLine(row.name, LIMITS.reviewName),
        stars,
      };
    })
    // The words are the review. A name and a star count with nothing to read is
    // a rating, and a rating on its own persuades nobody.
    .filter((r) => r.text);
}

export const EMPTY_TRUST: Trust = {
  licensed: false,
  insured: false,
  years: "",
  jobsCompleted: "",
  warranty: "",
  serviceArea: "",
};

export function cleanTrust(value: unknown): Trust {
  const row = (value ?? {}) as Record<string, unknown>;
  return {
    licensed: row.licensed === true,
    insured: row.insured === true,
    years: cleanLine(row.years, LIMITS.trustValue),
    jobsCompleted: cleanLine(row.jobsCompleted, LIMITS.trustValue),
    warranty: cleanLine(row.warranty, LIMITS.trustValue),
    serviceArea: cleanLine(row.serviceArea, LIMITS.trustValue),
  };
}

// Is there anything on the trust strip at all? Used by the preview, which draws
// the strip or leaves it out rather than drawing an empty bar.
export function hasTrust(trust: Trust): boolean {
  return (
    trust.licensed ||
    trust.insured ||
    !!trust.years ||
    !!trust.jobsCompleted ||
    !!trust.warranty ||
    !!trust.serviceArea
  );
}

// The calendar embed. Control characters go, newlines stay, nothing else is
// touched: see the note at the top of this file about why this one is markup.
export function cleanEmbed(value: unknown): string {
  return cleanBlock(value, LIMITS.calendarEmbed);
}

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return list.includes(value as T) ? (value as T) : fallback;
}

// "" is a real answer here, unlike everywhere else: rows written before 0096
// have no kind and the list screen shows them separately rather than guessing.
export function cleanKind(value: unknown): AssetKind | "" {
  return ASSET_KINDS.includes(value as AssetKind) ? (value as AssetKind) : "";
}

export function cleanDesignSource(value: unknown): DesignSource {
  return oneOf(DESIGN_SOURCES, value, "default");
}

export function cleanColorSource(value: unknown): ColorSource {
  return oneOf(COLOR_SOURCES, value, "custom");
}

export function cleanStatus(value: unknown): ConversionAssetStatus {
  return oneOf(STATUSES, value, "draft");
}

// ---------------------------------------------------------------------------

// The wizard's steps. The kind is NOT a step: it is chosen by clicking one of
// the three slot cards, and a screen that asks again is a screen that can
// disagree with the card that was clicked.
const ALL_STEPS = [
  { id: "design", label: "Design" },
  { id: "content", label: "Content" },
  { id: "booking", label: "Booking" },
  { id: "link", label: "Link" },
  { id: "review", label: "Review" },
] as const;

export type WizardStepId = (typeof ALL_STEPS)[number]["id"];
export interface WizardStep {
  id: WizardStepId;
  label: string;
}

// The steps THIS kind asks. our-work books nothing, so Booking is not skipped
// past, it does not exist: four steps, and the rail says four.
export function stepsFor(kind: AssetKind | ""): WizardStep[] {
  return ALL_STEPS.filter((s) => s.id !== "booking" || kind === "" || asksForBooking(kind)).map(
    (s) => ({ id: s.id, label: s.label }),
  );
}

// Has this kind got the content it structurally needs?
//
// Only what BREAKS without it. recent-work needs one whole job to be worth
// opening; the reviews and the trust facts are what make it good, not what make
// it possible. The owner story needs the person AND the gift, because the text
// that sends them there promised the gift by name.
//
// unique-mechanism requires NOTHING, and that is deliberate rather than an
// oversight. The whole point of that page is that it is built out of
// positioning rather than out of assets: the client may have no photos, no
// documented process and nothing to hand over. Everything on that screen is
// steering, and an empty screen still produces a page.
export function contentIsComplete(asset: ConversionAsset): boolean {
  switch (asset.kind) {
    case "recent-work":
      return wholeJobs(asset.jobs).length > 0;
    case "owner-story":
      return (
        !!asset.ownerPhotoUrl &&
        asset.storyNotes.trim().length > 0 &&
        asset.couponOffer.trim().length > 0
      );
    case "unique-mechanism":
      return true;
    default:
      return false;
  }
}

// Whether a step has everything it needs to move on. The wizard reads this for
// its Next button and for the review list, so "what is missing" is answered in
// one place rather than once per screen.
export function stepIsComplete(step: WizardStepId, asset: ConversionAsset): boolean {
  switch (step) {
    case "design": {
      // A kit carries its own look, so the upload IS the answer.
      if (asset.designSource === "kit") return !!asset.designKitUrl;
      if (asset.designSource === "website" && !asset.designRef) return false;
      // Otherwise colours are asked, unless the site's own are being used.
      return !needsColors(asset.designSource, asset.colorSource) || asset.colors.length > 0;
    }
    case "content":
      return contentIsComplete(asset);
    case "booking":
      // Unreachable for our-work, which has no booking step. Answered anyway so
      // a stale index cannot park the Next button on a step it cannot satisfy.
      if (asset.kind && !asksForBooking(asset.kind)) return true;
      return !!asset.appointmentType && !!asset.calendarEmbed;
    case "link":
      return !!asset.slug;
    case "review":
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------

// The database row, as selected. page_source is not in the list select: see
// hasSource on ConversionAsset.
export interface ConversionAssetRow {
  id: string;
  tenant_id: string;
  asset_kind: string;
  slug: string;
  design_source: string;
  design_ref: string;
  design_colors_source: string;
  colors: unknown;
  design_kit_url: string;
  logo_url: string;
  owner_name: string;
  owner_photo_url: string;
  story_notes: string;
  coupon_offer: string;
  coupon_code: string;
  coupon_terms: string;
  mechanism_name: string;
  mechanism_notes: string;
  jobs: unknown;
  reviews: unknown;
  trust: unknown;
  appointment_type: string;
  calendar_embed: string;
  status: string;
  has_source: boolean;
  created_at: string;
  updated_at: string;
}

export const CONVERSION_ASSET_SELECT =
  "id, tenant_id, asset_kind, slug, design_source, design_ref, " +
  "design_colors_source, colors, design_kit_url, logo_url, owner_name, " +
  "owner_photo_url, story_notes, coupon_offer, coupon_code, coupon_terms, " +
  "mechanism_name, mechanism_notes, jobs, reviews, trust, appointment_type, " +
  "calendar_embed, status, has_source, created_at, updated_at";

// Row to API shape. The jsonb columns are cleaned on the way OUT as well as in:
// a row written before a cap changed still has to render, and rendering is not
// the place to discover that it cannot.
export function toConversionAsset(row: ConversionAssetRow): ConversionAsset {
  const kind = cleanKind(row.asset_kind);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    kind,
    // The path is a FUNCTION of the kind, not a stored decision, so a row that
    // predates the fixed paths gets the right one rather than an empty Link
    // step. It persists on the next save.
    slug: row.slug || (kind ? ASSET_KIND_PATHS[kind] : ""),
    designSource: cleanDesignSource(row.design_source),
    designRef: row.design_ref,
    colorSource: cleanColorSource(row.design_colors_source),
    colors: cleanColors(row.colors),
    designKitUrl: row.design_kit_url,
    logoUrl: row.logo_url,
    ownerName: row.owner_name ?? "",
    ownerPhotoUrl: row.owner_photo_url ?? "",
    storyNotes: row.story_notes ?? "",
    couponOffer: row.coupon_offer ?? "",
    couponCode: row.coupon_code ?? "",
    couponTerms: row.coupon_terms ?? "",
    mechanismName: row.mechanism_name ?? "",
    mechanismNotes: row.mechanism_notes ?? "",
    jobs: cleanJobs(row.jobs),
    reviews: cleanReviews(row.reviews),
    trust: cleanTrust(row.trust),
    appointmentType: row.appointment_type,
    calendarEmbed: row.calendar_embed,
    status: cleanStatus(row.status),
    hasSource: row.has_source === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// A brand-new asset of one kind, before anything has been asked. Used by the
// wizard so an unsaved draft and a saved row are the same shape and the panel
// never has to branch on which one it is holding.
//
// The slug is set HERE, from the kind, and never typed. See the note at the top.
export function emptyConversionAsset(tenantId: string, kind: AssetKind): ConversionAsset {
  return {
    id: "",
    tenantId,
    kind,
    slug: ASSET_KIND_PATHS[kind],
    designSource: "default",
    designRef: "",
    colorSource: "custom",
    colors: [],
    designKitUrl: "",
    logoUrl: "",
    ownerName: "",
    ownerPhotoUrl: "",
    storyNotes: "",
    // Pre-filled, because the universal text already told the lead what the
    // gift is. Typing it again per client is asking somebody to restate a
    // decision that has already been made everywhere else.
    couponOffer: kind === "owner-story" ? DEFAULT_COUPON_OFFER : "",
    couponCode: "",
    couponTerms: "",
    mechanismName: "",
    mechanismNotes: "",
    jobs: [],
    reviews: [],
    trust: { ...EMPTY_TRUST },
    appointmentType: "",
    calendarEmbed: "",
    status: "draft",
    hasSource: false,
    createdAt: null,
    updatedAt: null,
  };
}

// What a second asset for the same client inherits from one already filled in.
// The look, the logo, the appointment and the calendar are settled once per
// client, and asking again is asking Jake to repeat himself.
//
// Deliberately NOT carried: the kind, the slug, and every content field. Those
// are the entire difference between the three.
export function carryForward(from: ConversionAsset): Partial<ConversionAsset> {
  return {
    designSource: from.designSource,
    designRef: from.designRef,
    colorSource: from.colorSource,
    colors: from.colors,
    designKitUrl: from.designKitUrl,
    logoUrl: from.logoUrl,
    ownerName: from.ownerName,
    appointmentType: from.appointmentType,
    calendarEmbed: from.calendarEmbed,
  };
}

// What a write may carry. Every field optional: the wizard saves as each step
// is left, so a request naming all of them could overwrite a value the operator
// never reached.
export interface ConversionAssetPatch {
  kind?: string;
  slug?: string;
  designSource?: string;
  designRef?: string;
  colorSource?: string;
  colors?: string[];
  designKitUrl?: string;
  logoUrl?: string;
  ownerName?: string;
  ownerPhotoUrl?: string;
  storyNotes?: string;
  couponOffer?: string;
  couponCode?: string;
  couponTerms?: string;
  mechanismName?: string;
  mechanismNotes?: string;
  jobs?: Job[];
  reviews?: Review[];
  trust?: Trust;
  appointmentType?: string;
  calendarEmbed?: string;
  status?: string;
  pageSource?: string;
}

// Build the column update for a write. Returns only the columns the body
// actually named, so an absent key is left alone rather than blanked.
export function patchColumns(body: ConversionAssetPatch): Record<string, unknown> {
  const update: Record<string, unknown> = {};

  if (body.kind !== undefined) update.asset_kind = cleanKind(body.kind);
  if (body.slug !== undefined) update.slug = cleanSlug(body.slug);
  if (body.designSource !== undefined) update.design_source = cleanDesignSource(body.designSource);
  if (body.designRef !== undefined) update.design_ref = cleanUrl(body.designRef);
  if (body.colorSource !== undefined) {
    update.design_colors_source = cleanColorSource(body.colorSource);
  }
  if (body.colors !== undefined) update.colors = cleanColors(body.colors);
  if (body.designKitUrl !== undefined) update.design_kit_url = cleanUrl(body.designKitUrl);
  if (body.logoUrl !== undefined) update.logo_url = cleanUrl(body.logoUrl);
  if (body.ownerName !== undefined) update.owner_name = cleanLine(body.ownerName, LIMITS.ownerName);
  if (body.ownerPhotoUrl !== undefined) update.owner_photo_url = cleanUrl(body.ownerPhotoUrl);
  if (body.storyNotes !== undefined) {
    update.story_notes = cleanBlock(body.storyNotes, LIMITS.storyNotes);
  }
  if (body.couponOffer !== undefined) {
    update.coupon_offer = cleanLine(body.couponOffer, LIMITS.couponOffer);
  }
  if (body.couponCode !== undefined) {
    update.coupon_code = cleanLine(body.couponCode, LIMITS.couponCode);
  }
  if (body.couponTerms !== undefined) {
    update.coupon_terms = cleanLine(body.couponTerms, LIMITS.couponTerms);
  }
  if (body.mechanismName !== undefined) {
    update.mechanism_name = cleanLine(body.mechanismName, LIMITS.mechanismName);
  }
  if (body.mechanismNotes !== undefined) {
    update.mechanism_notes = cleanBlock(body.mechanismNotes, LIMITS.mechanismNotes);
  }
  if (body.jobs !== undefined) update.jobs = cleanJobs(body.jobs);
  if (body.reviews !== undefined) update.reviews = cleanReviews(body.reviews);
  if (body.trust !== undefined) update.trust = cleanTrust(body.trust);
  if (body.appointmentType !== undefined) {
    update.appointment_type = cleanLine(body.appointmentType, LIMITS.appointmentType);
  }
  if (body.calendarEmbed !== undefined) update.calendar_embed = cleanEmbed(body.calendarEmbed);
  if (body.status !== undefined) update.status = cleanStatus(body.status);
  if (body.pageSource !== undefined) {
    update.page_source = cleanBlock(body.pageSource, LIMITS.pageSource);
  }

  return update;
}
