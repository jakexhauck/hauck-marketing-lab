import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./automations.css";

/**
 * Automations overview. A catalogue of every automation in the app, plus a
 * Make.com-style flow visualizer that pops up when you click a card.
 *
 * The catalogue (and each flow) is hand-curated. When a new automation lands,
 * append to AUTOMATIONS with its flow definition.
 */

type AutomationStatus = "running" | "manual" | "stub" | "planned" | "broken";
type Cadence = "live" | "fast" | "slow" | "event" | "manual" | "idea";

type NodeKind = "trigger" | "external" | "process" | "store" | "ui" | "output";

interface FlowNode {
  kind: NodeKind;
  label: string;
  sub?: string;
  glyph?: string;
}

interface Automation {
  name: string;
  category: CategoryId;
  status: AutomationStatus;
  cadence: Cadence;
  cadenceLabel: string;
  what: string;
  flow: FlowNode[];
}

type CategoryId =
  | "calendar"
  | "ads"
  | "agents"
  | "vault"
  | "outreach"
  | "onboarding"
  | "notifications"
  | "sync"
  | "ideas";

interface Category {
  id: CategoryId;
  name: string;
  blurb: string;
  glyph: string;
  accent: "purple" | "blue" | "teal" | "amber" | "plum" | "green" | "neutral" | "red";
}

const CATEGORIES: Category[] = [
  { id: "calendar", name: "Calendar & Scheduling", glyph: "◷", blurb: "GHL bookings, Google Calendar, Today views.", accent: "blue" },
  { id: "ads", name: "Ad Platforms", glyph: "◈", blurb: "Meta Ads pulls, campaign control, KPI caching.", accent: "purple" },
  { id: "agents", name: "AI Agents & Generators", glyph: "✦", blurb: "Claude, Replicate, Gemini. Brains and brushes.", accent: "plum" },
  { id: "vault", name: "Vault & Memory", glyph: "❒", blurb: "File watchers and memory writebacks.", accent: "teal" },
  { id: "outreach", name: "Outreach & Lead Gen", glyph: "➤", blurb: "Lead scraper, web designer, sequences.", accent: "amber" },
  { id: "onboarding", name: "Onboarding & Pipeline", glyph: "✓", blurb: "Phase advancement and opportunity sync.", accent: "green" },
  { id: "notifications", name: "Notifications & Events", glyph: "◉", blurb: "Activity log, event bus, the bell.", accent: "neutral" },
  { id: "sync", name: "File & Git Sync", glyph: "⇅", blurb: "Git sync, Drive index, vault backup.", accent: "blue" },
  { id: "ideas", name: "Gaps & Ideas", glyph: "✧", blurb: "Things worth automating next.", accent: "red" },
];

// Tiny node factories so the data block stays readable.
const T = (label: string, sub?: string, glyph?: string): FlowNode => ({ kind: "trigger", label, sub, glyph });
const X = (label: string, sub?: string, glyph?: string): FlowNode => ({ kind: "external", label, sub, glyph });
const P = (label: string, sub?: string, glyph?: string): FlowNode => ({ kind: "process", label, sub, glyph });
const S = (label: string, sub?: string, glyph?: string): FlowNode => ({ kind: "store", label, sub, glyph });
const U = (label: string, sub?: string, glyph?: string): FlowNode => ({ kind: "ui", label, sub, glyph });
const O = (label: string, sub?: string, glyph?: string): FlowNode => ({ kind: "output", label, sub, glyph });

const AUTOMATIONS: Automation[] = [
  // ───── Calendar & Scheduling ─────
  {
    name: "GHL to HML calendar sync",
    category: "calendar", status: "running", cadence: "fast", cadenceLabel: "Every 90s",
    what: "Mirrors GHL bookings into HML, advances the sales pipeline.",
    flow: [
      T("Timer", "every 90s", "◷"),
      X("GHL", "/calendars/events", "G"),
      P("Parse bookings", "diff vs cache"),
      S("appointments.json"),
      O("Pipeline advance", "Call Booked stage"),
      U("Sales Hub", "kanban update"),
    ],
  },
  {
    name: "Google Calendar fetch",
    category: "calendar", status: "running", cadence: "slow", cadenceLabel: "Every 10 min",
    what: "Refreshes the dashboard Today widget and Booked-Today panel.",
    flow: [
      T("Timer", "10 min + on focus", "◷"),
      X("Google Calendar", "events.list", "G"),
      P("Merge with HML appts"),
      U("Today widget", "Dashboard"),
    ],
  },
  {
    name: "Sales Hub appointment poll",
    category: "calendar", status: "running", cadence: "fast", cadenceLabel: "Every 15s",
    what: "Keeps kanban appointment badges in sync.",
    flow: [
      T("Timer", "every 15s", "◷"),
      S("appointments.json", "read tail"),
      P("Diff badges"),
      U("Kanban badges"),
    ],
  },
  {
    name: "Calendar sync listener",
    category: "calendar", status: "running", cadence: "event", cadenceLabel: "On sync event",
    what: "Instantly updates calendar when a new booking lands.",
    flow: [
      T("Event", "hml:ghl-calendar-sync", "⚡"),
      P("Reload appts"),
      U("Calendar view"),
    ],
  },

  // ───── Ad Platforms ─────
  {
    name: "Meta Ads insights pull",
    category: "ads", status: "running", cadence: "event", cadenceLabel: "On page load",
    what: "Fetches campaign and ad insights with a 15-min cache.",
    flow: [
      T("Page open", "AdsManagerPage", "⚡"),
      X("Meta Graph", "/insights v21.0", "M"),
      P("Cache 15 min"),
      U("Ads Manager", "tables + charts"),
    ],
  },
  {
    name: "Meta campaign control",
    category: "ads", status: "running", cadence: "manual", cadenceLabel: "On demand",
    what: "Pause, resume, duplicate, or change budget from the app.",
    flow: [
      T("User action", "pause / resume / budget", "✋"),
      X("Meta Marketing API", "campaign mutate", "M"),
      P("Confirm response"),
      U("Ads Manager", "row re-render"),
    ],
  },
  {
    name: "Meta KPI backfill",
    category: "ads", status: "manual", cadence: "manual", cadenceLabel: "Manual",
    what: "Caches spend and ROAS into revenue.json. Should be nightly.",
    flow: [
      T("Manual command", "meta_backfill_kpis", "✋"),
      X("Meta Graph", "insights aggregate", "M"),
      P("Roll up daily"),
      S("revenue.json"),
    ],
  },

  // ───── AI Agents & Generators ─────
  {
    name: "Claude prompt invocation",
    category: "agents", status: "running", cadence: "event", cadenceLabel: "On demand",
    what: "Background claude -p for memory, transcripts, form outputs.",
    flow: [
      T("Caller", "form / memory / transcript", "⚡"),
      X("claude -p", "background process", "C"),
      P("Parse output"),
      O("Apply", "to vault / form"),
    ],
  },
  {
    name: "Replicate image generation",
    category: "agents", status: "running", cadence: "event", cadenceLabel: "On demand",
    what: "Creative Studio image renders, polled every 2s until done.",
    flow: [
      T("User submit", "prompt + model", "⚡"),
      X("Replicate", "predictions.create", "R"),
      P("Poll 2s", "until succeeded"),
      S("creatives/", "saved to disk"),
      U("Creative Studio"),
    ],
  },
  {
    name: "Gemini Nano Banana",
    category: "agents", status: "running", cadence: "event", cadenceLabel: "On demand",
    what: "Generates creative sets for the playback ring.",
    flow: [
      T("User submit", "ring spec", "⚡"),
      X("Gemini", "image gen", "G"),
      P("Parse images"),
      S("creatives/"),
      U("Creative Ring"),
    ],
  },
  {
    name: "Transcript ingest",
    category: "agents", status: "running", cadence: "manual", cadenceLabel: "On upload",
    what: "Parses Fathom transcripts into Memory and Profile facts.",
    flow: [
      T("Upload", "Fathom .md", "✋"),
      X("claude -p", "extract facts", "C"),
      P("Classify", "add / update / supersede"),
      S("Memory.md + Profile.md"),
    ],
  },

  // ───── Vault & Memory ─────
  {
    name: "Vault file watcher",
    category: "vault", status: "running", cadence: "live", cadenceLabel: "Live",
    what: "Watches vault and recordings, fires change events instantly.",
    flow: [
      T("FS event", "create / write / delete", "⚡"),
      P("Debounce 150ms"),
      O("vault://changed", "emit event"),
      U("Bound components", "auto refresh"),
    ],
  },
  {
    name: "Memory writeback",
    category: "vault", status: "running", cadence: "event", cadenceLabel: "On form save",
    what: "Appends durable facts from agent outputs into Memory.md.",
    flow: [
      T("Form save", "agent output", "⚡"),
      X("claude -p", "fact extraction", "C"),
      P("Filter durable facts"),
      S("Memory.md", "append"),
    ],
  },
  {
    name: "Drive index refresh",
    category: "vault", status: "manual", cadence: "manual", cadenceLabel: "Per client",
    what: "Regenerates a client's Drive folder map via Claude.",
    flow: [
      T("Manual", "per-client button", "✋"),
      X("Google Drive", "list folder", "D"),
      X("claude -p", "summarize", "C"),
      S("_drive-index.md"),
    ],
  },

  // ───── Outreach ─────
  {
    name: "Lead scraper",
    category: "outreach", status: "manual", cadence: "manual", cadenceLabel: "Manual run",
    what: "Places + Sheets scrape, writes prospects CSV.",
    flow: [
      T("Manual", "python scrape.py", "✋"),
      X("Google Places", "search", "P"),
      X("Google Sheets", "append", "S"),
      S("prospects.csv"),
    ],
  },
  {
    name: "Web designer revamp",
    category: "outreach", status: "stub", cadence: "manual", cadenceLabel: "Manual",
    what: "Claude generates a landing page for a prospect.",
    flow: [
      T("Trigger", "prospect picker", "✋"),
      X("claude -p", "web-designer skill", "C"),
      P("Render HTML"),
      S("revamp.html", "mockup"),
    ],
  },
  {
    name: "Cold-call sequence",
    category: "outreach", status: "manual", cadence: "manual", cadenceLabel: "Wizard",
    what: "Step-by-step UI, not auto-advancing on outside signals.",
    flow: [
      T("User step", "wizard click", "✋"),
      P("Update status"),
      S("prospect profile.md"),
      U("Sequence page"),
    ],
  },

  // ───── Onboarding ─────
  {
    name: "Phase to GHL pipeline",
    category: "onboarding", status: "running", cadence: "event", cadenceLabel: "On phase done",
    what: "Pushes opportunity stage to GHL when a checklist phase completes.",
    flow: [
      T("Phase complete", "checklist event", "⚡"),
      X("GHL", "opportunities.update", "G"),
      S("clients.yaml", "cache IDs"),
      U("Sales Hub"),
    ],
  },
  {
    name: "Onboarding auto-populate",
    category: "onboarding", status: "running", cadence: "event", cadenceLabel: "On intake submit",
    what: "Carries adsLaunchedAt and invoicePaidAt into the checklist.",
    flow: [
      T("Intake submit", "form save", "⚡"),
      P("Map fields"),
      S("onboarding.json + clients.yaml"),
      U("Client Hub"),
    ],
  },
  {
    name: "GHL opportunity mirror",
    category: "onboarding", status: "stub", cadence: "manual", cadenceLabel: "On page load",
    what: "Reads but doesn't auto-refresh when GHL changes upstream.",
    flow: [
      T("Page open", "Sales Hub", "⚡"),
      X("GHL", "opportunities.list", "G"),
      U("Kanban", "read-only render"),
    ],
  },

  // ───── Notifications ─────
  {
    name: "Activity log writer",
    category: "notifications", status: "running", cadence: "live", cadenceLabel: "Live",
    what: "Fires data change events on every mutation.",
    flow: [
      T("Data mutation", "any write", "⚡"),
      S("activity.json", "append"),
      O("data://changed", "broadcast"),
    ],
  },
  {
    name: "Notifications bell",
    category: "notifications", status: "running", cadence: "live", cadenceLabel: "Live",
    what: "Tails the last 50 events, flags hot items in the topbar.",
    flow: [
      T("data://changed", "or mount", "⚡"),
      S("activity.json", "tail 50"),
      P("Flag hot items"),
      U("Topbar bell", "badge + dropdown"),
    ],
  },

  // ───── Sync ─────
  {
    name: "Git sync",
    category: "sync", status: "manual", cadence: "manual", cadenceLabel: "Button click",
    what: "Commits, pulls, and pushes the repo on demand.",
    flow: [
      T("Click", "Sync button", "✋"),
      P("git add + commit", "host + timestamp"),
      X("GitHub", "pull + push", "G"),
      U("Topbar status"),
    ],
  },

  // ───── Ideas ─────
  {
    name: "Nightly Meta KPI backfill",
    category: "ideas", status: "planned", cadence: "idea", cadenceLabel: "Idea",
    what: "Run KPI backfill once a day so revenue.json never lags.",
    flow: [
      T("Cron", "nightly 02:00", "⌛"),
      X("Meta Graph", "yesterday's insights", "M"),
      P("Roll up"),
      S("revenue.json"),
      U("Reports / Client Hub"),
    ],
  },
  {
    name: "Fathom transcript auto-pull",
    category: "ideas", status: "planned", cadence: "idea", cadenceLabel: "Idea",
    what: "Pull new transcripts the moment Fathom finishes processing.",
    flow: [
      T("Webhook", "Fathom processed", "⚡"),
      X("Fathom API", "transcript", "F"),
      X("claude -p", "extract facts", "C"),
      S("Memory.md"),
    ],
  },
  {
    name: "GHL inbound webhooks",
    category: "ideas", status: "planned", cadence: "idea", cadenceLabel: "Idea",
    what: "Real-time push instead of 15 to 90-second polling.",
    flow: [
      T("GHL workflow", "booking / status / lead", "⚡"),
      X("HML webhook endpoint", "POST /hooks/ghl", "H"),
      P("Route by type"),
      O("Update state", "instant"),
    ],
  },
  {
    name: "Weekly lead scraper",
    category: "ideas", status: "planned", cadence: "idea", cadenceLabel: "Idea",
    what: "Auto-run the scraper every Monday, deliver new rows for review.",
    flow: [
      T("Cron", "Mon 09:00", "⌛"),
      X("Places + Sheets"),
      S("prospects.csv"),
      O("Notification", "review queue"),
    ],
  },
  {
    name: "Sales Hub auto-refresh",
    category: "ideas", status: "planned", cadence: "idea", cadenceLabel: "Idea",
    what: "Poll GHL opportunities so the kanban mirrors reality.",
    flow: [
      T("Timer", "every 30s", "◷"),
      X("GHL", "opportunities.list", "G"),
      P("Diff vs cache"),
      U("Kanban"),
    ],
  },
  {
    name: "Auto-revamp on new prospect",
    category: "ideas", status: "planned", cadence: "idea", cadenceLabel: "Idea",
    what: "Kick off web-designer revamp the moment a prospect is added.",
    flow: [
      T("Prospect created", "vault event", "⚡"),
      X("claude -p", "web designer", "C"),
      S("revamp.html"),
      O("Notification", "outreach queue"),
    ],
  },
];

const STATUS_META: Record<AutomationStatus, { label: string; tone: string }> = {
  running: { label: "Live", tone: "green" },
  manual: { label: "Manual", tone: "amber" },
  stub: { label: "Stub", tone: "plum" },
  planned: { label: "Idea", tone: "blue" },
  broken: { label: "Broken", tone: "red" },
};

type StatusFilter = "all" | AutomationStatus;

export function AutomationsPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Automation | null>(null);

  const stats = useMemo(() => {
    const c: Record<AutomationStatus, number> = { running: 0, manual: 0, stub: 0, planned: 0, broken: 0 };
    for (const a of AUTOMATIONS) c[a.status]++;
    return c;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return AUTOMATIONS.filter((a) => {
      if (filter !== "all" && a.status !== filter) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.what.toLowerCase().includes(q) ||
        a.cadenceLabel.toLowerCase().includes(q)
      );
    });
  }, [query, filter]);

  const byCategory = useMemo(() => {
    const map = new Map<CategoryId, Automation[]>();
    for (const c of CATEGORIES) map.set(c.id, []);
    for (const a of filtered) map.get(a.category)?.push(a);
    return map;
  }, [filtered]);

  const filterChips: { id: StatusFilter; label: string; count: number; tone: string }[] = [
    { id: "all", label: "All", count: AUTOMATIONS.length, tone: "neutral" },
    { id: "running", label: "Live", count: stats.running, tone: "green" },
    { id: "manual", label: "Manual", count: stats.manual, tone: "amber" },
    { id: "stub", label: "Stubs", count: stats.stub, tone: "plum" },
    { id: "planned", label: "Ideas", count: stats.planned, tone: "blue" },
  ];

  return (
    <div className="hml-content auto-shell">
      <section className="auto-hero">
        <div>
          <div className="auto-eyebrow">
            <span className="hml-eyebrow-dot" />
            WORKSPACE
          </div>
          <h1 className="auto-title">Automations</h1>
          <p className="auto-sub">
            Every running sync, agent loop, and integration in one place. Click
            any card to see its flow.
          </p>
        </div>
        <div className="auto-hero-stats">
          <StatTile label="Live" value={stats.running} tone="green" pulse />
          <StatTile label="Manual" value={stats.manual} tone="amber" />
          <StatTile label="Stubs" value={stats.stub} tone="plum" />
          <StatTile label="Ideas" value={stats.planned} tone="blue" />
        </div>
      </section>

      <div className="auto-toolbar">
        <input
          type="text"
          className="auto-search"
          placeholder="Search automations…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="auto-chips">
          {filterChips.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`auto-chip auto-chip-${f.tone}${filter === f.id ? " auto-chip-on" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              <span className={`auto-chip-dot auto-dot-${f.tone}`} />
              {f.label}
              <span className="auto-chip-count">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="auto-categories">
        {CATEGORIES.map((cat) => {
          const items = byCategory.get(cat.id) ?? [];
          if (items.length === 0 && (query || filter !== "all")) return null;
          return (
            <section key={cat.id} className={`auto-cat auto-cat-${cat.accent}`}>
              <header className="auto-cat-head">
                <span className="auto-cat-glyph">{cat.glyph}</span>
                <div className="auto-cat-meta">
                  <div className="auto-cat-name">
                    {cat.name}
                    <span className="auto-cat-count">{items.length}</span>
                  </div>
                  <div className="auto-cat-blurb">{cat.blurb}</div>
                </div>
              </header>

              {items.length === 0 ? (
                <div className="auto-cat-empty">Nothing wired here yet.</div>
              ) : (
                <div className="auto-grid">
                  {items.map((a) => (
                    <AutomationCard
                      key={a.name}
                      a={a}
                      onOpen={() => setSelected(a)}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {selected && (
        <FlowModal a={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function AutomationCard({ a, onOpen }: { a: Automation; onOpen: () => void }) {
  const meta = STATUS_META[a.status];
  const live = a.status === "running";
  return (
    <button
      type="button"
      className={`auto-card auto-card-${a.status}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen();
      }}
    >
      <div className="auto-card-top">
        <span className={`auto-status-dot auto-dot-${meta.tone}${live ? " auto-dot-pulse" : ""}`} />
        <span className={`auto-status-label auto-label-${meta.tone}`}>{meta.label}</span>
        <span className="auto-card-view">View flow ↗</span>
      </div>

      <h3 className="auto-card-name">{a.name}</h3>
      <p className="auto-card-what">{a.what}</p>

      <div className="auto-card-foot">
        <span className={`auto-cadence auto-cadence-${a.cadence}`}>
          <span className="auto-cadence-glyph">{cadenceGlyph(a.cadence)}</span>
          {a.cadenceLabel}
        </span>
        <span className="auto-card-mini-flow">
          {a.flow.slice(0, 5).map((n, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="auto-mini-arrow">›</span>}
              <span className={`auto-mini-node auto-mini-node-${n.kind}`} title={n.label}>
                {miniGlyph(n)}
              </span>
            </Fragment>
          ))}
          {a.flow.length > 5 && <span className="auto-mini-more">+{a.flow.length - 5}</span>}
        </span>
      </div>
    </button>
  );
}

function FlowModal({ a, onClose }: { a: Automation; onClose: () => void }) {
  const meta = STATUS_META[a.status];
  const live = a.status === "running";
  // Ignore any backdrop press that happens in the first frames after mount.
  // Prevents the originating click (or its synthesized mousedown) from
  // immediately closing the modal it just opened.
  const armedRef = useRef(false);

  useEffect(() => {
    const armTimer = window.setTimeout(() => {
      armedRef.current = true;
    }, 250);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(armTimer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      armedRef.current = false;
    };
  }, [onClose]);

  const modal = (
    <div
      className="auto-modal-backdrop"
      onMouseDown={(e) => {
        if (!armedRef.current) return;
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="auto-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="auto-modal-head">
          <div className="auto-modal-head-meta">
            <span className={`auto-status-dot auto-dot-${meta.tone}${live ? " auto-dot-pulse" : ""}`} />
            <span className={`auto-status-label auto-label-${meta.tone}`}>{meta.label}</span>
            <span className={`auto-cadence auto-cadence-${a.cadence}`}>
              <span className="auto-cadence-glyph">{cadenceGlyph(a.cadence)}</span>
              {a.cadenceLabel}
            </span>
          </div>
          <button
            type="button"
            className="auto-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <h2 className="auto-modal-title">{a.name}</h2>
        <p className="auto-modal-what">{a.what}</p>

        <div className="auto-flow-legend">
          <LegendDot kind="trigger" label="Trigger" />
          <LegendDot kind="external" label="External" />
          <LegendDot kind="process" label="Process" />
          <LegendDot kind="store" label="Store" />
          <LegendDot kind="output" label="Output" />
          <LegendDot kind="ui" label="UI" />
        </div>

        <FlowDiagram nodes={a.flow} live={live} />
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function FlowDiagram({ nodes, live }: { nodes: FlowNode[]; live: boolean }) {
  return (
    <div className="auto-flow">
      {nodes.map((n, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <div className={`auto-flow-arrow${live ? " auto-flow-arrow-live" : ""}`}>
              <span className="auto-flow-arrow-line" />
              <span className="auto-flow-arrow-tip">▸</span>
            </div>
          )}
          <FlowNodeBox n={n} index={i} />
        </Fragment>
      ))}
    </div>
  );
}

function FlowNodeBox({ n, index }: { n: FlowNode; index: number }) {
  return (
    <div className={`auto-flow-node auto-flow-node-${n.kind}`}>
      <div className="auto-flow-node-step">STEP {String(index + 1).padStart(2, "0")}</div>
      <div className="auto-flow-node-circle">
        <span className="auto-flow-node-glyph">{nodeGlyph(n)}</span>
      </div>
      <div className="auto-flow-node-kind">{kindLabel(n.kind)}</div>
      <div className="auto-flow-node-label">{n.label}</div>
      {n.sub && <div className="auto-flow-node-sub">{n.sub}</div>}
    </div>
  );
}

function LegendDot({ kind, label }: { kind: NodeKind; label: string }) {
  return (
    <span className={`auto-legend auto-legend-${kind}`}>
      <span className="auto-legend-dot" />
      {label}
    </span>
  );
}

function nodeGlyph(n: FlowNode): string {
  if (n.glyph) return n.glyph;
  switch (n.kind) {
    case "trigger":  return "⚡";
    case "external": return "⇄";
    case "process":  return "⚙";
    case "store":    return "❒";
    case "ui":       return "▣";
    case "output":   return "↗";
  }
}

function miniGlyph(n: FlowNode): string {
  if (n.glyph && n.glyph.length === 1) return n.glyph;
  switch (n.kind) {
    case "trigger":  return "⚡";
    case "external": return "⇄";
    case "process":  return "⚙";
    case "store":    return "❒";
    case "ui":       return "▣";
    case "output":   return "↗";
  }
}

function kindLabel(k: NodeKind): string {
  switch (k) {
    case "trigger":  return "TRIGGER";
    case "external": return "EXTERNAL";
    case "process":  return "PROCESS";
    case "store":    return "STORE";
    case "ui":       return "UI";
    case "output":   return "OUTPUT";
  }
}

function cadenceGlyph(c: Cadence): string {
  switch (c) {
    case "live":   return "●";
    case "fast":   return "⟳";
    case "slow":   return "◷";
    case "event":  return "⚡";
    case "manual": return "✋";
    case "idea":   return "✧";
  }
}

function StatTile({
  label, value, tone, pulse,
}: { label: string; value: number; tone: "green" | "amber" | "plum" | "blue"; pulse?: boolean }) {
  return (
    <div className={`auto-stat auto-stat-${tone}`}>
      <div className="auto-stat-head">
        <span className={`auto-stat-dot auto-dot-${tone}${pulse ? " auto-dot-pulse" : ""}`} />
        <span className="auto-stat-label">{label}</span>
      </div>
      <div className="auto-stat-value">{value}</div>
    </div>
  );
}
