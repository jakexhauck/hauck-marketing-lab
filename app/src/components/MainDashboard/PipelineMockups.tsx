/**
 * PipelineMockups — three visual variations for a read-only GHL pipeline mirror.
 *
 * Concept: GHL stays the source of truth. HML displays the pipeline + contact
 * data in a much nicer shell than GHL's own UI. Webhooks push changes, the API
 * is used to refresh on app open.
 *
 * Variants:
 *   1. Kanban — columns per stage, opportunity cards (closest to GHL's native)
 *   2. Split view — list on left, full contact detail on right
 *   3. Dense table — sortable, scannable, lots of data per row
 *
 * Read-only on purpose. All data here is mocked — wiring to real GHL data
 * happens after a direction is chosen.
 */

import { useMemo, useState } from "react";
import {
  IconCalendar,
  IconExternalLink,
  IconMail,
  IconSearch,
} from "../icons";

// ── Mock data shapes ───────────────────────────────────────

type Stage =
  | "lead"
  | "contacted"
  | "booked"
  | "showed"
  | "proposal"
  | "closed"
  | "lost";

interface Opportunity {
  id: string;
  name: string;
  business: string;
  niche: string;
  phone: string;
  email: string;
  source: "Cold Call" | "Cold DM" | "Referral" | "Inbound" | "Scraper";
  stage: Stage;
  value: number;
  createdAt: string; // ISO
  lastTouchAt: string; // ISO
  nextScheduledAt: string | null; // ISO — call booked, follow-up due, etc.
  notes: string;
  activity: ActivityEntry[];
}

interface ActivityEntry {
  kind: "call" | "sms" | "email" | "stage" | "note";
  at: string; // ISO
  summary: string;
}

const STAGE_ORDER: Stage[] = [
  "lead",
  "contacted",
  "booked",
  "showed",
  "proposal",
  "closed",
  "lost",
];

const STAGE_META: Record<Stage, { label: string; cls: string; tone: string }> = {
  lead: { label: "New Lead", cls: "hml-neutral", tone: "var(--hml-neutral)" },
  contacted: { label: "Contacted", cls: "hml-blue", tone: "var(--hml-blue)" },
  booked: { label: "Call Booked", cls: "hml-amber", tone: "var(--hml-amber)" },
  showed: { label: "Showed", cls: "hml-plum", tone: "var(--hml-plum)" },
  proposal: { label: "Proposal Sent", cls: "hml-teal", tone: "var(--hml-teal)" },
  closed: { label: "Closed", cls: "hml-green", tone: "var(--hml-green)" },
  lost: { label: "Lost", cls: "hml-red", tone: "var(--hml-red)" },
};

const MOCK_OPPS: Opportunity[] = [
  {
    id: "opp-1",
    name: "Marcus Doyle",
    business: "Doyle Pressure Washing",
    niche: "Pressure washing",
    phone: "+1 (614) 555-0114",
    email: "marcus@doylepw.com",
    source: "Cold Call",
    stage: "booked",
    value: 2500,
    createdAt: "2026-05-08",
    lastTouchAt: "2026-05-12",
    nextScheduledAt: "2026-05-14T15:00:00",
    notes: "Wants 30 jobs/mo. Currently $0 ads. Booked discovery for Thu 3pm.",
    activity: [
      { kind: "stage", at: "2026-05-12", summary: "Moved to Call Booked" },
      { kind: "call", at: "2026-05-12", summary: "Outbound · 4m 12s · Booked" },
      { kind: "sms", at: "2026-05-12", summary: "Sent: Calendar link" },
      { kind: "stage", at: "2026-05-10", summary: "Moved to Contacted" },
      { kind: "call", at: "2026-05-10", summary: "Outbound · 1m 48s · VM" },
      { kind: "stage", at: "2026-05-08", summary: "Created from Scraper" },
    ],
  },
  {
    id: "opp-2",
    name: "Lena Park",
    business: "Park Family Dentistry",
    niche: "Dental",
    phone: "+1 (614) 555-0207",
    email: "lena@parkfamilydental.com",
    source: "Referral",
    stage: "showed",
    value: 4200,
    createdAt: "2026-05-04",
    lastTouchAt: "2026-05-13",
    nextScheduledAt: "2026-05-16T10:00:00",
    notes: "Showed up on call. Strong fit. Proposal due Friday.",
    activity: [
      { kind: "stage", at: "2026-05-13", summary: "Moved to Showed" },
      { kind: "call", at: "2026-05-13", summary: "Discovery · 38m · Showed" },
      { kind: "stage", at: "2026-05-08", summary: "Moved to Call Booked" },
    ],
  },
  {
    id: "opp-3",
    name: "Devon Hill",
    business: "Hillside Roofing",
    niche: "Roofing",
    phone: "+1 (614) 555-0312",
    email: "devon@hillsideroofing.com",
    source: "Cold Call",
    stage: "proposal",
    value: 3800,
    createdAt: "2026-04-28",
    lastTouchAt: "2026-05-11",
    nextScheduledAt: "2026-05-15T14:00:00",
    notes: "Sent proposal Mon. Follow-up call Friday.",
    activity: [
      { kind: "stage", at: "2026-05-11", summary: "Moved to Proposal Sent" },
      { kind: "email", at: "2026-05-11", summary: "Sent: Proposal v1" },
      { kind: "stage", at: "2026-05-06", summary: "Moved to Showed" },
    ],
  },
  {
    id: "opp-4",
    name: "Sara Mendel",
    business: "Mendel Window Cleaning",
    niche: "Window cleaning",
    phone: "+1 (614) 555-0429",
    email: "sara@mendelwindows.com",
    source: "Cold DM",
    stage: "contacted",
    value: 1800,
    createdAt: "2026-05-11",
    lastTouchAt: "2026-05-12",
    nextScheduledAt: null,
    notes: "Replied to IG DM, wants info. Sent loom.",
    activity: [
      { kind: "sms", at: "2026-05-12", summary: "Replied: Will watch tonight" },
      { kind: "stage", at: "2026-05-12", summary: "Moved to Contacted" },
    ],
  },
  {
    id: "opp-5",
    name: "Tom Briggs",
    business: "Briggs HVAC",
    niche: "HVAC",
    phone: "+1 (614) 555-0501",
    email: "tom@briggshvac.com",
    source: "Scraper",
    stage: "lead",
    value: 0,
    createdAt: "2026-05-13",
    lastTouchAt: "2026-05-13",
    nextScheduledAt: null,
    notes: "Scraped from Places. No outreach yet.",
    activity: [
      { kind: "stage", at: "2026-05-13", summary: "Created from Scraper" },
    ],
  },
  {
    id: "opp-6",
    name: "Riley Knox",
    business: "Knox Detailing",
    niche: "Auto detail",
    phone: "+1 (614) 555-0644",
    email: "riley@knoxdetail.com",
    source: "Cold Call",
    stage: "closed",
    value: 2200,
    createdAt: "2026-04-15",
    lastTouchAt: "2026-05-09",
    nextScheduledAt: null,
    notes: "Signed retainer 5/9. Onboarding in HML.",
    activity: [
      { kind: "stage", at: "2026-05-09", summary: "Moved to Closed" },
      { kind: "email", at: "2026-05-09", summary: "Sent: Agreement signed" },
    ],
  },
  {
    id: "opp-7",
    name: "Casey Nguyen",
    business: "Nguyen Law",
    niche: "Legal",
    phone: "+1 (614) 555-0775",
    email: "casey@nguyenlaw.com",
    source: "Cold Call",
    stage: "lost",
    value: 0,
    createdAt: "2026-04-20",
    lastTouchAt: "2026-05-02",
    nextScheduledAt: null,
    notes: "Said budget pulled. Re-engage Aug.",
    activity: [
      { kind: "stage", at: "2026-05-02", summary: "Moved to Lost" },
    ],
  },
  {
    id: "opp-8",
    name: "Avery Pope",
    business: "Pope Plumbing",
    niche: "Plumbing",
    phone: "+1 (614) 555-0823",
    email: "avery@popeplumb.com",
    source: "Inbound",
    stage: "booked",
    value: 3200,
    createdAt: "2026-05-09",
    lastTouchAt: "2026-05-12",
    nextScheduledAt: "2026-05-15T11:00:00",
    notes: "Filled landing page form. Hot inbound.",
    activity: [
      { kind: "stage", at: "2026-05-12", summary: "Moved to Call Booked" },
      { kind: "email", at: "2026-05-12", summary: "Sent: Calendar link" },
      { kind: "stage", at: "2026-05-09", summary: "Created from Inbound" },
    ],
  },
  {
    id: "opp-9",
    name: "Jordan Ash",
    business: "Ash Landscaping",
    niche: "Landscaping",
    phone: "+1 (614) 555-0901",
    email: "jordan@ashlandscape.com",
    source: "Cold DM",
    stage: "contacted",
    value: 2400,
    createdAt: "2026-05-10",
    lastTouchAt: "2026-05-11",
    nextScheduledAt: null,
    notes: "Open to call but no time slot picked yet.",
    activity: [
      { kind: "sms", at: "2026-05-11", summary: "Sent: Two slots offered" },
      { kind: "stage", at: "2026-05-11", summary: "Moved to Contacted" },
    ],
  },
  {
    id: "opp-10",
    name: "Quinn Vega",
    business: "Vega Solar",
    niche: "Solar",
    phone: "+1 (614) 555-1022",
    email: "quinn@vegasolar.com",
    source: "Scraper",
    stage: "lead",
    value: 0,
    createdAt: "2026-05-13",
    lastTouchAt: "2026-05-13",
    nextScheduledAt: null,
    notes: "Scraped this morning. Needs first touch.",
    activity: [
      { kind: "stage", at: "2026-05-13", summary: "Created from Scraper" },
    ],
  },
];

// ── Variant switcher ───────────────────────────────────────

const VARIANTS = [
  { id: "kanban" as const, label: "Kanban board" },
  { id: "split" as const, label: "Split view" },
  { id: "table" as const, label: "Dense table" },
];

type VariantId = (typeof VARIANTS)[number]["id"];

export function PipelineMockups() {
  const [variant, setVariant] = useState<VariantId>("split");

  return (
    <div className="hml-content">
      <section className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <span className="hml-eyebrow-dot" />
            CRM · Mockup · Read-only
          </div>
          <h1 className="hml-page-title">Pipeline</h1>
          <div className="hml-page-subtitle">
            GoHighLevel mirror: pick a layout. Real wiring is webhooks in,
            API pulls on open. All data shown is placeholder.
          </div>
        </div>
        <div className="pm-variant-switch" role="tablist">
          {VARIANTS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={variant === v.id}
              className={`pm-variant-btn${variant === v.id ? " pm-variant-on" : ""}`}
              onClick={() => setVariant(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </section>

      <style>{MOCKUP_CSS}</style>

      {variant === "kanban" && <VariantKanban />}
      {variant === "split" && <VariantSplit />}
      {variant === "table" && <VariantTable />}
    </div>
  );
}

// ── Shared helpers ─────────────────────────────────────────

function money(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function relTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function StagePill({ stage }: { stage: Stage }) {
  const meta = STAGE_META[stage];
  return (
    <span className={`hml-pill ${meta.cls}`}>
      <span className="hml-pill-dot" />
      {meta.label}
    </span>
  );
}

// ─── Variant 1: Kanban ─────────────────────────────────────

function VariantKanban() {
  const grouped = useMemo(() => {
    const map: Record<Stage, Opportunity[]> = {
      lead: [],
      contacted: [],
      booked: [],
      showed: [],
      proposal: [],
      closed: [],
      lost: [],
    };
    for (const o of MOCK_OPPS) map[o.stage].push(o);
    return map;
  }, []);

  return (
    <div className="pm-kanban">
      {STAGE_ORDER.map((stage) => {
        const meta = STAGE_META[stage];
        const items = grouped[stage];
        const total = items.reduce((s, o) => s + o.value, 0);
        return (
          <div key={stage} className="pm-kanban-col">
            <header
              className="pm-kanban-col-head"
              style={{ borderTopColor: meta.tone }}
            >
              <div className="pm-kanban-col-title">
                <span className="pm-kanban-col-dot" style={{ background: meta.tone }} />
                {meta.label}
                <span className="pm-kanban-col-count">{items.length}</span>
              </div>
              {total > 0 && (
                <div className="pm-kanban-col-sum">{money(total)}</div>
              )}
            </header>
            <div className="pm-kanban-col-body">
              {items.map((o) => (
                <article key={o.id} className="pm-card">
                  <div className="pm-card-row">
                    <div className="pm-avatar">{initials(o.name)}</div>
                    <div className="pm-card-title-block">
                      <div className="pm-card-name">{o.name}</div>
                      <div className="pm-card-sub">{o.business}</div>
                    </div>
                  </div>
                  <div className="pm-card-meta">
                    <span className="pm-tag">{o.source}</span>
                    {o.value > 0 && (
                      <span className="pm-value">{money(o.value)}</span>
                    )}
                  </div>
                  {o.nextScheduledAt && (
                    <div className="pm-card-next">
                      <IconCalendar size={11} />
                      {fmtDateTime(o.nextScheduledAt)}
                    </div>
                  )}
                  <div className="pm-card-foot">
                    <span className="pm-card-touch">
                      Last touch {relTime(o.lastTouchAt)}
                    </span>
                  </div>
                </article>
              ))}
              {items.length === 0 && (
                <div className="pm-kanban-empty">Empty</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Variant 2: Split view ────────────────────────────────

function VariantSplit() {
  const [selectedId, setSelectedId] = useState<string>(MOCK_OPPS[0].id);
  const [filter, setFilter] = useState<Stage | "all">("all");
  const selected = MOCK_OPPS.find((o) => o.id === selectedId) ?? MOCK_OPPS[0];

  const rows = MOCK_OPPS.filter((o) => filter === "all" || o.stage === filter);

  return (
    <div className="pm-split">
      <aside className="pm-split-list">
        <header className="pm-split-list-head">
          <div className="pm-split-search">
            <IconSearch size={13} />
            <input placeholder="Search prospects…" />
          </div>
          <div className="pm-stage-filter">
            <button
              type="button"
              className={`pm-stage-chip${filter === "all" ? " pm-stage-on" : ""}`}
              onClick={() => setFilter("all")}
            >
              All <span className="pm-stage-count">{MOCK_OPPS.length}</span>
            </button>
            {STAGE_ORDER.map((s) => {
              const count = MOCK_OPPS.filter((o) => o.stage === s).length;
              if (count === 0) return null;
              const meta = STAGE_META[s];
              return (
                <button
                  key={s}
                  type="button"
                  className={`pm-stage-chip${filter === s ? " pm-stage-on" : ""}`}
                  onClick={() => setFilter(s)}
                >
                  <span
                    className="pm-stage-chip-dot"
                    style={{ background: meta.tone }}
                  />
                  {meta.label}
                  <span className="pm-stage-count">{count}</span>
                </button>
              );
            })}
          </div>
        </header>
        <div className="pm-split-rows">
          {rows.map((o) => (
            <button
              type="button"
              key={o.id}
              className={`pm-split-row${o.id === selectedId ? " pm-split-row-on" : ""}`}
              onClick={() => setSelectedId(o.id)}
            >
              <div className="pm-avatar pm-avatar-sm">{initials(o.name)}</div>
              <div className="pm-split-row-body">
                <div className="pm-split-row-line1">
                  <span className="pm-split-row-name">{o.name}</span>
                  <span className="pm-split-row-sub">· {o.business}</span>
                </div>
                <div className="pm-split-row-line2">
                  <StagePill stage={o.stage} />
                  <span className="pm-split-row-meta">
                    {relTime(o.lastTouchAt)}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="pm-split-detail">
        <header className="pm-detail-head">
          <div className="pm-avatar pm-avatar-lg">{initials(selected.name)}</div>
          <div className="pm-detail-title-block">
            <div className="pm-detail-name">{selected.name}</div>
            <div className="pm-detail-sub">
              {selected.business} · {selected.niche}
            </div>
            <div className="pm-detail-pills">
              <StagePill stage={selected.stage} />
              <span className="pm-tag">{selected.source}</span>
              {selected.value > 0 && (
                <span className="pm-value pm-value-lg">{money(selected.value)}</span>
              )}
            </div>
          </div>
          <button type="button" className="pm-ghost-btn">
            <IconExternalLink size={12} />
            Open in GHL
          </button>
        </header>

        <div className="pm-detail-grid">
          <div className="pm-detail-col">
            <div className="pm-detail-section">
              <div className="pm-section-label">Contact</div>
              <div className="pm-contact-row">
                <IconPhone size={12} />
                <span className="pm-contact-val">{selected.phone}</span>
              </div>
              <div className="pm-contact-row">
                <IconMail size={12} />
                <span className="pm-contact-val">{selected.email}</span>
              </div>
            </div>

            {selected.nextScheduledAt && (
              <div className="pm-detail-section">
                <div className="pm-section-label">Next scheduled</div>
                <div className="pm-next-card">
                  <IconCalendar size={13} />
                  <div>
                    <div className="pm-next-when">
                      {fmtDateTime(selected.nextScheduledAt)}
                    </div>
                    <div className="pm-next-what">Discovery call · 30 min</div>
                  </div>
                </div>
              </div>
            )}

            <div className="pm-detail-section">
              <div className="pm-section-label">Notes</div>
              <div className="pm-notes">{selected.notes}</div>
            </div>

            <div className="pm-detail-section">
              <div className="pm-section-label">Quick actions</div>
              <div className="pm-actions">
                <button type="button" className="pm-action-btn">
                  Trigger: Send Loom
                </button>
                <button type="button" className="pm-action-btn">
                  Trigger: Proposal Sequence
                </button>
                <button type="button" className="pm-action-btn pm-action-warn">
                  Trigger: Re-engage 90d
                </button>
              </div>
              <div className="pm-actions-note">
                Fires the matching GHL workflow. Result reflects back via webhook.
              </div>
            </div>
          </div>

          <div className="pm-detail-col">
            <div className="pm-detail-section">
              <div className="pm-section-label">Activity</div>
              <ol className="pm-timeline">
                {selected.activity.map((a, i) => (
                  <li key={i} className="pm-timeline-row">
                    <span className={`pm-timeline-dot pm-timeline-${a.kind}`} />
                    <div className="pm-timeline-body">
                      <div className="pm-timeline-summary">{a.summary}</div>
                      <div className="pm-timeline-when">{fmtDate(a.at)}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Variant 3: Dense table ───────────────────────────────

function VariantTable() {
  return (
    <div className="pm-table-wrap">
      <table className="pm-table">
        <thead>
          <tr>
            <th>Prospect</th>
            <th>Business</th>
            <th>Stage</th>
            <th>Source</th>
            <th className="pm-table-right">Value</th>
            <th>Next</th>
            <th>Last touch</th>
            <th>Phone</th>
          </tr>
        </thead>
        <tbody>
          {MOCK_OPPS.map((o) => (
            <tr key={o.id}>
              <td>
                <div className="pm-table-name-cell">
                  <div className="pm-avatar pm-avatar-sm">{initials(o.name)}</div>
                  <span>{o.name}</span>
                </div>
              </td>
              <td className="pm-text-muted">{o.business}</td>
              <td>
                <StagePill stage={o.stage} />
              </td>
              <td>
                <span className="pm-tag">{o.source}</span>
              </td>
              <td className="pm-table-right pm-mono">
                {o.value > 0 ? money(o.value) : "—"}
              </td>
              <td className="pm-text-muted">
                {o.nextScheduledAt ? fmtDateTime(o.nextScheduledAt) : "—"}
              </td>
              <td className="pm-text-muted">{relTime(o.lastTouchAt)}</td>
              <td className="pm-mono pm-text-muted">{o.phone}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Phone icon shim (in case IconPhone isn't exported) ─────
function IconPhone({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 2.5h2l1 3-1.5 1a8 8 0 0 0 4 4l1-1.5 3 1V13a1 1 0 0 1-1 1A11 11 0 0 1 2 3.5a1 1 0 0 1 1-1z" />
    </svg>
  );
}

// ─── Styles ───────────────────────────────────────────────

const MOCKUP_CSS = `
.pm-variant-switch {
  display: inline-flex;
  gap: 2px;
  margin-top: 16px;
  padding: 3px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border);
  border-radius: 8px;
}
.pm-variant-btn {
  background: transparent;
  border: none;
  color: var(--hml-text-secondary);
  font-family: inherit;
  font-size: 12.5px;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  letter-spacing: 0.01em;
  transition: background 120ms ease, color 120ms ease;
}
.pm-variant-btn:hover { color: var(--hml-text-primary); }
.pm-variant-on {
  background: var(--hml-bg-elev-1);
  color: var(--hml-accent);
  box-shadow: inset 0 0 0 1px var(--hml-accent-border);
}

/* shared atoms */
.pm-avatar {
  width: 32px;
  height: 32px;
  border-radius: 7px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--brand) 18%, transparent), color-mix(in srgb, var(--brand) 4%, transparent));
  border: 1px solid var(--brand-tint-strong);
  color: var(--hml-accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}
.pm-avatar-sm { width: 24px; height: 24px; font-size: 10px; border-radius: 5px; }
.pm-avatar-lg { width: 48px; height: 48px; font-size: 16px; border-radius: 10px; }

.pm-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  background: var(--hml-bg-elev-3);
  border: 1px solid var(--hml-border);
  border-radius: 4px;
  color: var(--hml-text-secondary);
  font-size: 10.5px;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.pm-value {
  font-family: var(--hml-font-mono);
  font-size: 11.5px;
  color: var(--hml-accent);
  letter-spacing: 0.01em;
}
.pm-value-lg { font-size: 14px; }

.pm-mono { font-family: var(--hml-font-mono); font-size: 12px; }
.pm-text-muted { color: var(--hml-text-secondary); }

/* ── Kanban ───────────────────────────────────────────── */
.pm-kanban {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 280px;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 24px;
}
.pm-kanban-col {
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-top: 2px solid var(--hml-border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-height: 400px;
}
.pm-kanban-col-head {
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--hml-border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pm-kanban-col-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 600;
  color: var(--hml-text-primary);
  letter-spacing: 0.01em;
}
.pm-kanban-col-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.pm-kanban-col-count {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
  padding: 1px 6px;
  background: var(--hml-bg-elev-3);
  border-radius: 4px;
  margin-left: 2px;
}
.pm-kanban-col-sum {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  color: var(--hml-accent);
}
.pm-kanban-col-body {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.pm-kanban-empty {
  font-size: 11.5px;
  color: var(--hml-text-quaternary);
  text-align: center;
  padding: 20px 0;
  font-style: italic;
}

.pm-card {
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 7px;
  padding: 10px 11px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  transition: border-color 120ms ease, transform 120ms ease;
}
.pm-card:hover {
  border-color: var(--hml-border-strong);
  transform: translateY(-1px);
}
.pm-card-row {
  display: flex;
  gap: 9px;
  align-items: center;
}
.pm-card-title-block { min-width: 0; flex: 1; }
.pm-card-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--hml-text-primary);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pm-card-sub {
  font-size: 11px;
  color: var(--hml-text-secondary);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pm-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.pm-card-next {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--hml-accent-dim);
  border: 1px solid var(--hml-accent-border);
  border-radius: 5px;
  color: var(--hml-accent-bright);
  font-size: 10.5px;
  font-family: var(--hml-font-mono);
}
.pm-card-foot {
  display: flex;
  justify-content: space-between;
  padding-top: 4px;
  border-top: 1px dashed var(--hml-border-subtle);
}
.pm-card-touch {
  font-size: 10px;
  color: var(--hml-text-tertiary);
  letter-spacing: 0.02em;
}

/* ── Split view ───────────────────────────────────────── */
.pm-split {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 14px;
  height: calc(100vh - 240px);
  min-height: 540px;
}

.pm-split-list {
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pm-split-list-head {
  padding: 12px;
  border-bottom: 1px solid var(--hml-border-subtle);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pm-split-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 6px;
  color: var(--hml-text-tertiary);
}
.pm-split-search input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--hml-text-primary);
  font-family: inherit;
  font-size: 12.5px;
}
.pm-split-search input::placeholder { color: var(--hml-text-quaternary); }

.pm-stage-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.pm-stage-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  background: transparent;
  border: 1px solid var(--hml-border-subtle);
  border-radius: 4px;
  color: var(--hml-text-secondary);
  font-family: inherit;
  font-size: 10.5px;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease;
}
.pm-stage-chip:hover {
  border-color: var(--hml-border-strong);
  color: var(--hml-text-primary);
}
.pm-stage-on {
  border-color: var(--hml-accent-border) !important;
  color: var(--hml-accent) !important;
  background: var(--hml-accent-dim);
}
.pm-stage-chip-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}
.pm-stage-count {
  font-family: var(--hml-font-mono);
  font-size: 9.5px;
  color: var(--hml-text-tertiary);
}

.pm-split-rows {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}
.pm-split-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  width: 100%;
  padding: 9px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  color: inherit;
  transition: background 120ms ease, border-color 120ms ease;
}
.pm-split-row:hover {
  background: var(--hml-bg-elev-2);
}
.pm-split-row-on {
  background: var(--hml-bg-elev-2);
  border-color: var(--hml-accent-border);
}
.pm-split-row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.pm-split-row-line1 {
  display: flex;
  align-items: baseline;
  gap: 4px;
  overflow: hidden;
}
.pm-split-row-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--hml-text-primary);
  white-space: nowrap;
}
.pm-split-row-sub {
  font-size: 11.5px;
  color: var(--hml-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pm-split-row-line2 {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pm-split-row-meta {
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
  letter-spacing: 0.02em;
}

.pm-split-detail {
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pm-detail-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--hml-border-subtle);
}
.pm-detail-title-block { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.pm-detail-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--hml-text-primary);
  letter-spacing: -0.005em;
}
.pm-detail-sub {
  font-size: 12.5px;
  color: var(--hml-text-secondary);
}
.pm-detail-pills {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.pm-ghost-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border);
  border-radius: 6px;
  color: var(--hml-text-secondary);
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease;
}
.pm-ghost-btn:hover {
  border-color: var(--hml-accent-border);
  color: var(--hml-accent);
}

.pm-detail-grid {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 14px;
  padding: 18px 20px;
  overflow-y: auto;
}
.pm-detail-col { display: flex; flex-direction: column; gap: 18px; }

.pm-detail-section { display: flex; flex-direction: column; gap: 8px; }
.pm-section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--hml-text-tertiary);
  font-weight: 600;
}

.pm-contact-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 5px;
  color: var(--hml-text-secondary);
  font-size: 12px;
}
.pm-contact-val {
  font-family: var(--hml-font-mono);
  font-size: 11.5px;
  color: var(--hml-text-primary);
}

.pm-next-card {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 12px;
  background: var(--hml-accent-dim);
  border: 1px solid var(--hml-accent-border);
  border-radius: 6px;
  color: var(--hml-accent-bright);
}
.pm-next-when {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: -0.002em;
}
.pm-next-what {
  font-size: 11px;
  color: var(--hml-text-secondary);
}

.pm-notes {
  padding: 10px 12px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--hml-text-primary);
  line-height: 1.55;
}

.pm-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pm-action-btn {
  padding: 8px 11px;
  text-align: left;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 5px;
  color: var(--hml-text-primary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}
.pm-action-btn:hover {
  border-color: var(--hml-accent-border);
  background: var(--hml-accent-dim);
  color: var(--hml-accent-bright);
}
.pm-action-warn:hover {
  border-color: var(--hml-red-border);
  background: var(--hml-red-bg);
  color: var(--hml-red);
}
.pm-actions-note {
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
  font-style: italic;
  line-height: 1.45;
}

.pm-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.pm-timeline-row {
  display: flex;
  gap: 11px;
  padding: 9px 0;
  border-bottom: 1px dashed var(--hml-border-subtle);
  position: relative;
}
.pm-timeline-row:last-child { border-bottom: none; }
.pm-timeline-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
  background: var(--hml-neutral);
}
.pm-timeline-call { background: var(--hml-amber); }
.pm-timeline-sms { background: var(--hml-blue); }
.pm-timeline-email { background: var(--hml-teal); }
.pm-timeline-stage { background: var(--hml-accent); }
.pm-timeline-note { background: var(--hml-plum); }
.pm-timeline-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.pm-timeline-summary {
  font-size: 12px;
  color: var(--hml-text-primary);
  line-height: 1.4;
}
.pm-timeline-when {
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
  letter-spacing: 0.02em;
}

/* ── Dense table ───────────────────────────────────────── */
.pm-table-wrap {
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 8px;
  overflow: hidden;
}
.pm-table {
  width: 100%;
  border-collapse: collapse;
}
.pm-table thead th {
  text-align: left;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--hml-text-tertiary);
  padding: 12px 14px;
  border-bottom: 1px solid var(--hml-border);
  background: var(--hml-bg-elev-2);
}
.pm-table-right { text-align: right; }
.pm-table tbody td {
  padding: 11px 14px;
  border-bottom: 1px solid var(--hml-border-subtle);
  font-size: 12.5px;
  color: var(--hml-text-primary);
  vertical-align: middle;
}
.pm-table tbody tr:last-child td { border-bottom: none; }
.pm-table tbody tr:hover { background: var(--hml-bg-elev-2); }
.pm-table-name-cell {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 600;
}
`;
