import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import Shell from "../components/Shell";
import DesktopPage from "../components/desktop/DesktopPage";
import { PageHeader } from "../components/PageHeader";
import { PAGE_CONTAINER } from "../lib/layout";
import { CLIENT_HOME } from "../lib/nav";

// One reusable placeholder for every skeleton surface. The product has a home
// for the feature (sidebar row + route) before the feature itself exists; this
// renders the "coming soon" state on both the phone and desktop layouts so the
// information architecture can ship ahead of the content.
export default function ComingSoon({
  title,
  blurb = "This area is on the way. We are building it out next.",
}: {
  title: string;
  blurb?: string;
}) {
  const navigate = useNavigate();

  return (
    <Shell>
      {/* Phone layout (below lg). */}
      <div className={PAGE_CONTAINER + " lg:hidden"}>
        <PageHeader
          title={title}
          count="Coming soon"
          onBack={() => navigate(CLIENT_HOME)}
          backLabel="Back to home"
        />
        <main className="flex flex-1 items-center justify-center">
          <ComingSoonCard title={title} blurb={blurb} />
        </main>
      </div>

      {/* Desktop layout (lg+): shared chrome, centered card. */}
      <div className="hidden min-h-dvh flex-1 lg:flex">
        <DesktopPage title={title}>
          <div className="flex min-h-[60vh] items-center justify-center">
            <ComingSoonCard title={title} blurb={blurb} />
          </div>
        </DesktopPage>
      </div>
    </Shell>
  );
}

function ComingSoonCard({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="flex max-w-sm flex-col items-center gap-4 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-white"
        style={{ backgroundImage: "var(--grad-brand)" }}
      >
        <Sparkles size={24} aria-hidden="true" />
      </div>
      <div>
        <h2 className="font-display text-[20px] font-bold text-[var(--text)]">{title}</h2>
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
          Coming soon
        </div>
      </div>
      <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">{blurb}</p>
    </div>
  );
}
