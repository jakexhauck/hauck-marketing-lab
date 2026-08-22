import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLeadCities } from "../../../hooks/useApi";
import { useNichePresets } from "../../../hooks/useLeadScraper";
import { cityKey } from "../../../lib/leadScraper";
import { nicheLabels, cityCoverage, type Coverage } from "../../../lib/cityCoverage";
import type { LeadCity } from "../../../lib/api";

// Leads > Cities. Every city we have touched, and what we did there, so picking
// the next scrape is a decision rather than a memory test.
//
// Two counts, never merged into one "scraped" flag, because they disagree in
// both directions and each disagreement means something:
//
//   Runs   how many scrape runs named this city. Worked, whatever it yielded.
//   Leads  how many leads in the book carry it.
//
// A city with runs and no leads was worked and came up empty. A city with leads
// and no runs arrived some other way. One flag would have hidden both.
//
// The list is not the 999 biggest cities. It is the union of those with every
// city a run has ever named and every city a lead carries, because the cities
// Jake types in himself are wealthy suburbs that are far too small for a
// population list: Mercer Island, Los Gatos, Gig Harbor. Those rows have no rank
// and no population.
//
// Coverage is read per TRADE. Pick one and the counts scope to it, while the
// Trades column keeps showing everything the city has been worked for. That is
// the whole question: a city scraped for garage doors is still open for windows,
// and merged counts made the two look identical.
//
// Everything is filtered and sorted in the browser: the whole list is a couple
// of thousand rows, so a keystroke costs nothing, where paging would cost a
// round trip.

type Status = "all" | "untouched" | "worked" | "open" | "empty" | "leads";
type SortKey = "rank" | "city" | "population" | "growth" | "runs" | "leads";

const STATUS_LABEL: Record<Status, string> = {
  all: "All cities",
  untouched: "Never touched",
  worked: "Worked (any trade)",
  open: "Open for this trade",
  empty: "Ran, no leads",
  leads: "Has leads",
};

function matchesStatus(c: LeadCity, status: Status): boolean {
  const cover = cityCoverage(c);
  switch (status) {
    case "untouched":
      return cover === "cold";
    case "worked":
      return cover !== "cold";
    // The row worth acting on when a trade is picked: worked before, never for
    // this one.
    case "open":
      return cover === "open";
    // The other row worth acting on: we spent a run there and it produced
    // nothing.
    case "empty":
      return c.runs > 0 && c.leads === 0;
    case "leads":
      return c.leads > 0;
    default:
      return true;
  }
}

const CHIP: Record<Coverage, string> = {
  leads: "lc-chip-on",
  empty: "lc-chip-warn",
  open: "lc-chip-open",
  cold: "lc-chip-off",
};

function StatusChip({ city }: { city: LeadCity }) {
  const cover = cityCoverage(city);
  const text =
    cover === "leads"
      ? `${city.leads.toLocaleString()} lead${city.leads === 1 ? "" : "s"}`
      : cover === "empty"
        ? "Ran, nothing found"
        : cover === "open"
          ? "Open for this trade"
          : "Never touched";
  return <span className={`lc-chip ${CHIP[cover]}`}>{text}</span>;
}

// Ranked cities first, in rank order; everything off the planning list after.
const rankOf = (c: LeadCity) => c.rank ?? Number.MAX_SAFE_INTEGER;

/**
 * Wizard mode. The same table, with a tick box on every row.
 *
 * It is the same component and not a copy because the coverage a city shows
 * while you are PICKING it is the whole reason to pick it. Two tables would
 * drift, and the one that drifted would be the one being used to spend a run.
 */
export interface CityPicker {
  // Fixed by the wizard's first step, so the trade dropdown is not drawn.
  niche: string;
  cap: number;
  picked: { city: string; state: string }[];
  onToggle: (city: { city: string; state: string }) => void;
  // Cities typed in that the coverage list has never heard of. They are real
  // targets, they simply have no history, so they are shown and tickable rather
  // than silently dropped.
  extra?: LeadCity[];
}

export default function CitiesTable({ picker }: { picker?: CityPicker } = {}) {
  const [niche, setNiche] = useState("");
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [sort, setSort] = useState<SortKey>("rank");
  const [desc, setDesc] = useState(false);

  const trade = picker ? picker.niche : niche;
  const query = useLeadCities(trade);
  const presets = useNichePresets();
  const cities = useMemo(() => {
    const rows = query.data?.cities ?? [];
    return picker?.extra?.length ? [...picker.extra, ...rows] : rows;
  }, [query.data, picker?.extra]);
  const niches = query.data?.niches ?? [];
  const labels = useMemo(() => nicheLabels(presets.data?.presets), [presets.data]);

  const states = useMemo(
    () => [...new Set(cities.map((c) => c.stateCode).filter(Boolean))].sort(),
    [cities],
  );

  // "Open for this trade" is only a question once a trade is chosen. Clearing
  // the trade while it is selected would otherwise leave the table empty with no
  // way to tell why.
  const statuses = (Object.keys(STATUS_LABEL) as Status[]).filter(
    (s) => s !== "open" || trade !== "",
  );

  const pickedKeys = useMemo(
    () => new Set((picker?.picked ?? []).map((c) => cityKey(c.city, c.state))),
    [picker?.picked],
  );
  const full = !!picker && pickedKeys.size >= picker.cap;

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = cities.filter((c) => {
      if (state && c.stateCode !== state) return false;
      if (!matchesStatus(c, status)) return false;
      if (needle && !c.city.toLowerCase().includes(needle) && !c.stateName.toLowerCase().includes(needle))
        return false;
      return true;
    });

    const dir = desc ? -1 : 1;
    return [...rows].sort((a, b) => {
      switch (sort) {
        case "city":
          return dir * a.city.localeCompare(b.city);
        case "population":
          return dir * ((a.population ?? 0) - (b.population ?? 0));
        case "growth":
          return dir * ((a.growthPct ?? 0) - (b.growthPct ?? 0));
        case "runs":
          return dir * (a.runs - b.runs);
        case "leads":
          return dir * (a.leads - b.leads);
        default:
          return dir * (rankOf(a) - rankOf(b));
      }
    });
  }, [cities, q, state, status, sort, desc]);

  const touched = cities.filter((c) => cityCoverage(c) !== "cold").length;

  const head = (key: SortKey, label: string, right = false) => (
    <th
      className={right ? "lc-num" : undefined}
      aria-sort={sort === key ? (desc ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        onClick={() => {
          if (sort === key) setDesc((v) => !v);
          else {
            setSort(key);
            // Counts and sizes are read biggest-first; names and ranks are not.
            setDesc(key !== "rank" && key !== "city");
          }
        }}
      >
        {label}
        {sort === key && <span aria-hidden>{desc ? " ↓" : " ↑"}</span>}
      </button>
    </th>
  );

  return (
    <div className="lc">
      <CitiesStyle />

      <div className="lc-bar">
        <label className="lc-search">
          <Search size={15} aria-hidden />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search city or state"
            aria-label="Search cities"
          />
        </label>

        <select value={state} onChange={(e) => setState(e.target.value)} aria-label="State">
          <option value="">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          aria-label="Coverage"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>

        {/* Narrowing to a trade re-asks the server, because "scraped for HVAC"
            is a different question from "scraped at all" and the counts behind
            it are different rows. In the wizard the trade is already answered,
            so there is nothing to ask. */}
        {!picker && (
          <select
            value={niche}
            onChange={(e) => {
              setNiche(e.target.value);
              if (!e.target.value && status === "open") setStatus("all");
            }}
            aria-label="Trade"
          >
            <option value="">All trades</option>
            {niches.map((n) => (
              <option key={n} value={n}>
                {labels(n)}
              </option>
            ))}
          </select>
        )}

        <span className="lc-count">
          {query.isLoading
            ? "Loading..."
            : picker
              ? `${pickedKeys.size} of ${picker.cap} picked`
              : `${visible.length.toLocaleString()} of ${cities.length.toLocaleString()} shown, ${touched.toLocaleString()} touched`}
        </span>
      </div>

      {query.isError ? (
        <p className="lc-empty">Could not load the city list.</p>
      ) : (
        <div className="lc-scroll">
          <table>
            <thead>
              <tr>
                {picker && <th className="lc-tick" aria-label="Picked" />}
                {head("rank", "#")}
                {head("city", "City")}
                <th>State</th>
                {head("population", "Population", true)}
                {head("growth", "Growth", true)}
                {head("runs", "Runs", true)}
                {head("leads", "Leads", true)}
                <th>Trades</th>
                <th>Coverage</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && !query.isLoading && (
                <tr>
                  <td colSpan={picker ? 10 : 9} className="lc-empty">
                    No cities match those filters.
                  </td>
                </tr>
              )}
              {visible.map((c) => {
                const key = cityKey(c.city, c.stateCode);
                const picked = pickedKeys.has(key);
                return (
                <tr
                  key={key}
                  className={picked ? "lc-picked" : undefined}
                  onClick={picker && (picked || !full)
                    ? () => picker.onToggle({ city: c.city, state: c.stateCode })
                    : undefined}
                >
                  {picker && (
                    <td className="lc-tick">
                      <input
                        type="checkbox"
                        checked={picked}
                        // At the cap, the only tick you can still change is one
                        // that is already on. Silently ignoring the click would
                        // read as a broken table.
                        disabled={!picked && full}
                        onChange={() => picker.onToggle({ city: c.city, state: c.stateCode })}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`${c.city} ${c.stateCode}`}
                      />
                    </td>
                  )}
                  <td className="lc-num lc-faint">{c.rank ?? "-"}</td>
                  <td className="lc-city">{c.city}</td>
                  <td className="lc-faint">{c.stateCode || "-"}</td>
                  <td className="lc-num">{c.population?.toLocaleString() ?? "-"}</td>
                  <td className="lc-num lc-faint">
                    {c.growthPct == null ? "-" : `${c.growthPct}%`}
                  </td>
                  <td className="lc-num">{c.runs || "-"}</td>
                  <td className="lc-num">{c.leads ? c.leads.toLocaleString() : "-"}</td>
                  <td>
                    {c.niches.length === 0 ? (
                      <span className="lc-faint">-</span>
                    ) : (
                      <span className="lc-trades">
                        {c.niches.map((n) => (
                          <span key={n} className={`lc-trade${n === trade ? " on" : ""}`}>
                            {labels(n)}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td>
                    <StatusChip city={c} />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Scoped to .lc so it cannot leak into the other Leads views, matching how the
// rest of this surface styles itself.
function CitiesStyle() {
  return (
    <style>{`
.lc { display: flex; flex-direction: column; gap: 12px; }
.lc-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.lc-bar select { appearance: auto; border: 1px solid var(--pk-line, rgba(148,163,184,0.28)); border-radius: 9px; padding: 6px 10px; font: inherit; font-size: 12.5px; background: transparent; color: inherit; }
.lc-search { position: relative; display: inline-flex; align-items: center; }
.lc-search svg { position: absolute; left: 9px; opacity: 0.5; pointer-events: none; }
.lc-search input { border: 1px solid var(--pk-line, rgba(148,163,184,0.28)); border-radius: 9px; padding: 6px 10px 6px 30px; font: inherit; font-size: 12.5px; background: transparent; color: inherit; min-width: 210px; }
.lc-search input:focus { outline: none; border-color: var(--ls-indigo, #6366f1); }
.lc-count { margin-left: auto; font-size: 12px; opacity: 0.6; font-variant-numeric: tabular-nums; }

.lc-scroll { overflow-x: auto; border: 1px solid var(--pk-line, rgba(148,163,184,0.22)); border-radius: 11px; max-height: 68vh; overflow-y: auto; }
.lc table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 940px; }
.lc thead th { position: sticky; top: 0; z-index: 1; background: var(--pk-bg, #fff); text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; opacity: 0.7; padding: 9px 12px; border-bottom: 1px solid var(--pk-line, rgba(148,163,184,0.22)); white-space: nowrap; }
.lc thead th button { appearance: none; background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: inherit; cursor: pointer; }
.lc thead th button:hover { color: var(--ls-indigo, #6366f1); }
.lc tbody td { padding: 8px 12px; border-top: 1px solid var(--pk-line, rgba(148,163,184,0.14)); white-space: nowrap; }
.lc tbody tr:hover td { background: var(--pk-surface, rgba(148,163,184,0.06)); }
.lc .lc-num { text-align: right; font-variant-numeric: tabular-nums; }
.lc .lc-city { font-weight: 500; }
.lc .lc-faint { opacity: 0.6; }
.lc-empty { padding: 28px 12px; text-align: center; font-size: 13px; opacity: 0.65; }

.lc-tick { width: 34px; padding-right: 0 !important; }
.lc-tick input { width: 14px; height: 14px; accent-color: var(--ls-indigo, #6366f1); cursor: pointer; }
.lc-tick input:disabled { cursor: not-allowed; opacity: 0.35; }
.lc tbody tr.lc-picked td { background: rgba(99,102,241,0.10); }
.lc tbody tr.lc-picked:hover td { background: rgba(99,102,241,0.16); }

.lc-trades { display: inline-flex; gap: 4px; flex-wrap: nowrap; }
.lc-trade { border-radius: 6px; padding: 2px 7px; font-size: 11px; background: rgba(148,163,184,0.16); opacity: 0.8; }
.lc-trade.on { background: rgba(99,102,241,0.16); color: var(--ls-indigo, #6366f1); opacity: 1; font-weight: 600; }

.lc-chip { display: inline-flex; align-items: center; border-radius: 999px; padding: 2px 9px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.lc-chip-on { background: rgba(22,163,74,0.14); color: #15803d; }
.lc-chip-warn { background: rgba(245,158,11,0.16); color: #b45309; }
.lc-chip-open { background: rgba(99,102,241,0.14); color: #4f46e5; }
.lc-chip-off { background: rgba(148,163,184,0.16); opacity: 0.75; }
`}</style>
  );
}
