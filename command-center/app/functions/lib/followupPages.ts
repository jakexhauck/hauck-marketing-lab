// SMS follow-up asset pages: shape and input cleaning (0093).
//
// The page an SMS sends a lead to when they came in from a Facebook ad and did
// NOT book. The wizard at /admin/fulfillment/ghl?sub=follow-ups writes these
// rows; the followup-page skill reads one and builds the served file.
//
// The order of the fields here is the order the wizard asks for them, and that
// order is the whole design: client, then which follow-up, then the SMS. The
// APPROVED SMS decides the page type, so page_type is derived and never asked
// for on its own. Nothing about design or assets is requested until the message
// is signed off, because the page exists to pay off exactly what it promised.
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
// Imported by the browser too, so the form and the server cannot disagree about
// what a page is or how long a field may be.

import { cleanBlock, cleanLine, cleanUrl } from "./adWorkspace";

export { cleanBlock, cleanLine, cleanUrl };

// Which follow-up sequence the page belongs to.
//
// new-leads gets exactly TWO asset sends and no more. That cap is real: it is
// how the sequence is built in GHL, and a third page would have no step to be
// sent from. estimate-assets is not capped and uses step for ordering only.
export const FOLLOWUP_TYPES = ["new-leads", "estimate-assets"] as const;
export type FollowupType = (typeof FOLLOWUP_TYPES)[number];

export const FOLLOWUP_TYPE_LABELS: Record<FollowupType, string> = {
  "new-leads": "New leads coming in",
  "estimate-assets": "Estimate assets",
};

// How many asset sends each sequence has. null is "as many as the work needs".
export const FOLLOWUP_STEP_CAP: Record<FollowupType, number | null> = {
  "new-leads": 2,
  "estimate-assets": null,
};

// The page type library. The approved SMS picks one; the wizard never asks.
// Growing this list is a code change on purpose, so a one-off page has to earn
// a name before it becomes a category.
export const PAGE_TYPES = [
  "objection-killer",
  "recent-job",
  "how-it-works",
  "pricing-transparency",
  "owner-story",
  "guarantee",
  "seasonal-urgency",
] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  "objection-killer": "Objection killer",
  "recent-job": "Recent job near them",
  "how-it-works": "How it works",
  "pricing-transparency": "Pricing transparency",
  "owner-story": "Owner story",
  guarantee: "Guarantee",
  "seasonal-urgency": "Seasonal urgency",
};

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
export function needsColors(
  source: DesignSource,
  colorSource: ColorSource,
): boolean {
  if (source === "kit") return false;
  if (source === "website") return colorSource === "custom";
  return true;
}

// What the page draws. This is the question the asset step is really asking,
// and every slot below follows from the answer.
export const MEDIA_TREATMENTS = ["photo", "before-after", "gallery", "video"] as const;
export type MediaTreatment = (typeof MEDIA_TREATMENTS)[number];

export const MEDIA_TREATMENT_LABELS: Record<MediaTreatment, string> = {
  photo: "One photo",
  "before-after": "Before / after slider",
  gallery: "Photo gallery",
  video: "Video",
};

// A named place a file goes. The slot is the whole point: a before/after pair
// stored as two unlabelled rows is a slider that can crop the wrong way round,
// and nothing downstream can tell which was which.
export const ASSET_SLOTS = [
  "hero",
  "before",
  "after",
  "gallery",
  "video",
  "poster",
  "extra",
] as const;
export type AssetSlot = (typeof ASSET_SLOTS)[number];

export interface SlotSpec {
  slot: AssetSlot;
  label: string;
  required: boolean;
  // "image" is uploaded; "url" is pasted (a video lives on YouTube or Vimeo,
  // not in our bucket).
  input: "image" | "url";
}

// The smallest gallery worth calling a gallery. Two photos is a pair.
export const GALLERY_MINIMUM = 3;

// The named slots a treatment asks for, in the order they are asked.
export function slotsFor(treatment: MediaTreatment): SlotSpec[] {
  switch (treatment) {
    case "before-after":
      // Order matters and is stated out loud. The first is what it looked
      // like, the second is what we did.
      return [
        { slot: "before", label: "Before photo", required: true, input: "image" },
        { slot: "after", label: "After photo", required: true, input: "image" },
      ];
    case "gallery":
      return [];
    case "video":
      return [
        { slot: "video", label: "Video link", required: true, input: "url" },
        { slot: "poster", label: "Poster image", required: false, input: "image" },
      ];
    case "photo":
    default:
      return [{ slot: "hero", label: "Hero photo", required: false, input: "image" }];
  }
}

// What the step says it needs, in a sentence. The operator should never have
// to infer the count from the number of boxes on screen.
export function requirementText(treatment: MediaTreatment): string {
  switch (treatment) {
    case "before-after":
      return "This page needs 2 photos: the before, then the after.";
    case "gallery":
      return `This page needs at least ${GALLERY_MINIMUM} photos.`;
    case "video":
      return "This page needs a video link. A poster image is optional.";
    case "photo":
    default:
      return "This page needs 1 photo.";
  }
}

export const STATUSES = ["draft", "built", "live"] as const;
export type FollowupStatus = (typeof STATUSES)[number];

export interface FollowupAsset {
  slot: AssetSlot;
  url: string;
  label: string;
}

// The assets filling one slot, in insertion order. Gallery and extra hold
// many; every other slot holds one.
export function assetsInSlot(assets: FollowupAsset[], slot: AssetSlot): FollowupAsset[] {
  return assets.filter((a) => a.slot === slot);
}

// Has this treatment got everything it structurally needs?
//
// Only the ones that BREAK without it are enforced: a slider with one photo
// has nothing to slide, a three-minimum gallery with two is a pair, and a
// video block with no link is an empty box. A single hero photo is optional,
// because a page can legitimately ship on the logo alone.
export function mediaIsComplete(
  treatment: MediaTreatment,
  assets: FollowupAsset[],
): boolean {
  switch (treatment) {
    case "before-after":
      return (
        assetsInSlot(assets, "before").length > 0 && assetsInSlot(assets, "after").length > 0
      );
    case "gallery":
      return assetsInSlot(assets, "gallery").length >= GALLERY_MINIMUM;
    case "video":
      return assetsInSlot(assets, "video").length > 0;
    case "photo":
    default:
      return true;
  }
}

export interface FollowupPage {
  id: string;
  tenantId: string;
  followupType: FollowupType;
  step: number;
  slug: string;
  smsBody: string;
  pageType: PageType | "";
  designSource: DesignSource;
  designRef: string;
  colorSource: ColorSource;
  colors: string[];
  designKitUrl: string;
  logoUrl: string;
  mediaTreatment: MediaTreatment;
  assets: FollowupAsset[];
  appointmentType: string;
  calendarEmbed: string;
  status: FollowupStatus;
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
  // An SMS is 160 characters a segment. This is not a hard SMS limit, it is a
  // ceiling on what can be stored: the wizard warns about segments separately.
  sms: 1200,
  slug: 120,
  designRef: 500,
  appointmentType: 200,
  assetLabel: 200,
  // A GHL calendar embed is an iframe plus a script. 20k is far past any real
  // one and exists only so a malformed body cannot write an unbounded column.
  calendarEmbed: 20000,
  colors: 8,
  assets: 24,
  // A built page file. The Willis funnel's quote.js is 61k, and a follow-up
  // page is a fraction of that, but the cap has to clear the largest thing
  // that could legitimately be built.
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

export function cleanAssets(value: unknown): FollowupAsset[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, LIMITS.assets)
    .map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      const slot = ASSET_SLOTS.includes(row.slot as AssetSlot)
        ? (row.slot as AssetSlot)
        : "extra";
      return {
        slot,
        url: cleanUrl(row.url),
        label: cleanLine(row.label, LIMITS.assetLabel),
      };
    })
    // No url is an upload that never finished. A label alone points at nothing
    // and would render as a gap in the built page.
    .filter((a) => a.url);
}

// The calendar embed. Control characters go, newlines stay, nothing else is
// touched: see the note at the top of this file about why this one is markup.
export function cleanEmbed(value: unknown): string {
  return cleanBlock(value, LIMITS.calendarEmbed);
}

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return list.includes(value as T) ? (value as T) : fallback;
}

export function cleanFollowupType(value: unknown): FollowupType {
  return oneOf(FOLLOWUP_TYPES, value, "new-leads");
}

export function cleanDesignSource(value: unknown): DesignSource {
  return oneOf(DESIGN_SOURCES, value, "default");
}

export function cleanColorSource(value: unknown): ColorSource {
  return oneOf(COLOR_SOURCES, value, "custom");
}

export function cleanMediaTreatment(value: unknown): MediaTreatment {
  return oneOf(MEDIA_TREATMENTS, value, "photo");
}

export function cleanStatus(value: unknown): FollowupStatus {
  return oneOf(STATUSES, value, "draft");
}

export function cleanPageType(value: unknown): PageType | "" {
  return PAGE_TYPES.includes(value as PageType) ? (value as PageType) : "";
}

// The step a page sits at in its sequence, clamped to what that sequence has.
// A new-leads page can only ever be 1 or 2, so a body asking for 7 is corrected
// rather than rejected: the wizard's Next button is what should have stopped
// it, and failing the save here would lose everything already typed.
export function cleanStep(value: unknown, type: FollowupType): number {
  const raw = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 1;
  const cap = FOLLOWUP_STEP_CAP[type];
  const max = cap ?? 99;
  return Math.min(Math.max(raw, 1), max);
}

// Which step a new page should take: the first free one in the sequence, or
// the cap when the sequence is already full. The wizard uses this to open page
// two straight after page one without asking.
export function nextStep(existing: FollowupPage[], type: FollowupType): number {
  const used = new Set(existing.filter((p) => p.followupType === type).map((p) => p.step));
  const cap = FOLLOWUP_STEP_CAP[type] ?? 99;
  for (let step = 1; step <= cap; step += 1) {
    if (!used.has(step)) return step;
  }
  return cap;
}

// Is this sequence full? new-leads gets two asset sends and the wizard says so
// rather than letting a third be started and then failing to place it.
export function sequenceIsFull(existing: FollowupPage[], type: FollowupType): boolean {
  const cap = FOLLOWUP_STEP_CAP[type];
  if (cap === null) return false;
  return existing.filter((p) => p.followupType === type).length >= cap;
}

// The wizard's steps, in the order they are asked. Exported so the panel and
// its tests cannot disagree about what the flow is.
export const WIZARD_STEPS = [
  { id: "client", label: "Client" },
  { id: "type", label: "Follow-up" },
  { id: "sms", label: "The message" },
  { id: "design", label: "Design" },
  { id: "assets", label: "Assets" },
  { id: "booking", label: "Booking" },
  { id: "slug", label: "Slug" },
  { id: "review", label: "Review" },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

// Whether a step has everything it needs to move on. The wizard reads this for
// its Next button and for the review list, so "what is missing" is answered in
// one place rather than once per screen.
export function stepIsComplete(step: WizardStepId, draft: FollowupPage): boolean {
  switch (step) {
    case "client":
      return !!draft.tenantId;
    case "type":
      return !!draft.followupType;
    // The message is the gate. Nothing downstream is asked until it exists,
    // because the approved SMS is what decides the page type.
    case "sms":
      return draft.smsBody.trim().length > 0 && !!draft.pageType;
    case "design": {
      // A kit carries its own look, so the upload IS the answer.
      if (draft.designSource === "kit") return !!draft.designKitUrl;
      if (draft.designSource === "website" && !draft.designRef) return false;
      // Otherwise colours are asked, unless the site's own are being used.
      return !needsColors(draft.designSource, draft.colorSource) || draft.colors.length > 0;
    }
    case "assets":
      // Only what the chosen treatment structurally needs. A single hero photo
      // stays optional; a slider missing half of its pair does not.
      return mediaIsComplete(draft.mediaTreatment, draft.assets);
    case "booking":
      return !!draft.appointmentType && !!draft.calendarEmbed;
    case "slug":
      return !!draft.slug;
    case "review":
      return true;
    default:
      return false;
  }
}

// GSM-7 segments are 160 characters, 153 once a message is concatenated. A
// message carrying an emoji or a curly quote is UCS-2 instead: 70 and 67. The
// wizard shows this so a follow-up does not quietly cost three sends.
//
// Merge fields are NOT expanded here. {{contact.first_name}} is 24 characters
// in the box and a real name at send time, so the count shown is a worst case
// and is labelled as an estimate on screen.
export function smsSegments(body: string): { chars: number; segments: number; unicode: boolean } {
  const chars = [...body].length;
  // Anything outside the GSM-7 basic set forces the whole message to UCS-2.
  // Testing for non-ASCII is the honest approximation: it catches every emoji
  // and smart quote, and over-reports only for a handful of GSM-7 extras.
  const unicode = [...body].some((ch) => (ch.codePointAt(0) ?? 0) > 127);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  if (chars === 0) return { chars: 0, segments: 0, unicode };
  const segments = chars <= single ? 1 : Math.ceil(chars / multi);
  return { chars, segments, unicode };
}

// The database row, as selected. page_source is not in the list select: see
// hasSource on FollowupPage.
export interface FollowupPageRow {
  id: string;
  tenant_id: string;
  followup_type: string;
  step: number;
  slug: string;
  sms_body: string;
  page_type: string;
  design_source: string;
  design_ref: string;
  design_colors_source: string;
  colors: unknown;
  design_kit_url: string;
  logo_url: string;
  media_treatment: string;
  assets: unknown;
  appointment_type: string;
  calendar_embed: string;
  status: string;
  has_source: boolean;
  created_at: string;
  updated_at: string;
}

export const FOLLOWUP_PAGE_SELECT =
  "id, tenant_id, followup_type, step, slug, sms_body, page_type, " +
  "design_source, design_ref, design_colors_source, colors, design_kit_url, " +
  "logo_url, media_treatment, assets, appointment_type, " +
  "calendar_embed, status, has_source, created_at, updated_at";

// Row to API shape. The jsonb columns are cleaned on the way OUT as well as in:
// a row written before a cap changed still has to render, and rendering is not
// the place to discover that it cannot.
export function toFollowupPage(row: FollowupPageRow): FollowupPage {
  const followupType = cleanFollowupType(row.followup_type);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    followupType,
    step: cleanStep(row.step, followupType),
    slug: row.slug,
    smsBody: row.sms_body,
    pageType: cleanPageType(row.page_type),
    designSource: cleanDesignSource(row.design_source),
    designRef: row.design_ref,
    colorSource: cleanColorSource(row.design_colors_source),
    colors: cleanColors(row.colors),
    designKitUrl: row.design_kit_url,
    logoUrl: row.logo_url,
    mediaTreatment: cleanMediaTreatment(row.media_treatment),
    assets: cleanAssets(row.assets),
    appointmentType: row.appointment_type,
    calendarEmbed: row.calendar_embed,
    status: cleanStatus(row.status),
    hasSource: row.has_source === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// A brand-new page, before anything has been asked. Used by the wizard so an
// unsaved draft and a saved row are the same shape and the panel never has to
// branch on which one it is holding.
export function emptyFollowupPage(tenantId: string, step = 1): FollowupPage {
  return {
    id: "",
    tenantId,
    followupType: "new-leads",
    step,
    slug: "",
    smsBody: "",
    pageType: "",
    designSource: "default",
    designRef: "",
    colorSource: "custom",
    colors: [],
    designKitUrl: "",
    logoUrl: "",
    mediaTreatment: "photo",
    assets: [],
    appointmentType: "",
    calendarEmbed: "",
    status: "draft",
    hasSource: false,
    createdAt: null,
    updatedAt: null,
  };
}

// What a write may carry. Every field optional: the wizard saves as each step
// is left, so a request naming all of them could overwrite a value the operator
// never reached.
export interface FollowupPagePatch {
  followupType?: string;
  step?: number;
  slug?: string;
  smsBody?: string;
  pageType?: string;
  designSource?: string;
  designRef?: string;
  colorSource?: string;
  colors?: string[];
  designKitUrl?: string;
  logoUrl?: string;
  mediaTreatment?: string;
  assets?: FollowupAsset[];
  appointmentType?: string;
  calendarEmbed?: string;
  status?: string;
  pageSource?: string;
}

// Build the column update for a write. Returns only the columns the body
// actually named, so an absent key is left alone rather than blanked.
//
// `type` is the page's follow-up type AFTER this patch, needed because step is
// clamped against it and a single request can change both at once.
export function patchColumns(
  body: FollowupPagePatch,
  type: FollowupType,
): Record<string, unknown> {
  const update: Record<string, unknown> = {};

  if (body.followupType !== undefined) update.followup_type = type;
  if (body.step !== undefined) update.step = cleanStep(body.step, type);
  if (body.slug !== undefined) update.slug = cleanSlug(body.slug);
  if (body.smsBody !== undefined) update.sms_body = cleanBlock(body.smsBody, LIMITS.sms);
  if (body.pageType !== undefined) update.page_type = cleanPageType(body.pageType);
  if (body.designSource !== undefined) update.design_source = cleanDesignSource(body.designSource);
  if (body.designRef !== undefined) update.design_ref = cleanUrl(body.designRef);
  if (body.colorSource !== undefined) {
    update.design_colors_source = cleanColorSource(body.colorSource);
  }
  if (body.colors !== undefined) update.colors = cleanColors(body.colors);
  if (body.designKitUrl !== undefined) update.design_kit_url = cleanUrl(body.designKitUrl);
  if (body.logoUrl !== undefined) update.logo_url = cleanUrl(body.logoUrl);
  if (body.mediaTreatment !== undefined) {
    update.media_treatment = cleanMediaTreatment(body.mediaTreatment);
  }
  if (body.assets !== undefined) update.assets = cleanAssets(body.assets);
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
