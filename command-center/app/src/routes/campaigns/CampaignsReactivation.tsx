import { RotateCcw, Zap, Users, CalendarCheck } from "lucide-react";
import Shell from "../../components/Shell";
import CampaignsMobileTabs from "../../components/campaigns/CampaignsMobileTabs";
import { PageHeader } from "../../components/PageHeader";
import { Panel, PanelHeader, Badge, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import {
  CAMPAIGNS_CONTAINER,
  NotConnectedNotice,
  ChannelGlyph,
  ChannelChip,
  REACT_KPIS,
  REACT_FUNNEL,
  REACT_DORMANT_TOTAL,
  REACT_SEQUENCE,
  REACT_RECENT,
} from "./shared";

// Reactivation: the client-facing layer over the standing GHL "Database
// Reactivation" pipeline. An always-on campaign that wins back dormant past
// customers with a short text + email sequence. Same golden rule as the rest of
// Campaigns: a real (connected) client sees the zeroed/not-connected state until
// the customer list is linked; the designed, populated layout only renders in
// demo/preview (`?demo=1`).

export default function CampaignsReactivation() {
  const demo = demoMode();
  const kpis = demo ? REACT_KPIS : REACT_KPIS.map((k) => ({ ...k, value: "0", brand: false }));

  return (
    <Shell>
      <div className={CAMPAIGNS_CONTAINER}>
        <CampaignsMobileTabs />
        <PageHeader
          title="Reactivation"
          description="Quietly win back customers who haven't booked in a while, on autopilot."
          actions={
            demo ? (
              <Badge tone="positive">
                <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden /> Running
              </Badge>
            ) : undefined
          }
        />

        {!demo && (
          <NotConnectedNotice message="Once your customer list is linked through GoHighLevel, we'll quietly reach out to people who haven't booked in a while and show you who comes back here." />
        )}

        {/* What it does, in one calm line (demo only). */}
        {demo && (
          <Panel className="mb-4 flex items-start gap-3 border-brand/30 bg-brand-tint p-4">
            <RotateCcw size={20} className="mt-0.5 shrink-0 text-brand-text" />
            <div className="flex-1 text-[13px] leading-snug text-text">
              We automatically reach out to your{" "}
              <span className="font-semibold">{REACT_DORMANT_TOTAL} past customers</span> who haven't booked in over a
              year, with a short text and email. You don't have to lift a finger, the booked jobs just show up.
            </div>
          </Panel>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((k) => (
            <Panel key={k.label} className="p-4">
              <div className="text-[13px] text-muted">{k.label}</div>
              <div
                className={`mt-2 font-data text-[28px] font-semibold tnum ${
                  k.brand ? "text-brand-text" : demo ? "text-text" : "text-faint"
                }`}
              >
                {k.value}
              </div>
            </Panel>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            {/* The funnel: dormant -> reached -> replied -> booked */}
            <Panel className="overflow-hidden">
              <PanelHeader title="How it's going" />
              {demo ? (
                <div className="flex flex-col gap-4 p-4">
                  {REACT_FUNNEL.map((s) => (
                    <div key={s.label}>
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="font-display text-[14px] text-text">{s.label}</div>
                        <div className="shrink-0 font-data text-[13px] font-semibold text-text">{s.count}</div>
                      </div>
                      <div className="mt-1 text-[12px] text-faint">{s.hint}</div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max((s.count / REACT_DORMANT_TOTAL) * 100, 3)}%`,
                            backgroundImage: "var(--grad-brand)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5 pt-1 text-[12px] text-faint">
                    <Users size={13} /> Measured against {REACT_DORMANT_TOTAL} dormant customers
                  </div>
                </div>
              ) : (
                <div className="px-4 py-10">
                  <EmptyState
                    icon={<RotateCcw size={22} />}
                    title="Nothing to show yet"
                    description="Once we connect your list, you'll see how many dormant customers we've reached and won back."
                  />
                </div>
              )}
            </Panel>

            {/* The message sequence */}
            <Panel className="overflow-hidden">
              <PanelHeader title="The sequence" />
              {demo ? (
                <ol>
                  {REACT_SEQUENCE.map((m) => (
                    <li
                      key={m.step}
                      className="flex gap-3 border-b border-divider px-4 py-3.5 last:border-b-0"
                    >
                      <ChannelGlyph ch={m.ch} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-[14px] text-text">{m.title}</span>
                          <ChannelChip ch={m.ch} />
                          <span className="ml-auto shrink-0 text-[12px] font-medium text-faint">{m.when}</span>
                        </div>
                        {m.subject && (
                          <div className="mt-1 text-[12.5px] font-medium text-muted">Subject: {m.subject}</div>
                        )}
                        <div className="mt-1 text-[12.5px] leading-snug text-faint">{m.body}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="px-4 py-10">
                  <EmptyState
                    icon={<RotateCcw size={22} />}
                    title="Your sequence lives here"
                    description="The texts and emails we send to win back past customers will show up here once it's live."
                  />
                </div>
              )}
            </Panel>
          </div>

          {/* Recently won back + a small note */}
          <div className="flex flex-col gap-4">
            <Panel className="overflow-hidden">
              <PanelHeader title="Recently won back" />
              {demo ? (
                <ul>
                  {REACT_RECENT.map((r) => (
                    <li
                      key={r.name}
                      className="flex items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0"
                    >
                      <span
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-[14px] font-semibold"
                        style={{ background: "var(--brand-tint)", color: "var(--brand-text)" }}
                        aria-hidden
                      >
                        {r.initials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display text-[14px] text-text">{r.name}</div>
                        <div className="mt-0.5 text-[12px] text-faint">{r.sub}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-10">
                  <EmptyState
                    icon={<CalendarCheck size={22} />}
                    title="No win-backs yet"
                    description="Customers this campaign brings back will appear here."
                  />
                </div>
              )}
            </Panel>

            {demo && (
              <Panel className="flex items-start gap-3 border-brand/30 bg-brand-tint p-4">
                <Zap size={20} className="mt-0.5 shrink-0 text-brand-text" />
                <div className="flex-1 text-[13px] leading-snug text-text">
                  This runs in the background every month, so dormant customers keep getting a gentle nudge without you
                  thinking about it.
                </div>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
