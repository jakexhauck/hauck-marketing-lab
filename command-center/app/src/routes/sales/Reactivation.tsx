import { RotateCcw, Zap, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { REACTIVATION_TABS } from "../../lib/pageTabs";
import { Panel, PanelHeader, Badge, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { demoMode } from "../../demo/demoMode";
import { PAGE_CONTAINER } from "../../lib/layout";
import { useReactivation } from "../../hooks/useReactivation";
import { reactPopulated, reactRates } from "../../lib/reactivation";
import { NotConnectedNotice } from "../campaigns/shared";

// Reactivation: a standing Marketing surface that layers over the always-on
// "win back dormant customers" campaign (a short text + email sequence to past
// customers who haven't booked in a while). This Overview is the at-a-glance
// summary: the headline counts plus how the win-back is going. The read-only
// stage breakdown lives on Pipeline, the detailed table on Full Data, and the
// messages we send on Messages, so nothing dense repeats here. Same golden rule
// as the rest of the client app: a real (connected) client sees the honest
// not-connected state until the campaign has reached anyone; the designed
// layout renders from live counts (or in demo/preview via `?demo=1`).

// Page scroll container, matching the other client surfaces.
const REACTIVATION_CONTAINER = PAGE_CONTAINER;

export default function Reactivation() {
  const demo = demoMode();
  const { session } = useAuth();
  const { data } = useReactivation(Boolean(session));

  // Populated when the campaign has actually reached anyone. Otherwise the
  // surface shows its honest not-connected / empty state (never zeros-as-data).
  const populated = reactPopulated(data);
  const reached = data?.reached ?? 0;
  const rates = reactRates(data);

  const kpis = [
    { label: "Reached out to", value: reached, brand: false },
    { label: "Replied", value: data?.replied ?? 0, brand: false },
    { label: "No answer yet", value: data?.noAnswer ?? 0, brand: false },
    { label: "Estimates booked", value: data?.booked ?? 0, brand: true },
  ];

  // The at-a-glance rates that make up the summary, derived from live counts.
  const summaryStats = [
    { label: "Reply rate", value: rates.replyRate, hint: "of everyone we reached texted or emailed us back" },
    { label: "Estimates booked", value: rates.bookedRate, hint: "of everyone we reached scheduled an estimate" },
    { label: "Still no answer", value: rates.noAnswerRate, hint: "reached, waiting on a reply" },
  ];

  return (
    <Shell>
      <div className={REACTIVATION_CONTAINER}>
        <PageBar
          tabs={REACTIVATION_TABS}
          description="Quietly win back customers who haven't booked in a while, on autopilot."
          actions={
            populated ? (
              <Badge tone="positive">
                <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden /> Running
              </Badge>
            ) : undefined
          }
        />

        {!populated && (
          <NotConnectedNotice message="Once your customer list is linked, we'll quietly reach out to people who haven't booked in a while and show you who comes back here." />
        )}

        {/* What it does, in one calm line (demo only, descriptive copy). */}
        {demo && (
          <Panel className="mb-4 flex items-start gap-3 border-brand/30 bg-brand-tint p-4">
            <RotateCcw size={20} className="mt-0.5 shrink-0 text-brand-text" />
            <div className="flex-1 text-[13px] leading-snug text-text">
              We automatically reach out to your past customers who haven't booked in over a
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
                  k.brand && populated ? "text-brand-text" : populated ? "text-text" : "text-faint"
                }`}
              >
                {populated ? k.value.toLocaleString("en-US") : "0"}
              </div>
            </Panel>
          ))}
        </div>

        {/* At-a-glance summary. The dense stage breakdown lives on Pipeline and
            Full Data, so the Overview stays a quick read and never repeats it. */}
        <Panel className="mt-4 overflow-hidden">
          <PanelHeader
            title="How your win-back is going"
            action={
              populated ? (
                <Link
                  to="/marketing/reactivation/data"
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-text hover:underline"
                >
                  Full data <ArrowRight size={14} />
                </Link>
              ) : undefined
            }
          />
          {populated ? (
            <div className="grid grid-cols-1 gap-px bg-divider sm:grid-cols-3">
              {summaryStats.map((s) => (
                <div key={s.label} className="bg-surface p-4">
                  <div className="text-[13px] text-muted">{s.label}</div>
                  <div className="mt-1 font-data text-[26px] font-semibold tnum text-text">{s.value}%</div>
                  <div className="mt-1 text-[12px] leading-snug text-faint">{s.hint}</div>
                </div>
              ))}
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

        {demo && (
          <Panel className="mt-4 flex items-start gap-3 border-brand/30 bg-brand-tint p-4">
            <Zap size={20} className="mt-0.5 shrink-0 text-brand-text" />
            <div className="flex-1 text-[13px] leading-snug text-text">
              This runs in the background every month, so dormant customers keep getting a gentle nudge without you
              thinking about it. See the full stage breakdown on Pipeline, and the messages we send on Messages.
            </div>
          </Panel>
        )}
      </div>
    </Shell>
  );
}
