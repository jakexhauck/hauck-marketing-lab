import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  History,
  Loader2,
  Phone,
  Play,
  MapPin,
  Radar,
  Search,
  MessageSquare,
  Table2,
} from "lucide-react";
import { PillarTitleActions } from "../../pillars/PillarKit";
import CitiesTable from "./CitiesTable";
import { formatPhoneDashed } from "../../../lib/phone";
import {
  RUN_SIZES,
  canSend,
  channelLabel,
  cityKey,
  draftProblem,
  emptyDraft,
  formatRating,
  formatScore,
  isRunActive,
  parseCityList,
  passRateLabel,
  prettyDomain,
  resolveRunRequest,
  runStatusLine,
  summariseSelection,
  type Channel,
  type MetroCity,
  type RunDraft,
  type RunSize,
  type ScrapeRun,
  type ScrapedLeadView,
} from "../../../lib/leadScraper";
import {
  useAvailableStates,
  useLeads,
  useMetroCities,
  useNichePresets,
  useScrapeRuns,
  useSendLeads,
  useStartRun,
  type LeadFilters,
  type SendResult,
} from "../../../hooks/useLeadScraper";

// Acquisition > Leads.
//
// A window onto the LIIGO SOP's scraper, which lives at command-center/lead-scraper
// and runs on Jake's own Mac and PC. This page does not scrape. It says what to
// look for, shows what came back and why each row scored what it did, and hands the
// ones Jake ticks to Cold Call or SMS as tagged GoHighLevel contacts.
//
// Three views. Leads is the table and the default, because most visits are to work
// a list that is already there. New scrape is the wizard. Runs is the history.
// An active run shows above all three, since "is it still going" is the question
// you have on every one of them.
//
// Nothing here fabricates a number. Every score, reason, rating and count is read
// from what the qualifier actually wrote.

type View = "leads" | "new" | "runs" | "cities";

export default function LeadsSurface() {
  const [view, setView] = useState<View>("leads");
  const [filters, setFilters] = useState<LeadFilters>({ sent: "0" });

  const runsQuery = useScrapeRuns();
  const runs = runsQuery.data?.runs ?? [];
  const activeRun = runs.find(isRunActive) ?? null;

  const leadsQuery = useLeads(filters);
  const leads = leadsQuery.data?.leads ?? [];

  return (
    <div className="ls">
      <LeadsStyle />

      <PillarTitleActions>
        <nav className="ls-subnav" role="tablist" aria-label="Leads views">
          <SubTab id="leads" view={view} onSelect={setView} icon={<Table2 size={15} />} label="Leads" count={leadsQuery.data?.total} />
          <SubTab id="new" view={view} onSelect={setView} icon={<Radar size={15} />} label="New scrape" />
          <SubTab id="runs" view={view} onSelect={setView} icon={<History size={15} />} label="Runs" count={runs.length || undefined} />
          {/* Cities sits last: it is the planning view, read before starting a
              scrape rather than while working the list. */}
          <SubTab id="cities" view={view} onSelect={setView} icon={<MapPin size={15} />} label="Cities" />
        </nav>
      </PillarTitleActions>

      {activeRun && <RunBanner run={activeRun} />}

      {view === "leads" && (
        <LeadsTable
          leads={leads}
          total={leadsQuery.data?.total ?? 0}
          loading={leadsQuery.isLoading}
          filters={filters}
          onFilters={setFilters}
          runs={runs}
        />
      )}
      {view === "new" && (
        <Wizard
          disabled={!!activeRun}
          onStarted={() => {
            setView("leads");
            setFilters({ sent: "0" });
          }}
        />
      )}
      {view === "runs" && <RunHistory runs={runs} loading={runsQuery.isLoading} />}
      {view === "cities" && <CitiesTable />}
    </div>
  );
}

function SubTab({
  id, view, onSelect, icon, label, count,
}: {
  id: View; view: View; onSelect: (v: View) => void;
  icon: React.ReactNode; label: string; count?: number;
}) {
  const on = view === id;
  return (
    <button type="button" role="tab" aria-selected={on} className={`ls-subtab${on ? " on" : ""}`} onClick={() => onSelect(id)}>
      {icon}
      {label}
      {count !== undefined && count > 0 && <span className="ls-cnt">{count}</span>}
    </button>
  );
}

// --- the active run ----------------------------------------------------------

function RunBanner({ run }: { run: ScrapeRun }) {
  const pending = run.status === "preparing" || run.status === "queued";
  return (
    <div className={`ls-banner${run.blocked ? " warn" : ""}`}>
      <div className="ls-banner-top">
        <div className="ls-banner-title">
          {pending ? <Loader2 size={15} className="ls-spin" /> : <Radar size={15} />}
          {run.nicheLabel}
          <span className="ls-banner-where">
            {run.states.length > 0 ? run.states.join(", ") : `${run.cities.length} cities`}
          </span>
        </div>
        {run.host && <span className="ls-banner-host">on {run.host}</span>}
      </div>

      <div className="ls-bar" role="progressbar" aria-valuenow={run.percent} aria-valuemin={0} aria-valuemax={100}>
        {/* Indeterminate until there is a real denominator: a bar sitting at 0%
            for two minutes reads as broken, where a moving stripe reads as busy. */}
        <div className={`ls-bar-fill${run.totalQueries === 0 ? " indet" : ""}`} style={run.totalQueries > 0 ? { width: `${run.percent}%` } : undefined} />
      </div>

      <div className="ls-banner-line">{runStatusLine(run)}</div>

      {run.status === "running" && run.rawFound > 0 && (
        <div className="ls-banner-stats">
          <span><b>{run.rawFound}</b> found</span>
          <span><b>{run.kept}</b> kept</span>
          <span><b>{run.added}</b> added</span>
          {run.hiddenAsDuplicates > 0 && <span><b>{run.hiddenAsDuplicates}</b> already in the CRM</span>}
        </div>
      )}

      {run.crmSnapshotPartial && (
        <div className="ls-note">
          <AlertTriangle size={13} />
          Duplicate hiding is partial for this run: the GoHighLevel sweep did not
          finish, so some businesses you already have may still appear.
        </div>
      )}
    </div>
  );
}

// --- the wizard --------------------------------------------------------------

function Wizard({ disabled, onStarted }: { disabled: boolean; onStarted: () => void }) {
  const [draft, setDraft] = useState<RunDraft>(emptyDraft);
  const [manualText, setManualText] = useState("");

  const presets = useNichePresets();
  const statesQuery = useAvailableStates();
  const metros = useMetroCities(draft.cityMode === "suggested" ? draft.states : []);
  const start = useStartRun();

  const suggested: MetroCity[] = metros.data?.cities ?? [];
  const manualCities = useMemo(() => parseCityList(manualText), [manualText]);
  const effective: RunDraft = { ...draft, manualCities };
  const problem = draftProblem(effective, suggested);

  const excluded = new Set(draft.excluded);
  const keptCount = suggested.filter((c) => !excluded.has(cityKey(c.city, c.state))).length;

  const toggleState = (state: string) =>
    setDraft((d) => ({
      ...d,
      states: d.states.includes(state) ? d.states.filter((s) => s !== state) : [...d.states, state],
      // Strike-outs belong to the city list that was on screen; changing the
      // states rebuilds that list, so carrying them over would silently drop a
      // city from a state Jake has only just added.
      excluded: [],
    }));

  const toggleCity = (c: MetroCity) => {
    const key = cityKey(c.city, c.state);
    setDraft((d) => ({
      ...d,
      excluded: d.excluded.includes(key) ? d.excluded.filter((k) => k !== key) : [...d.excluded, key],
    }));
  };

  const go = () => {
    if (problem || disabled) return;
    start.mutate(resolveRunRequest(effective, suggested), { onSuccess: onStarted });
  };

  return (
    <div className="ls-wizard">
      {disabled && (
        <div className="ls-note warn">
          <AlertTriangle size={13} />
          A scrape is already running. Let it finish before starting another.
        </div>
      )}

      <Step n={1} title="What are you looking for?">
        {presets.isLoading && <div className="ls-muted">Loading niches...</div>}
        {presets.data?.presets.length === 0 && (
          <div className="ls-muted">
            No niches yet. Run <code>node scripts/seed-niches.mjs</code> to load the built-in ones.
          </div>
        )}
        <div className="ls-chips">
          {(presets.data?.presets ?? []).map((p) => (
            <button
              key={p.nicheId}
              type="button"
              className={`ls-chip${draft.nicheId === p.nicheId ? " on" : ""}`}
              onClick={() => setDraft((d) => ({ ...d, nicheId: p.nicheId }))}
            >
              <span className="ls-chip-label">{p.label}</span>
              <span className="ls-chip-sub">
                {p.summary.keywords} searches, {p.summary.denyTerms} things it rejects
              </span>
            </button>
          ))}
        </div>
      </Step>

      <Step n={2} title="Where?">
        <div className="ls-modes">
          <button type="button" className={`ls-mode${draft.cityMode === "suggested" ? " on" : ""}`} onClick={() => setDraft((d) => ({ ...d, cityMode: "suggested" }))}>
            Pick states, I'll suggest the wealthy suburbs
          </button>
          <button type="button" className={`ls-mode${draft.cityMode === "manual" ? " on" : ""}`} onClick={() => setDraft((d) => ({ ...d, cityMode: "manual" }))}>
            Name the cities myself
          </button>
        </div>

        {draft.cityMode === "suggested" ? (
          <>
            <div className="ls-states">
              {(statesQuery.data?.states ?? []).map((s) => (
                <button
                  key={s.state}
                  type="button"
                  className={`ls-state${draft.states.includes(s.state) ? " on" : ""}`}
                  title={`${s.cities} cities`}
                  onClick={() => toggleState(s.state)}
                >
                  {s.state}
                </button>
              ))}
            </div>

            {draft.states.length > 0 && (
              <div className="ls-cities">
                <div className="ls-cities-head">
                  <span>
                    {keptCount} of {suggested.length} cities. Click any to strike it out.
                  </span>
                  {draft.excluded.length > 0 && (
                    <button type="button" className="ls-linkbtn" onClick={() => setDraft((d) => ({ ...d, excluded: [] }))}>
                      Put them all back
                    </button>
                  )}
                </div>
                <div className="ls-citylist">
                  {metros.isLoading && <span className="ls-muted">Loading cities...</span>}
                  {suggested.map((c) => {
                    const off = excluded.has(cityKey(c.city, c.state));
                    return (
                      <button key={cityKey(c.city, c.state)} type="button" className={`ls-city${off ? " off" : ""}${c.isAnchor ? " anchor" : ""}`} onClick={() => toggleCity(c)}>
                        {c.city}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <textarea
              className="ls-textarea"
              rows={6}
              placeholder={"One city per line, with its state:\nPlano TX\nBoise ID\nNaperville IL"}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
            />
            <div className="ls-muted">
              {manualCities.length} {manualCities.length === 1 ? "city" : "cities"} recognised.
            </div>
          </>
        )}
      </Step>

      <Step n={3} title="How big a run?">
        <div className="ls-sizes">
          {RUN_SIZES.map((s) => (
            <button key={s.id} type="button" className={`ls-size${draft.size === s.id ? " on" : ""}`} onClick={() => setDraft((d) => ({ ...d, size: s.id as RunSize }))}>
              <span className="ls-size-label">{s.label}</span>
              <span className="ls-size-blurb">{s.blurb}</span>
            </button>
          ))}
        </div>
      </Step>

      <div className="ls-go">
        <button type="button" className="ls-primary" disabled={!!problem || disabled || start.isPending} onClick={go}>
          {start.isPending ? <Loader2 size={15} className="ls-spin" /> : <Play size={15} />}
          Start the scrape
        </button>
        {problem && <span className="ls-muted">{problem}</span>}
        {start.isError && (
          <span className="ls-err">{(start.error as { body?: { error?: string } })?.body?.error ?? "Could not start that run."}</span>
        )}
      </div>

      <p className="ls-footnote">
        The scraping runs on your Mac or PC, not here. Start the runner with{" "}
        <code>bash run.sh --watch</code> in <code>command-center/lead-scraper</code> and it will
        pick this up.
      </p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="ls-step">
      <h3 className="ls-step-h">
        <span className="ls-step-n">{n}</span>
        {title}
      </h3>
      <div className="ls-step-body">{children}</div>
    </section>
  );
}

// --- the table ---------------------------------------------------------------

function LeadsTable({
  leads, total, loading, filters, onFilters, runs,
}: {
  leads: ScrapedLeadView[]; total: number; loading: boolean;
  filters: LeadFilters; onFilters: (f: LeadFilters) => void; runs: ScrapeRun[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const send = useSendLeads();

  const summary = summariseSelection(leads, selected);
  const allTicked = leads.length > 0 && leads.every((l) => selected.has(l.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allTicked ? new Set() : new Set(leads.map((l) => l.id)));

  const doSend = (channel: Channel) => {
    const ids = leads.filter((l) => selected.has(l.id)).map((l) => l.id);
    if (ids.length === 0) return;
    send.mutate({ ids, channel }, {
      onSuccess: (res) => {
        setResult(res);
        setSelected(new Set());
      },
    });
  };

  return (
    <div className="ls-card">
      <div className="ls-toolbar">
        <div className="ls-search">
          <Search size={14} />
          <input
            value={filters.q ?? ""}
            placeholder="Search a business or city"
            onChange={(e) => onFilters({ ...filters, q: e.target.value })}
          />
        </div>

        <select className="ls-select" value={filters.sent ?? ""} onChange={(e) => onFilters({ ...filters, sent: (e.target.value || null) as LeadFilters["sent"] })}>
          <option value="0">Not sent yet</option>
          <option value="1">Already sent</option>
          <option value="">Everything</option>
        </select>

        <select className="ls-select" value={filters.runId ?? ""} onChange={(e) => onFilters({ ...filters, runId: e.target.value || null })}>
          <option value="">Every run</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nicheLabel} - {new Date(r.createdAt).toLocaleDateString()}
            </option>
          ))}
        </select>

        <div className="ls-toolbar-right">
          <a className="ls-ghost" href={`/api/admin/leads/export${filters.runId ? `?runId=${filters.runId}` : ""}`} title="Downloads the qualified, unsent leads and marks them as sent">
            <Download size={14} />
            CSV
          </a>
        </div>
      </div>

      {summary.ticked > 0 && (
        <div className="ls-actionbar">
          <span className="ls-actionbar-count">
            <b>{summary.sendable}</b> ready to send
            {summary.reason && <em>{summary.reason}</em>}
          </span>
          <div className="ls-actionbar-btns">
            <button type="button" className="ls-primary sm" disabled={!canSend(summary) || send.isPending} onClick={() => doSend("cold_call")}>
              <Phone size={14} />
              Send to Cold Call
            </button>
            <button type="button" className="ls-primary sm alt" disabled={!canSend(summary) || send.isPending} onClick={() => doSend("sms")}>
              <MessageSquare size={14} />
              Send to SMS
            </button>
          </div>
        </div>
      )}

      {result && <SendReceipt result={result} onDismiss={() => setResult(null)} />}

      <div className="ls-scroll">
        <table>
          <thead>
            <tr>
              <th className="ls-tick"><input type="checkbox" checked={allTicked} onChange={toggleAll} aria-label="Select all" /></th>
              <th>Business</th>
              <th>Score</th>
              <th>Rating</th>
              <th>Website</th>
              <th>Where</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="ls-empty">Loading...</td></tr>}
            {!loading && leads.length === 0 && (
              <tr><td colSpan={7} className="ls-empty">
                Nothing here yet. Run a scrape and the results land in this table.
              </td></tr>
            )}
            {leads.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                ticked={selected.has(lead.id)}
                expanded={expanded === lead.id}
                onTick={() => toggle(lead.id)}
                onExpand={() => setExpanded(expanded === lead.id ? null : lead.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {total > leads.length && (
        <div className="ls-foot">Showing {leads.length} of {total}. Narrow it with the filters above.</div>
      )}
    </div>
  );
}

function LeadRow({
  lead, ticked, expanded, onTick, onExpand,
}: {
  lead: ScrapedLeadView; ticked: boolean; expanded: boolean;
  onTick: () => void; onExpand: () => void;
}) {
  const sent = lead.sendStatus !== "pending";
  const domain = prettyDomain(lead.website);
  return (
    <>
      <tr className={ticked ? "on" : undefined}>
        <td className="ls-tick">
          <input type="checkbox" checked={ticked} onChange={onTick} disabled={sent} aria-label={`Select ${lead.businessName ?? lead.phoneE164}`} />
        </td>
        <td>
          <button type="button" className="ls-name" onClick={onExpand} title="Why it scored what it did">
            {lead.businessName ?? "(no name)"}
          </button>
          <div className="ls-phone">{formatPhoneDashed(lead.phoneE164)}</div>
        </td>
        <td>
          <span className={`ls-score ${lead.scoreBand}`}>{formatScore(lead.icpScore)}</span>
        </td>
        <td className="ls-dim">{formatRating(lead.rating, lead.reviewCount)}</td>
        <td>
          {domain ? (
            <a className="ls-link" href={lead.website ?? "#"} target="_blank" rel="noreferrer">
              {domain}
              <ExternalLink size={11} />
            </a>
          ) : (
            <span className="ls-dim">None</span>
          )}
        </td>
        <td className="ls-dim">{[lead.city, lead.state].filter(Boolean).join(", ") || "-"}</td>
        <td>
          {sent ? (
            <span className="ls-sent"><Check size={12} />{lead.sentTo ? channelLabel(lead.sentTo as Channel) : "Sent"}</span>
          ) : (
            <span className="ls-dim">Not sent</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="ls-why">
          <td />
          <td colSpan={6}>
            <div className="ls-why-box">
              <b>Why {formatScore(lead.icpScore)}</b>
              {lead.reasons.length > 0 ? (
                <ul>{lead.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              ) : (
                <span className="ls-dim"> - no reasons recorded.</span>
              )}
              <div className="ls-why-meta">
                {lead.category && <span>Category: {lead.category}</span>}
                {lead.sourceKeyword && <span>Found by: "{lead.sourceKeyword}"</span>}
                {lead.source && <span>Source: {lead.source}</span>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SendReceipt({ result, onDismiss }: { result: SendResult; onDismiss: () => void }) {
  return (
    <div className={`ls-receipt${result.sent === 0 ? " warn" : ""}`}>
      <div>
        <b>
          {result.sent} sent to {channelLabel(result.channel)}
          {result.addedToProspectBook > 0 && `, ${result.addedToProspectBook} added to the call list`}
        </b>
        {result.notConfigured && <div>GoHighLevel is not connected, so nothing was pushed.</div>}
        {result.skipped.length > 0 && (
          <div className="ls-receipt-skipped">
            {result.skipped.length} skipped: {[...new Set(result.skipped.map((s) => s.reason))].join("; ")}
          </div>
        )}
      </div>
      <button type="button" className="ls-linkbtn" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

// --- history -----------------------------------------------------------------

function RunHistory({ runs, loading }: { runs: ScrapeRun[]; loading: boolean }) {
  return (
    <div className="ls-card">
      <div className="ls-scroll">
        <table>
          <thead>
            <tr>
              <th>When</th><th>Niche</th><th>Where</th><th>Found</th><th>Kept</th><th>Added</th><th>Sent</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="ls-empty">Loading...</td></tr>}
            {!loading && runs.length === 0 && (
              <tr><td colSpan={8} className="ls-empty">No runs yet.</td></tr>
            )}
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>{r.nicheLabel}</td>
                <td className="ls-dim">{r.states.length > 0 ? r.states.join(", ") : `${r.cities.length} cities`}</td>
                <td>{r.rawFound || "-"}</td>
                <td>{r.kept || "-"}</td>
                <td>{r.added || "-"}</td>
                <td>{r.sent || "-"}</td>
                <td>
                  <span className={`ls-status ${r.status}`}>{r.status}</span>
                  {passRateLabel(r) && <div className="ls-dim ls-rate">{passRateLabel(r)}</div>}
                  {r.error && <div className="ls-err">{r.error}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- styles ------------------------------------------------------------------

// Scoped to .pk-kit so it reads the admin theme tokens in light and dark, matching
// the Cold SMS surface next door. Indigo is the accent the pillar already uses.
function LeadsStyle() {
  return (
    <style>{`
      .pk-kit { --ls-indigo: #6366f1; --ls-indigo-tint: #eef0ff; --ls-head-bg: #fafbfc; --ls-hover: #fbfbfd; }
      [data-theme="dark"] .pk-kit {
        --ls-indigo-tint: rgba(99,102,241,.18);
        --ls-head-bg: color-mix(in srgb, var(--surface) 80%, transparent);
        --ls-hover: rgba(255,255,255,.03);
      }

      .pk-kit .ls-subnav { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
      .pk-kit .ls-subtab {
        border: 0; background: transparent; cursor: pointer; font-family: inherit;
        font-size: 13.5px; font-weight: 600; color: var(--text-faint); padding: 9px 2px;
        border-bottom: 2.5px solid transparent; transition: .15s;
        display: inline-flex; align-items: center; gap: 7px;
      }
      .pk-kit .ls-subtab:hover { color: var(--text); }
      .pk-kit .ls-subtab.on { color: var(--ls-indigo); border-bottom-color: var(--ls-indigo); }
      .pk-kit .ls-cnt {
        font-size: 11px; font-weight: 700; background: var(--ls-indigo-tint);
        color: var(--ls-indigo); padding: 1px 7px; border-radius: 999px;
      }

      .pk-kit .ls-card, .pk-kit .ls-wizard {
        background: var(--surface); border: 1px solid var(--border); border-radius: 22px;
        box-shadow: var(--shadow-md); overflow: hidden;
      }
      .pk-kit .ls-wizard { padding: 4px 0 20px; }

      /* the run banner */
      .pk-kit .ls-banner {
        background: var(--surface); border: 1px solid var(--border); border-radius: 18px;
        padding: 14px 18px; margin-bottom: 16px; box-shadow: var(--shadow-md);
      }
      .pk-kit .ls-banner.warn { border-color: #f59e0b; }
      .pk-kit .ls-banner-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
      .pk-kit .ls-banner-title {
        display: inline-flex; align-items: center; gap: 8px;
        font-family: var(--font-display); font-weight: 600; font-size: 15px; color: var(--text);
      }
      .pk-kit .ls-banner-where { font-size: 12px; font-weight: 500; color: var(--text-faint); }
      .pk-kit .ls-banner-host { font-size: 11.5px; color: var(--text-faint); }
      .pk-kit .ls-bar { height: 6px; background: var(--ls-indigo-tint); border-radius: 999px; overflow: hidden; margin: 10px 0 8px; }
      .pk-kit .ls-bar-fill { height: 100%; background: var(--ls-indigo); border-radius: 999px; transition: width .4s ease; }
      .pk-kit .ls-bar-fill.indet { width: 34%; animation: ls-slide 1.4s ease-in-out infinite; }
      @keyframes ls-slide { 0% { margin-left: -34%; } 100% { margin-left: 100%; } }
      @media (prefers-reduced-motion: reduce) {
        .pk-kit .ls-bar-fill.indet { animation: none; width: 100%; opacity: .4; }
        .pk-kit .ls-spin { animation: none; }
      }
      .pk-kit .ls-banner-line { font-size: 13px; color: var(--text-muted); }
      .pk-kit .ls-banner-stats { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; font-size: 12.5px; color: var(--text-faint); }
      .pk-kit .ls-banner-stats b { color: var(--text); font-variant-numeric: tabular-nums; }

      .pk-kit .ls-spin { animation: ls-rot 1s linear infinite; }
      @keyframes ls-rot { to { transform: rotate(360deg); } }

      .pk-kit .ls-note {
        display: flex; align-items: flex-start; gap: 8px; margin: 10px 18px;
        font-size: 12.5px; color: var(--text-muted); background: var(--ls-hover);
        border: 1px solid var(--border); border-radius: 12px; padding: 9px 12px;
      }
      .pk-kit .ls-note.warn { border-color: #f59e0b; }

      /* the wizard */
      .pk-kit .ls-step { padding: 18px 22px; border-bottom: 1px solid var(--border); }
      .pk-kit .ls-step:last-of-type { border-bottom: 0; }
      .pk-kit .ls-step-h {
        display: flex; align-items: center; gap: 10px; margin: 0 0 14px;
        font-family: var(--font-display); font-weight: 600; font-size: 15px; color: var(--text);
      }
      .pk-kit .ls-step-n {
        width: 22px; height: 22px; border-radius: 999px; background: var(--ls-indigo-tint);
        color: var(--ls-indigo); font-size: 12px; font-weight: 700;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .pk-kit .ls-chips, .pk-kit .ls-sizes { display: flex; gap: 10px; flex-wrap: wrap; }
      .pk-kit .ls-chip, .pk-kit .ls-size {
        display: flex; flex-direction: column; gap: 2px; text-align: left; cursor: pointer;
        border: 1px solid var(--border); background: var(--surface); border-radius: 14px;
        padding: 10px 14px; font-family: inherit; color: var(--text); transition: .15s; min-width: 180px;
      }
      .pk-kit .ls-chip:hover, .pk-kit .ls-size:hover { background: var(--ls-hover); }
      .pk-kit .ls-chip.on, .pk-kit .ls-size.on { border-color: var(--ls-indigo); background: var(--ls-indigo-tint); }
      .pk-kit .ls-chip-label, .pk-kit .ls-size-label { font-weight: 600; font-size: 13.5px; }
      .pk-kit .ls-chip-sub, .pk-kit .ls-size-blurb { font-size: 11.5px; color: var(--text-faint); }

      .pk-kit .ls-modes { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
      .pk-kit .ls-mode {
        border: 1px solid var(--border); background: var(--surface); color: var(--text-muted);
        border-radius: 999px; padding: 7px 14px; font: inherit; font-size: 12.5px; cursor: pointer;
      }
      .pk-kit .ls-mode.on { border-color: var(--ls-indigo); color: var(--ls-indigo); background: var(--ls-indigo-tint); font-weight: 600; }

      .pk-kit .ls-states { display: flex; flex-wrap: wrap; gap: 6px; }
      .pk-kit .ls-state {
        min-width: 40px; border: 1px solid var(--border); background: var(--surface);
        color: var(--text-muted); border-radius: 9px; padding: 6px 9px; cursor: pointer;
        font: inherit; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums;
      }
      .pk-kit .ls-state:hover { background: var(--ls-hover); }
      .pk-kit .ls-state.on { border-color: var(--ls-indigo); background: var(--ls-indigo); color: #fff; }

      .pk-kit .ls-cities { margin-top: 16px; }
      .pk-kit .ls-cities-head {
        display: flex; justify-content: space-between; align-items: center; gap: 10px;
        font-size: 12px; color: var(--text-faint); margin-bottom: 8px; flex-wrap: wrap;
      }
      .pk-kit .ls-citylist { display: flex; flex-wrap: wrap; gap: 6px; max-height: 260px; overflow: auto; }
      .pk-kit .ls-city {
        border: 1px solid var(--border); background: var(--surface); color: var(--text);
        border-radius: 999px; padding: 5px 11px; font: inherit; font-size: 12px; cursor: pointer;
      }
      .pk-kit .ls-city.anchor { font-weight: 600; }
      .pk-kit .ls-city.off { text-decoration: line-through; color: var(--text-faint); opacity: .55; }

      .pk-kit .ls-textarea {
        width: 100%; border: 1px solid var(--border); background: var(--surface); color: var(--text);
        border-radius: 12px; padding: 10px 12px; font: inherit; font-size: 13px; resize: vertical;
      }
      .pk-kit .ls-textarea:focus { outline: 0; box-shadow: 0 0 0 2px var(--ls-indigo); }

      .pk-kit .ls-go { display: flex; align-items: center; gap: 12px; padding: 18px 22px 0; flex-wrap: wrap; }
      .pk-kit .ls-primary {
        display: inline-flex; align-items: center; gap: 7px; border: 0; cursor: pointer;
        background: var(--ls-indigo); color: #fff; font-family: inherit; font-weight: 600;
        font-size: 13.5px; padding: 10px 16px; border-radius: 12px;
      }
      .pk-kit .ls-primary.sm { font-size: 12.5px; padding: 8px 13px; }
      .pk-kit .ls-primary.alt { background: var(--ls-indigo-tint); color: var(--ls-indigo); }
      .pk-kit .ls-primary:hover:not(:disabled) { filter: brightness(.95); }
      .pk-kit .ls-primary:disabled { opacity: .45; cursor: not-allowed; }
      .pk-kit .ls-footnote { padding: 14px 22px 0; font-size: 12px; color: var(--text-faint); }
      .pk-kit .ls-footnote code, .pk-kit .ls-muted code {
        background: var(--ls-hover); border: 1px solid var(--border); border-radius: 5px; padding: 1px 5px; font-size: 11.5px;
      }

      /* the table */
      .pk-kit .ls-toolbar {
        display: flex; align-items: center; gap: 10px; padding: 14px 18px;
        border-bottom: 1px solid var(--border); flex-wrap: wrap;
      }
      .pk-kit .ls-toolbar-right { margin-left: auto; display: flex; gap: 8px; }
      .pk-kit .ls-search { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--border); border-radius: 10px; padding: 0 10px; background: var(--surface); }
      .pk-kit .ls-search input { border: 0; background: transparent; color: var(--text); font: inherit; font-size: 12.5px; padding: 8px 0; min-width: 190px; }
      .pk-kit .ls-search input:focus { outline: 0; }
      .pk-kit .ls-select {
        border: 1px solid var(--border); background: var(--surface); color: var(--text);
        border-radius: 10px; padding: 8px 10px; font: inherit; font-size: 12.5px;
      }
      .pk-kit .ls-ghost {
        display: inline-flex; align-items: center; gap: 6px; text-decoration: none;
        border: 1px solid var(--border); background: var(--surface); color: var(--text-muted);
        border-radius: 10px; padding: 8px 12px; font-size: 12.5px; font-weight: 600;
      }
      .pk-kit .ls-ghost:hover { background: var(--ls-hover); color: var(--text); }

      .pk-kit .ls-actionbar {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 11px 18px; background: var(--ls-indigo-tint); flex-wrap: wrap;
      }
      .pk-kit .ls-actionbar-count { font-size: 12.5px; color: var(--text); }
      .pk-kit .ls-actionbar-count b { font-variant-numeric: tabular-nums; }
      .pk-kit .ls-actionbar-count em { font-style: normal; color: var(--text-faint); margin-left: 8px; }
      .pk-kit .ls-actionbar-btns { display: flex; gap: 8px; }

      .pk-kit .ls-receipt {
        display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
        padding: 11px 18px; font-size: 12.5px; color: var(--text);
        border-bottom: 1px solid var(--border); background: var(--ls-hover);
      }
      .pk-kit .ls-receipt.warn { border-left: 3px solid #f59e0b; }
      .pk-kit .ls-receipt-skipped { color: var(--text-faint); margin-top: 3px; }

      .pk-kit .ls-scroll { overflow: auto; max-height: min(72vh, 900px); }
      .pk-kit .ls-card table { width: 100%; border-collapse: collapse; }
      .pk-kit .ls-card thead th {
        position: sticky; top: 0; z-index: 2; background: var(--ls-head-bg);
        font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
        color: var(--text-faint); text-align: left; padding: 11px 14px; white-space: nowrap;
        border-bottom: 1px solid var(--border);
      }
      .pk-kit .ls-card tbody td {
        padding: 9px 14px; font-size: 13px; border-bottom: 1px solid var(--border); vertical-align: top;
      }
      .pk-kit .ls-card tbody tr:hover td { background: var(--ls-hover); }
      .pk-kit .ls-card tbody tr.on td { background: var(--ls-indigo-tint); }
      .pk-kit .ls-tick { width: 34px; }
      .pk-kit .ls-name {
        border: 0; background: transparent; padding: 0; cursor: pointer; font: inherit;
        font-weight: 600; color: var(--text); text-align: left; text-decoration: underline;
        text-decoration-style: dotted; text-underline-offset: 3px;
      }
      .pk-kit .ls-phone { font-size: 11.5px; color: var(--text-faint); font-variant-numeric: tabular-nums; }
      .pk-kit .ls-dim { color: var(--text-faint); }
      .pk-kit .ls-score {
        display: inline-block; min-width: 30px; text-align: center; border-radius: 8px;
        padding: 2px 7px; font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums;
      }
      .pk-kit .ls-score.high { background: rgba(16,185,129,.15); color: #059669; }
      .pk-kit .ls-score.medium { background: var(--ls-indigo-tint); color: var(--ls-indigo); }
      .pk-kit .ls-score.low { background: rgba(148,163,184,.18); color: var(--text-muted); }
      .pk-kit .ls-link { display: inline-flex; align-items: center; gap: 4px; color: var(--ls-indigo); text-decoration: none; font-size: 12.5px; }
      .pk-kit .ls-link:hover { text-decoration: underline; }
      .pk-kit .ls-sent { display: inline-flex; align-items: center; gap: 4px; color: #059669; font-size: 12.5px; font-weight: 600; }
      .pk-kit .ls-empty { padding: 30px 18px; text-align: center; color: var(--text-muted); }
      .pk-kit .ls-foot { padding: 11px 18px; font-size: 12px; color: var(--text-faint); border-top: 1px solid var(--border); }

      .pk-kit .ls-why td { background: var(--ls-hover); }
      .pk-kit .ls-why-box { font-size: 12.5px; color: var(--text-muted); }
      .pk-kit .ls-why-box b { color: var(--text); }
      .pk-kit .ls-why-box ul { margin: 6px 0 0; padding-left: 18px; }
      .pk-kit .ls-why-meta { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 7px; color: var(--text-faint); font-size: 11.5px; }

      .pk-kit .ls-status { font-size: 11.5px; font-weight: 600; text-transform: capitalize; }
      .pk-kit .ls-status.done { color: #059669; }
      .pk-kit .ls-status.failed { color: #dc2626; }
      .pk-kit .ls-status.running, .pk-kit .ls-status.queued, .pk-kit .ls-status.preparing { color: var(--ls-indigo); }
      .pk-kit .ls-rate { font-size: 11px; }
      .pk-kit .ls-err { color: #dc2626; font-size: 12px; }
      .pk-kit .ls-muted { color: var(--text-faint); font-size: 12.5px; }
      .pk-kit .ls-linkbtn { border: 0; background: transparent; color: var(--ls-indigo); cursor: pointer; font: inherit; font-size: 12px; }
    `}</style>
  );
}
