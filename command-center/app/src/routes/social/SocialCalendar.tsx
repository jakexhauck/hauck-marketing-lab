import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Shell from "../../components/Shell";
import { PageHeader } from "../../components/PageHeader";
import { Panel, Button, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import { Platform, NotConnectedNotice, SOCIAL_CONTAINER, PLATFORM } from "./shared";
import PlanMonthDialog from "../../components/social/PlanMonthDialog";

// Month calendar. Populated demo month in preview; empty not-connected otherwise.

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Ev = { p: Platform; label: string };
// June 2026 laid out Mon-first. `out` greys leading/trailing days from other months.
const CELLS: { day: number; out?: boolean; today?: boolean; events?: Ev[] }[] = [
  { day: 1 }, { day: 2 }, { day: 3 }, { day: 4 }, { day: 5 }, { day: 6 }, { day: 7 },
  { day: 8 }, { day: 9 }, { day: 10 }, { day: 11 }, { day: 12 }, { day: 13 }, { day: 14 },
  { day: 15 }, { day: 16 }, { day: 17 }, { day: 18 }, { day: 19 }, { day: 20 }, { day: 21 },
  { day: 22 }, { day: 23, events: [{ p: "ig", label: "Crew intro" }] },
  { day: 24, events: [{ p: "fb", label: "Drain tip" }] },
  { day: 25 },
  { day: 26, events: [{ p: "gb", label: "Garcia 5★" }] },
  { day: 27, today: true },
  { day: 28, events: [{ p: "ig", label: "Hot water" }, { p: "fb", label: "Hot water" }] },
  { day: 29, events: [{ p: "fb", label: "AC tune-up" }] },
  { day: 30 },
  { day: 1, out: true }, { day: 2, out: true }, { day: 3, out: true }, { day: 4, out: true }, { day: 5, out: true },
];

export default function SocialCalendar() {
  const demo = demoMode();
  const [planOpen, setPlanOpen] = useState(false);

  return (
    <Shell>
      <PlanMonthDialog open={planOpen} onClose={() => setPlanOpen(false)} />
      <div className={SOCIAL_CONTAINER}>
        <PageHeader
          title="Calendar"
          description="Your whole month of posts at a glance."
          actions={
            <Button variant="primary" size="md" onClick={() => setPlanOpen(true)}>
              <CalendarDays size={16} /> Plan My Month
            </Button>
          }
        />

        {!demo && (
          <NotConnectedNotice message="Your calendar fills in once posts can publish. Connect your social accounts through GoHighLevel to start scheduling." />
        )}

        {demo ? (
          <Panel className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="font-display text-[19px] text-text">June 2026</div>
              <div className="flex gap-1.5">
                <Button variant="secondary" size="icon" aria-label="Previous month">
                  <ChevronLeft size={16} />
                </Button>
                <Button variant="secondary" size="icon" aria-label="Next month">
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-2">
              {DOW.map((d) => (
                <div key={d} className="text-center font-data text-[10px] uppercase tracking-wide text-faint">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {CELLS.map((c, i) => (
                <div
                  key={i}
                  className={`flex min-h-[94px] flex-col gap-1.5 rounded-[11px] border p-2 ${
                    c.today
                      ? "border-brand bg-brand-tint"
                      : c.out
                        ? "border-border bg-surface-2 opacity-60"
                        : "border-border bg-surface"
                  }`}
                >
                  <span className={`font-display text-[12.5px] ${c.today ? "text-brand-text" : "text-faint"}`}>
                    {c.day}
                  </span>
                  {c.events?.map((e, j) => (
                    <div
                      key={j}
                      className="flex items-center gap-1.5 truncate rounded-md bg-surface-2 px-1.5 py-1 text-[10.5px] font-medium text-muted"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-sm"
                        style={{ background: PLATFORM[e.p].bg }}
                      />
                      <span className="truncate">{e.label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Panel>
        ) : (
          <Panel className="px-4 py-12">
            <EmptyState
              icon={<CalendarDays size={22} />}
              title="Your posting calendar is on the way"
              description="Once connected, you'll see every scheduled and published post on a month view, with open days you can fill in a tap."
            />
          </Panel>
        )}
      </div>
    </Shell>
  );
}
