import { BarChart3, Clock, Eye, Target, UserPlus, Monitor, MapPin, CalendarDays } from "lucide-react";
import { Panel, EmptyState } from "../../../ui";
import { useAdminWebsiteAnalyticsQuery } from "../../../../hooks/useApi";
import { formatDuration } from "../../../../hooks/useWebsiteAnalytics";

// Web Design > Analytics. One client's real GA4 numbers in the Fulfillment
// cockpit, read from GET /api/admin/clients/:tenantId/website/analytics (the
// same WebsiteAnalytics the client's own Insights reads). Not connected, or the
// GA4 property unset -> an honest "not connected" state, never fabricated
// numbers. No plain-English narration here: this is the operator's read.

// A labelled horizontal bar (traffic sources / device mix). Shared by both.
function BarRow({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[13px]">
        <span className="text-text">{label}</span>
        <span className="font-data font-semibold tnum text-muted">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: "var(--grad-brand)" }}
        />
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
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

export default function AnalyticsPanel({ tenantId }: { tenantId: string }) {
  const query = useAdminWebsiteAnalyticsQuery(tenantId);

  if (query.isLoading) {
    return <div className="pk-empty">Loading analytics...</div>;
  }
  if (query.isError || !query.data) {
    return <div className="pk-empty">Could not load this client's analytics.</div>;
  }

  const a = query.data;
  if (!a.connected) {
    return (
      <Panel className="px-4 py-12">
        <EmptyState
          icon={<BarChart3 size={22} />}
          title="Google Analytics is not connected for this client"
          description="Add the client's GA4 property in Config to see their visitor trend, traffic sources, and top pages here."
        />
      </Panel>
    );
  }

  const totalUsers = a.newUsers + a.returningUsers;
  const newPct = totalUsers > 0 ? Math.round((a.newUsers / totalUsers) * 100) : 0;
  const maxTrend = Math.max(1, ...a.trend);

  return (
    <div>
      {/* Hero: visitors this month + delta + trend. */}
      <Panel className="mb-4 p-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="label-cap mb-2 text-muted">Visitors this month</div>
            <div className="flex items-baseline gap-2.5">
              <span className="font-display text-[64px] font-black leading-[0.9] tracking-[-0.045em] tnum text-text">
                {a.visitorsThisMonth.toLocaleString()}
              </span>
              <span className="font-display text-[18px] font-semibold text-muted">visitors</span>
            </div>
            {a.deltaPct != null && (
              <div className="mt-3 flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[12px] font-bold tnum ${
                    a.deltaPct >= 0 ? "bg-positive-tint text-positive" : "bg-danger-tint text-danger"
                  }`}
                >
                  {a.deltaPct >= 0 ? "+" : ""}
                  {a.deltaPct}%
                </span>
                <span className="text-[13px] text-muted">
                  vs last month ({a.visitorsLastMonth.toLocaleString()})
                </span>
              </div>
            )}
          </div>

          {a.trend.length > 0 && (
            <div className="flex h-[60px] items-end gap-[5px]">
              {a.trend.map((v, i) => (
                <span
                  key={i}
                  className="block w-[11px] rounded-t-[4px]"
                  style={{ height: `${Math.max(4, (v / maxTrend) * 100)}%`, background: "var(--grad-brand)", opacity: 0.85 }}
                />
              ))}
            </div>
          )}
        </div>
      </Panel>

      {/* KPI strip. */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard icon={Clock} label="Avg time on site" value={formatDuration(a.avgTimeOnSiteSec)} />
        <KpiCard icon={Eye} label="Page views" value={a.pageViews.toLocaleString()} />
        <KpiCard icon={Target} label="Engaged visitors" value={`${a.engagementRate}%`} />
        <KpiCard icon={UserPlus} label="New visitors" value={`${newPct}%`} />
      </div>

      {/* Sources + most-visited pages. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <h3 className="mb-4 font-display text-[15px] text-text">Where visitors come from</h3>
          {a.sources.length > 0 ? (
            <div className="flex flex-col gap-3.5">
              {a.sources.map((s) => (
                <BarRow key={s.label} label={s.label} pct={s.pct} />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted">No traffic sources recorded yet this month.</p>
          )}
        </Panel>

        <Panel className="p-5">
          <h3 className="mb-4 font-display text-[15px] text-text">Most-visited pages</h3>
          {a.topPages.length > 0 ? (
            <ul className="flex flex-col">
              {a.topPages.map((p, i) => (
                <li
                  key={`${p.path}-${i}`}
                  className="flex items-center justify-between border-b border-divider py-2.5 last:border-b-0"
                >
                  <span className="flex items-center gap-2.5 text-[13.5px] text-text">
                    <span className="font-data text-[12px] tnum text-faint">{i + 1}</span>
                    {p.label}
                  </span>
                  <span className="font-data text-[13px] font-semibold tnum text-muted">
                    {p.views.toLocaleString()} views
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">No page views recorded yet this month.</p>
          )}
        </Panel>
      </div>

      {/* Devices + top towns. */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <h3 className="mb-4 flex items-center gap-2 font-display text-[15px] text-text">
            <Monitor size={16} className="text-brand" />
            What people visit on
          </h3>
          {a.devices.length > 0 ? (
            <div className="flex flex-col gap-3.5">
              {a.devices.map((d) => (
                <BarRow key={d.label} label={d.label} pct={d.pct} />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted">No device data yet this month.</p>
          )}
        </Panel>

        <Panel className="p-5">
          <h3 className="mb-4 flex items-center gap-2 font-display text-[15px] text-text">
            <MapPin size={16} className="text-brand" />
            Where visitors are
          </h3>
          {a.cities.length > 0 ? (
            <ul className="flex flex-col">
              {a.cities.map((c, i) => (
                <li
                  key={`${c.label}-${i}`}
                  className="flex items-center justify-between border-b border-divider py-2.5 last:border-b-0"
                >
                  <span className="text-[13.5px] text-text">{c.label}</span>
                  <span className="font-data text-[13px] font-semibold tnum text-muted">
                    {c.visitors.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">No location data yet this month.</p>
          )}
        </Panel>
      </div>

      {/* Busiest day. */}
      {a.busiestDay && (
        <Panel className="mt-4 flex items-center gap-3 p-5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-tint text-brand-text">
            <CalendarDays size={19} />
          </div>
          <div className="text-[14px] text-text">
            <span className="font-semibold">{a.busiestDay}</span> is this client's busiest day.
          </div>
        </Panel>
      )}
    </div>
  );
}
