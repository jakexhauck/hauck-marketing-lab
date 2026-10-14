// Naming and sorting for creatives uploaded to a client's Meta ad account.
//
// Every creative is made twice, a 1:1 and a 4:5, and both land in the one ad
// account library. Meta has no folders there, so the size lives in the name:
// "spring-promo 1:1.jpg" and "spring-promo 4:5.jpg". This file is the only
// place that shape is written or read, shared by the browser (to plan a drop)
// and the Worker (to list what Meta already holds).
//
// The size is read from the file's pixels, never from its name. A name is a
// hint someone typed; the pixels are what Meta will crop.

export type Ratio = "1:1" | "4:5";
export const RATIOS: Ratio[] = ["1:1", "4:5"];

export type CreativeKind = "image" | "video";

// Exports drift by a pixel or two (1082x1352 is still a 4:5), and a crop that
// far off is invisible in a placement. Wider than this and it is a different
// shape that Meta would crop, which is exactly what the label promises it won't.
const TOLERANCE = 0.02;

export function classifyRatio(width: number, height: number): Ratio | null {
  if (!(width > 0) || !(height > 0)) return null;
  const r = width / height;
  if (Math.abs(r - 1) <= TOLERANCE) return "1:1";
  if (Math.abs(r - 0.8) <= TOLERANCE) return "4:5";
  return null;
}

// A size marker only counts as a whole token: "promo_4x5" and "promo (1:1)"
// are markers, "14x5 deal" is not.
const MARKER = /(^|[\s_\-.([])(?:1\s*[x×:_-]\s*1|4\s*[x×:_-]\s*5)(?=$|[\s_\-.)\]])/gi;

export function baseCreativeName(fileName: string): string {
  const stem = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "").trim();
  const cleaned = stem
    .replace(MARKER, "$1")
    .replace(/[([]\s*[)\]]/g, "")
    .replace(/[\s_\-.]+$/, "")
    .replace(/^[\s_\-.]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || stem;
}

export function extensionOf(fileName: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(fileName);
  return m ? m[1].toLowerCase() : "";
}

export function labelledName(base: string, ratio: Ratio, ext: string): string {
  const e = ext.replace(/^\./, "").toLowerCase();
  return e ? `${base} ${ratio}.${e}` : `${base} ${ratio}`;
}

const LABELLED = /^(.*\S) (1:1|4:5)(?:\.[A-Za-z0-9]{1,5})?$/;

export function parseLabelledName(name: string): { base: string; ratio: Ratio } | null {
  const m = LABELLED.exec(name.trim());
  return m ? { base: m[1], ratio: m[2] as Ratio } : null;
}

// Lookup key for "does Meta already have this one". Case-folded so "Promo" and
// "promo" are one creative rather than two near-identical uploads.
export function creativeKey(base: string, ratio: Ratio): string {
  return `${base.toLowerCase()}|${ratio}`;
}

export interface DroppedFile {
  id: string;
  fileName: string;
  kind: CreativeKind | "other";
  width: number;
  height: number;
}

export type PlanStatus = "ready" | "duplicate" | "bad-ratio" | "clash" | "unsupported";

export interface PlannedFile {
  id: string;
  fileName: string;
  ratio: Ratio | null;
  // The name it goes to Meta under; "" when it will not be uploaded at all.
  name: string;
  status: PlanStatus;
  width: number;
  height: number;
}

export interface PlannedGroup {
  key: string;
  base: string;
  kind: CreativeKind | "other";
  files: PlannedFile[];
  // Sizes this creative still lacks after the drop, counting what Meta holds.
  // Empty for a group with nothing usable in it: a missing partner is only
  // worth saying about a creative that exists.
  missing: Ratio[];
}

export function planCreatives(
  files: DroppedFile[],
  existing: Record<CreativeKind, Set<string>>,
): PlannedGroup[] {
  const groups = new Map<string, PlannedGroup>();
  const taken = new Set<string>();

  for (const f of files) {
    const base = baseCreativeName(f.fileName);
    const groupKey = `${f.kind}|${base.toLowerCase()}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { key: groupKey, base, kind: f.kind, files: [], missing: [] };
      groups.set(groupKey, group);
    }

    const planned: PlannedFile = {
      id: f.id,
      fileName: f.fileName,
      ratio: null,
      name: "",
      status: "unsupported",
      width: f.width,
      height: f.height,
    };
    group.files.push(planned);
    if (f.kind === "other") continue;

    const ratio = classifyRatio(f.width, f.height);
    planned.ratio = ratio;
    if (!ratio) {
      planned.status = "bad-ratio";
      continue;
    }
    const key = creativeKey(base, ratio);
    planned.name = labelledName(base, ratio, extensionOf(f.fileName));
    if (existing[f.kind].has(key)) {
      planned.status = "duplicate";
    } else if (taken.has(`${f.kind}|${key}`)) {
      planned.status = "clash";
      planned.name = "";
    } else {
      planned.status = "ready";
      taken.add(`${f.kind}|${key}`);
    }
  }

  const order = (r: Ratio | null) => (r ? RATIOS.indexOf(r) : RATIOS.length);
  for (const g of groups.values()) {
    g.files.sort((a, b) => order(a.ratio) - order(b.ratio));
    if (g.kind === "other") continue;
    const have = new Set(
      g.files.filter((f) => f.status === "ready" || f.status === "duplicate").map((f) => f.ratio),
    );
    g.missing = have.size ? RATIOS.filter((r) => !have.has(r)) : [];
  }
  return [...groups.values()];
}
