import { Megaphone, DollarSign, UserPlus, Tag, Heart, CreditCard, Zap } from "lucide-react";
import { Panel, PanelHeader, EmptyState } from "../../../ui";
import {
  useAdminAdsInsightsQuery,
  useAdminAdsLeadsQuery,
  type AdminAdLeadRow,
} from "../../../../hooks/useApi";
import { timeAgo } from "../../../../lib/timeAgo";

// Paid Ads > Data & Leads. One client's real Meta spend/lead metrics plus their
// real Paid Ad's Pipeline leads in the Fulfillment cockpit, read from GET
// /api/admin/clients/:tenantId/ads/insights and .../ads/leads (the same shared
// adsCore + paidAdsPipeline the client's own Overview/Leads tabs read). Meta not
// wired, or no Paid Ad's Pipeline for this tenant -> an honest, specific empty
// state, never fabricated numbers or "connected, data will appear here" filler.

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
}) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2 text-[12.5px] text-muted">
        <Icon size={15} className="shrink-0 text-faint" />
        <span>{label}</span>
      </div>
      <div className="mt-2 font-display text-[24px] font-black leading-none tracking-tight tnum text-text">
        {value}
      </div>
    </Panel>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase()) || "?";
}

function LeadRow({ lead }: { lead: AdminAdLeadRow }) {
  return (
    <tr className="border-b border-divider transition-colors last:border-0 hover:bg-[var(--rail)]">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] font-display text-[12px] font-bold text-white"
            style={{ backgroundImage: "linear-gradient(135deg,#4f46e5,#7c73f0)" }}
          >
            {initialsOf(lead.name)}
          </span>
          <span className="text-[13.5px] font-semibold text-text">{lead.name}</span>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-[13px] text-muted">
        {lead.stageName ?? "Unknown stage"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-[13px] text-muted">
        {timeAgo(lead.lastActivityAt)}
      </td>
    </tr>
  );
}

export default function DataLeadsPanel({ tenantId }: { tenantId: string }) {
  const insightsQuery = useAdminAdsInsightsQuery(tenantId);
  const leadsQuery = useAdminAdsLeadsQuery(tenantId);

  if (insightsQuery.isLoading || leadsQuery.isLoading) {
    return <div className="pk-empty">Loading ad data...</div>;
  }
  if (insightsQuery.isError || !insightsQuery.data) {
    return <div className="pk-empty">Could not load this client's ad data.</div>;
  }

  const insights = insightsQuery.data;

  if (!insights.configured) {
    return (
      <Panel className="px-4 py-12">
        <EmptyState
          icon={<Megaphone size={22} />}
          title="Meta is not connected for this client yet"
          description="Add the client's ad account in Config to see their spend, leads, and cost per lead here."
        />
      </Panel>
    );
  }

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: insights.currency || "USD",
    maximumFractionDigits: 0,
  });
  const { totals, ads } = insights;

  const leadsData = leadsQuery.data;

  return (
    <div>
      {/* KPI strip: this client's real spend/lead numbers this month. */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard icon={DollarSign} label="Spend" value={money.format(totals.spend)} />
        <KpiCard icon={UserPlus} label="Leads" value={totals.leads.toLocaleString()} />
        <KpiCard icon={Tag} label="Cost per lead" value={money.format(totals.costPerLead)} />
        <KpiCard icon={Heart} label="Customers" value={totals.customers.toLocaleString()} />
        <KpiCard icon={CreditCard} label="Revenue" value={money.format(totals.revenue)} />
        <KpiCard icon={Zap} label="ROAS" value={`${totals.roas}x`} />
      </div>

      {/* Per-ad breakdown. */}
      <Panel className="mb-4 overflow-hidden p-0">
        <PanelHeader title="Ads" action={<span className="label-cap">{ads.length} total</span>} />
        {ads.length === 0 ? (
          <p className="px-4 py-8 text-[13px] text-muted">No ads have run yet this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Ad", "Status", "Leads", "Reach", "Spend"].map((h) => (
                    <th
                      key={h}
                      className="label-cap whitespace-nowrap border-b border-divider bg-[var(--rail)] px-4 py-2.5 text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ads.map((a) => (
                  <tr key={a.id} className="border-b border-divider last:border-0">
                    <td className="max-w-[280px] truncate px-4 py-3 text-[13.5px] font-semibold text-text">
                      {a.headline}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                          a.active ? "bg-positive-tint text-positive" : "bg-[var(--surface-2)] text-muted"
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {a.active ? "Active" : "Paused"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[13px] tnum text-muted">
                      {a.leads.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[13px] tnum text-muted">
                      {a.reach.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[13px] font-semibold tnum text-text">
                      {money.format(a.spend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Incoming leads: this client's real Paid Ad's Pipeline. */}
      <Panel className="overflow-hidden p-0">
        <PanelHeader title="Incoming leads" action={<span className="label-cap">Newest first</span>} />
        {leadsQuery.isError || !leadsData ? (
          <p className="px-4 py-8 text-[13px] text-muted">Could not load this client's leads.</p>
        ) : leadsData.configError === "pipeline_not_found" ? (
          <EmptyState
            className="px-4 py-12"
            icon={<UserPlus size={22} />}
            title="No Paid Ad's Pipeline found for this client"
            description="This client's GoHighLevel account has no pipeline named Paid Ad's Pipeline yet, so there is nowhere for ad leads to land."
          />
        ) : leadsData.leads.length === 0 ? (
          <p className="px-4 py-8 text-[13px] text-muted">No leads have come in yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Name", "Stage", "Last activity"].map((h) => (
                    <th
                      key={h}
                      className="label-cap whitespace-nowrap border-b border-divider bg-[var(--rail)] px-4 py-2.5 text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leadsData.leads.map((lead) => (
                  <LeadRow key={lead.id} lead={lead} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
