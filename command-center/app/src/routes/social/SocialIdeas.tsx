import { useState } from "react";
import { Sparkles, ArrowRight, Plus } from "lucide-react";
import Shell from "../../components/Shell";
import { PageHeader } from "../../components/PageHeader";
import { Panel, Badge, Button, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import { Platform, PlatformGlyph, NotConnectedNotice, SOCIAL_CONTAINER } from "./shared";
import NewIdeaDialog from "../../components/social/NewIdeaDialog";
import SocialComposerDialog from "../../components/social/SocialComposerDialog";

// The idea feed. Populated in demo/preview; not-connected empty state otherwise.

const IDEAS: { kind: string; title: string; why: string; platforms: Platform[] }[] = [
  {
    kind: "Social proof",
    title: "Show off the Thompson water-heater job",
    why: "Closed Tuesday, photos are great. Before/after posts get you the most calls.",
    platforms: ["ig", "fb", "gb"],
  },
  {
    kind: "Seasonal · Timely",
    title: "Heat wave coming — post an AC tune-up reminder",
    why: "95°F this weekend. A tune-up offer now tends to fill next week's calendar.",
    platforms: ["fb", "ig"],
  },
  {
    kind: "Tip · Builds trust",
    title: "One thing every homeowner gets wrong about drains",
    why: "Quick value post. Keeps you visible on days you're not selling anything.",
    platforms: ["gb", "fb"],
  },
  {
    kind: "Review · Social proof",
    title: "Turn the Garcia 5★ review into a post",
    why: "Came in yesterday. Review posts performed best for you last month.",
    platforms: ["ig", "fb"],
  },
  {
    kind: "Offer",
    title: 'Mid-summer "we answer the phone" promo',
    why: "Slow week ahead on the schedule. A light offer can backfill it.",
    platforms: ["fb", "gb"],
  },
  {
    kind: "Behind the scenes",
    title: "Meet the crew: introduce your newest tech",
    why: "People hire people. A quick intro builds local trust.",
    platforms: ["ig", "fb"],
  },
];

export default function SocialIdeas() {
  const demo = demoMode();
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [composeIdea, setComposeIdea] = useState<string | null>(null);

  return (
    <Shell>
      <NewIdeaDialog open={ideaOpen} onClose={() => setIdeaOpen(false)} />
      <SocialComposerDialog
        open={composeIdea !== null}
        sourceIdea={composeIdea ?? undefined}
        onClose={() => setComposeIdea(null)}
      />
      <div className={SOCIAL_CONTAINER}>
        <PageHeader
          title="Ideas"
          count={demo ? `${IDEAS.length}` : undefined}
          description="Post ideas built from your jobs, your offers, and what's working this week."
          actions={
            <Button variant="primary" size="md" onClick={() => setIdeaOpen(true)}>
              <Plus size={16} /> New Post Idea
            </Button>
          }
        />

        {!demo && (
          <NotConnectedNotice message="Your idea feed builds from your jobs and accounts. Connect them through GoHighLevel and ideas will appear here, ready to write in your voice." />
        )}

        {demo ? (
          <>
            <Panel className="mb-4 flex items-center justify-between gap-4 border-brand/30 bg-brand-tint p-5">
              <div>
                <h3 className="font-display text-[20px] leading-tight text-text">
                  Don't know what to post? <span className="text-brand-text">We do.</span>
                </h3>
                <p className="mt-1.5 max-w-[460px] text-[13px] text-muted">
                  Tap one and it's basically written, in your voice. The rest is a glance and a click.
                </p>
              </div>
              <Badge tone="brand">{IDEAS.length} ideas ready</Badge>
            </Panel>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {IDEAS.map((idea) => (
                <Panel
                  key={idea.title}
                  role="button"
                  tabIndex={0}
                  onClick={() => setComposeIdea(idea.title)}
                  className="relative flex cursor-pointer flex-col overflow-hidden p-5 pl-6 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-md)]"
                >
                  <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundImage: "var(--grad-brand)" }} />
                  <div className="label-cap text-brand-text">{idea.kind}</div>
                  <h3 className="mt-2.5 font-display text-[16px] leading-snug text-text">{idea.title}</h3>
                  <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-muted">{idea.why}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex gap-1">
                      {idea.platforms.map((p) => (
                        <PlatformGlyph key={p} p={p} size={20} />
                      ))}
                    </div>
                    <span className="flex items-center gap-1.5 font-display text-[13px] font-semibold text-brand-text">
                      Write it <ArrowRight size={13} />
                    </span>
                  </div>
                </Panel>
              ))}
            </div>
          </>
        ) : (
          <Panel className="px-4 py-12">
            <EmptyState
              icon={<Sparkles size={22} />}
              title="Your idea feed is on the way"
              description="Once connected, this fills with ready-to-write posts. Tap one and it's drafted in your voice, then schedule it in a couple of clicks."
            />
          </Panel>
        )}
      </div>
    </Shell>
  );
}
