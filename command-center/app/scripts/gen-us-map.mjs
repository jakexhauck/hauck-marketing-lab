// Regenerates src/lib/usStatePaths.ts.
//
// Run this only when the map itself has to change (a different projection, a
// different level of detail). The output is committed, so nothing at build time
// or run time depends on this script or on the network.
//
// It needs three packages that are deliberately NOT in package.json, because
// carrying a projection library in the app's dependency tree to produce a file
// that changes roughly never is a cost with no payer:
//
//   npm i --no-save d3-geo topojson-client topojson-simplify
//   node scripts/gen-us-map.mjs
//
// Source is us-atlas states-10m, which is public domain (US Census cartographic
// boundary files). Fetched here rather than vendored for the same reason.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { presimplify, simplify, quantile } = await import("topojson-simplify");
const topojson = await import("topojson-client");
const { geoAlbersUsa, geoPath } = await import("d3-geo");

const SOURCE = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

// The projected canvas. 975x610 is the us-atlas house size and keeps Albers USA
// looking like the map everyone has seen.
const WIDTH = 975;
const HEIGHT = 610;

// How much geometry to throw away, as a quantile of vertex weight. 0.2 takes the
// file from 160KB to 27KB and costs nothing visible at the size this is drawn.
// Raising it past ~0.6 starts dropping small states entirely, which the run
// below checks for rather than trusts.
const SIMPLIFY_QUANTILE = 0.2;

const FIPS_TO_CODE = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
  "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
  "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
  "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
  "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
  "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
  "54": "WV", "55": "WI", "56": "WY",
};

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`${SOURCE} returned ${res.status}`);
const raw = await res.json();

const pre = presimplify(raw);
const topo = simplify(pre, quantile(pre, SIMPLIFY_QUANTILE));
const fc = topojson.feature(topo, topo.objects.states);

const projection = geoAlbersUsa().fitSize([WIDTH, HEIGHT], fc);
const toPath = geoPath(projection).digits(0);

const rows = [];
for (const f of fc.features) {
  const code = FIPS_TO_CODE[f.id];
  // Territories are skipped on purpose: they are not scraped, and a shape with
  // no calling block would render uncoloured.
  if (!code) continue;
  const d = toPath(f);
  if (!d) throw new Error(`${code} simplified away to nothing`);
  const [cx, cy] = toPath.centroid(f);
  rows.push({ code, name: f.properties.name, d, cx: Math.round(cx), cy: Math.round(cy), area: Math.round(toPath.area(f)) });
}
rows.sort((a, b) => a.code.localeCompare(b.code));
if (rows.length !== 51) throw new Error(`expected 50 states and DC, produced ${rows.length}`);

const out = `// GENERATED, do not hand-edit. Regenerate with scripts/gen-us-map.mjs.
//
// The fifty states and DC as SVG paths, projected once here so the browser never
// projects anything. Source is us-atlas states-10m (public domain, from the
// Census cartographic boundaries), run through an Albers USA projection that
// tucks Alaska and Hawaii under the southwest, then simplified to the ${SIMPLIFY_QUANTILE * 100}th
// percentile of vertex weight and rounded to whole units.
//
// That simplification is the whole reason this file is 27KB and not 160KB, and
// at the size this map is drawn it takes nothing off the outline you can see.
// Whole-unit rounding is safe for the same reason: one unit of this viewBox is
// well under a pixel on screen.
//
// \`area\` is the projected area in square viewBox units. It exists so the map can
// decide which states have room for a label inside them, rather than carrying a
// hand-kept list of the small ones that would rot the first time the projection
// changes.

export interface UsStateShape {
  code: string;
  name: string;
  /** SVG path data in US_MAP_VIEWBOX coordinates. */
  d: string;
  /** Projected centroid, for label placement. */
  cx: number;
  cy: number;
  /** Projected area in square viewBox units. */
  area: number;
}

export const US_MAP_VIEWBOX = "0 0 ${WIDTH} ${HEIGHT}";

export const US_STATE_SHAPES: UsStateShape[] = [
${rows.map((r) => `  { code: ${JSON.stringify(r.code)}, name: ${JSON.stringify(r.name)}, cx: ${r.cx}, cy: ${r.cy}, area: ${r.area}, d: ${JSON.stringify(r.d)} },`).join("\n")}
];
`;

const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "usStatePaths.ts");
fs.writeFileSync(dest, out);
console.log(`wrote ${rows.length} states, ${Math.round(fs.statSync(dest).size / 1024)}KB`);
