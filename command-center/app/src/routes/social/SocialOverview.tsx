import { Link, useNavigate } from "react-router-dom";
import { Plus, CalendarDays, Sparkles, BarChart3, Link2 } from "lucide-react";
import Shell from "../../components/Shell";
import { PageHeader } from "../../components/PageHeader";
import { Panel, PanelHeader, Button, EmptyState } from "../../components/ui";

// The Social hub overview. There is NO live data here yet: this surface is not
// connected to anything. The client's social accounts still need to be linked
// (via GoHighLevel) before any real posts or numbers can appear. Until then every
// metric reads 0 and every list shows an empty state, and the banner up top says
// so explicitly. Do not fill these with sample data.

const KPIS: { label: string; value: string }[] = [
  { label: "Posts this month", value: "0" },
  { label: "Calls & messages", value: "0" },
  { label: "People reached", value: "0" },
  { label: "Scheduled", value: "0" },
];

export default function SocialOverview() {
  const navigate = useNavigate();

  return (
    <Shell>
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-5 pb-12 pt-5 lg:px-8">
        <PageHeader
          title="Social Media"
          description="Your social at a glance. Here's what's next and what's working."
          actions={
            <>
              <Button
                variant="secondary"
                size="md"
                className="hidden sm:inline-flex"
                onClick={() => navigate("/marketing/social/calendar")}
              >
                <CalendarDays size={16} /> Plan my month
              </Button>
              <Button variant="primary" size="md" onClick={() => navigate("/marketing/social/ideas")}>
                <Plus size={16} /> New post
              </Button>
            </>
          }
        />

        {/* Not-connected notice. This stays until the social accounts are linked. */}
        <Panel className="mb-4 flex flex-col gap-3 border-brand/30 bg-brand-tint p-4 sm:flex-row sm:items-center">
          <Link2 size={20} className="shrink-0 text-brand-text" />
          <div className="flex-1 text-[13px] leading-snug text-text">
            <span className="font-semibold">Not connected yet.</span> These numbers are all 0
            because nothing is linked. To see real posts and results, we still need to connect
            your social accounts (Facebook, Instagram, Google) through GoHighLevel.
          </div>
          <Button variant="secondary" size="sm" disabled className="shrink-0">
            Connect accounts (coming soon)
          </Button>
        </Panel>

        {/* KPI row — all 0 until connected */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {KPIS.map((k) => (
            <Panel key={k.label} className="p-4">
              <div className="text-[13px] text-muted">{k.label}</div>
              <div className="mt-2 font-data text-[28px] font-semibold tnum text-faint">
                {k.value}
              </div>
            </Panel>
          ))}
        </div>

        {/* Two-column body — empty states until connected */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Panel className="overflow-hidden">
              <PanelHeader title="Up next" />
              <div className="px-4 py-10">
                <EmptyState
                  icon={<CalendarDays size={22} />}
                  title="Nothing scheduled yet"
                  description="Once your accounts are connected, your scheduled posts show up here."
                />
              </div>
            </Panel>

            <Panel className="overflow-hidden">
              <PanelHeader title="Recently posted" />
              <div className="px-4 py-10">
                <EmptyState
                  icon={<BarChart3 size={22} />}
                  title="No posts yet"
                  description="After your accounts are linked, published posts and how they performed appear here."
                />
              </div>
            </Panel>
          </div>

          <div className="flex flex-col gap-4">
            <Panel className="overflow-hidden">
              <PanelHeader
                title="Ideas for you"
                action={
                  <Link
                    to="/marketing/social/ideas"
                    className="text-[12px] font-medium text-brand-text hover:underline"
                  >
                    See all
                  </Link>
                }
              />
              <div className="px-4 py-10">
                <EmptyState
                  icon={<Sparkles size={22} />}
                  title="Ideas are on the way"
                  description="Post ideas built from your jobs and the week ahead will appear once you're connected."
                />
              </div>
            </Panel>
          </div>
        </div>

        <p className="mt-6 text-[11.5px] text-faint">
          No live data yet. This page stays empty until your social accounts are connected through
          GoHighLevel.
        </p>
      </div>
    </Shell>
  );
}
