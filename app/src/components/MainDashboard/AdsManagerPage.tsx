/**
 * AdsManagerPage, stripped explorer layout.
 *
 * Stack (top to bottom):
 *   1. Header: ADS MANAGER eyebrow, client name + account ID, Last Nd chip, refresh
 *   2. 4 KPI tiles (Spend, Results, Cost/Result, CTR) with delta vs prev period
 *   3. Toolbar: Campaigns/Ad Sets/Ads segmented control, All status filter, search
 *   4. Hierarchical campaign table with switch toggles, status pills, pace bars,
 *      sparkline trend column, and a totals row
 *   5. Two-column insights row: What changed, Recommendations
 *
 * Data comes from useAdsAccounts (mock for clients without a Meta account
 * wired up, live when meta_ad_account_id is set).
 */

import { Fragment, useMemo, useState } from "react";
import type { ClientEntry } from "../../lib/types";
import {
  adStatusPill,
  type AdStatus,
  type MetaAd,
  type MetaAdSet,
  type MetaAdsAccount,
  type MetaCampaign,
} from "../../lib/mockMetaAds";
import { useAdsAccounts } from "../../lib/useAdsAccounts";
import { IconBarChart, IconRefresh } from "../icons";

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
  onSelectClient: _onSelectClient,
  variant: _variant = "full",
  onBack: _onBack,
  backLabel: _backLabel = "Back",
}: AdsManagerPageProps) {
  const [rangePreset, setRangePreset] = useState<RangePreset>("last7");
  // Custom date range setters intentionally unused since the stripped layout
  // exposes only preset ranges; kept here so the resolver type stays stable.
  const [customStart] = useState("");
  const [customEnd] = useState("");
  const [attrPreset] = useState<AttrPreset>("7d_click_1d_view");
  const [filterSlug] = useState<string | null>(
    mode === "client" ? activeClientSlug ?? null : activeClientSlug ?? null,
  );

  const range = useMemo(
    () => resolveRange(rangePreset, customStart, customEnd),
    [rangePreset, customStart, customEnd],
  );
  const attr = ATTR_OPTIONS.find((o) => o.value === attrPreset) ?? ATTR_OPTIONS[0];
  const windowDays = range.windowDays > 0 ? range.windowDays : 30;

  const effectiveSlug = mode === "client" ? activeClientSlug ?? null : filterSlug;

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

  const { accounts, loading, refresh } = useAdsAccounts(targetClients, {
    windowDays: range.windowDays > 0 ? range.windowDays : 30,
    startDate: range.startDate,
    endDate: range.endDate,
    attributionWindows: attr.windows,
  });

  const totals = useMemo(() => aggregate(accounts), [accounts]);

  const rows = useMemo(() => {
    const out: Array<{ account: MetaAdsAccount; campaign: MetaCampaign }> = [];
    for (const acct of accounts) {
      for (const cmp of acct.campaigns) {
        out.push({ account: acct, campaign: cmp });
      }
    }
    return out;
  }, [accounts]);

  const sortedRows = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => (b.campaign.spend ?? 0) - (a.campaign.spend ?? 0));
    return out;
  }, [rows]);

  // Stripped layout state: which hierarchy level the table renders (campaigns
  // is the default; ad-sets and ads flatten the tree one level down).
  const [explorerLevel, setExplorerLevel] = useState<"campaigns" | "adsets" | "ads">("campaigns");
  const [statusFilter, setStatusFilter] = useState<"all" | AdStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Mock prev-period deltas. When the real Meta Ads MCP lands these should
  // come from a second insights call over the previous window.
  const prevSpend = totals.spend > 0 ? totals.spend / 1.124 : 0;
  const prevResults = totals.results > 0 ? Math.round(totals.results / 1.192) : 0;
  const prevCpr = totals.cpr > 0 ? totals.cpr * 1.06 : 0;
  const prevCtr = totals.ctr > 0 ? totals.ctr + 0.14 : 0;

  return (
    <div className="hml-content hml-ads">
      <style>{ADS_CSS}</style>

      {/* Header: eyebrow, client name + account id, range chip, refresh */}
      <section className="hml-ads-header hml-ads-header-stripped">
        <div>
          <div className="hml-ads-eyebrow">
            <IconBarChart size={12} />
            <span>Ads Manager</span>
          </div>
          <h1 className="hml-ads-title-row">
            <span>
              {mode === "client"
                ? accounts[0]?.clientName ?? "Client"
                : effectiveSlug
                  ? accounts[0]?.clientName ?? "Client"
                  : "All clients"}
            </span>
            {accounts[0]?.accountId && (
              <span className="hml-ads-acct-id">{accounts[0].accountId}</span>
            )}
          </h1>
        </div>
        <div className="hml-ads-controls hml-ads-controls-stripped">
          <select
            className="hml-ads-range-select"
            value={rangePreset}
            onChange={(e) => setRangePreset(e.target.value as RangePreset)}
            title="Date range"
          >
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 days</option>
            <option value="last14">Last 14 days</option>
            <option value="last30">Last 30 days</option>
            <option value="mtd">Month-to-date</option>
            <option value="lastmonth">Last month</option>
          </select>
          <button
            type="button"
            className="hml-ads-icon-btn"
            title="Refetch from Meta (bypasses 15-min cache)"
            onClick={refresh}
            disabled={loading}
          >
            <IconRefresh size={13} />
          </button>
        </div>
      </section>

      {/* KPI tiles, 4 wide with delta vs prev period */}
      <section className="hml-ads-kpis hml-ads-kpis-stripped">
        <KpiTileStripped
          label="Spend"
          value={fmtMoney(totals.spend)}
          delta={pctDelta(totals.spend, prevSpend)}
          prevText={`vs prev ${windowDays}d ${fmtMoney(prevSpend)}`}
          tone="pos-on-up"
        />
        <KpiTileStripped
          label="Results"
          value={fmtInt(totals.results)}
          delta={pctDelta(totals.results, prevResults)}
          prevText={`vs prev ${windowDays}d ${fmtInt(prevResults)}`}
          tone="pos-on-up"
        />
        <KpiTileStripped
          label="Cost / result"
          value={fmtMoney(totals.cpr)}
          delta={pctDelta(totals.cpr, prevCpr)}
          prevText={`vs prev ${windowDays}d ${fmtMoney(prevCpr)}`}
          tone="pos-on-down"
        />
        <KpiTileStripped
          label="CTR"
          value={`${totals.ctr.toFixed(2)}%`}
          delta={ppDelta(totals.ctr, prevCtr)}
          prevText={`vs prev ${windowDays}d ${prevCtr.toFixed(2)}%`}
          tone="pos-on-up"
        />
      </section>

      {/* Toolbar: level segmented control · status filter · search */}
      <section className="hml-ads-toolbar">
        <div className="hml-ads-seg">
          <button
            type="button"
            className={explorerLevel === "campaigns" ? "hml-on" : ""}
            onClick={() => setExplorerLevel("campaigns")}
          >
            Campaigns
          </button>
          <button
            type="button"
            className={explorerLevel === "adsets" ? "hml-on" : ""}
            onClick={() => setExplorerLevel("adsets")}
          >
            Ad Sets
          </button>
          <button
            type="button"
            className={explorerLevel === "ads" ? "hml-on" : ""}
            onClick={() => setExplorerLevel("ads")}
          >
            Ads
          </button>
        </div>
        <div className="hml-ads-filter">
          <span className="hml-ads-filter-label">{statusFilter === "all" ? "All status" : statusFilter}</span>
          <span className="hml-ads-filter-count">{sortedRows.length}</span>
          <select
            className="hml-ads-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            aria-label="Status filter"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="learning">Learning</option>
            <option value="paused">Paused</option>
            <option value="off">Off</option>
          </select>
        </div>
        <div className="hml-ads-search">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search campaigns, ad sets, ads"
          />
        </div>
      </section>

      {/* Stripped explorer table */}
      <section className="hml-ads-tree-wrap">
        <ExplorerTable
          rows={sortedRows}
          statusFilter={statusFilter}
          searchQuery={searchQuery}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          explorerLevel={explorerLevel}
          mode={mode}
          onRefresh={refresh}
        />
      </section>

      {/* What changed + Recommendations row */}
      {accounts.length > 0 && (
        <section className="hml-ads-insights">
          <NotableShiftsPanel />
          <RecommendationsPanel />
        </section>
      )}
    </div>
  );
}

/** Tiny helpers for KPI deltas. */
function pctDelta(curr: number, prev: number): string {
  if (prev <= 0) return "—";
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
function ppDelta(curr: number, prev: number): string {
  const diff = curr - prev;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${diff.toFixed(2)}pp`;
}

// ─── small subcomponents ──────────────────────────────────────────────────

/** KPI tile for the stripped layout. Big number, then a "delta · vs prev"
 *  caption. `tone` decides whether positive movement is good (Spend +12% is
 *  good for context, CPR +12% is bad). */
function KpiTileStripped({
  label,
  value,
  delta,
  prevText,
  tone,
}: {
  label: string;
  value: string;
  delta: string;
  prevText: string;
  tone: "pos-on-up" | "pos-on-down";
}) {
  const isUp = delta.startsWith("+");
  const good = tone === "pos-on-up" ? isUp : !isUp;
  return (
    <div className="hml-ads-kpi hml-ads-kpi-stripped">
      <div className="hml-ads-kpi-label">{label}</div>
      <div className="hml-ads-kpi-value">{value}</div>
      <div className="hml-ads-kpi-sub">
        <span className={`hml-ads-kpi-delta ${good ? "hml-pos" : "hml-neg"}`}>{delta}</span>{" "}
        <span className="hml-ads-kpi-prev">{prevText}</span>
      </div>
    </div>
  );
}

/** Stripped explorer table from the variation-D mockup. One column per row,
 *  with chevron expand to drill from campaign to ad set to ad. */
function ExplorerTable({
  rows,
  statusFilter,
  searchQuery,
  expanded,
  onToggleExpand,
  explorerLevel,
  mode,
  onRefresh,
}: {
  rows: Array<{ account: MetaAdsAccount; campaign: MetaCampaign }>;
  statusFilter: "all" | AdStatus;
  searchQuery: string;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  explorerLevel: "campaigns" | "adsets" | "ads";
  mode: "global" | "client";
  onRefresh: () => void;
}) {
  const q = searchQuery.trim().toLowerCase();

  const filtered = useMemo(() => {
    return rows.filter(({ campaign }) => {
      if (statusFilter !== "all" && campaign.status !== statusFilter) return false;
      if (!q) return true;
      if (campaign.name.toLowerCase().includes(q)) return true;
      for (const aset of campaign.adSets) {
        if (aset.name.toLowerCase().includes(q)) return true;
        for (const ad of aset.ads) {
          if (ad.name.toLowerCase().includes(q)) return true;
        }
      }
      return false;
    });
  }, [rows, statusFilter, q]);

  const totals = useMemo(() => {
    const sum = { spend: 0, results: 0, budgetDaily: 0 };
    for (const { campaign } of filtered) {
      sum.spend += campaign.spend;
      sum.results += campaign.results;
      sum.budgetDaily += campaign.budgetDaily;
    }
    const cpr = sum.results > 0 ? sum.spend / sum.results : 0;
    // Mean CTR weighted by spend (approximate).
    let ctrSum = 0;
    let ctrW = 0;
    for (const { campaign } of filtered) {
      ctrSum += campaign.ctr * campaign.spend;
      ctrW += campaign.spend;
    }
    const ctr = ctrW > 0 ? ctrSum / ctrW : 0;
    return { ...sum, cpr, ctr };
  }, [filtered]);

  if (filtered.length === 0) {
    return (
      <div className="hml-empty" style={{ padding: "32px 24px" }}>
        <div className="hml-empty-title">No campaigns to show</div>
        <div className="hml-empty-sub">Adjust the filter or refresh.</div>
      </div>
    );
  }

  return (
    <div className="hml-ads-tree">
      <div className="hml-ads-tree-head">
        <div className="hml-ads-tree-name">Name</div>
        <div className="hml-ads-tree-delivery">Delivery</div>
        <div className="hml-ads-tree-budget">Budget</div>
        <div className="hml-ads-tree-num">Spend</div>
        <div className="hml-ads-tree-num">Results</div>
        <div className="hml-ads-tree-num">CPR</div>
        <div className="hml-ads-tree-num">CTR</div>
        <div className="hml-ads-tree-trend">7d trend</div>
      </div>

      {filtered.map(({ account, campaign }) => {
        const cid = `${account.accountId}:${campaign.id}`;
        const isOpen = expanded.has(cid);
        const objBadge = objectiveBadge(campaign.objective);
        return (
          <Fragment key={cid}>
            <CampaignTreeRow
              campaign={campaign}
              accountName={mode === "global" ? account.clientName : null}
              objBadge={objBadge}
              isOpen={isOpen}
              onToggle={() => onToggleExpand(cid)}
              onRefresh={onRefresh}
            />
            {isOpen && explorerLevel !== "ads" && (
              <>
                {campaign.adSets.map((aset) => {
                  const aid = `${cid}:${aset.id}`;
                  const aOpen = expanded.has(aid);
                  return (
                    <Fragment key={aid}>
                      <AdSetTreeRow
                        adSet={aset}
                        isOpen={aOpen}
                        onToggle={() => onToggleExpand(aid)}
                      />
                      {aOpen && aset.ads.map((ad) => <AdTreeRow key={ad.id} ad={ad} />)}
                    </Fragment>
                  );
                })}
              </>
            )}
          </Fragment>
        );
      })}

      <div className="hml-ads-tree-foot">
        <div className="hml-ads-tree-name">TOTALS ({filtered.length} CAMPAIGNS)</div>
        <div className="hml-ads-tree-delivery"></div>
        <div className="hml-ads-tree-budget">{fmtMoney(totals.budgetDaily)} /day</div>
        <div className="hml-ads-tree-num">{fmtMoney(totals.spend)}</div>
        <div className="hml-ads-tree-num">{fmtInt(totals.results)}</div>
        <div className="hml-ads-tree-num">{fmtMoney(totals.cpr)}</div>
        <div className="hml-ads-tree-num">{totals.ctr.toFixed(2)}%</div>
        <div className="hml-ads-tree-trend"></div>
      </div>
    </div>
  );
}

function objectiveBadge(objective: string): { label: string; cls: string } {
  const o = objective.toLowerCase();
  if (o.includes("lead")) return { label: "LEADS", cls: "hml-ads-obj-leads" };
  if (o.includes("conv") || o.includes("sales") || o.includes("purchase"))
    return { label: "CONVERSIONS", cls: "hml-ads-obj-conv" };
  if (o.includes("reach") || o.includes("awareness"))
    return { label: "REACH", cls: "hml-ads-obj-reach" };
  if (o.includes("traffic") || o.includes("clicks"))
    return { label: "TRAFFIC", cls: "hml-ads-obj-reach" };
  return { label: objective.toUpperCase(), cls: "hml-ads-obj-reach" };
}

function CampaignTreeRow({
  campaign,
  accountName,
  objBadge,
  isOpen,
  onToggle,
  onRefresh,
}: {
  campaign: MetaCampaign;
  accountName: string | null;
  objBadge: { label: string; cls: string };
  isOpen: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const pacePct = pacePercent(campaign.spend, campaign.budgetDaily, 7);
  return (
    <div className="hml-ads-tree-row hml-lvl-1">
      <div className="hml-ads-tree-name">
        <button
          type="button"
          className={`hml-ads-chev${isOpen ? " hml-open" : ""}`}
          onClick={onToggle}
          aria-label={isOpen ? "Collapse" : "Expand"}
        >
          ▸
        </button>
        <button
          type="button"
          className={`hml-ads-swtch${campaign.status === "active" || campaign.status === "learning" ? " hml-on" : ""}`}
          onClick={() => {
            // Mutation hook lives behind real Meta only. For mock we just
            // refresh the cached series so the row reflects current state.
            onRefresh();
          }}
          aria-label="Toggle delivery"
        />
        <span className={`hml-ads-row-dot ${statusDotClass(campaign.status)}`} />
        <span className="hml-ads-tree-title">{campaign.name}</span>
        <span className={`hml-ads-obj-badge ${objBadge.cls}`}>{objBadge.label}</span>
        {accountName && <span className="hml-ads-tree-account">{accountName}</span>}
      </div>
      <div className="hml-ads-tree-delivery">
        <StatusPill status={campaign.status} />
      </div>
      <div className="hml-ads-tree-budget">
        <div className="hml-ads-budget-amt">
          {fmtMoney(campaign.budgetDaily)} <span className="hml-ads-budget-cad">/day</span>
        </div>
        <div className={`hml-ads-pace${pacePct > 90 ? " hml-warn" : ""}`}>
          <span style={{ width: `${Math.min(100, pacePct)}%` }} />
        </div>
      </div>
      <div className="hml-ads-tree-num">{fmtMoney(campaign.spend)}</div>
      <div className="hml-ads-tree-num">{fmtInt(campaign.results)}</div>
      <div className="hml-ads-tree-num">{fmtMoney(campaign.cpr)}</div>
      <div className="hml-ads-tree-num">{campaign.ctr.toFixed(2)}%</div>
      <div className="hml-ads-tree-trend">
        <Sparkline campaign={campaign} />
      </div>
    </div>
  );
}

function AdSetTreeRow({
  adSet,
  isOpen,
  onToggle,
}: {
  adSet: MetaAdSet;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="hml-ads-tree-row hml-lvl-2">
      <div className="hml-ads-tree-name">
        <button
          type="button"
          className={`hml-ads-chev${isOpen ? " hml-open" : ""}`}
          onClick={onToggle}
          aria-label={isOpen ? "Collapse" : "Expand"}
        >
          ▸
        </button>
        <span className={`hml-ads-swtch${adSet.status === "active" || adSet.status === "learning" ? " hml-on" : ""}`} />
        <span className={`hml-ads-row-dot ${statusDotClass(adSet.status)}`} />
        <span className="hml-ads-tree-title hml-dim">{adSet.name}</span>
      </div>
      <div className="hml-ads-tree-delivery">
        <StatusPill status={adSet.status} />
      </div>
      <div className="hml-ads-tree-budget">
        <div className="hml-ads-budget-amt">{fmtMoney(adSet.budgetDaily)} <span className="hml-ads-budget-cad">/day</span></div>
      </div>
      <div className="hml-ads-tree-num">{fmtMoney(adSet.spend)}</div>
      <div className="hml-ads-tree-num">{fmtInt(adSet.results)}</div>
      <div className="hml-ads-tree-num">{fmtMoney(adSet.cpr)}</div>
      <div className="hml-ads-tree-num">—</div>
      <div className="hml-ads-tree-trend"></div>
    </div>
  );
}

function AdTreeRow({ ad }: { ad: MetaAd }) {
  return (
    <div className="hml-ads-tree-row hml-lvl-3">
      <div className="hml-ads-tree-name">
        <span className="hml-ads-chev hml-leaf"></span>
        <span className={`hml-ads-swtch${ad.status === "active" ? " hml-on" : ""}`} />
        <span className={`hml-ads-row-dot ${statusDotClass(ad.status)}`} />
        <span className="hml-ads-ad-thumb">IMG</span>
        <span className="hml-ads-tree-title hml-dim">{ad.name}</span>
      </div>
      <div className="hml-ads-tree-delivery">
        <StatusPill status={ad.status} />
      </div>
      <div className="hml-ads-tree-budget"></div>
      <div className="hml-ads-tree-num">{fmtMoney(ad.spend)}</div>
      <div className="hml-ads-tree-num">{fmtInt(ad.results)}</div>
      <div className="hml-ads-tree-num">{fmtMoney(ad.cpr)}</div>
      <div className="hml-ads-tree-num">{ad.ctr.toFixed(2)}%</div>
      <div className="hml-ads-tree-trend"></div>
    </div>
  );
}

/** Cheap mock sparkline derived deterministically from campaign spend. Until
 *  the Meta MCP exposes per-day series at the campaign level we can't draw a
 *  real trend; this still rhymes with the row's general direction. */
function Sparkline({ campaign }: { campaign: MetaCampaign }) {
  const seed = campaign.id.length + Math.floor(campaign.spend);
  const trendUp = campaign.roas >= 2.5 || campaign.cpr <= 40;
  const stroke = trendUp ? "#5fe699" : "#ef6b6b";
  const points: string[] = [];
  for (let i = 0; i < 9; i++) {
    const noise = ((seed * (i + 1)) % 7) - 3;
    const base = trendUp ? 18 - i * 1.6 : 5 + i * 1.4;
    const y = Math.max(2, Math.min(22, base + noise));
    const x = 2 + i * 9.5;
    points.push(`${x},${y.toFixed(1)}`);
  }
  const delta = trendUp ? `▲ ${(8 + (seed % 18)).toFixed(0)}%` : `▼ ${(6 + (seed % 14)).toFixed(0)}%`;
  return (
    <div className="hml-ads-spark-cell">
      <svg className="hml-ads-spark" viewBox="0 0 80 24" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points.join(" ")}
        />
      </svg>
      <span className={`hml-ads-spark-delta ${trendUp ? "hml-pos" : "hml-neg"}`}>{delta}</span>
    </div>
  );
}

function pacePercent(spendToDate: number, dailyBudget: number, windowDays: number): number {
  if (dailyBudget <= 0 || windowDays <= 0) return 0;
  const expected = dailyBudget * windowDays;
  return expected > 0 ? (spendToDate / expected) * 100 : 0;
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

/** Notable shifts panel, Variation F. Hardcoded mock for now; later we'll
 *  derive these from compare-vs-previous-period deltas. */
function NotableShiftsPanel() {
  const shifts: Array<{ tone: "up" | "dn" | "flat"; arrow: string; body: React.ReactNode; meta: string }> = [
    {
      tone: "up",
      arrow: "↓",
      body: (
        <>
          CPR dropped <b>22%</b> on Implant Awareness, now $28.40.
        </>
      ),
      meta: "May 17 · sustained 3 days",
    },
    {
      tone: "dn",
      arrow: "↑",
      body: (
        <>
          Frequency on Retargeting climbed to <b>4.18</b>, fatigue likely.
        </>
      ),
      meta: "May 18 · creative aged 24 days",
    },
    {
      tone: "flat",
      arrow: "·",
      body: (
        <>
          New Patient Cold exited <b>learning</b> on its lookalike ad set.
        </>
      ),
      meta: "May 15 · 51 conversions in 7d window",
    },
    {
      tone: "up",
      arrow: "↑",
      body: (
        <>
          Tuesday spend hit <b>$451</b>, highest day since March.
        </>
      ),
      meta: "May 19 · driven by Implant Awareness +$80/day bump",
    },
  ];
  return (
    <div className="hml-ads-card">
      <div className="hml-ads-card-head">
        <div>
          <div className="hml-ads-card-eyebrow">
            <span className="hml-ads-card-led" />
            What changed
          </div>
          <div className="hml-ads-card-title">Notable shifts, last 7 days</div>
        </div>
        <button type="button" className="hml-ads-card-link">
          View all ({shifts.length})
        </button>
      </div>
      <div className="hml-ads-shifts">
        {shifts.map((s, i) => (
          <div key={i} className="hml-ads-shift">
            <div className={`hml-ads-shift-arrow hml-${s.tone}`}>{s.arrow}</div>
            <div className="hml-ads-shift-body">
              <div className="hml-ads-shift-text">{s.body}</div>
              <div className="hml-ads-shift-meta">{s.meta}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Recommendations panel, Variation F. Hardcoded mock for now; later this
 *  will be backed by an Aurelius-generated review of the daily series. */
function RecommendationsPanel() {
  const recs = [
    {
      title: "Scale Implant Awareness budget by +$40/day",
      body: "CPR is 32% below target and frequency is healthy at 1.86. Projected: +9 leads over the next 7 days at similar cost.",
      apply: "Apply",
      conf: 0.86,
    },
    {
      title: "Refresh creative on Retargeting",
      body: "Frequency 4.18 and CTR slipping (2.40 to 1.78). Generate 2 fresh variants with Vortex.",
      apply: "Generate",
      conf: 0.74,
    },
    {
      title: "Consolidate two underperforming ad sets",
      body: "Interest-based ad sets in New Patient Cold both spending under $15/day with weak signal. Merge into broad lookalike.",
      apply: "Apply",
      conf: 0.69,
    },
  ];
  return (
    <div className="hml-ads-card">
      <div className="hml-ads-card-head">
        <div>
          <div className="hml-ads-card-eyebrow">
            <span className="hml-ads-card-led" />
            Recommendations
          </div>
          <div className="hml-ads-card-title">{recs.length} actions ready to apply</div>
        </div>
        <button type="button" className="hml-ads-card-link">
          Dismiss all
        </button>
      </div>
      <div className="hml-ads-recs">
        {recs.map((r, i) => (
          <div key={i} className="hml-ads-rec">
            <div className="hml-ads-rec-title">{r.title}</div>
            <div className="hml-ads-rec-body">{r.body}</div>
            <div className="hml-ads-rec-row">
              <button type="button" className="hml-ads-rec-apply">
                {r.apply}
              </button>
              <button type="button" className="hml-ads-rec-ghost">
                Adjust
              </button>
              <span className="hml-ads-rec-meta">conf · {r.conf.toFixed(2)}</span>
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
  background: rgba(180,120,255,0.18);
  border-color: rgba(180,120,255,0.45);
  color: #b478ff;
}
.hml-ads-action-primary:hover:not(:disabled) {
  background: rgba(180,120,255,0.28);
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
  border-color: rgba(180, 120, 255, 0.4);
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
.hml-ads-row.hml-active { background: rgba(180, 120, 255, 0.06); }
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
  background: linear-gradient(135deg, #b478ff, #ff8836);
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

/* ── Daily delivery panel (Variation F) ─────────────────────────── */
.hml-ads-dd {
  margin-top: 18px;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px;
  padding: 16px 18px;
}
.hml-ads-dd-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.hml-ads-dd-eyebrow {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
  margin-bottom: 4px;
}
.hml-ads-dd-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--hml-text-primary);
  letter-spacing: -0.008em;
}
.hml-ads-dd-legend {
  display: inline-flex;
  align-items: center;
  gap: 16px;
  font-size: 12px;
  color: var(--hml-text-secondary);
}
.hml-ads-dd-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.hml-ads-dd-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.hml-ads-dd-v {
  font-family: var(--hml-font-mono);
  font-size: 12px;
  color: var(--hml-text-primary);
  margin-left: 4px;
}
.hml-ads-dd-svg {
  display: block;
  width: 100%;
  height: 180px;
}
.hml-ads-dd-axis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  gap: 6px;
  margin-top: 8px;
}
.hml-ads-dd-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.02));
  border: 1px solid var(--hml-border-subtle);
  border-radius: 6px;
}
.hml-ads-dd-tile.hml-peak {
  background: rgba(180, 120, 255, 0.10);
  border-color: rgba(180, 120, 255, 0.32);
  box-shadow: 0 0 14px -6px rgba(180, 120, 255, 0.45);
}
.hml-ads-dd-tile-d {
  font-family: var(--hml-font-mono);
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
}
.hml-ads-dd-tile-n {
  font-family: var(--hml-font-mono);
  font-size: 11.5px;
  color: var(--hml-text-primary);
}
.hml-ads-dd-tile.hml-peak .hml-ads-dd-tile-n {
  color: #c594ff;
}

/* ── Insights row: Notable shifts + Recommendations ─────────────── */
.hml-ads-insights {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 980px) {
  .hml-ads-insights { grid-template-columns: 1fr; }
}
.hml-ads-card {
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.hml-ads-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.hml-ads-card-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--hml-font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
  margin-bottom: 6px;
}
.hml-ads-card-led {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #b478ff;
  box-shadow: 0 0 8px rgba(180, 120, 255, 0.45);
}
.hml-ads-card-title {
  font-size: 14.5px;
  font-weight: 500;
  color: var(--hml-text-primary);
  letter-spacing: -0.008em;
}
.hml-ads-card-link {
  font-size: 11.5px;
  color: var(--hml-text-tertiary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.hml-ads-card-link:hover { color: var(--hml-text-primary); }

/* Shifts list */
.hml-ads-shifts {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hml-ads-shift {
  display: grid;
  grid-template-columns: 26px 1fr;
  gap: 12px;
  align-items: flex-start;
}
.hml-ads-shift-arrow {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  font-family: var(--hml-font-mono);
  font-size: 14px;
  font-weight: 600;
  border: 1px solid var(--hml-border-subtle);
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.02));
}
.hml-ads-shift-arrow.hml-up {
  color: #5fe699;
  border-color: rgba(95,230,153,0.25);
  background: rgba(95,230,153,0.10);
}
.hml-ads-shift-arrow.hml-dn {
  color: #ef6b6b;
  border-color: rgba(239,107,107,0.25);
  background: rgba(239,107,107,0.10);
}
.hml-ads-shift-arrow.hml-flat {
  color: var(--hml-text-tertiary);
}
.hml-ads-shift-body { min-width: 0; }
.hml-ads-shift-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--hml-text-primary);
}
.hml-ads-shift-text b {
  color: #c594ff;
  font-weight: 600;
}
.hml-ads-shift-meta {
  margin-top: 4px;
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
}

/* Recommendations list */
.hml-ads-recs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hml-ads-rec {
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.02));
  border: 1px solid var(--hml-border-subtle);
  border-radius: 8px;
  padding: 11px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hml-ads-rec-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--hml-text-primary);
  line-height: 1.4;
}
.hml-ads-rec-body {
  font-size: 12px;
  color: var(--hml-text-secondary);
  line-height: 1.55;
}
.hml-ads-rec-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hml-ads-rec-apply {
  height: 26px;
  padding: 0 12px;
  border-radius: 6px;
  background: linear-gradient(180deg, #c594ff, #b478ff);
  color: #0d0a1a;
  font-size: 11.5px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  box-shadow:
    0 0 18px -4px rgba(180, 120, 255, 0.45),
    inset 0 1px 0 rgba(255,255,255,0.2);
}
.hml-ads-rec-ghost {
  height: 26px;
  padding: 0 10px;
  border-radius: 6px;
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.02));
  border: 1px solid var(--hml-border-subtle);
  color: var(--hml-text-secondary);
  font-size: 11.5px;
  cursor: pointer;
}
.hml-ads-rec-ghost:hover {
  color: var(--hml-text-primary);
  background: var(--hml-bg-elev-1);
}
.hml-ads-rec-meta {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
  margin-left: auto;
}

/* ── Stripped layout (Variation D screenshot) ───────────────────── */
.hml-ads-header-stripped {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 4px 0 18px;
  gap: 14px;
  flex-wrap: wrap;
}
.hml-ads-title-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 24px;
  font-weight: 500;
  letter-spacing: -0.012em;
  color: var(--hml-text-primary);
  margin: 6px 0 0;
}
.hml-ads-acct-id {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  color: var(--hml-text-tertiary);
}
.hml-ads-controls-stripped {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.hml-ads-range-select {
  height: 30px;
  padding: 0 28px 0 11px;
  border-radius: 7px;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  color: var(--hml-text-secondary);
  font-size: 12px;
  font-family: var(--hml-font-mono);
  cursor: pointer;
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--hml-text-tertiary) 50%), linear-gradient(135deg, var(--hml-text-tertiary) 50%, transparent 50%);
  background-position: calc(100% - 14px) 12px, calc(100% - 9px) 12px;
  background-size: 5px 5px;
  background-repeat: no-repeat;
}
.hml-ads-range-select:hover {
  border-color: var(--hml-border);
  color: var(--hml-text-primary);
}
.hml-ads-icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  color: var(--hml-text-secondary);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.hml-ads-icon-btn:hover {
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.04));
  color: var(--hml-text-primary);
}

/* KPI tiles, stripped layout */
.hml-ads-kpis-stripped {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}
@media (max-width: 920px) {
  .hml-ads-kpis-stripped { grid-template-columns: repeat(2, 1fr); }
}
.hml-ads-kpi-stripped {
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hml-ads-kpi-stripped .hml-ads-kpi-label {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
}
.hml-ads-kpi-stripped .hml-ads-kpi-value {
  font-family: var(--hml-font-mono);
  font-size: 28px;
  font-weight: 500;
  color: var(--hml-text-primary);
  letter-spacing: -0.012em;
  line-height: 1.1;
}
.hml-ads-kpi-sub {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  color: var(--hml-text-tertiary);
}
.hml-ads-kpi-sub .hml-ads-kpi-delta {
  font-weight: 600;
}
.hml-ads-kpi-sub .hml-ads-kpi-delta.hml-pos { color: #5fe699; }
.hml-ads-kpi-sub .hml-ads-kpi-delta.hml-neg { color: #ef6b6b; }
.hml-ads-kpi-sub .hml-ads-kpi-prev { color: var(--hml-text-tertiary); }

/* Toolbar */
.hml-ads-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.hml-ads-seg {
  display: inline-flex;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 7px;
  padding: 3px;
}
.hml-ads-seg button {
  padding: 0 11px;
  height: 24px;
  border-radius: 5px;
  font-size: 12px;
  color: var(--hml-text-tertiary);
  background: none;
  border: none;
  cursor: pointer;
}
.hml-ads-seg button:hover { color: var(--hml-text-secondary); }
.hml-ads-seg button.hml-on {
  background: rgba(180, 120, 255, 0.12);
  color: #c594ff;
  box-shadow: inset 0 0 0 1px rgba(180, 120, 255, 0.32), 0 0 14px -4px rgba(180, 120, 255, 0.45);
}
.hml-ads-filter {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 11px;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 7px;
  color: var(--hml-text-secondary);
  font-size: 12px;
}
.hml-ads-filter-count {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.04));
  padding: 1px 6px;
  border-radius: 4px;
}
.hml-ads-filter-select {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.hml-ads-search {
  display: flex;
  align-items: center;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 7px;
  padding: 0 11px;
  height: 30px;
  flex: 1;
  min-width: 220px;
  max-width: 340px;
}
.hml-ads-search input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--hml-text-primary);
  font-size: 12.5px;
}
.hml-ads-search input::placeholder { color: var(--hml-text-tertiary); }

/* Stripped tree table */
.hml-ads-tree-wrap {
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px;
  overflow: hidden;
}
.hml-ads-tree {
  display: flex;
  flex-direction: column;
}
.hml-ads-tree-head,
.hml-ads-tree-row,
.hml-ads-tree-foot {
  display: grid;
  grid-template-columns: minmax(280px, 1.8fr) 110px 130px 96px 80px 86px 70px 150px;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
}
.hml-ads-tree-head {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
  border-bottom: 1px solid var(--hml-border-subtle);
  background: var(--hml-bg-elev-1);
}
.hml-ads-tree-head .hml-ads-tree-num,
.hml-ads-tree-head .hml-ads-tree-budget,
.hml-ads-tree-head .hml-ads-tree-trend {
  text-align: right;
}
.hml-ads-tree-row {
  border-bottom: 1px solid var(--hml-border-subtle);
  position: relative;
  transition: background 120ms;
}
.hml-ads-tree-row:hover {
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.02));
}
.hml-ads-tree-row:hover::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #b478ff;
  box-shadow: 0 0 12px rgba(180, 120, 255, 0.45);
}
.hml-ads-tree-row.hml-lvl-2 .hml-ads-tree-name { padding-left: 28px; }
.hml-ads-tree-row.hml-lvl-3 .hml-ads-tree-name { padding-left: 50px; }
.hml-ads-tree-name {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.hml-ads-tree-title {
  font-size: 12.8px;
  font-weight: 500;
  color: var(--hml-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hml-ads-tree-title.hml-dim {
  color: var(--hml-text-secondary);
  font-weight: 400;
}
.hml-ads-tree-account {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  color: var(--hml-text-tertiary);
  margin-left: auto;
}
.hml-ads-tree-num {
  font-family: var(--hml-font-mono);
  font-size: 12px;
  color: var(--hml-text-primary);
  text-align: right;
}
.hml-ads-tree-budget { text-align: right; }
.hml-ads-budget-amt {
  font-family: var(--hml-font-mono);
  font-size: 12px;
  color: var(--hml-text-primary);
}
.hml-ads-budget-cad {
  font-size: 10px;
  color: var(--hml-text-tertiary);
}
.hml-ads-pace {
  margin-top: 4px;
  height: 3px;
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.04));
  border-radius: 2px;
  overflow: hidden;
}
.hml-ads-pace > span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #7a3fd9, #b478ff);
  box-shadow: 0 0 8px rgba(180, 120, 255, 0.45);
}
.hml-ads-pace.hml-warn > span {
  background: linear-gradient(90deg, #b87410, #f59e0b);
  box-shadow: 0 0 8px #f59e0b;
}
.hml-ads-tree-trend { text-align: right; }
.hml-ads-spark-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}
.hml-ads-spark {
  width: 80px;
  height: 24px;
  display: block;
}
.hml-ads-spark-delta {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
}
.hml-ads-spark-delta.hml-pos { color: #5fe699; }
.hml-ads-spark-delta.hml-neg { color: #ef6b6b; }

/* Switch + chevron + status dot */
.hml-ads-chev {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  color: var(--hml-text-tertiary);
  background: none;
  border: none;
  cursor: pointer;
  transition: transform 160ms ease, color 120ms;
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
}
.hml-ads-chev:hover { color: var(--hml-text-primary); }
.hml-ads-chev.hml-open { transform: rotate(90deg); color: var(--hml-text-secondary); }
.hml-ads-chev.hml-leaf { visibility: hidden; }

.hml-ads-swtch {
  width: 28px;
  height: 16px;
  border-radius: 999px;
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.04));
  border: 1px solid var(--hml-border-subtle);
  position: relative;
  flex-shrink: 0;
  cursor: pointer;
  padding: 0;
  transition: background 160ms, border-color 160ms;
}
.hml-ads-swtch::after {
  content: "";
  position: absolute;
  top: 1px;
  left: 1px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--hml-text-tertiary);
  transition: left 160ms ease, background 160ms;
}
.hml-ads-swtch.hml-on {
  background: rgba(180, 120, 255, 0.12);
  border-color: rgba(180, 120, 255, 0.32);
  box-shadow: 0 0 14px -4px rgba(180, 120, 255, 0.45);
}
.hml-ads-swtch.hml-on::after {
  left: 13px;
  background: #c594ff;
  box-shadow: 0 0 8px rgba(180, 120, 255, 0.45);
}

.hml-ads-row-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.hml-ads-row-dot.hml-active-dot { background: #5fe699; box-shadow: 0 0 6px #5fe699; }
.hml-ads-row-dot.hml-learning-dot { background: #7ba8c4; box-shadow: 0 0 6px #7ba8c4; }
.hml-ads-row-dot.hml-paused-dot { background: #f59e0b; box-shadow: 0 0 6px #f59e0b; }

.hml-ads-obj-badge {
  font-family: var(--hml-font-mono);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--hml-border-subtle);
  color: var(--hml-text-secondary);
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.04));
  flex-shrink: 0;
}
.hml-ads-obj-badge.hml-ads-obj-leads {
  color: #7ba8c4;
  border-color: rgba(123, 168, 196, 0.25);
  background: rgba(123, 168, 196, 0.12);
}
.hml-ads-obj-badge.hml-ads-obj-conv {
  color: #c594ff;
  border-color: rgba(180, 120, 255, 0.32);
  background: rgba(180, 120, 255, 0.12);
}
.hml-ads-obj-badge.hml-ads-obj-reach { color: var(--hml-text-secondary); }

.hml-ads-ad-thumb {
  width: 28px;
  height: 28px;
  border-radius: 5px;
  background: linear-gradient(135deg, #2a2a35, #15151c);
  border: 1px solid var(--hml-border-subtle);
  display: grid;
  place-items: center;
  color: var(--hml-text-tertiary);
  font-family: var(--hml-font-mono);
  font-size: 9px;
  flex-shrink: 0;
}

.hml-ads-tree-foot {
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.04));
  font-family: var(--hml-font-mono);
  font-size: 11.5px;
  color: var(--hml-text-primary);
  border-top: 1px solid var(--hml-border-subtle);
}
.hml-ads-tree-foot .hml-ads-tree-name {
  font-size: 10.5px;
  color: var(--hml-text-secondary);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.hml-ads-tree-foot .hml-ads-tree-budget {
  font-family: var(--hml-font-mono);
}
`;
