// The Paid Ads overview: every client's headline numbers in one place (the
// agency "master sheet" view), above a table you can drill into. Opens from the
// Service Delivery > Paid Ads box. Mock data for now via MOCK_ADS_CLIENTS.

import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { PillarStyle } from "../../components/pillars/PillarKit";
import { MOCK_ADS_CLIENTS } from "../../lib/mockAds";
import { computeFunnel, sumFunnels, type Funnel } from "../../lib/adsTracker";
import { gbp, roasX, intNum } from "../../components/ads-tracker/format";

const TH =
  "border-y border-divider px-4 py-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.01em] text-faint";
const THR = TH + " text-right";
const TD = "px-4 py-4 text-[14px] text-text";
const TDR = TD + " text-right tabular-nums";

const TOTAL_TILES: { label: string; key: keyof Funnel; fmt: (n: number) => string }[] = [
  { label: "Leads", key: "leads", fmt: intNum },
  { label: "Pickups", key: "pickups", fmt: intNum },
  { label: "Bookings", key: "bookings", fmt: intNum },
  { label: "Sales", key: "sales", fmt: intNum },
  { label: "Revenue", key: "revenue", fmt: gbp },
  { label: "Ad Spend", key: "adSpend", fmt: gbp },
  { label: "Blended ROAS", key: "roas", fmt: roasX },
];

export default function AdminAds() {
  const navigate = useNavigate();

  const rows = useMemo(
    () =>
      MOCK_ADS_CLIENTS.map((c) => ({ client: c, funnel: computeFunnel(c) })),
    [],
  );
  const totals = useMemo(() => sumFunnels(rows.map((r) => r.funnel)), [rows]);

  return (
    <div className="pk-root">
      <PillarStyle />

      <Link className="pk-back" to="/admin/pillar/service/lanes">
        <ArrowLeft /> Service Delivery
      </Link>

      <div className="pk-kicker">Service Delivery</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="pk-title">Paid Ads</span>
      </div>
      <div className="pk-tagline">Every client's ad performance, rolled up and per client.</div>

      {/* Agency-wide totals: the master rollup across all clients. */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
        {TOTAL_TILES.map((t) => (
          <div
            key={t.label}
            className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3.5 shadow-[var(--shadow-sm)]"
          >
            <div
              className={
                "font-display text-[22px] font-semibold tabular-nums tracking-[-0.02em] " +
                (t.key === "revenue"
                  ? "text-positive"
                  : t.key === "roas"
                    ? "text-brand-text"
                    : "text-text")
              }
            >
              {t.fmt(totals[t.key])}
            </div>
            <div className="mt-1 text-[11.5px] font-medium leading-tight text-muted">{t.label}</div>
          </div>
        ))}
      </div>

      {/* Per-client table: click a row to open that client's full tracker. */}
      <section className="mt-6 overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>Client</th>
              <th className={THR}>Leads</th>
              <th className={THR}>Bookings</th>
              <th className={THR}>Sales</th>
              <th className={THR}>Revenue</th>
              <th className={THR}>Ad Spend</th>
              <th className={THR}>ROAS</th>
              <th className="w-10 border-y border-divider px-2 py-3" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ client, funnel }) => (
              <tr
                key={client.clientId}
                onClick={() => navigate(`/admin/ads/${client.clientId}`)}
                className="group cursor-pointer border-b border-divider transition-colors last:border-0 hover:bg-surface-2"
              >
                <td className={TD}>
                  <div className="flex items-center gap-3">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] font-display text-[13px] font-bold text-white shadow-[var(--shadow-sm)]"
                      style={{ background: client.brandColor || "var(--brand)" }}
                    >
                      {client.brandInitials || client.clientName.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <div className="font-display text-[14.5px] font-semibold tracking-[-0.01em]">
                        {client.clientName}
                      </div>
                      <div className="text-[12.5px] text-muted">{client.niche || "--"}</div>
                    </div>
                  </div>
                </td>
                <td className={TDR}>{intNum(funnel.leads)}</td>
                <td className={TDR}>{intNum(funnel.bookings)}</td>
                <td className={TDR}>{intNum(funnel.sales)}</td>
                <td className={TDR + " font-semibold text-positive"}>{gbp(funnel.revenue)}</td>
                <td className={TDR + " text-muted"}>{gbp(funnel.adSpend)}</td>
                <td className={TDR + " font-semibold text-brand-text"}>{roasX(funnel.roas)}</td>
                <td className="px-2 py-4 text-right">
                  <ChevronRight
                    size={18}
                    className="text-faint transition-all group-hover:translate-x-1 group-hover:text-brand-text"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
