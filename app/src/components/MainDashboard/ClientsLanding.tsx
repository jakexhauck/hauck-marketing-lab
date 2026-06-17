import { useMemo } from "react";
import type { ClientEntry } from "../../lib/types";
import type { ClientSection } from "../../lib/navigation";
import { useAdsAccounts } from "../../lib/useAdsAccounts";
import type { MetaAdsAccount } from "../../lib/mockMetaAds";
import { IconChevronRight, IconPlus } from "../icons";

interface ClientsLandingProps {
  clients: ClientEntry[];
  root: string | null;
  onSelectClientSection: (slug: string, section: ClientSection) => void;
  onAddClient?: () => void;
}

function fmtMoney(n: number, currency: string = "USD") {
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: n >= 100 ? 0 : 2,
  }).format(n);
}

function fmtInt(n: number) {
  if (!isFinite(n)) return "0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function statusPill(s: ClientEntry["status"]) {
  switch (s) {
    case "live":
      return { className: "live", label: "Live" };
    case "pre-launch":
      return { className: "pre", label: "Pre-launch" };
    case "paused":
      return { className: "paused", label: "Paused" };
  }
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <svg className="hml-cl-spark" viewBox="0 0 78 22" preserveAspectRatio="none">
        <line x1="0" y1="11" x2="78" y2="11" stroke="color-mix(in srgb, var(--brand) 30%, transparent)" strokeWidth="1" />
      </svg>
    );
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 78;
  const h = 22;
  const stepX = w / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg className="hml-cl-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ClientsLanding({
  clients,
  root: _root,
  onSelectClientSection,
  onAddClient,
}: ClientsLandingProps) {
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
    let campaignCount = 0;
    for (const a of accounts) {
      spend += a.totals.spend;
      results += a.totals.results;
      revenue += a.totals.revenue;
      roasSum += a.totals.roas;
      campaignCount += a.campaigns.length;
    }
    const n = Math.max(1, accounts.length);
    return {
      spend,
      results,
      cpr: results > 0 ? spend / results : 0,
      roas: roasSum / n,
      revenue,
      campaignCount,
    };
  }, [accounts]);

  const accountsBySlug = useMemo(() => {
    const map = new Map<string, MetaAdsAccount>();
    for (const a of accounts) map.set(a.clientSlug, a);
    return map;
  }, [accounts]);

  const rows = useMemo(() => {
    return clients.map((c) => {
      const acct = accountsBySlug.get(c.slug);
      const totals7d = acct?.totals;
      const daily = acct?.daily ?? [];
      const sparkValues = daily.map((d) => d.spend);
      return {
        client: c,
        spend: totals7d?.spend ?? 0,
        results: totals7d?.results ?? 0,
        cpr: totals7d?.cpr ?? 0,
        roas: totals7d?.roas ?? 0,
        sparkValues,
      };
    });
  }, [clients, accountsBySlug]);

  return (
    <div className="hml-content hml-cl">
      <style>{LANDING_CSS}</style>

      <div className="hml-cl-head">
        <div>
          <h1 className="hml-cl-title">Clients</h1>
          <div className="hml-cl-sub">
            {clients.length} client{clients.length === 1 ? "" : "s"}
            {", "}
            {totals.campaignCount} campaign{totals.campaignCount === 1 ? "" : "s"}
            {", "}
            last refreshed {loading ? "now" : "just now"}
          </div>
        </div>
        {onAddClient && (
          <button type="button" className="hml-cl-add" onClick={onAddClient}>
            <IconPlus size={13} />
            <span>Add client</span>
          </button>
        )}
      </div>

      <div className="hml-cl-kpis">
        <Kpi label="Total spend · 7d" value={fmtMoney(totals.spend)} />
        <Kpi label="Total leads" value={fmtInt(totals.results)} />
        <Kpi label="Avg CPL" value={fmtMoney(totals.cpr)} />
        <Kpi
          label="Avg ROAS"
          value={`${totals.roas.toFixed(2)}x`}
        />
      </div>

      <div className="hml-cl-table">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Status</th>
              <th className="hml-cl-num">Spend</th>
              <th className="hml-cl-num">Leads</th>
              <th className="hml-cl-num">CPL</th>
              <th className="hml-cl-num">ROAS</th>
              <th className="hml-cl-num">7d trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="hml-cl-empty">
                  No clients yet. Add one to populate this view.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const pill = statusPill(r.client.status);
              return (
                <tr
                  key={r.client.slug}
                  className="hml-cl-row"
                  onClick={() => onSelectClientSection(r.client.slug, "ads")}
                >
                  <td>
                    <div className="hml-cl-ncell">
                      <span className="hml-cl-chev">
                        <IconChevronRight size={12} />
                      </span>
                      <span className="hml-cl-mark">
                        {r.client.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="hml-cl-name">{r.client.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`hml-cl-pill ${pill.className}`}>
                      <span className="hml-cl-pdot" />
                      {pill.label}
                    </span>
                  </td>
                  <td className="hml-cl-num">{fmtMoney(r.spend)}</td>
                  <td className="hml-cl-num">{fmtInt(r.results)}</td>
                  <td className="hml-cl-num">{fmtMoney(r.cpr)}</td>
                  <td className="hml-cl-num">{r.roas.toFixed(2)}x</td>
                  <td className="hml-cl-num">
                    <Sparkline values={r.sparkValues} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="hml-cl-kpi">
      <div className="hml-cl-kpi-lbl">{label}</div>
      <div className="hml-cl-kpi-val">{value}</div>
    </div>
  );
}

const LANDING_CSS = `
.hml-cl { padding: 24px 26px 30px; }
.hml-cl-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
.hml-cl-title { font-size: 22px; font-weight: 600; color: var(--hml-text-primary); letter-spacing: -0.018em; line-height: 1.2; }
.hml-cl-sub { font-size: 12.8px; color: var(--hml-text-tertiary); margin-top: 5px; }
.hml-cl-add {
  height: 32px; padding: 0 14px; border-radius: 7px;
  background: linear-gradient(180deg, var(--hml-accent-bright), var(--hml-accent));
  color: var(--brand-fg); font-size: 12.5px; font-weight: 600;
  display: inline-flex; align-items: center; gap: 7px;
  border: none; cursor: pointer;
  box-shadow:
    0 0 0 1px rgba(var(--ink),0.06) inset,
    0 0 22px -2px color-mix(in srgb, var(--brand) 45%, transparent),
    0 1px 0 rgba(var(--ink),0.2) inset;
}

.hml-cl-kpis {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 0;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px; margin-bottom: 20px; overflow: hidden;
}
.hml-cl-kpi {
  padding: 16px 20px;
  border-right: 1px solid var(--hml-border-subtle);
  display: flex; flex-direction: column; gap: 6px;
}
.hml-cl-kpi:last-child { border-right: none; }
.hml-cl-kpi-lbl {
  font-family: var(--hml-font-mono);
  font-size: 9.5px; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--hml-text-tertiary);
}
.hml-cl-kpi-val {
  font-family: var(--hml-font-mono);
  font-size: 22px; font-weight: 500;
  color: var(--hml-text-primary); letter-spacing: -0.01em; line-height: 1;
}

.hml-cl-table {
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px; overflow: hidden;
}
.hml-cl-table table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12.8px; }
.hml-cl-table thead th {
  text-align: left; padding: 14px 18px;
  font-family: var(--hml-font-mono);
  font-size: 10px; font-weight: 500; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--hml-text-tertiary);
  border-bottom: 1px solid var(--hml-border); background: var(--hml-bg-elev-1);
}
.hml-cl-table thead th.hml-cl-num { text-align: right; }
.hml-cl-table tbody td {
  padding: 16px 18px;
  border-bottom: 1px solid var(--hml-border-subtle);
  color: var(--hml-text-primary); vertical-align: middle;
}
.hml-cl-table tbody td.hml-cl-num {
  font-family: var(--hml-font-mono);
  text-align: right; font-size: 12.5px;
}
.hml-cl-table tbody tr:last-child td { border-bottom: none; }
.hml-cl-row { cursor: pointer; position: relative; transition: background 120ms ease; }
.hml-cl-row:hover td { background: var(--hml-bg-elev-2); }
.hml-cl-row > td:first-child { position: relative; }
.hml-cl-row:hover > td:first-child::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2px;
  background: var(--hml-accent); box-shadow: 0 0 12px color-mix(in srgb, var(--brand) 45%, transparent);
}

.hml-cl-empty { color: var(--hml-text-tertiary); text-align: center; padding: 28px; }

.hml-cl-ncell { display: flex; align-items: center; gap: 12px; min-width: 0; }
.hml-cl-chev { color: var(--hml-text-tertiary); display: inline-flex; }
.hml-cl-row:hover .hml-cl-chev { color: var(--hml-accent-bright); }
.hml-cl-mark {
  width: 26px; height: 26px; border-radius: 6px;
  flex-shrink: 0; display: grid; place-items: center;
  font-family: var(--hml-font-mono); font-size: 10px; font-weight: 600;
  color: var(--hml-text-primary); border: 1px solid var(--hml-border);
  background: var(--hml-bg-elev-2);
}
.hml-cl-name { font-size: 13.2px; font-weight: 500; color: var(--hml-text-primary); }

.hml-cl-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 9px; height: 22px; border-radius: 5px;
  font-family: var(--hml-font-mono); font-size: 10px; font-weight: 500;
  letter-spacing: 0.06em; text-transform: uppercase; border: 1px solid;
}
.hml-cl-pdot { width: 5px; height: 5px; border-radius: 50%; }
.hml-cl-pill.live { color: var(--hml-green); background: var(--hml-green-bg); border-color: var(--hml-green-border); }
.hml-cl-pill.live .hml-cl-pdot { background: var(--hml-green); box-shadow: 0 0 6px var(--hml-green); }
.hml-cl-pill.pre { color: var(--hml-blue); background: var(--hml-blue-bg); border-color: var(--hml-blue-border); }
.hml-cl-pill.pre .hml-cl-pdot { background: var(--hml-blue); }
.hml-cl-pill.paused { color: var(--hml-text-tertiary); background: var(--hml-bg-elev-2); border-color: var(--hml-border); }
.hml-cl-pill.paused .hml-cl-pdot { background: var(--hml-text-quaternary); }

.hml-cl-spark { width: 78px; height: 22px; display: inline-block; vertical-align: middle; }
`;
