/**
 * ClientHubMockups — four visual variations for the Workspace > Clients page.
 *
 * Read-only on purpose. The goal here is to pick a direction; editing wires
 * back into ClientsTracker (OpsTrackers.tsx) once Jake selects a variant.
 *
 * Variants:
 *   1. Card grid
 *   2. Rich list rows
 *   3. Compact dense table (upgraded current)
 *   4. Sectioned by status
 *
 * Data: merges real `clients` with placeholders so each variant shows variety.
 * Report dates are computed from a fake `adsLaunchedAt` per row.
 */

import { useMemo, useState } from "react";
import type { ClientEntry, ClientStatus } from "../../lib/types";
import { IconCalendar, IconFolder, IconMore, IconPlus } from "../icons";

// ── Mock row shape ─────────────────────────────────────────
interface MockRow {
  slug: string;
  name: string;
  status: ClientStatus;
  retainer: number;
  adSpend: number;
  retainerStartedAt: string; // ISO
  adsLaunchedAt: string | null; // ISO — drives weekly/monthly cadence
  nextCall: string | null; // ISO
  notes?: string;
  isReal?: boolean;
}

const PLACEHOLDER_ROWS: MockRow[] = [
  {
    slug: "_demo_keystone",
    name: "Keystone Roofing",
    status: "live",
    retainer: 3500,
    adSpend: 8200,
    retainerStartedAt: "2026-03-04",
    adsLaunchedAt: "2026-03-18",
    nextCall: "2026-05-15",
    notes: "Spring promo creative shipping Mon.",
  },
  {
    slug: "_demo_brightside",
    name: "Brightside Cleaning Co.",
    status: "live",
    retainer: 2200,
    adSpend: 4500,
    retainerStartedAt: "2026-02-12",
    adsLaunchedAt: "2026-02-26",
    nextCall: "2026-05-20",
    notes: "Asked for second-city pixel — pending.",
  },
  {
    slug: "_demo_harbor",
    name: "Harbor Dental",
    status: "pre-launch",
    retainer: 2800,
    adSpend: 0,
    retainerStartedAt: "2026-05-01",
    adsLaunchedAt: null,
    nextCall: "2026-05-14",
    notes: "Onboarding 4/6 — waiting on tracking pixel.",
  },
  {
    slug: "_demo_oakmark",
    name: "Oakmark Auto Detail",
    status: "paused",
    retainer: 1800,
    adSpend: 0,
    retainerStartedAt: "2025-11-08",
    adsLaunchedAt: "2025-11-22",
    nextCall: null,
    notes: "Paused for owner sabbatical — resume in June.",
  },
];

interface PageProps {
  clients: ClientEntry[];
}

const VARIANTS = [
  { id: "rows-sectioned" as const, label: "Rows · sectioned" },
  { id: "cards" as const, label: "Card grid" },
  { id: "rows" as const, label: "Rich rows" },
  { id: "table" as const, label: "Dense table" },
  { id: "sectioned" as const, label: "By status (cards)" },
];

type VariantId = (typeof VARIANTS)[number]["id"];

export function ClientHubMockups({ clients }: PageProps) {
  const [variant, setVariant] = useState<VariantId>("rows-sectioned");

  const rows = useMemo<MockRow[]>(() => {
    const real: MockRow[] = clients.map((c, i) => ({
      slug: c.slug,
      name: c.name,
      status: c.status,
      retainer: [2500, 3000, 3500, 1800, 4200][i % 5],
      adSpend: c.status === "live" ? [5500, 7200, 9100, 3400][i % 4] : 0,
      retainerStartedAt: c.created_at ?? "2026-04-01",
      adsLaunchedAt: c.status === "live" ? c.created_at ?? "2026-04-08" : null,
      nextCall: null,
      notes: "",
      isReal: true,
    }));
    return [...real, ...PLACEHOLDER_ROWS];
  }, [clients]);

  return (
    <div className="hml-content">
      <section className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <span className="hml-eyebrow-dot" />
            Workspace · Mockup
          </div>
          <h1 className="hml-page-title">Client Dashboard</h1>
          <div className="hml-page-subtitle">
            Four variations — pick one to wire up for real. Placeholder clients
            are mixed in so the layouts have variety. <strong>Read-only.</strong>
          </div>
        </div>
        <div className="ch-variant-switch" role="tablist">
          {VARIANTS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={variant === v.id}
              className={`ch-variant-btn${variant === v.id ? " ch-variant-on" : ""}`}
              onClick={() => setVariant(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </section>

      <style>{MOCKUP_CSS}</style>

      {variant === "rows-sectioned" && <VariantRowsSectioned rows={rows} />}
      {variant === "cards" && <VariantCardGrid rows={rows} />}
      {variant === "rows" && <VariantRichRows rows={rows} />}
      {variant === "table" && <VariantDenseTable rows={rows} />}
      {variant === "sectioned" && <VariantSectioned rows={rows} />}
    </div>
  );
}

// ── shared helpers ─────────────────────────────────────────
function avatarChar(name: string) {
  return name.charAt(0).toUpperCase();
}

function statusMeta(s: ClientStatus) {
  if (s === "live") return { cls: "hml-green", label: "Live", accent: "var(--signal-go)" };
  if (s === "pre-launch")
    return { cls: "hml-amber", label: "Pre-launch", accent: "var(--copper)" };
  return { cls: "hml-neutral", label: "Paused", accent: "var(--text-faint)" };
}

function money(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso: string | null, opts: { weekday?: boolean } = {}) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    weekday: opts.weekday ? "short" : undefined,
    month: "short",
    day: "numeric",
  });
}

/** Weekly cadence: ads_launched + 7d, rolling. Monthly: same day-of-month. */
function computeReportDates(adsLaunchedIso: string | null) {
  if (!adsLaunchedIso) return { weekly: null, monthly: null };
  const launched = new Date(adsLaunchedIso);
  if (Number.isNaN(launched.getTime())) return { weekly: null, monthly: null };
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Weekly: next launch + N*7 that is >= today
  const dayMs = 86400000;
  const sinceLaunch = Math.floor((today.getTime() - launched.getTime()) / dayMs);
  const weeksSince = Math.max(0, Math.ceil(sinceLaunch / 7));
  const weekly = new Date(launched.getTime() + weeksSince * 7 * dayMs);

  // Monthly: same day-of-month of the next month >= today
  const monthly = new Date(launched);
  while (monthly.getTime() < today.getTime()) {
    monthly.setMonth(monthly.getMonth() + 1);
  }

  return { weekly: weekly.toISOString(), monthly: monthly.toISOString() };
}

// ─── Variant 1: Card grid ──────────────────────────────────
function VariantCardGrid({ rows }: { rows: MockRow[] }) {
  return (
    <div className="ch-grid">
      {rows.map((r) => {
        const meta = statusMeta(r.status);
        const reports = computeReportDates(r.adsLaunchedAt);
        return (
          <article key={r.slug} className="ch-card">
            <div className="ch-card-stripe" style={{ background: meta.accent }} />
            <header className="ch-card-head">
              <div className="ch-avatar">{avatarChar(r.name)}</div>
              <div className="ch-card-title-block">
                <div className="ch-card-name">{r.name}</div>
                <span className={`hml-pill ${meta.cls}`}>
                  <span className="hml-pill-dot" />
                  {meta.label}
                </span>
              </div>
              <button type="button" className="hml-icon-btn" aria-label="More">
                <IconMore size={14} />
              </button>
            </header>

            <div className="ch-card-metrics">
              <div className="ch-metric">
                <div className="ch-metric-label">Retainer</div>
                <div className="ch-metric-value">{money(r.retainer)}</div>
              </div>
              <div className="ch-metric">
                <div className="ch-metric-label">Ad spend</div>
                <div className="ch-metric-value">
                  {r.adSpend ? money(r.adSpend) : "—"}
                </div>
              </div>
            </div>

            <div className="ch-card-dates">
              <DateRow label="Launched" value={fmtDate(r.adsLaunchedAt)} />
              <DateRow
                label="Weekly due"
                value={fmtDate(reports.weekly, { weekday: true })}
                badge="W"
                badgeTone="copper"
              />
              <DateRow
                label="Monthly due"
                value={fmtDate(reports.monthly, { weekday: true })}
                badge="M"
                badgeTone="muted"
              />
              <DateRow
                label="Next call"
                value={fmtDate(r.nextCall, { weekday: true })}
                icon={<IconCalendar size={11} />}
              />
            </div>

            {r.notes && <div className="ch-card-notes">{r.notes}</div>}
          </article>
        );
      })}
      <button type="button" className="ch-card ch-card-add">
        <IconPlus size={18} />
        <span>Add client</span>
      </button>
    </div>
  );
}

function DateRow({
  label,
  value,
  badge,
  badgeTone,
  icon,
}: {
  label: string;
  value: string;
  badge?: string;
  badgeTone?: "copper" | "muted";
  icon?: React.ReactNode;
}) {
  return (
    <div className="ch-date-row">
      <span className="ch-date-label">
        {icon}
        {label}
      </span>
      <span className="ch-date-value">
        {badge && (
          <span
            className={`ch-badge${badgeTone === "copper" ? " ch-badge-copper" : ""}`}
          >
            {badge}
          </span>
        )}
        {value}
      </span>
    </div>
  );
}

// ─── Rich row (shared by Variant 2 and Rows · sectioned) ───
function RichRow({ row, dimmed }: { row: MockRow; dimmed?: boolean }) {
  const meta = statusMeta(row.status);
  const reports = computeReportDates(row.adsLaunchedAt);
  return (
    <div className={`ch-row${dimmed ? " ch-row-dim" : ""}`}>
      <div className="ch-row-stripe" style={{ background: meta.accent }} />
      <div className="ch-row-id">
        <div className="ch-avatar ch-avatar-lg">{avatarChar(row.name)}</div>
        <div>
          <div className="ch-row-name">{row.name}</div>
          <span className={`hml-pill ${meta.cls}`}>
            <span className="hml-pill-dot" />
            {meta.label}
          </span>
        </div>
      </div>

      <div className="ch-row-metrics">
        <RowMetric label="Retainer" value={money(row.retainer)} />
        <RowMetric
          label="Ad spend"
          value={row.adSpend ? money(row.adSpend) : "—"}
        />
        <RowMetric label="Launched" value={fmtDate(row.adsLaunchedAt)} mono />
      </div>

      <div className="ch-row-reports">
        <div className="ch-report">
          <span className="ch-badge ch-badge-copper">W</span>
          <div>
            <div className="ch-report-label">Weekly due</div>
            <div className="ch-report-date">
              {fmtDate(reports.weekly, { weekday: true })}
            </div>
          </div>
        </div>
        <div className="ch-report">
          <span className="ch-badge">M</span>
          <div>
            <div className="ch-report-label">Monthly due</div>
            <div className="ch-report-date">
              {fmtDate(reports.monthly, { weekday: true })}
            </div>
          </div>
        </div>
      </div>

      <div className="ch-row-call">
        <div className="ch-report-label">Next call</div>
        <div className="ch-report-date">
          <IconCalendar size={11} />{" "}
          {fmtDate(row.nextCall, { weekday: true })}
        </div>
      </div>

      <div className="ch-row-actions">
        <button type="button" className="hml-btn">
          <IconFolder size={12} />
          Drive
        </button>
        <button type="button" className="hml-icon-btn">
          <IconMore size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Variant 2: Rich rows (flat) ───────────────────────────
function VariantRichRows({ rows }: { rows: MockRow[] }) {
  return (
    <div className="ch-rows">
      {rows.map((r) => (
        <RichRow key={r.slug} row={r} />
      ))}
    </div>
  );
}

// ─── Combined: Rich rows sectioned by status (DEFAULT) ─────
function VariantRowsSectioned({ rows }: { rows: MockRow[] }) {
  const [showPaused, setShowPaused] = useState(false);
  const live = rows.filter((r) => r.status === "live");
  const pre = rows.filter((r) => r.status === "pre-launch");
  const paused = rows.filter((r) => r.status === "paused");

  const totalMRR = live.reduce((s, r) => s + r.retainer, 0);
  const totalSpend = live.reduce((s, r) => s + r.adSpend, 0);

  return (
    <div className="ch-sections">
      <section className="ch-section">
        <header className="ch-section-head">
          <div>
            <div className="ch-section-eyebrow">
              <span
                className="hml-eyebrow-dot"
                style={{ background: "var(--signal-go)" }}
              />
              Live · generating
            </div>
            <h2 className="ch-section-title">{live.length} active clients</h2>
          </div>
          <div className="ch-section-summary">
            {money(totalMRR)} MRR · {money(totalSpend)} ad spend
          </div>
        </header>
        <div className="ch-rows">
          {live.length === 0 ? (
            <EmptySectionRow label="No live clients yet." />
          ) : (
            live.map((r) => <RichRow key={r.slug} row={r} />)
          )}
        </div>
      </section>

      <section className="ch-section">
        <header className="ch-section-head">
          <div>
            <div className="ch-section-eyebrow">
              <span
                className="hml-eyebrow-dot"
                style={{ background: "var(--copper)" }}
              />
              Pre-launch
            </div>
            <h2 className="ch-section-title">
              {pre.length} onboarding in progress
            </h2>
          </div>
        </header>
        <div className="ch-rows">
          {pre.length === 0 ? (
            <EmptySectionRow label="Nobody in onboarding right now." />
          ) : (
            pre.map((r) => <RichRow key={r.slug} row={r} />)
          )}
        </div>
      </section>

      {paused.length > 0 && (
        <section className="ch-section">
          <button
            type="button"
            className="ch-section-head ch-section-collapsible"
            onClick={() => setShowPaused((p) => !p)}
          >
            <div>
              <div className="ch-section-eyebrow">
                <span
                  className="hml-eyebrow-dot"
                  style={{ background: "var(--text-faint)" }}
                />
                Paused · {paused.length}
              </div>
            </div>
            <span className="ch-toggle">{showPaused ? "Hide" : "Show"}</span>
          </button>
          {showPaused && (
            <div className="ch-rows">
              {paused.map((r) => (
                <RichRow key={r.slug} row={r} dimmed />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function EmptySectionRow({ label }: { label: string }) {
  return <div className="ch-section-empty">{label}</div>;
}

function RowMetric({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="ch-row-metric">
      <div className="ch-metric-label">{label}</div>
      <div className={`ch-metric-value${mono ? " ch-mono" : ""}`}>{value}</div>
    </div>
  );
}

// ─── Variant 3: Dense table (upgraded) ─────────────────────
function VariantDenseTable({ rows }: { rows: MockRow[] }) {
  return (
    <div className="hml-panel ch-table-panel">
      <table className="ch-table">
        <thead>
          <tr>
            <th />
            <th>Client</th>
            <th className="ch-th-num">Retainer</th>
            <th className="ch-th-num">Ad Spend</th>
            <th>Launched</th>
            <th>
              <span className="ch-badge ch-badge-copper">W</span> Weekly Due
            </th>
            <th>
              <span className="ch-badge">M</span> Monthly Due
            </th>
            <th>Next Call</th>
            <th>Status</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const meta = statusMeta(r.status);
            const reports = computeReportDates(r.adsLaunchedAt);
            return (
              <tr key={r.slug}>
                <td className="ch-td-stripe">
                  <span
                    className="ch-stripe-dot"
                    style={{ background: meta.accent }}
                  />
                </td>
                <td className="ch-td-name">
                  <div className="ch-avatar ch-avatar-sm">
                    {avatarChar(r.name)}
                  </div>
                  {r.name}
                </td>
                <td className="ch-td-num">{money(r.retainer)}</td>
                <td className="ch-td-num">
                  {r.adSpend ? money(r.adSpend) : "—"}
                </td>
                <td className="ch-td-date">{fmtDate(r.adsLaunchedAt)}</td>
                <td className="ch-td-date">
                  {fmtDate(reports.weekly, { weekday: true })}
                </td>
                <td className="ch-td-date">
                  {fmtDate(reports.monthly, { weekday: true })}
                </td>
                <td className="ch-td-date">
                  {fmtDate(r.nextCall, { weekday: true })}
                </td>
                <td>
                  <span className={`hml-pill ${meta.cls}`}>
                    <span className="hml-pill-dot" />
                    {meta.label}
                  </span>
                </td>
                <td className="ch-td-notes">{r.notes || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Variant 4: Sectioned by status ────────────────────────
function VariantSectioned({ rows }: { rows: MockRow[] }) {
  const [showPaused, setShowPaused] = useState(false);
  const live = rows.filter((r) => r.status === "live");
  const pre = rows.filter((r) => r.status === "pre-launch");
  const paused = rows.filter((r) => r.status === "paused");

  return (
    <div className="ch-sections">
      <section className="ch-section">
        <header className="ch-section-head">
          <div>
            <div className="ch-section-eyebrow">
              <span
                className="hml-eyebrow-dot"
                style={{ background: "var(--signal-go)" }}
              />
              Live · generating
            </div>
            <h2 className="ch-section-title">{live.length} active clients</h2>
          </div>
          <div className="ch-section-summary">
            {money(live.reduce((s, r) => s + r.retainer, 0))} MRR ·{" "}
            {money(live.reduce((s, r) => s + r.adSpend, 0))} ad spend
          </div>
        </header>
        <div className="ch-grid ch-grid-featured">
          {live.map((r) => (
            <FeaturedCard key={r.slug} row={r} />
          ))}
        </div>
      </section>

      {pre.length > 0 && (
        <section className="ch-section">
          <header className="ch-section-head">
            <div>
              <div className="ch-section-eyebrow">
                <span
                  className="hml-eyebrow-dot"
                  style={{ background: "var(--copper)" }}
                />
                Pre-launch
              </div>
              <h2 className="ch-section-title">
                {pre.length} onboarding in progress
              </h2>
            </div>
          </header>
          <div className="ch-quiet-list">
            {pre.map((r) => (
              <QuietRow key={r.slug} row={r} />
            ))}
          </div>
        </section>
      )}

      {paused.length > 0 && (
        <section className="ch-section">
          <button
            type="button"
            className="ch-section-head ch-section-collapsible"
            onClick={() => setShowPaused((p) => !p)}
          >
            <div>
              <div className="ch-section-eyebrow">
                <span
                  className="hml-eyebrow-dot"
                  style={{ background: "var(--text-faint)" }}
                />
                Paused · {paused.length}
              </div>
            </div>
            <span className="ch-toggle">{showPaused ? "Hide" : "Show"}</span>
          </button>
          {showPaused && (
            <div className="ch-quiet-list">
              {paused.map((r) => (
                <QuietRow key={r.slug} row={r} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function FeaturedCard({ row }: { row: MockRow }) {
  const meta = statusMeta(row.status);
  const reports = computeReportDates(row.adsLaunchedAt);
  return (
    <article className="ch-card ch-card-featured">
      <div className="ch-card-stripe" style={{ background: meta.accent }} />
      <header className="ch-card-head">
        <div className="ch-avatar ch-avatar-lg">{avatarChar(row.name)}</div>
        <div className="ch-card-title-block">
          <div className="ch-card-name ch-card-name-lg">{row.name}</div>
          <div className="ch-card-sub">
            Launched {fmtDate(row.adsLaunchedAt)}
          </div>
        </div>
      </header>
      <div className="ch-card-bigmetrics">
        <div className="ch-bigmetric">
          <div className="ch-metric-label">Retainer</div>
          <div className="ch-bigmetric-value">{money(row.retainer)}</div>
        </div>
        <div className="ch-bigmetric">
          <div className="ch-metric-label">Ad spend</div>
          <div className="ch-bigmetric-value ch-bigmetric-copper">
            {money(row.adSpend)}
          </div>
        </div>
      </div>
      <div className="ch-card-dates">
        <DateRow
          label="Weekly due"
          value={fmtDate(reports.weekly, { weekday: true })}
          badge="W"
          badgeTone="copper"
        />
        <DateRow
          label="Monthly due"
          value={fmtDate(reports.monthly, { weekday: true })}
          badge="M"
          badgeTone="muted"
        />
        <DateRow
          label="Next call"
          value={fmtDate(row.nextCall, { weekday: true })}
          icon={<IconCalendar size={11} />}
        />
      </div>
      {row.notes && <div className="ch-card-notes">{row.notes}</div>}
    </article>
  );
}

function QuietRow({ row }: { row: MockRow }) {
  const meta = statusMeta(row.status);
  return (
    <div className="ch-quiet-row">
      <div className="ch-avatar ch-avatar-sm">{avatarChar(row.name)}</div>
      <div className="ch-quiet-name">{row.name}</div>
      <span className={`hml-pill ${meta.cls}`}>
        <span className="hml-pill-dot" />
        {meta.label}
      </span>
      <div className="ch-quiet-meta">
        Retainer {money(row.retainer)} · Started {fmtDate(row.retainerStartedAt)}
      </div>
      {row.notes && <div className="ch-quiet-notes">{row.notes}</div>}
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────
const MOCKUP_CSS = `
.ch-variant-switch {
  display: inline-flex;
  gap: 2px;
  margin-top: 16px;
  padding: 3px;
  background: var(--bg-elev, #191920);
  border: 1px solid var(--border, rgba(255,255,255,0.06));
  border-radius: 8px;
}
.ch-variant-btn {
  background: transparent;
  border: none;
  color: var(--text-muted, #9c9ca8);
  font-family: inherit;
  font-size: 12.5px;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  letter-spacing: 0.01em;
  transition: background 120ms ease, color 120ms ease;
}
.ch-variant-btn:hover { color: var(--text, #ececf0); }
.ch-variant-on {
  background: var(--bg-surface, #131318);
  color: var(--copper, #b478ff);
  box-shadow: inset 0 0 0 1px rgba(180, 120, 255, 0.18);
}

/* shared atoms */
.ch-avatar {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(180,120,255,0.18), rgba(180,120,255,0.04));
  border: 1px solid rgba(180, 120, 255, 0.22);
  color: var(--copper, #b478ff);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}
.ch-avatar-sm { width: 26px; height: 26px; font-size: 11.5px; border-radius: 6px; }
.ch-avatar-lg { width: 44px; height: 44px; font-size: 17px; border-radius: 10px; }

.ch-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(255,255,255,0.06);
  color: var(--text-faint, #6a6a76);
  font-family: var(--mono);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-right: 6px;
}
.ch-badge-copper {
  background: rgba(180, 120, 255, 0.14);
  color: var(--copper, #b478ff);
}

.ch-mono { font-family: var(--mono); font-size: 12.5px; }

/* ── Variant 1: cards ── */
.ch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.ch-card {
  position: relative;
  background: var(--bg-surface, #131318);
  border: 1px solid var(--border, rgba(255,255,255,0.06));
  border-radius: 10px;
  padding: 18px 18px 16px 22px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: border-color 140ms ease, transform 140ms ease;
}
.ch-card:hover {
  border-color: rgba(180, 120, 255, 0.22);
  transform: translateY(-1px);
}
.ch-card-stripe {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
}
.ch-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.ch-card-title-block { flex: 1; min-width: 0; }
.ch-card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text, #ececf0);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ch-card-name-lg { font-size: 17px; }
.ch-card-sub {
  font-size: 11.5px;
  color: var(--text-faint, #6a6a76);
  font-family: var(--mono);
  letter-spacing: 0.02em;
}
.ch-card-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 12px 0;
  margin-bottom: 12px;
  border-top: 1px solid var(--border, rgba(255,255,255,0.05));
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.05));
}
.ch-metric { }
.ch-metric-label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint, #6a6a76);
  margin-bottom: 4px;
}
.ch-metric-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text, #ececf0);
  font-variant-numeric: tabular-nums;
}
.ch-card-dates {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ch-date-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12.5px;
}
.ch-date-label {
  color: var(--text-muted, #9c9ca8);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ch-date-value {
  display: inline-flex;
  align-items: center;
  color: var(--text-mid, #c2c2cc);
  font-variant-numeric: tabular-nums;
}
.ch-card-notes {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--border, rgba(255,255,255,0.06));
  font-size: 12px;
  color: var(--text-muted, #9c9ca8);
  font-style: normal;
}
.ch-card-add {
  border-style: dashed;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: transparent;
  color: var(--text-faint, #6a6a76);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  min-height: 220px;
}
.ch-card-add:hover {
  color: var(--copper, #b478ff);
  border-color: rgba(180, 120, 255, 0.4);
}

/* ── Variant 2: rich rows ── */
.ch-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ch-row {
  position: relative;
  display: grid;
  grid-template-columns: 220px 1fr 280px 140px 110px;
  gap: 24px;
  align-items: center;
  background: var(--bg-surface, #131318);
  border: 1px solid var(--border, rgba(255,255,255,0.06));
  border-radius: 10px;
  padding: 16px 18px 16px 22px;
  transition: border-color 140ms ease, transform 140ms ease;
}
.ch-row:hover { border-color: rgba(180, 120, 255, 0.18); }
.ch-row-dim { opacity: 0.62; }
.ch-row-dim:hover { opacity: 1; }
.ch-section-empty {
  padding: 18px 22px;
  font-size: 12.5px;
  color: var(--text-faint, #6a6a76);
  background: rgba(255,255,255,0.015);
  border: 1px dashed var(--border, rgba(255,255,255,0.06));
  border-radius: 10px;
  font-style: normal;
}
.ch-row-stripe {
  position: absolute;
  left: 0; top: 12px; bottom: 12px;
  width: 3px;
  border-radius: 2px;
}
.ch-row-id {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.ch-row-name {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--text, #ececf0);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ch-row-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}
.ch-row-metric { }
.ch-row-reports {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.ch-report {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.ch-report-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint, #6a6a76);
  margin-bottom: 2px;
}
.ch-report-date {
  font-size: 13px;
  color: var(--text-mid, #c2c2cc);
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ch-row-call { }
.ch-row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}

/* ── Variant 3: dense table ── */
.ch-table-panel {
  padding: 0;
  overflow: hidden;
}
.ch-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.ch-table thead th {
  text-align: left;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint, #6a6a76);
  padding: 14px 12px;
  border-bottom: 1px solid var(--border-strong, rgba(255,255,255,0.08));
  background: rgba(255,255,255,0.015);
}
.ch-table tbody td {
  padding: 12px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.04));
  color: var(--text-mid, #c2c2cc);
  vertical-align: middle;
}
.ch-table tbody tr:hover { background: rgba(255,255,255,0.02); }
.ch-table tbody tr:last-child td { border-bottom: none; }
.ch-th-num, .ch-td-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.ch-td-stripe {
  width: 4px;
  padding: 0 !important;
}
.ch-stripe-dot {
  display: block;
  width: 3px;
  height: 28px;
  margin: 0 auto;
  border-radius: 2px;
}
.ch-td-name {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text, #ececf0);
  font-weight: 500;
}
.ch-td-date {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.01em;
  color: var(--text-mid, #c2c2cc);
}
.ch-td-notes {
  font-size: 12px;
  color: var(--text-muted, #9c9ca8);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Variant 4: sectioned ── */
.ch-sections {
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.ch-section { }
.ch-section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
}
.ch-section-collapsible {
  background: none;
  border: none;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
  width: 100%;
  cursor: pointer;
  font-family: inherit;
  color: inherit;
  text-align: left;
  align-items: center;
}
.ch-section-collapsible:hover .ch-toggle { color: var(--copper, #b478ff); }
.ch-section-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-faint, #6a6a76);
  margin-bottom: 6px;
}
.ch-section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text, #ececf0);
  letter-spacing: -0.005em;
}
.ch-section-summary {
  font-size: 12.5px;
  color: var(--text-muted, #9c9ca8);
  font-variant-numeric: tabular-nums;
  font-family: var(--mono);
}
.ch-toggle {
  font-size: 11.5px;
  color: var(--text-faint, #6a6a76);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.ch-grid-featured {
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
}
.ch-card-featured { padding: 22px 22px 18px 26px; }
.ch-card-bigmetrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 14px 0;
  margin-bottom: 14px;
  border-top: 1px solid var(--border, rgba(255,255,255,0.05));
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.05));
}
.ch-bigmetric-value {
  font-size: 22px;
  font-weight: 600;
  color: var(--text, #ececf0);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.005em;
}
.ch-bigmetric-copper { color: var(--copper, #b478ff); }
.ch-quiet-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ch-quiet-row {
  display: grid;
  grid-template-columns: auto 200px auto 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  background: rgba(255,255,255,0.01);
  border: 1px solid var(--border, rgba(255,255,255,0.04));
  border-radius: 8px;
}
.ch-quiet-row:hover { background: rgba(255,255,255,0.025); }
.ch-quiet-name {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text, #ececf0);
}
.ch-quiet-meta {
  font-size: 11.5px;
  color: var(--text-muted, #9c9ca8);
  font-family: var(--mono);
}
.ch-quiet-notes {
  font-size: 12px;
  color: var(--text-faint, #6a6a76);
  font-style: normal;
  text-align: right;
}
`;
