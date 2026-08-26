import { useMemo, useState } from "react";
import { US_MAP_VIEWBOX, US_STATE_SHAPES } from "../../../lib/usStatePaths";
import { regionOf, REGION_LABEL, type Region } from "../../../lib/usRegions";
import type { CoverageLevel, StateCoverage } from "../../../lib/stateCoverage";

// The state picker. Click a state, the city list under it narrows to that state.
//
// Two readings come off one shape, because there is only one shape to paint:
//
//   HUE    which calling block the state is in. West blue, Central amber, East
//          green. Fixed, never changes.
//   DEPTH  how hard the selected trade has already been worked there. Pale is
//          open ground, solid is picked over.
//
// Splitting those across two attributes is what makes both survive. Hue is the
// fill, depth is its opacity, and neither has to give way to the other. Trying
// to encode both in the colour itself would have meant twelve hand-mixed shades
// that no one could tell apart at the size Rhode Island renders.
//
// A state worked for some OTHER trade but never for this one gets a dashed
// outline. It is cold by every number on its row and it is the best market on
// the map, and a fill alone cannot say both.
//
// Small states are small. Jake's call, asked and answered: no inset strip, no
// zoom. What that buys them instead is a title tooltip on every shape and a
// label that is suppressed rather than smeared across a neighbour.

// Below this many square viewBox units a state has no room for two characters
// inside it without the text spilling across its borders.
//
// Measured against the generated areas, not guessed. It falls between
// Massachusetts (799) and New Hampshire (920), which silences exactly the seven
// that were unreadable in the northeast pile-up: DC, RI, DE, CT, HI, NJ, MA.
// Those states are still hoverable, clickable and named in their tooltip; they
// simply do not carry two characters wider than the shape underneath them.
const LABEL_MIN_AREA = 900;

// Depth is fill opacity, so the floor is not a style choice: at 0.08 a cold
// state on a light background had no fill and, with a white border, no edge
// either. Nevada, Idaho, Montana and Wyoming simply were not on the map. A cold
// state still has to read as a state, so the scale starts where a shape is
// visibly there and climbs from it.
const DEPTH: Record<CoverageLevel, number> = {
  cold: 0.14,
  started: 0.38,
  worked: 0.64,
  heavy: 0.88,
};

const HUE: Record<Region, string> = {
  west: "#3b82f6",
  central: "#f59e0b",
  east: "#10b981",
};

const LEVEL_WORD: Record<CoverageLevel, string> = {
  cold: "Never touched",
  started: "Started",
  worked: "Worked",
  heavy: "Worked hard",
};

export interface UsStateMapProps {
  /** Per-state rollup for the selected trade. A missing code is cold. */
  coverage: Map<string, StateCoverage>;
  /** Two-letter codes currently selected. */
  picked: Set<string>;
  onToggle: (stateCode: string) => void;
  onClear: () => void;
}

function tooltip(code: string, name: string, row: StateCoverage | undefined): string {
  const region = regionOf(code);
  const block = region ? REGION_LABEL[region] : "";
  if (!row || (row.runs === 0 && row.leads === 0)) {
    const tail = row?.openForTrade ? "Worked for another trade" : "Never touched";
    return `${name} (${block})\n${tail}`;
  }
  const runs = `${row.runs.toLocaleString()} run${row.runs === 1 ? "" : "s"}`;
  const leads = `${row.leads.toLocaleString()} lead${row.leads === 1 ? "" : "s"}`;
  const where = `${row.citiesWithLeads} of ${row.cities} cities`;
  return `${name} (${block})\n${LEVEL_WORD[row.level]}: ${runs}, ${leads} across ${where}`;
}

export default function UsStateMap({ coverage, picked, onToggle, onClear }: UsStateMapProps) {
  const [hover, setHover] = useState<string | null>(null);

  // Picked states are drawn last so their outline sits above a neighbour's fill.
  // Without this the ring around Utah is cut in half by Nevada wherever they
  // touch, which reads as a rendering fault rather than a selection.
  const order = useMemo(() => {
    const on = US_STATE_SHAPES.filter((s) => picked.has(s.code));
    const off = US_STATE_SHAPES.filter((s) => !picked.has(s.code));
    return [...off, ...on];
  }, [picked]);

  return (
    <div className="um">
      <MapStyle />

      <div className="um-head">
        <div className="um-key">
          {(["west", "central", "east"] as Region[]).map((r) => (
            <span key={r} className="um-key-item">
              <i style={{ background: HUE[r] }} aria-hidden />
              {REGION_LABEL[r]}
            </span>
          ))}
          <span className="um-key-sep" aria-hidden />
          {(["cold", "started", "worked", "heavy"] as CoverageLevel[]).map((l) => (
            <span key={l} className="um-key-item">
              <i style={{ background: "#64748b", opacity: DEPTH[l] }} aria-hidden />
              {LEVEL_WORD[l]}
            </span>
          ))}
        </div>

        {picked.size > 0 && (
          <button type="button" className="um-clear" onClick={onClear}>
            Clear {picked.size} {picked.size === 1 ? "state" : "states"}
          </button>
        )}
      </div>

      <svg
        className="um-svg"
        viewBox={US_MAP_VIEWBOX}
        role="group"
        aria-label="United States, pick states to scrape"
      >
        {order.map((s) => {
          const row = coverage.get(s.code);
          const region = regionOf(s.code);
          const level = row?.level ?? "cold";
          const on = picked.has(s.code);
          const open = row?.openForTrade ?? false;
          return (
            <path
              key={s.code}
              d={s.d}
              className={`um-state${on ? " on" : ""}${open ? " open" : ""}`}
              fill={region ? HUE[region] : "#94a3b8"}
              fillOpacity={on ? Math.max(DEPTH[level], 0.5) : DEPTH[level]}
              tabIndex={0}
              role="checkbox"
              aria-checked={on}
              aria-label={`${s.name}, ${LEVEL_WORD[level]}`}
              onClick={() => onToggle(s.code)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(s.code);
                }
              }}
              onMouseEnter={() => setHover(s.code)}
              onMouseLeave={() => setHover((h) => (h === s.code ? null : h))}
            >
              <title>{tooltip(s.code, s.name, row)}</title>
            </path>
          );
        })}

        {/* Labels are a separate pass over the same list so that no state's fill
            can paint over a neighbour's label. They take no pointer events, so
            the two characters never swallow a click meant for the shape. */}
        {US_STATE_SHAPES.filter((s) => s.area >= LABEL_MIN_AREA).map((s) => (
          <text
            key={s.code}
            className={`um-label${picked.has(s.code) ? " on" : ""}${hover === s.code ? " hot" : ""}`}
            x={s.cx}
            y={s.cy}
            textAnchor="middle"
            dominantBaseline="central"
            aria-hidden
          >
            {s.code}
          </text>
        ))}
      </svg>
    </div>
  );
}

function MapStyle() {
  return (
    <style>{`
.um { display: flex; flex-direction: column; gap: 8px; }
.um-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.um-key { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 11px; opacity: 0.75; }
.um-key-item { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.um-key-item i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.um-key-sep { width: 1px; height: 13px; background: var(--pk-line, rgba(148,163,184,0.35)); }
.um-clear { margin-left: auto; appearance: none; border: 1px solid var(--pk-line, rgba(148,163,184,0.28)); border-radius: 9px; background: transparent; color: inherit; font: inherit; font-size: 12px; padding: 5px 11px; cursor: pointer; }
.um-clear:hover { border-color: var(--ls-indigo, #6366f1); color: var(--ls-indigo, #6366f1); }

.um-svg { width: 100%; height: auto; display: block; border: 1px solid var(--pk-line, rgba(148,163,184,0.22)); border-radius: 11px; background: var(--pk-surface, rgba(148,163,184,0.05)); }

/* A real line, not the page background. Borders drawn in --pk-bg vanish the
   moment the fill behind them is pale, which took the whole Mountain West off
   the map on a light theme. */
.um-state { stroke: rgba(100,116,139,0.5); stroke-width: 0.75; cursor: pointer; transition: fill-opacity 120ms ease, stroke 120ms ease; outline: none; }
.um-state:hover { fill-opacity: 0.75; stroke: var(--ls-indigo, #6366f1); stroke-width: 1.5; }
.um-state:focus-visible { stroke: var(--ls-indigo, #6366f1); stroke-width: 2.5; }
/* Worked for another trade, never for this one. Cold by the numbers, and the
   best ground on the map. */
.um-state.open { stroke: var(--ls-indigo, #6366f1); stroke-width: 1.25; stroke-dasharray: 4 3; }
.um-state.on { stroke: var(--ls-indigo, #6366f1); stroke-width: 2.5; stroke-dasharray: none; }

.um-label { font-size: 12px; font-weight: 600; fill: #0f172a; opacity: 0.55; pointer-events: none; paint-order: stroke; stroke: var(--pk-bg, #fff); stroke-width: 2.5px; stroke-linejoin: round; }
.um-label.on { opacity: 1; fill: var(--ls-indigo, #4338ca); }
.um-label.hot { opacity: 1; }
`}</style>
  );
}
