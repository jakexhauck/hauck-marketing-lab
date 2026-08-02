import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLeadCities } from "../../../hooks/useApi";
import type { LeadCity } from "../../../lib/api";

// Leads > Cities. The 1000 biggest US cities and what we have already done in
// each, so picking the next scrape is a decision rather than a memory test.
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
// Everything is filtered and sorted in the browser: the whole list is 999 rows,
// so a keystroke costs nothing, where paging would cost a round trip.

type Status = "all" | "untouched" | "worked" | "empty" | "leads";
type SortKey = "rank" | "city" | "population" | "growth" | "runs" | "leads";

const STATUS_LABEL: Record<Status, string> = {
  all: "All cities",
  untouched: "Never touched",
  worked: "Worked (any)",
  empty: "Ran, no leads",
  leads: "Has leads",
};

function matchesStatus(c: LeadCity, status: Status): boolean {
  switch (status) {
    case "untouched":
      return c.runs === 0 && c.leads === 0;
    case "worked":
      return c.runs > 0 || c.leads > 0;
    // The row worth acting on: we spent a run there and it produced nothing.
    case "empty":
      return c.runs > 0 && c.leads === 0;
    case "leads":
      return c.leads > 0;
    default:
      return true;
  }
}

function StatusChip({ city }: { city: LeadCity }) {
  if (city.leads > 0) {
    return (
      <span className="lc-chip lc-chip-on">
        {city.leads.toLocaleString()} lead{city.leads === 1 ? "" : "s"}
      </span>
    );
  }
  if (city.runs > 0) return <span className="lc-chip lc-chip-warn">Ran, nothing found</span>;
  return <span className="lc-chip lc-chip-off">Never touched</span>;
}

export default function CitiesTable() {
  const [niche, setNiche] = useState("");
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [sort, setSort] = useState<SortKey>("rank");
  const [desc, setDesc] = useState(false);

  const query = useLeadCities(niche);
  const cities = useMemo(() => query.data?.cities ?? [], [query.data]);
  const niches = query.data?.niches ?? [];

  const states = useMemo(
    () => [...new Set(cities.map((c) => c.stateCode))].sort(),
    [cities],
  );

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
          return dir * (a.rank - b.rank);
      }
    });
  }, [cities, q, state, status, sort, desc]);

  const touched = cities.filter((c) => c.runs > 0 || c.leads > 0).length;

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
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>

        {/* Narrowing to a niche re-asks the server, because "scraped for HVAC"
            is a different question from "scraped at all" and the counts behind
            it are different rows. */}
        <select value={niche} onChange={(e) => setNiche(e.target.value)} aria-label="Niche">
          <option value="">All niches</option>
          {niches.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <span className="lc-count">
          {query.isLoading
            ? "Loading..."
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
                {head("rank", "#")}
                {head("city", "City")}
                <th>State</th>
                {head("population", "Population", true)}
                {head("growth", "Growth", true)}
                {head("runs", "Runs", true)}
                {head("leads", "Leads", true)}
                <th>Coverage</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && !query.isLoading && (
                <tr>
                  <td colSpan={8} className="lc-empty">
                    No cities match those filters.
                  </td>
                </tr>
              )}
              {visible.map((c) => (
                <tr key={`${c.city}-${c.stateCode}`}>
                  <td className="lc-num lc-faint">{c.rank}</td>
                  <td className="lc-city">{c.city}</td>
                  <td className="lc-faint">{c.stateCode}</td>
                  <td className="lc-num">{c.population?.toLocaleString() ?? "-"}</td>
                  <td className="lc-num lc-faint">
                    {c.growthPct == null ? "-" : `${c.growthPct}%`}
                  </td>
                  <td className="lc-num">{c.runs || "-"}</td>
                  <td className="lc-num">{c.leads ? c.leads.toLocaleString() : "-"}</td>
                  <td>
                    <StatusChip city={c} />
                  </td>
                </tr>
              ))}
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
.lc table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 820px; }
.lc thead th { position: sticky; top: 0; z-index: 1; background: var(--pk-bg, #fff); text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; opacity: 0.7; padding: 9px 12px; border-bottom: 1px solid var(--pk-line, rgba(148,163,184,0.22)); white-space: nowrap; }
.lc thead th button { appearance: none; background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: inherit; cursor: pointer; }
.lc thead th button:hover { color: var(--ls-indigo, #6366f1); }
.lc tbody td { padding: 8px 12px; border-top: 1px solid var(--pk-line, rgba(148,163,184,0.14)); white-space: nowrap; }
.lc tbody tr:hover td { background: var(--pk-surface, rgba(148,163,184,0.06)); }
.lc .lc-num { text-align: right; font-variant-numeric: tabular-nums; }
.lc .lc-city { font-weight: 500; }
.lc .lc-faint { opacity: 0.6; }
.lc-empty { padding: 28px 12px; text-align: center; font-size: 13px; opacity: 0.65; }

.lc-chip { display: inline-flex; align-items: center; border-radius: 999px; padding: 2px 9px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.lc-chip-on { background: rgba(22,163,74,0.14); color: #15803d; }
.lc-chip-warn { background: rgba(245,158,11,0.16); color: #b45309; }
.lc-chip-off { background: rgba(148,163,184,0.16); opacity: 0.75; }
`}</style>
  );
}
