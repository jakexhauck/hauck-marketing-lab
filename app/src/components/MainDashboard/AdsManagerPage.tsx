/**
 * AdsManagerPage — pseudo Meta Ads Manager surface.
 *
 * Renders mock data from `lib/mockMetaAds.ts` until the real Meta Ads MCP is
 * wired up. The hybrid layout is:
 *
 *   ┌────────────────────────────────────────────┐
 *   │ KPI tiles: spend · results · CPR · ROAS    │
 *   ├────────────────────────────────────────────┤
 *   │ Campaign table   │  Detail rail            │
 *   │ (sortable)       │  (chart + creative)     │
 *   └────────────────────────────────────────────┘
 *
 * Mode "global"   — cross-client view with a client filter pill row up top.
 * Mode "client"   — scoped to a single client, no filter row.
 *
 * When the Meta Ads MCP lands, swap the `useMockAdsAccount` hook below for a
 * real `api.metaListAdsInsights(...)` call. The component shape stays the same.
 */

import { useEffect, useMemo, useState } from "react";
import type { ClientEntry, TrackingAudit } from "../../lib/types";
import {
  adStatusPill,
  type AdStatus,
  type MetaAd,
  type MetaAdsAccount,
  type MetaCampaign,
} from "../../lib/mockMetaAds";
import { useAdsAccounts } from "../../lib/useAdsAccounts";
import { api } from "../../lib/tauri";
import { IconBarChart, IconChevronRight, IconRefresh } from "../icons";

// ── date range presets ────────────────────────────────────────
type RangePreset =
  | "yesterday"
  | "last7"
  | "last14"
  | "last30"
  | "mtd"
  | "lastmonth"
  | "custom";

interface ResolvedRange {
  windowDays: number;
  startDate: string | null;
  endDate: string | null;
  label: string;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function resolveRange(
  preset: RangePreset,
  customStart: string,
  customEnd: string,
): ResolvedRange {
  const today = new Date();
  switch (preset) {
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const s = ymd(y);
      return { windowDays: 0, startDate: s, endDate: s, label: "Yesterday" };
    }
    case "last7":
      return { windowDays: 7, startDate: null, endDate: null, label: "Last 7d" };
    case "last14":
      return { windowDays: 14, startDate: null, endDate: null, label: "Last 14d" };
    case "last30":
      return { windowDays: 30, startDate: null, endDate: null, label: "Last 30d" };
    case "mtd": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        windowDays: 0,
        startDate: ymd(start),
        endDate: ymd(today),
        label: "Month-to-date",
      };
    }
    case "lastmonth": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        windowDays: 0,
        startDate: ymd(start),
        endDate: ymd(end),
        label: "Last month",
      };
    }
    case "custom": {
      if (customStart && customEnd) {
        return {
          windowDays: 0,
          startDate: customStart,
          endDate: customEnd,
          label: `${customStart} → ${customEnd}`,
        };
      }
      return { windowDays: 7, startDate: null, endDate: null, label: "Last 7d" };
    }
  }
}

// ── attribution presets ───────────────────────────────────────
type AttrPreset = "7d_click_1d_view" | "7d_click" | "1d_click";
const ATTR_OPTIONS: Array<{ value: AttrPreset; label: string; windows: string[] }> = [
  { value: "7d_click_1d_view", label: "7d click + 1d view", windows: ["7d_click", "1d_view"] },
  { value: "7d_click", label: "7d click only", windows: ["7d_click"] },
  { value: "1d_click", label: "1d click only", windows: ["1d_click"] },
];

// ── tracking pill tone mapping ────────────────────────────────
function trackingPillTone(audit: TrackingAudit | null): {
  bg: string;
  fg: string;
  label: string;
} {
  if (!audit) return { bg: "rgba(255,255,255,0.06)", fg: "#999", label: "unknown" };
  const worst =
    audit.pixel_status === "missing" || audit.capi_status === "missing"
      ? "missing"
      : audit.pixel_status === "warning" || audit.capi_status === "warning"
        ? "warning"
        : "ok";
  if (worst === "ok") return { bg: "rgba(95,230,153,0.12)", fg: "#5fe699", label: "OK" };
  if (worst === "warning")
    return { bg: "rgba(245,158,11,0.14)", fg: "#f59e0b", label: "WARN" };
  return { bg: "rgba(255,107,107,0.14)", fg: "#ff6b6b", label: "MISSING" };
}

interface AdsManagerPageProps {
  mode: "global" | "client";
  clients: ClientEntry[];
  /** In client mode, the currently active client. In global mode, the initial
   *  filter selection (use null/undefined for the "All clients" tile). */
  activeClientSlug?: string | null;
  /** Called when the user picks a different client tile in global mode. */
  onSelectClient?: (slug: string) => void;
  /** "minimal" hides the attribution selector, daily-spend bar chart, tracking
   *  pill, mock-data badge, and (in global mode) the client filter pill row.
   *  Used by the new AdsManagerWorkspace landing flow. Defaults to "full". */
  variant?: "full" | "minimal";
  /** Optional back-affordance rendered in the top-left of the header. Used by
   *  AdsManagerWorkspace to return to the client picker. */
  onBack?: () => void;
  backLabel?: string;
}

export function AdsManagerPage({
  mode,
  clients,
  activeClientSlug,
  onSelectClient,
  variant = "full",
  onBack,
  backLabel = "Back",
}: AdsManagerPageProps) {
  const isMinimal = variant === "minimal";
  const [rangePreset, setRangePreset] = useState<RangePreset>("last7");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [attrPreset, setAttrPreset] = useState<AttrPreset>("7d_click_1d_view");
  const [filterSlug, setFilterSlug] = useState<string | null>(
    mode === "client" ? activeClientSlug ?? null : activeClientSlug ?? null,
  );

  const range = useMemo(
    () => resolveRange(rangePreset, customStart, customEnd),
    [rangePreset, customStart, customEnd],
  );
  const attr = ATTR_OPTIONS.find((o) => o.value === attrPreset) ?? ATTR_OPTIONS[0];
  // `windowDays` kept as a local for backwards compat with downstream sub-
  // components that still expect a day count for label strings. Real range
  // is threaded through the hook via startDate/endDate when set.
  const windowDays = range.windowDays > 0 ? range.windowDays : 30;

  // In client mode the filter is always the active client.
  const effectiveSlug = mode === "client" ? activeClientSlug ?? null : filterSlug;

  // Decide which client subset feeds the hook. The hook itself handles the
  // connected-vs-mock split per client based on `meta_ad_account_id`.
  const targetClients = useMemo(() => {
    if (mode === "client") {
      if (!activeClientSlug) return [];
      return clients.filter((c) => c.slug === activeClientSlug);
    }
    if (effectiveSlug) {
      return clients.filter((c) => c.slug === effectiveSlug);
    }
    return clients;
  }, [mode, clients, effectiveSlug, activeClientSlug]);

  const { accounts, loading, errors, refresh } = useAdsAccounts(targetClients, {
    windowDays: range.windowDays > 0 ? range.windowDays : 30,
    startDate: range.startDate,
    endDate: range.endDate,
    attributionWindows: attr.windows,
  });
  const errorList = Object.entries(errors);
  // At least one selected client has a real ad account wired up?
  const hasConnected = accounts.some((a) => a.source === "connected");

  // Aggregate KPIs across visible accounts (1 account when filtered).
  const totals = useMemo(() => aggregate(accounts), [accounts]);

  // Flatten campaigns across selected accounts so the table works for both
  // "All clients" (cross-client) and single-client modes.
  const rows = useMemo(() => {
    const out: Array<{ account: MetaAdsAccount; campaign: MetaCampaign }> = [];
    for (const acct of accounts) {
      for (const cmp of acct.campaigns) {
        out.push({ account: acct, campaign: cmp });
      }
    }
    return out;
  }, [accounts]);

  const [sortKey, setSortKey] = useState<"spend" | "results" | "cpr" | "roas">("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedRows = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const av = a.campaign[sortKey] ?? 0;
      const bv = b.campaign[sortKey] ?? 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return out;
  }, [rows, sortKey, sortDir]);

  const [selectedRow, setSelectedRow] = useState<{ accountId: string; campaignId: string } | null>(
    null,
  );
  const activeRow =
    sortedRows.find(
      (r) =>
        r.account.accountId === selectedRow?.accountId &&
        r.campaign.id === selectedRow?.campaignId,
    ) ?? sortedRows[0];

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const onPickClient = (slug: string | null) => {
    setFilterSlug(slug);
    if (slug && mode === "global") onSelectClient?.(slug);
  };

  // ── tracking audit pill (single selected client only) ─────────
  const trackedSlug =
    mode === "client"
      ? activeClientSlug ?? null
      : effectiveSlug;
  const [tracking, setTracking] = useState<TrackingAudit | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!trackedSlug) {
      setTracking(null);
      return;
    }
    (async () => {
      try {
        const cfg = await api.loadConfig();
        const root = cfg.media_buying_path;
        if (!root) return;
        const audit = await api.readTrackingAudit(root, trackedSlug);
        if (!cancelled) setTracking(audit);
      } catch {
        if (!cancelled) setTracking(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackedSlug]);

  const trackingTone = trackingPillTone(tracking);

  return (
    <div className="hml-content hml-ads">
      <style>{ADS_CSS}</style>

      {/* Header strip: title + window selector + mock badge */}
      <section className="hml-ads-header">
        <div>
          {onBack && (
            <button type="button" className="hml-ads-back" onClick={onBack}>
              ← {backLabel}
            </button>
          )}
          <div className="hml-ads-eyebrow">
            <IconBarChart size={12} />
            <span>{mode === "client" ? "Client ads" : "Ads Manager"}</span>
          </div>
          <h1 className="hml-ads-title">
            {mode === "client"
              ? `${accounts[0]?.clientName ?? "—"}`
              : effectiveSlug
                ? `${accounts[0]?.clientName ?? "—"}`
                : "All clients"}
          </h1>
          {!isMinimal && (
            <div className="hml-ads-sub">
              {hasConnected ? (
                <span className="hml-mock-badge" style={{ background: "rgba(95,230,153,0.12)", color: "#5fe699" }}>
                  <span className="hml-mock-dot" style={{ background: "#5fe699" }} />
                  {loading ? "REFRESHING…" : "LIVE · Meta Marketing API"}
                </span>
              ) : (
                <span className="hml-mock-badge">
                  <span className="hml-mock-dot" />
                  MOCK DATA · no ad account wired
                </span>
              )}
              {accounts[0]?.accountId && (
                <>
                  <span className="hml-ads-dim">·</span>
                  <span className="hml-ads-mono">{accounts[0].accountId}</span>
                </>
              )}
              {errorList.length > 0 && (
                <>
                  <span className="hml-ads-dim">·</span>
                  <span
                    className="hml-ads-mono"
                    style={{ color: "#ff6b6b" }}
                    title={errorList.map(([s, e]) => `${s}: ${e}`).join("\n")}
                  >
                    {errorList.length} API error{errorList.length === 1 ? "" : "s"}
                  </span>
                </>
              )}
              {tracking && trackedSlug && (
                <>
                  <span className="hml-ads-dim">·</span>
                  <span
                    className="hml-mock-badge"
                    style={{ background: trackingTone.bg, color: trackingTone.fg }}
                    title={`Pixel: ${tracking.pixel_status} · CAPI: ${tracking.capi_status}${
                      tracking.emq_score != null ? ` · EMQ ${tracking.emq_score.toFixed(1)}` : ""
                    }${tracking.pulse_note ? ` · ${tracking.pulse_note}` : ""}`}
                  >
                    <span className="hml-mock-dot" style={{ background: trackingTone.fg }} />
                    TRACKING: {trackingTone.label}
                  </span>
                </>
              )}
            </div>
          )}
          {isMinimal && hasConnected && (
            <div className="hml-ads-sub">
              <span className="hml-mock-badge" style={{ background: "rgba(95,230,153,0.12)", color: "#5fe699" }}>
                <span className="hml-mock-dot" style={{ background: "#5fe699" }} />
                {loading ? "REFRESHING…" : "LIVE"}
              </span>
            </div>
          )}
        </div>
        <div className="hml-ads-controls">
          <div className="hml-ads-window">
            {(
              [
                ["yesterday", "Yest"],
                ["last7", "7d"],
                ["last14", "14d"],
                ["last30", "30d"],
                ["mtd", "MTD"],
                ["lastmonth", "Last mo"],
                ["custom", "Custom"],
              ] as Array<[RangePreset, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`hml-ads-window-btn${rangePreset === value ? " hml-active" : ""}`}
                onClick={() => setRangePreset(value)}
                title={value === "custom" ? "Pick custom date range below" : ""}
              >
                {label}
              </button>
            ))}
          </div>
          {rangePreset === "custom" && (
            <div className="hml-ads-custom-range">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="hml-ads-date-input"
                aria-label="Start date"
              />
              <span className="hml-ads-dim">→</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="hml-ads-date-input"
                aria-label="End date"
              />
            </div>
          )}
          {!isMinimal && (
            <select
              className="hml-ads-attr-select"
              value={attrPreset}
              onChange={(e) => setAttrPreset(e.target.value as AttrPreset)}
              title="Attribution window"
            >
              {ATTR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="hml-btn hml-ghost"
            title="Refetch from Meta (bypasses 15-min cache)"
            onClick={refresh}
            disabled={loading}
          >
            <IconRefresh size={12} />
            <span>{loading ? "Loading…" : "Refresh"}</span>
          </button>
        </div>
      </section>

      {/* Client filter row — only in global mode (and not the minimal variant) */}
      {mode === "global" && !isMinimal && clients.length > 0 && (
        <section className="hml-ads-clientrow">
          <button
            type="button"
            className={`hml-ads-pill${effectiveSlug === null ? " hml-active" : ""}`}
            onClick={() => onPickClient(null)}
          >
            <span className="hml-ads-pill-dot" />
            All clients
            <span className="hml-ads-pill-count">{clients.length}</span>
          </button>
          {clients.map((c) => (
            <button
              key={c.slug}
              type="button"
              className={`hml-ads-pill${effectiveSlug === c.slug ? " hml-active" : ""}`}
              onClick={() => onPickClient(c.slug)}
              title={c.name}
            >
              <span
                className={`hml-ads-pill-dot ${
                  c.status === "live" ? "hml-green" : c.status === "pre-launch" ? "hml-amber" : ""
                }`}
              />
              {c.name}
            </button>
          ))}
        </section>
      )}

      {/* KPI tiles */}
      <section className="hml-ads-kpis">
        <KpiTile label="Spend" value={fmtMoney(totals.spend)} delta={`${windowDays}d`} />
        <KpiTile label="Results" value={fmtInt(totals.results)} delta="leads" />
        <KpiTile label="CPR" value={fmtMoney(totals.cpr)} delta="per result" />
        <KpiTile
          label="ROAS"
          value={`${totals.roas.toFixed(2)}x`}
          delta={fmtMoney(totals.revenue)}
          deltaTone={totals.roas >= 3 ? "pos" : totals.roas >= 2 ? "warn" : "neg"}
        />
        <KpiTile label="Frequency" value={totals.frequency.toFixed(2)} delta="avg" />
      </section>

      {/* Mini daily-spend chart */}
      {!isMinimal && accounts.length > 0 && (
        <section className="hml-ads-chart-panel">
          <div className="hml-ads-chart-head">
            <div className="hml-ads-chart-title">Daily spend · last {windowDays}d</div>
            <div className="hml-ads-chart-legend">
              <span className="hml-ads-legend-dot" style={{ background: "#FF6B00" }} />
              <span>Spend</span>
              <span className="hml-ads-legend-dot" style={{ background: "#5fe699" }} />
              <span>Revenue</span>
            </div>
          </div>
          <DailyBars accounts={accounts} />
        </section>
      )}

      {/* Table + detail rail */}
      <section className="hml-ads-split">
        <div className="hml-ads-table-wrap">
          <div className="hml-ads-table-head">
            <div>Campaign</div>
            <SortHead
              label="Spend"
              active={sortKey === "spend"}
              dir={sortDir}
              onClick={() => toggleSort("spend")}
            />
            <SortHead
              label="Results"
              active={sortKey === "results"}
              dir={sortDir}
              onClick={() => toggleSort("results")}
            />
            <SortHead
              label="CPR"
              active={sortKey === "cpr"}
              dir={sortDir}
              onClick={() => toggleSort("cpr")}
            />
            <SortHead
              label="ROAS"
              active={sortKey === "roas"}
              dir={sortDir}
              onClick={() => toggleSort("roas")}
            />
            <div>Status</div>
          </div>
          {sortedRows.length === 0 ? (
            <div className="hml-empty" style={{ padding: "32px 24px" }}>
              <div className="hml-empty-title">No campaigns to show</div>
              <div className="hml-empty-sub">
                Pick a different client or add one to see mock data.
              </div>
            </div>
          ) : (
            sortedRows.map(({ account, campaign }) => {
              const isActive =
                activeRow?.account.accountId === account.accountId &&
                activeRow?.campaign.id === campaign.id;
              return (
                <button
                  key={`${account.accountId}-${campaign.id}`}
                  type="button"
                  className={`hml-ads-row${isActive ? " hml-active" : ""}`}
                  onClick={() =>
                    setSelectedRow({ accountId: account.accountId, campaignId: campaign.id })
                  }
                >
                  <div className="hml-ads-row-name">
                    <span className={`hml-ads-status-dot ${statusDotClass(campaign.status)}`} />
                    <div>
                      <div className="hml-ads-row-title">{campaign.name}</div>
                      <div className="hml-ads-row-sub">
                        {mode === "global" ? `${account.clientName} · ` : ""}
                        {campaign.objective} · {campaign.adSets.length} ad set
                        {campaign.adSets.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                  <div className="hml-ads-num">{fmtMoney(campaign.spend)}</div>
                  <div className="hml-ads-num">{fmtInt(campaign.results)}</div>
                  <div className="hml-ads-num">{fmtMoney(campaign.cpr)}</div>
                  <div
                    className={`hml-ads-num ${
                      campaign.roas >= 3 ? "hml-pos" : campaign.roas >= 2 ? "" : "hml-neg"
                    }`}
                  >
                    {campaign.roas.toFixed(2)}x
                  </div>
                  <div>
                    <StatusPill status={campaign.status} />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Detail rail */}
        <aside className="hml-ads-detail">
          {activeRow ? (
            <CampaignDetail
              account={activeRow.account}
              campaign={activeRow.campaign}
              onMutated={refresh}
            />
          ) : (
            <div className="hml-empty">
              <div className="hml-empty-title">Pick a campaign</div>
              <div className="hml-empty-sub">Select a row to see ad sets, ads, and creative.</div>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

// ─── small subcomponents ──────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  delta,
  deltaTone = "flat",
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "pos" | "neg" | "warn" | "flat";
}) {
  return (
    <div className="hml-ads-kpi">
      <div className="hml-ads-kpi-label">{label}</div>
      <div className="hml-ads-kpi-value">{value}</div>
      {delta && <div className={`hml-ads-kpi-delta hml-${deltaTone}`}>{delta}</div>}
    </div>
  );
}

function SortHead({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`hml-ads-sort${active ? " hml-active" : ""}`}
      onClick={onClick}
    >
      {label}
      <span className="hml-ads-sort-arrow">{active ? (dir === "desc" ? "▼" : "▲") : "·"}</span>
    </button>
  );
}

function StatusPill({ status }: { status: AdStatus }) {
  const pill = adStatusPill(status);
  return (
    <span className={`hml-pill ${pill.className}`}>
      <span className="hml-pill-dot" />
      {pill.label}
    </span>
  );
}

function statusDotClass(status: AdStatus): string {
  if (status === "active") return "hml-active-dot";
  if (status === "learning") return "hml-learning-dot";
  return "hml-paused-dot";
}

function DailyBars({ accounts }: { accounts: MetaAdsAccount[] }) {
  // Merge daily series across visible accounts (sum by date).
  const merged = useMemo(() => {
    const byDate = new Map<string, { spend: number; revenue: number }>();
    for (const acct of accounts) {
      for (const p of acct.daily) {
        const e = byDate.get(p.date) ?? { spend: 0, revenue: 0 };
        e.spend += p.spend;
        e.revenue += p.revenue;
        byDate.set(p.date, e);
      }
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, v]) => ({ date, ...v }));
  }, [accounts]);

  const maxVal = Math.max(1, ...merged.map((p) => Math.max(p.spend, p.revenue)));

  return (
    <div className="hml-ads-bars">
      {merged.map((p) => {
        const spendH = Math.round((p.spend / maxVal) * 64);
        const revH = Math.round((p.revenue / maxVal) * 64);
        const label = p.date.slice(5);
        return (
          <div key={p.date} className="hml-ads-bar-col" title={`${p.date}\nSpend ${fmtMoney(p.spend)}\nRev ${fmtMoney(p.revenue)}`}>
            <div className="hml-ads-bar-stack">
              <div className="hml-ads-bar" style={{ height: revH, background: "#5fe69988" }} />
              <div className="hml-ads-bar" style={{ height: spendH, background: "#FF6B00" }} />
            </div>
            <div className="hml-ads-bar-label">{label}</div>
          </div>
        );
      })}
    </div>
  );
}

function CampaignDetail({
  account,
  campaign,
  onMutated,
}: {
  account: MetaAdsAccount;
  campaign: MetaCampaign;
  onMutated: () => void;
}) {
  const topAd = useMemo<MetaAd | null>(() => {
    let best: MetaAd | null = null;
    for (const aset of campaign.adSets) {
      for (const ad of aset.ads) {
        if (!best || ad.roas > best.roas) best = ad;
      }
    }
    return best;
  }, [campaign]);

  // Only allow management actions for accounts wired to real Meta.
  const isLive = account.source === "connected";
  const [busy, setBusy] = useState<null | "pause" | "resume" | "duplicate" | "budget">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState(String(campaign.budgetDaily || 0));

  const runAction = async (
    kind: "pause" | "resume" | "duplicate",
    fn: () => Promise<unknown>,
  ) => {
    setBusy(kind);
    setActionError(null);
    try {
      await fn();
      onMutated();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const onPause = () =>
    runAction("pause", () => api.metaPauseCampaign(campaign.id));
  const onResume = () =>
    runAction("resume", () => api.metaResumeCampaign(campaign.id));
  const onDuplicate = () =>
    runAction("duplicate", () => api.metaDuplicateCampaign(campaign.id));

  const onSaveBudget = async () => {
    const next = Number(budgetDraft);
    if (!Number.isFinite(next) || next <= 0) {
      setActionError("Budget must be a positive number");
      return;
    }
    setBusy("budget");
    setActionError(null);
    try {
      await api.metaUpdateCampaignBudget(campaign.id, Math.round(next * 100));
      setBudgetOpen(false);
      onMutated();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const status = campaign.status;
  const canPause = status === "active" || status === "learning";
  const canResume = status === "paused" || status === "off";

  return (
    <div className="hml-ads-detail-inner">
      <div className="hml-ads-detail-head">
        <div>
          <div className="hml-ads-detail-eyebrow">{account.clientName}</div>
          <div className="hml-ads-detail-title">{campaign.name}</div>
          <div className="hml-ads-detail-sub">
            {campaign.objective} · daily ${campaign.budgetDaily} · CTR {campaign.ctr.toFixed(2)}% · CPM{" "}
            {fmtMoney(campaign.cpm)}
          </div>
        </div>
        <StatusPill status={campaign.status} />
      </div>

      {isLive && (
        <div className="hml-ads-actions">
          {canPause && (
            <button
              type="button"
              className="hml-ads-action-btn"
              onClick={onPause}
              disabled={busy !== null}
              title="Pause campaign (reversible)"
            >
              {busy === "pause" ? "Pausing…" : "Pause"}
            </button>
          )}
          {canResume && (
            <button
              type="button"
              className="hml-ads-action-btn hml-ads-action-primary"
              onClick={onResume}
              disabled={busy !== null}
              title="Resume campaign"
            >
              {busy === "resume" ? "Resuming…" : "Resume"}
            </button>
          )}
          <button
            type="button"
            className="hml-ads-action-btn"
            onClick={() => {
              setBudgetDraft(String(campaign.budgetDaily || 0));
              setBudgetOpen(true);
              setActionError(null);
            }}
            disabled={busy !== null}
            title="Edit daily budget"
          >
            Budget: ${campaign.budgetDaily.toFixed(0)}
          </button>
          <button
            type="button"
            className="hml-ads-action-btn"
            onClick={onDuplicate}
            disabled={busy !== null}
            title="Duplicate (creates a PAUSED copy)"
          >
            {busy === "duplicate" ? "Duplicating…" : "Duplicate"}
          </button>
        </div>
      )}

      {actionError && (
        <div
          className="hml-ads-action-err"
          title={actionError}
          onClick={() => setActionError(null)}
        >
          {actionError.slice(0, 220)}{actionError.length > 220 ? "…" : ""}
        </div>
      )}

      {budgetOpen && (
        <div className="hml-ads-budget-confirm">
          <div className="hml-ads-budget-row">
            <span className="hml-ads-detail-stat-l">New daily budget</span>
            <div className="hml-ads-budget-input-wrap">
              <span className="hml-ads-budget-prefix">$</span>
              <input
                type="number"
                min={1}
                step={1}
                value={budgetDraft}
                onChange={(e) => setBudgetDraft(e.target.value)}
                className="hml-ads-budget-input"
                autoFocus
              />
            </div>
          </div>
          <div className="hml-ads-budget-actions">
            <button
              type="button"
              className="hml-ads-action-btn"
              onClick={() => setBudgetOpen(false)}
              disabled={busy !== null}
            >
              Cancel
            </button>
            <button
              type="button"
              className="hml-ads-action-btn hml-ads-action-primary"
              onClick={onSaveBudget}
              disabled={busy !== null}
            >
              {busy === "budget"
                ? "Saving…"
                : `Set to $${Number(budgetDraft || 0).toFixed(0)}/day`}
            </button>
          </div>
        </div>
      )}

      <div className="hml-ads-detail-stats">
        <div>
          <div className="hml-ads-detail-stat-l">Spend</div>
          <div className="hml-ads-detail-stat-v">{fmtMoney(campaign.spend)}</div>
        </div>
        <div>
          <div className="hml-ads-detail-stat-l">Results</div>
          <div className="hml-ads-detail-stat-v">{fmtInt(campaign.results)}</div>
        </div>
        <div>
          <div className="hml-ads-detail-stat-l">CPR</div>
          <div className="hml-ads-detail-stat-v">{fmtMoney(campaign.cpr)}</div>
        </div>
        <div>
          <div className="hml-ads-detail-stat-l">Freq.</div>
          <div className="hml-ads-detail-stat-v">{campaign.frequency.toFixed(2)}</div>
        </div>
      </div>

      {topAd && (
        <div className="hml-ads-top-ad">
          <div className="hml-ads-detail-subhead">Top ad by ROAS</div>
          <div className="hml-ads-top-ad-card">
            <div
              className="hml-ads-creative-thumb"
              style={{ background: topAd.creative.thumbColor }}
            >
              <span className="hml-ads-creative-format">
                {topAd.creative.format.toUpperCase()}
              </span>
            </div>
            <div className="hml-ads-top-ad-body">
              <div className="hml-ads-top-ad-headline">{topAd.creative.headline}</div>
              <div className="hml-ads-top-ad-primary">{topAd.creative.primaryText}</div>
              <div className="hml-ads-top-ad-meta">
                <span>{fmtMoney(topAd.spend)} spend</span>
                <span>·</span>
                <span>{fmtInt(topAd.results)} results</span>
                <span>·</span>
                <span className="hml-pos">{topAd.roas.toFixed(2)}x ROAS</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="hml-ads-adset-list">
        <div className="hml-ads-detail-subhead">Ad sets ({campaign.adSets.length})</div>
        {campaign.adSets.map((aset) => (
          <div key={aset.id} className="hml-ads-adset-row">
            <div className="hml-ads-adset-left">
              <span className={`hml-ads-status-dot ${statusDotClass(aset.status)}`} />
              <div>
                <div className="hml-ads-adset-name">{aset.name}</div>
                <div className="hml-ads-adset-sub">
                  {aset.ads.length} ad{aset.ads.length === 1 ? "" : "s"} · daily ${aset.budgetDaily}
                </div>
              </div>
            </div>
            <div className="hml-ads-adset-right">
              <div className="hml-ads-adset-stat">
                <div className="hml-ads-detail-stat-l">CPR</div>
                <div className="hml-ads-detail-stat-v">{fmtMoney(aset.cpr)}</div>
              </div>
              <div className="hml-ads-adset-stat">
                <div className="hml-ads-detail-stat-l">ROAS</div>
                <div className="hml-ads-detail-stat-v">{aset.roas.toFixed(2)}x</div>
              </div>
              <IconChevronRight size={14} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function aggregate(accounts: MetaAdsAccount[]) {
  if (accounts.length === 0) {
    return { spend: 0, results: 0, cpr: 0, roas: 0, revenue: 0, ctr: 0, cpm: 0, frequency: 0 };
  }
  let spend = 0;
  let results = 0;
  let revenue = 0;
  let roasSum = 0;
  let ctrSum = 0;
  let cpmSum = 0;
  let freqSum = 0;
  for (const a of accounts) {
    spend += a.totals.spend;
    results += a.totals.results;
    revenue += a.totals.revenue;
    roasSum += a.totals.roas;
    ctrSum += a.totals.ctr;
    cpmSum += a.totals.cpm;
    freqSum += a.totals.frequency;
  }
  const n = accounts.length;
  return {
    spend: round2(spend),
    results,
    cpr: round2(spend / Math.max(1, results)),
    roas: round2(roasSum / n),
    revenue: round2(revenue),
    ctr: round2(ctrSum / n),
    cpm: round2(cpmSum / n),
    frequency: round2(freqSum / n),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (Math.abs(n) >= 1_000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtInt(n: number): string {
  return n.toLocaleString();
}

// ─── styles (scoped, inlined to keep main-dashboard.css small) ────────────

const ADS_CSS = `
.hml-ads { padding-bottom: 32px; }
.hml-ads-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.hml-ads-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary, #95a0b3);
  margin-bottom: 6px;
}
.hml-ads-back {
  background: transparent;
  border: 0;
  color: var(--hml-text-tertiary, #95a0b3);
  font-family: inherit;
  font-size: 11.5px;
  letter-spacing: 0.04em;
  padding: 0;
  margin-bottom: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.hml-ads-back:hover { color: var(--hml-text-primary, #f6f6f6); }
.hml-ads-title {
  font-family: var(--hml-font-sans);
  font-size: 26px;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.01em;
  margin: 0 0 8px;
  color: var(--hml-text-primary, #f6f6f6);
}
.hml-ads-sub {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--hml-text-secondary);
}
.hml-ads-mono { font-family: var(--hml-font-mono, ui-monospace, monospace); font-size: 11.5px; }
.hml-ads-dim { color: var(--hml-text-tertiary); opacity: 0.7; }
.hml-mock-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #f59e0b;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.hml-mock-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
}
.hml-ads-controls {
  display: flex; align-items: center; gap: 10px;
}
.hml-ads-window {
  display: inline-flex;
  background: var(--hml-bg-elev-1, rgba(255,255,255,0.04));
  border: 1px solid var(--hml-border, rgba(255,255,255,0.08));
  border-radius: 6px;
  overflow: hidden;
}
.hml-ads-window-btn {
  background: transparent;
  border: 0;
  color: var(--hml-text-secondary);
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  letter-spacing: 0.04em;
}
.hml-ads-window-btn.hml-active {
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.07));
  color: var(--hml-text-primary);
}
.hml-ads-custom-range {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 8px;
  border-radius: 8px;
  background: var(--hml-bg-elev-1, rgba(255,255,255,0.04));
  border: 1px solid var(--hml-border, rgba(255,255,255,0.08));
}
.hml-ads-date-input {
  background: transparent;
  border: 0;
  color: var(--hml-text-primary);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  padding: 2px 4px;
  color-scheme: dark;
}
.hml-ads-attr-select {
  background: var(--hml-bg-elev-1, rgba(255,255,255,0.04));
  border: 1px solid var(--hml-border, rgba(255,255,255,0.08));
  color: var(--hml-text-primary);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  letter-spacing: 0.02em;
}
.hml-ads-attr-select:hover {
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.07));
}

.hml-ads-actions {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin: 12px 0 4px;
}
.hml-ads-action-btn {
  background: var(--hml-bg-elev-1, rgba(255,255,255,0.05));
  border: 1px solid var(--hml-border, rgba(255,255,255,0.08));
  color: var(--hml-text-primary);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  letter-spacing: 0.02em;
}
.hml-ads-action-btn:hover:not(:disabled) {
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.09));
  border-color: rgba(255,255,255,0.18);
}
.hml-ads-action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.hml-ads-action-primary {
  background: rgba(255,107,0,0.18);
  border-color: rgba(255,107,0,0.45);
  color: #FF6B00;
}
.hml-ads-action-primary:hover:not(:disabled) {
  background: rgba(255,107,0,0.28);
}
.hml-ads-action-err {
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(255,107,107,0.10);
  border: 1px solid rgba(255,107,107,0.35);
  border-radius: 8px;
  color: #ff8b8b;
  font-size: 11px;
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-word;
}
.hml-ads-budget-confirm {
  margin: 10px 0 4px;
  padding: 10px 12px;
  background: var(--hml-bg-elev-1, rgba(255,255,255,0.04));
  border: 1px solid var(--hml-border, rgba(255,255,255,0.10));
  border-radius: 10px;
  display: flex; flex-direction: column; gap: 10px;
}
.hml-ads-budget-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.hml-ads-budget-input-wrap {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.06));
  border: 1px solid var(--hml-border, rgba(255,255,255,0.10));
  border-radius: 6px;
  padding: 4px 8px;
}
.hml-ads-budget-prefix { color: var(--hml-text-secondary); font-size: 12px; }
.hml-ads-budget-input {
  background: transparent; border: 0; color: var(--hml-text-primary);
  font-family: inherit; font-size: 13px; outline: none; width: 90px;
}
.hml-ads-budget-actions {
  display: flex; gap: 6px; justify-content: flex-end;
}

.hml-ads-clientrow {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-bottom: 16px;
}
.hml-ads-pill {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--hml-bg-elev-1, rgba(255,255,255,0.04));
  border: 1px solid var(--hml-border, rgba(255,255,255,0.08));
  color: var(--hml-text-secondary);
  font-size: 12px;
  cursor: pointer;
}
.hml-ads-pill.hml-active {
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.10));
  color: var(--hml-text-primary);
  border-color: rgba(255, 107, 0, 0.4);
}
.hml-ads-pill-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--hml-text-tertiary);
}
.hml-ads-pill-dot.hml-green { background: #5fe699; }
.hml-ads-pill-dot.hml-amber { background: #f59e0b; }
.hml-ads-pill-count {
  font-family: var(--hml-font-mono, ui-monospace, monospace);
  font-size: 10px;
  color: var(--hml-text-tertiary);
  margin-left: 2px;
}

.hml-ads-kpis {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}
.hml-ads-kpi {
  background: var(--hml-bg-elev-1, rgba(255,255,255,0.03));
  border: 1px solid var(--hml-border, rgba(255,255,255,0.08));
  border-radius: 8px;
  padding: 12px 14px;
}
.hml-ads-kpi-label {
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
  margin-bottom: 6px;
}
.hml-ads-kpi-value {
  font-family: var(--hml-font-sans);
  font-size: 22px;
  font-weight: 600;
  color: var(--hml-text-primary);
  letter-spacing: -0.01em;
}
.hml-ads-kpi-delta {
  font-size: 11px;
  margin-top: 4px;
  color: var(--hml-text-tertiary);
}
.hml-ads-kpi-delta.hml-pos { color: #5fe699; }
.hml-ads-kpi-delta.hml-neg { color: #ef4444; }
.hml-ads-kpi-delta.hml-warn { color: #f59e0b; }

.hml-ads-chart-panel {
  background: var(--hml-bg-elev-1, rgba(255,255,255,0.03));
  border: 1px solid var(--hml-border, rgba(255,255,255,0.08));
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 16px;
}
.hml-ads-chart-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px;
}
.hml-ads-chart-title {
  font-size: 12px;
  color: var(--hml-text-secondary);
  letter-spacing: 0.04em;
}
.hml-ads-chart-legend {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px;
  color: var(--hml-text-tertiary);
}
.hml-ads-legend-dot {
  width: 8px; height: 8px; border-radius: 2px;
  display: inline-block;
  margin-left: 6px;
}
.hml-ads-bars {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 88px;
}
.hml-ads-bar-col {
  flex: 1 1 0;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  min-width: 0;
}
.hml-ads-bar-stack {
  display: flex; flex-direction: column-reverse; align-items: stretch;
  width: 100%;
  gap: 1px;
}
.hml-ads-bar {
  width: 100%;
  min-height: 1px;
  border-radius: 2px;
}
.hml-ads-bar-label {
  font-size: 9.5px;
  color: var(--hml-text-tertiary);
  font-family: var(--hml-font-mono, ui-monospace, monospace);
}

.hml-ads-split {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.9fr);
  gap: 14px;
}
@media (max-width: 1100px) {
  .hml-ads-split { grid-template-columns: 1fr; }
}

.hml-ads-table-wrap {
  background: var(--hml-bg-elev-1, rgba(255,255,255,0.03));
  border: 1px solid var(--hml-border, rgba(255,255,255,0.08));
  border-radius: 8px;
  overflow: hidden;
}
.hml-ads-table-head, .hml-ads-row {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) 90px 80px 80px 80px 92px;
  gap: 12px;
  padding: 10px 14px;
  align-items: center;
}
.hml-ads-table-head {
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
  border-bottom: 1px solid var(--hml-border, rgba(255,255,255,0.08));
}
.hml-ads-row {
  background: transparent;
  border: 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  width: 100%;
  text-align: left;
  cursor: pointer;
  color: var(--hml-text-primary);
}
.hml-ads-row:hover { background: rgba(255,255,255,0.025); }
.hml-ads-row.hml-active { background: rgba(255, 107, 0, 0.06); }
.hml-ads-row-name { display: flex; align-items: center; gap: 10px; min-width: 0; }
.hml-ads-row-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--hml-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hml-ads-row-sub {
  font-size: 11px;
  color: var(--hml-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hml-ads-num {
  font-family: var(--hml-font-mono, ui-monospace, monospace);
  font-size: 12.5px;
  color: var(--hml-text-secondary);
  text-align: right;
}
.hml-ads-num.hml-pos { color: #5fe699; }
.hml-ads-num.hml-neg { color: #ef4444; }
.hml-ads-status-dot {
  width: 8px; height: 8px; border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.hml-ads-status-dot.hml-active-dot { background: #5fe699; box-shadow: 0 0 0 3px rgba(95, 230, 153, 0.15); }
.hml-ads-status-dot.hml-learning-dot { background: #f59e0b; box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15); }
.hml-ads-status-dot.hml-paused-dot { background: var(--hml-text-tertiary); }
.hml-ads-sort {
  background: transparent; border: 0;
  color: var(--hml-text-tertiary);
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-align: right;
  padding: 0;
  cursor: pointer;
}
.hml-ads-sort.hml-active { color: var(--hml-text-primary); }
.hml-ads-sort-arrow {
  font-family: var(--hml-font-mono, ui-monospace, monospace);
  font-size: 9px;
  margin-left: 4px;
}

.hml-ads-detail {
  background: var(--hml-bg-elev-1, rgba(255,255,255,0.03));
  border: 1px solid var(--hml-border, rgba(255,255,255,0.08));
  border-radius: 8px;
  min-height: 320px;
}
.hml-ads-detail-inner { padding: 16px 18px 18px; }
.hml-ads-detail-head {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
  margin-bottom: 14px;
}
.hml-ads-detail-eyebrow {
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
  margin-bottom: 4px;
}
.hml-ads-detail-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--hml-text-primary);
  margin-bottom: 4px;
}
.hml-ads-detail-sub {
  font-size: 11.5px;
  color: var(--hml-text-tertiary);
}
.hml-ads-detail-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 10px 0;
  margin-bottom: 12px;
  border-top: 1px solid rgba(255,255,255,0.05);
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.hml-ads-detail-stat-l {
  font-size: 9.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
  margin-bottom: 3px;
}
.hml-ads-detail-stat-v {
  font-family: var(--hml-font-mono, ui-monospace, monospace);
  font-size: 13px;
  color: var(--hml-text-primary);
}
.hml-ads-detail-subhead {
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
  margin: 8px 0 8px;
}

.hml-ads-top-ad-card {
  display: flex; gap: 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 14px;
}
.hml-ads-creative-thumb {
  width: 72px; height: 72px;
  border-radius: 5px;
  flex-shrink: 0;
  display: flex; align-items: flex-end; justify-content: flex-start;
  padding: 4px 6px;
  background: linear-gradient(135deg, #FF6B00, #ff8836);
}
.hml-ads-creative-format {
  font-family: var(--hml-font-mono, ui-monospace, monospace);
  font-size: 8px;
  letter-spacing: 0.18em;
  color: rgba(0,0,0,0.6);
  font-weight: 700;
}
.hml-ads-top-ad-body { min-width: 0; flex: 1; }
.hml-ads-top-ad-headline {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--hml-text-primary);
  margin-bottom: 4px;
}
.hml-ads-top-ad-primary {
  font-size: 11px;
  color: var(--hml-text-tertiary);
  line-height: 1.4;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hml-ads-top-ad-meta {
  display: inline-flex; gap: 5px;
  font-size: 11px;
  color: var(--hml-text-tertiary);
  font-family: var(--hml-font-mono, ui-monospace, monospace);
}
.hml-ads-top-ad-meta .hml-pos { color: #5fe699; }

.hml-ads-adset-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.hml-ads-adset-row:last-child { border-bottom: 0; }
.hml-ads-adset-left { display: flex; align-items: center; gap: 9px; min-width: 0; }
.hml-ads-adset-name {
  font-size: 12px;
  color: var(--hml-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}
.hml-ads-adset-sub {
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
}
.hml-ads-adset-right {
  display: inline-flex; align-items: center; gap: 12px;
}
.hml-ads-adset-stat {
  text-align: right;
}
`;
