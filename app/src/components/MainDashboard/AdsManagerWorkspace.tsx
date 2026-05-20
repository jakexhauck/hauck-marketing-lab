/**
 * AdsManagerWorkspace — global "Ads Manager" tab landing.
 *
 * Two states:
 *   1. picker  → agency totals strip + grid of client cards (name + status).
 *   2. picked  → minimalist AdsManagerPage scoped to that client, with a
 *                back-to-picker affordance.
 *
 * The per-client tab in the Clients hub is unchanged and still renders the
 * full AdsManagerPage variant.
 */

import { useMemo, useState } from "react";
import type { ClientEntry } from "../../lib/types";
import { useAdsAccounts } from "../../lib/useAdsAccounts";
import { IconBarChart, IconArrowRight } from "../icons";
import { AdsManagerPage } from "./AdsManagerPage";

interface AdsManagerWorkspaceProps {
  clients: ClientEntry[];
  /** If set on mount, drop straight into that client's view. */
  initialSlug?: string | null;
}

export function AdsManagerWorkspace({
  clients,
  initialSlug,
}: AdsManagerWorkspaceProps) {
  const [pickedSlug, setPickedSlug] = useState<string | null>(initialSlug ?? null);

  if (pickedSlug) {
    return (
      <AdsManagerPage
        mode="client"
        variant="minimal"
        clients={clients}
        activeClientSlug={pickedSlug}
        onBack={() => setPickedSlug(null)}
        backLabel="Back to clients"
      />
    );
  }

  return <Picker clients={clients} onPick={setPickedSlug} />;
}

// ─── picker landing ──────────────────────────────────────────────────────

function Picker({
  clients,
  onPick,
}: {
  clients: ClientEntry[];
  onPick: (slug: string) => void;
}) {
  // Pull 7d data for the agency-totals strip. We feed the hook ALL clients so
  // the totals are cross-client; the cards themselves don't render KPIs.
  const { accounts, loading } = useAdsAccounts(clients, {
    windowDays: 7,
    startDate: null,
    endDate: null,
    attributionWindows: ["7d_click", "1d_view"],
  });

  const totals = useMemo(() => {
    let spend = 0;
    let results = 0;
    let revenue = 0;
    let roasSum = 0;
    for (const a of accounts) {
      spend += a.totals.spend;
      results += a.totals.results;
      revenue += a.totals.revenue;
      roasSum += a.totals.roas;
    }
    const n = Math.max(1, accounts.length);
    return {
      spend,
      results,
      cpr: spend / Math.max(1, results),
      roas: roasSum / n,
      revenue,
    };
  }, [accounts]);

  return (
    <div className="hml-content hml-amw">
      <style>{WORKSPACE_CSS}</style>

      <section className="hml-amw-head">
        <div className="hml-amw-eyebrow">
          <IconBarChart size={12} />
          <span>Ads Manager</span>
        </div>
        <h1 className="hml-amw-title">Pick a client</h1>
        <div className="hml-amw-sub">
          Cleaner take on Meta's Ads Manager, scoped per client.
        </div>
      </section>

      <section className="hml-amw-totals">
        <Stat label="Agency spend · 7d" value={fmtMoney(totals.spend)} />
        <Stat label="Leads" value={fmtInt(totals.results)} />
        <Stat label="Blended CPR" value={fmtMoney(totals.cpr)} />
        <Stat
          label="Blended ROAS"
          value={`${totals.roas.toFixed(2)}x`}
          tone={totals.roas >= 3 ? "pos" : totals.roas >= 2 ? "flat" : "neg"}
        />
        <Stat label="Revenue" value={fmtMoney(totals.revenue)} />
        {loading && <div className="hml-amw-totals-loading">refreshing…</div>}
      </section>

      {clients.length === 0 ? (
        <div className="hml-amw-empty">
          <div className="hml-amw-empty-title">No clients yet</div>
          <div className="hml-amw-empty-sub">
            Add a client from the Clients hub to see their ads here.
          </div>
        </div>
      ) : (
        <section className="hml-amw-grid">
          {clients.map((c) => (
            <button
              key={c.slug}
              type="button"
              className="hml-amw-card"
              onClick={() => onPick(c.slug)}
            >
              <div className="hml-amw-card-name">{c.name}</div>
              <div className="hml-amw-card-foot">
                <StatusBadge status={c.status} />
                <span className="hml-amw-card-arrow">
                  <IconArrowRight size={14} />
                </span>
              </div>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "flat",
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "flat";
}) {
  return (
    <div className="hml-amw-stat">
      <div className="hml-amw-stat-l">{label}</div>
      <div className={`hml-amw-stat-v hml-${tone}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: ClientEntry["status"] }) {
  const tone =
    status === "live" ? "live" : status === "pre-launch" ? "pre" : "paused";
  const label =
    status === "live" ? "LIVE" : status === "pre-launch" ? "PRE-LAUNCH" : "PAUSED";
  return (
    <span className={`hml-amw-status hml-amw-status-${tone}`}>
      <span className="hml-amw-status-dot" />
      {label}
    </span>
  );
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (Math.abs(n) >= 1_000)
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtInt(n: number): string {
  return n.toLocaleString();
}

const WORKSPACE_CSS = `
.hml-amw { padding-bottom: 32px; }
.hml-amw-head { margin-bottom: 18px; }
.hml-amw-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary, #95a0b3);
  margin-bottom: 6px;
}
.hml-amw-title {
  font-family: var(--hml-font-sans);
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 6px;
  color: var(--hml-text-primary, #f6f6f6);
}
.hml-amw-sub {
  font-size: 12px;
  color: var(--hml-text-secondary, #b9c0cc);
}

.hml-amw-totals {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin-bottom: 22px;
  position: relative;
}
.hml-amw-totals-loading {
  position: absolute;
  top: -16px;
  right: 0;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary, #95a0b3);
}
.hml-amw-stat {
  background: var(--hml-bg-elev-1, rgba(255,255,255,0.03));
  border: 1px solid var(--hml-border, rgba(255,255,255,0.08));
  border-radius: 8px;
  padding: 12px 14px;
}
.hml-amw-stat-l {
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary, #95a0b3);
  margin-bottom: 6px;
}
.hml-amw-stat-v {
  font-family: var(--hml-font-sans);
  font-size: 20px;
  font-weight: 600;
  color: var(--hml-text-primary, #f6f6f6);
  letter-spacing: -0.01em;
}
.hml-amw-stat-v.hml-pos { color: #5fe699; }
.hml-amw-stat-v.hml-neg { color: #ef4444; }

.hml-amw-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.hml-amw-card {
  background: var(--hml-bg-elev-1, rgba(255,255,255,0.03));
  border: 1px solid var(--hml-border, rgba(255,255,255,0.08));
  border-radius: 10px;
  padding: 16px 16px 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  min-height: 92px;
  text-align: left;
  cursor: pointer;
  color: var(--hml-text-primary, #f6f6f6);
  font-family: inherit;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.12s ease;
}
.hml-amw-card:hover {
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.06));
  border-color: rgba(180, 120, 255, 0.4);
  transform: translateY(-1px);
}
.hml-amw-card-name {
  font-size: 14.5px;
  font-weight: 500;
  letter-spacing: -0.005em;
}
.hml-amw-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.hml-amw-card-arrow {
  color: var(--hml-text-tertiary, #95a0b3);
  display: inline-flex;
  align-items: center;
}
.hml-amw-card:hover .hml-amw-card-arrow { color: #b478ff; }

.hml-amw-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 9.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  font-weight: 500;
}
.hml-amw-status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}
.hml-amw-status-live {
  background: rgba(95,230,153,0.12);
  color: #5fe699;
}
.hml-amw-status-live .hml-amw-status-dot {
  background: #5fe699;
  box-shadow: 0 0 0 3px rgba(95,230,153,0.18);
}
.hml-amw-status-pre {
  background: rgba(245,158,11,0.12);
  color: #f59e0b;
}
.hml-amw-status-pre .hml-amw-status-dot {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245,158,11,0.18);
}
.hml-amw-status-paused {
  background: rgba(255,255,255,0.05);
  color: var(--hml-text-tertiary, #95a0b3);
}
.hml-amw-status-paused .hml-amw-status-dot {
  background: var(--hml-text-tertiary, #95a0b3);
}

.hml-amw-empty {
  padding: 48px 24px;
  text-align: center;
  background: var(--hml-bg-elev-1, rgba(255,255,255,0.03));
  border: 1px dashed var(--hml-border, rgba(255,255,255,0.10));
  border-radius: 10px;
}
.hml-amw-empty-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--hml-text-primary, #f6f6f6);
  margin-bottom: 4px;
}
.hml-amw-empty-sub {
  font-size: 12px;
  color: var(--hml-text-tertiary, #95a0b3);
}
`;
