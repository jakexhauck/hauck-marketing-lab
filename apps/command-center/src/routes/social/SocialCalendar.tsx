import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { SOCIAL_TABS } from "../../lib/pageTabs";
import { Panel, Button, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import {
  Platform,
  NotConnectedNotice,
  ConnectedEmptyNotice,
  SOCIAL_CONTAINER,
  PLATFORM,
} from "./shared";
import { useSocialAccounts, useSocialPosts } from "../../hooks/useSocial";
import { buildMonthGrid } from "../../lib/social";
import SocialComposerDialog from "../../components/social/SocialComposerDialog";

// Month calendar. Populated demo month in preview; a real, navigable month grid
// built from live GHL posts in a live session.

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Ev = { p: Platform; label: string };
// June 2026 laid out Mon-first (demo fixture). `out` greys neighbouring-month days.
const DEMO_CELLS: { day: number; out?: boolean; today?: boolean; events?: Ev[] }[] = [
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
  const [composerOpen, setComposerOpen] = useState(false);
  const [composeSource, setComposeSource] = useState<string | undefined>(undefined);
  const [view, setView] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const accountsQ = useSocialAccounts(!demo);
  const postsQ = useSocialPosts({}, !demo);
  const connected = accountsQ.data?.connected ?? false;
  const realPosts = postsQ.data?.posts ?? [];

  const cells = demo ? DEMO_CELLS : buildMonthGrid(view.y, view.m, realPosts, Date.now());
  const monthLabel = demo ? "June 2026" : `${MONTH_FULL[view.m]} ${view.y}`;

  function shiftMonth(delta: number) {
    setView((v) => {
      const m = v.m + delta;
      const y = v.y + Math.floor(m / 12);
      return { y, m: ((m % 12) + 12) % 12 };
    });
  }
  function openCompose(label?: string) {
    setComposeSource(label);
    setComposerOpen(true);
  }

  // In a real session the grid renders once connected (even with no posts, so the
  // client can see the month). Not connected keeps the honest empty state.
  const showGrid = demo || connected;

  return (
    <Shell>
      <SocialComposerDialog
        open={composerOpen}
        sourceIdea={composeSource}
        onClose={() => setComposerOpen(false)}
      />
      <div className={SOCIAL_CONTAINER}>
        <PageBar
          tabs={SOCIAL_TABS}
          actions={
            <Button variant="primary" size="md" onClick={() => openCompose()}>
              <Plus size={16} /> New post
            </Button>
          }
        />

        {!demo && !connected && (
          <NotConnectedNotice message="Your calendar fills in once posts can publish. Connect your social accounts to start scheduling." />
        )}
        {!demo && connected && realPosts.length === 0 && (
          <ConnectedEmptyNotice message="Your accounts are linked. Scheduled and published posts will land on this calendar." />
        )}

        {showGrid ? (
          <Panel className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="font-display text-[19px] text-text">{monthLabel}</div>
              <div className="flex gap-1.5">
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Previous month"
                  onClick={() => !demo && shiftMonth(-1)}
                  disabled={demo}
                >
                  <ChevronLeft size={16} />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Next month"
                  onClick={() => !demo && shiftMonth(1)}
                  disabled={demo}
                >
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
              {cells.map((c, i) => (
                <div
                  key={i}
                  onClick={() => !c.out && openCompose()}
                  className={`group flex min-h-[94px] flex-col gap-1.5 rounded-[11px] border p-2 ${
                    c.today
                      ? "border-brand bg-brand-tint"
                      : c.out
                        ? "border-border bg-surface-2 opacity-60"
                        : "cursor-pointer border-border bg-surface hover:border-brand"
                  }`}
                >
                  <span className={`font-display text-[12.5px] ${c.today ? "text-brand-text" : "text-faint"}`}>
                    {c.day}
                  </span>
                  {c.events?.map((e, j) => (
                    <button
                      key={j}
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openCompose(e.label);
                      }}
                      className="flex w-full items-center gap-1.5 truncate rounded-md bg-surface-2 px-1.5 py-1 text-left text-[10.5px] font-medium text-muted hover:text-text"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-sm"
                        style={{ background: PLATFORM[e.p].bg }}
                      />
                      <span className="truncate">{e.label}</span>
                    </button>
                  ))}
                  {!c.out && !c.events && (
                    <span className="mt-auto text-[10px] text-faint opacity-0 transition-opacity group-hover:opacity-100">
                      + add
                    </span>
                  )}
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
