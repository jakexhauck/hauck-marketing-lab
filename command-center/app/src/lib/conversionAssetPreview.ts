// What the live preview draws, derived from the draft.
//
// Kept out of the preview component for the same reason the brief is kept out
// of the wizard: these are decisions, not markup.
//
// The one that matters most is previewMedia, which reads a job's named `before`
// and `after` rather than a flat list of photos, so a pair uploaded after-first
// still draws in the order a slider needs. That is the exact failure the pairing
// was built for, and a preview that reproduced it would be worse than none.
//
// The second is previewClose. unique-mechanism does NOT book: it rides along
// with the estimate reminders, so its reader already has an appointment. The
// preview draws what-to-expect where the other two draw a button and a
// calendar, so a page that quietly grew a CTA is visible here before it is
// visible to a lead.

import {
  hasTrust,
  wholeJobs,
  type ConversionAsset,
  type Review,
} from "../../functions/lib/conversionAssets";

// A landing page is a light page. Only the accent and the hero come from the
// client; the paper and the ink are the same on every one of these.
const PAPER = "#fbfaf7";
const INK = "#1c2118";
// Neutral on purpose. When we do not know their colours yet, a grey page is
// honestly unstyled, where a green one is a guess the operator might believe.
const UNKNOWN_ACCENT = "#4a5361";

const DARK_TEXT = "#101211";
const LIGHT_TEXT = "#ffffff";

// The sRGB luminance above which black text beats white. The standard 0.179
// crossover, not a guess: at 0.18 both are close to 4.5:1 and either is legal.
const LUMINANCE_CROSSOVER = 0.179;

// How many empty wells the grid draws when there is nothing in it yet. Three
// reads as "a wall of work goes here"; one reads as a broken image.
const EMPTY_GRID_TILES = 3;

export interface PreviewPalette {
  paper: string;
  ink: string;
  accent: string;
  hero: string;
  onAccent: string;
  onHero: string;
  // False when the colours have not actually been decided: an unread design
  // kit, or "pull them off their website". The preview says so out loud rather
  // than presenting a neutral guess as the client's brand.
  known: boolean;
}

export type PreviewMedia =
  | { kind: "portrait"; photo: string | null }
  | { kind: "grid"; photos: (string | null)[] }
  // The mechanism has no photograph to show. It draws its own steps, which is
  // the honest picture of a page built out of positioning rather than assets.
  | { kind: "steps"; name: string };

export type PreviewClose =
  | { kind: "book"; cta: string; hasCalendar: boolean }
  | { kind: "expect" };

// The gift block on the owner story, or null when there is nothing to hand
// over. The text that sends them there promised this, so an owner story
// drawing without it is a promise the preview can show being broken.
export interface PreviewCoupon {
  offer: string;
  code: string;
  terms: string;
}

// #abc and #aabbcc, in any case, to a lowercase six-digit hex. Anything else is
// null, because a colour we cannot parse is a colour we must not draw.
function normalizeHex(value: string): string | null {
  const raw = value.trim().toLowerCase();
  const short = /^#?([0-9a-f]{3})$/.exec(raw);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const long = /^#?([0-9a-f]{6})$/.exec(raw);
  return long ? `#${long[1]}` : null;
}

function channel(eightBit: number): number {
  const c = eightBit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Black or white, whichever is readable on the given fill. The operator picks
// these colours, so white-on-accent cannot be assumed: their brand yellow with
// white text on it is a button nobody can read.
export function readableOn(fill: string): string {
  const hex = normalizeHex(fill);
  if (!hex) return LIGHT_TEXT;
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > LUMINANCE_CROSSOVER ? DARK_TEXT : LIGHT_TEXT;
}

export function previewPalette(asset: ConversionAsset): PreviewPalette {
  // A kit carries its own colours and nothing has read it; "use their website's
  // colours" is an instruction to the builder, not an answer we hold.
  const deferred =
    asset.designSource === "kit" ||
    (asset.designSource === "website" && asset.colorSource === "website");

  const picked = asset.colors.map(normalizeHex).filter((c): c is string => c !== null);

  const accent = picked[0] ?? UNKNOWN_ACCENT;
  const hero = picked[1] ?? accent;

  return {
    paper: PAPER,
    ink: INK,
    accent,
    hero,
    onAccent: readableOn(accent),
    onHero: readableOn(hero),
    known: !deferred && picked.length > 0,
  };
}

// One line per kind, in the client's voice rather than ours. These are
// placeholders the builder will rewrite, but a real sentence shows the shape of
// the page in a way "Headline" never does.
//
// The owner story uses their name once it is known, because "Meet Dave" is the
// headline that page actually wants and the generic line is a stand-in for it.
export function previewHeadline(asset: ConversionAsset): string {
  switch (asset.kind) {
    case "recent-work":
      return "Work we have just finished near you";
    case "owner-story":
      return asset.ownerName.trim()
        ? `Meet ${asset.ownerName.trim()}`
        : "Who you would actually be hiring";
    case "unique-mechanism":
      return asset.mechanismName.trim() || "How we do this differently";
    default:
      return "Your headline goes here";
  }
}

// "Book your free on-site quote". The appointment type is free text the
// operator typed, so a leading capital is lowercased to keep the sentence
// reading, unless it opens on an acronym that was capitalised on purpose.
export function previewCta(asset: ConversionAsset): string {
  const typed = asset.appointmentType.trim();
  if (!typed) return "Book your appointment";
  const acronym =
    typed.length > 1 && typed[0] === typed[0].toUpperCase() && typed[1] === typed[1].toUpperCase();
  const phrase = acronym ? typed : typed[0].toLowerCase() + typed.slice(1);
  return `Book your ${phrase}`;
}

export function previewMedia(asset: ConversionAsset): PreviewMedia {
  switch (asset.kind) {
    case "owner-story":
      return { kind: "portrait", photo: asset.ownerPhotoUrl || null };

    case "unique-mechanism":
      return { kind: "steps", name: asset.mechanismName.trim() };

    case "recent-work": {
      const done = wholeJobs(asset.jobs).map((j) => j.after);
      // Empty wells rather than nothing at all, so the hole says what goes in
      // it. Once there is one real job the grid stops padding: five wells under
      // one photo reads as four missing files.
      const photos = done.length > 0 ? done : Array<null>(EMPTY_GRID_TILES).fill(null);
      return { kind: "grid", photos };
    }

    default:
      return { kind: "portrait", photo: null };
  }
}

// How the page ends. The entire difference between an asset that converts and
// an asset that nurtures lives in this function.
export function previewClose(asset: ConversionAsset): PreviewClose {
  if (asset.kind === "unique-mechanism") return { kind: "expect" };
  return { kind: "book", cta: previewCta(asset), hasCalendar: !!asset.calendarEmbed };
}

// The gift, on the one page that promised it.
export function previewCoupon(asset: ConversionAsset): PreviewCoupon | null {
  if (asset.kind !== "owner-story" || !asset.couponOffer.trim()) return null;
  return {
    offer: asset.couponOffer.trim(),
    code: asset.couponCode.trim(),
    terms: asset.couponTerms.trim(),
  };
}

// The review the preview shows. One, not all of them: the preview is a sketch
// of the shape, and six stacked quotes in a 300px frame is a scroll test.
export function previewReview(asset: ConversionAsset): Review | null {
  return asset.kind === "recent-work" ? (asset.reviews[0] ?? null) : null;
}

// The trust strip, as short chips in the order they are asked for. Empty when
// nothing is filled in, so the preview leaves the strip out rather than drawing
// an empty bar.
export function previewTrust(asset: ConversionAsset): string[] {
  if (asset.kind !== "recent-work" || !hasTrust(asset.trust)) return [];
  const t = asset.trust;
  const chips: string[] = [];
  if (t.licensed) chips.push("Licensed");
  if (t.insured) chips.push("Insured");
  if (t.years) chips.push(`${t.years} years`);
  if (t.jobsCompleted) chips.push(`${t.jobsCompleted} jobs`);
  if (t.warranty) chips.push(t.warranty);
  if (t.serviceArea) chips.push(t.serviceArea);
  return chips;
}
