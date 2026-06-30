import { RotateCcw, Zap, Users, CalendarCheck } from "lucide-react";
import Shell from "../../components/Shell";
import { PageHeader } from "../../components/PageHeader";
import { Panel, PanelHeader, Badge, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import { PAGE_CONTAINER } from "../../lib/layout";
import {
  NotConnectedNotice,
  REACT_KPIS,
  REACT_STAGES,
  REACT_DORMANT_TOTAL,
  REACT_REACHED,
  REACT_RECENT,
} from "../campaigns/shared";

// Reactivation: a standing Sales surface (its own category in the Sales group)
// that layers over the always-on GHL "Database Reactivation" pipeline. It wins
// back dormant past customers with a short text + email sequence. Same golden
// rule as the rest of the client app: a real (connected) client sees the
// zeroed/not-connected state until the customer list is linked; the designed,
// populated layout only renders in demo/preview (`?demo=1`).

// Page scroll container, matching the other client surfaces.
const REACTIVATION_CONTAINER = PAGE_CONTAINER;

export default function Reactivation() {
  const demo = demoMode();
  const kpis = demo ? REACT_KPIS : REACT_KPIS.map((k) => ({ ...k, value: "0", brand: false }));

  return (
    <Shell>
      <div className={REACTIVATION_CONTAINER}>
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
            {/* Where the reached customers are now: one row per real pipeline
                stage (Lead Responded, No answer, Not Qualified) plus the Won
                outcome. Bars are measured against the reached total. */}
            <Panel className="overflow-hidden">
              <PanelHeader title="Where they are now" />
              {demo ? (
                <div className="flex flex-col gap-4 p-4">
                  {REACT_STAGES.map((s) => (
                    <div key={s.label}>
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="flex items-center gap-2 font-display text-[14px] text-text">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={s.grad ? { backgroundImage: s.bar } : { background: s.bar }}
                            aria-hidden
                          />
                          {s.label}
                        </div>
                        <div className="shrink-0 font-data text-[13px] font-semibold text-text">{s.count}</div>
                      </div>
                      <div className="mt-1 pl-[18px] text-[12px] text-faint">{s.hint}</div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max((s.count / REACT_REACHED) * 100, 3)}%`,
                            ...(s.grad ? { backgroundImage: s.bar } : { background: s.bar }),
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5 pt-1 text-[12px] text-faint">
                    <Users size={13} /> {REACT_REACHED} of {REACT_DORMANT_TOTAL} dormant customers reached so far
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
