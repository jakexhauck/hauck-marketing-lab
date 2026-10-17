// A client's brand for the video template (video/build.mjs): every name,
// number, colour and asset the AAG ads had hard-coded.
//
// Read in layers, each one overriding the last:
//
//   1. Generic defaults, named after the client.
//   2. Facts in the client's vault notes (Profile.md, Memory.md): the owner on
//      camera, the Google rating, the ad CTA, the brand assets folder. Jake
//      writes these as he learns them, so they are the source of truth for
//      anything said on screen.
//   3. video/brands/<slug>.json, checked in: the design choices a note does not
//      hold (owner's full name on the card, location, palette, method name).
//   4. brand.json in the client's brand assets folder, written by the Creative
//      Agent when it sets up a new client.
//
// photosDir and logoPath may be relative; they resolve against the assets
// folder (the Creative Agent's work folder for that client, brand/).

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface BrandColors {
  ink: string;
  ink2: string;
  fg: string;
  chrome: string;
  accent: string;
  accentDeep: string;
  star: string;
}

export interface Brand {
  name: string;
  ownerName: string;
  location: string;
  rating: string;
  reviews: string;
  offer: string;
  offerHtml: string;
  cta: string;
  processHtml: string;
  diagChip: string;
  stamp: { big: string; small: string };
  notifMsg: string;
  endcardBg: string;
  hot: string[];
  colors: BrandColors;
  logoPath: string;
  photosDir: string;
}

export interface BrandOptions {
  // The client's vault folder (vault/Clients/<Name>), or null when unknown.
  vaultFolder: string | null;
  // Display name when nothing else gives one.
  name: string;
  brandsDir: string;
  assetsDir: string;
}

export const BRANDS_DIR = join(dirname(fileURLToPath(import.meta.url)), "brands");

// The template's own palette (AAG). A brand that sets no colours looks like AAG.
export const DEFAULT_COLORS: BrandColors = {
  ink: "#061017",
  ink2: "#0c1d27",
  fg: "#f1f7fa",
  chrome: "#c4d0d6",
  accent: "#19c3f0",
  accentDeep: "#0a8fbf",
  star: "#ffc531",
};

function defaults(name: string): Brand {
  return {
    name,
    ownerName: "",
    location: "",
    rating: "5.0",
    reviews: "",
    offer: "Free estimate",
    offerHtml: "Free estimate",
    cta: "Tap Learn More",
    processHtml: name,
    diagChip: "Diagnosis",
    stamp: { big: "FREE", small: "Estimate" },
    notifMsg: "Got your request. We'll be in touch <b>within minutes.</b>",
    endcardBg: "endcard",
    hot: [],
    colors: { ...DEFAULT_COLORS },
    logoPath: "logo.png",
    photosDir: "photos",
  };
}

const readOr = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : "");

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The on-screen facts in a client's vault notes. Matches the way Jake writes
 * them in Memory.md ("Owner on camera is **Ryan**", "**4.9 stars from 120+
 * reviews**", 'Ad CTA: **"Tap Learn More for a free same-day estimate."**',
 * "Brand assets (...): `G:\...\Photos`"). Anything not found is left out.
 */
export function vaultFacts(text: string): Partial<Brand> {
  const out: Partial<Brand> = {};
  const owner = /owner on camera is \*\*([^*]+)\*\*/i.exec(text);
  if (owner) out.ownerName = owner[1].trim();
  const rating = /(\d(?:\.\d)?)\s*stars?\s+from\s+([\d,]+\+?)\s+(?:google\s+)?reviews/i.exec(text);
  if (rating) {
    out.rating = rating[1].includes(".") ? rating[1] : `${rating[1]}.0`;
    out.reviews = rating[2];
  }
  const cta = /ad cta:\s*\*\*"?([^"*]+?)"?\*\*/i.exec(text);
  if (cta) {
    const line = cta[1].trim().replace(/[.!]+$/, "");
    const split = /^(.*?)\s+for\s+(?:an?\s+)?(.+)$/i.exec(line);
    if (split) {
      out.cta = split[1];
      out.offer = cap(split[2]);
      out.offerHtml = out.offer;
    } else {
      out.cta = line;
    }
  }
  const assets = /brand assets[^:\n]*:\s*`([^`]+)`/i.exec(text);
  if (assets) out.photosDir = assets[1].trim();
  return out;
}

function readJson(file: string): Partial<Brand> {
  if (!existsSync(file)) return {};
  const v = JSON.parse(readFileSync(file, "utf8"));
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Partial<Brand>) : {};
}

function merge(base: Brand, over: Partial<Brand>): Brand {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined || v === null) continue;
    if (k === "colors" || k === "stamp") (out as any)[k] = { ...(base as any)[k], ...(v as object) };
    else (out as any)[k] = v;
  }
  return out;
}

export function brandFor(slug: string, opts: BrandOptions): Brand {
  let b = defaults(opts.name);
  if (opts.vaultFolder) {
    const notes = [readOr(join(opts.vaultFolder, "Profile.md")), readOr(join(opts.vaultFolder, "Memory.md"))].join("\n");
    b = merge(b, vaultFacts(notes));
  }
  b = merge(b, readJson(join(opts.brandsDir, `${slug}.json`)));
  b = merge(b, readJson(join(opts.assetsDir, "brand.json")));
  const at = (p: string) => (isAbsolute(p) ? p : resolve(opts.assetsDir, p));
  return { ...b, logoPath: at(b.logoPath), photosDir: at(b.photosDir) };
}
