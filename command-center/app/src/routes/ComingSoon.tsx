import { useNavigate } from "react-router-dom";
import { ChevronLeft, Sparkles } from "lucide-react";
import Shell from "../components/Shell";
import NavyHero from "../components/NavyHero";
import BottomNav from "../components/BottomNav";
import DesktopPage from "../components/desktop/DesktopPage";
import { HeroIconButton } from "../components/HeroUi";

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
      <div className="flex min-h-dvh flex-col lg:hidden">
        <NavyHero>
          <div className="flex items-center gap-2.5">
            <HeroIconButton label="Back to home" onClick={() => navigate("/home")}>
              <ChevronLeft size={20} />
            </HeroIconButton>
            <div className="min-w-0">
              <div className="font-display text-[17px] font-bold text-white">{title}</div>
              <div className="truncate text-[12px] text-white/60">Coming soon</div>
            </div>
          </div>
        </NavyHero>
        <main className="flex flex-1 items-center justify-center px-6 pb-28 pt-6">
          <ComingSoonCard title={title} blurb={blurb} />
        </main>
      </div>

      {/* Desktop layout (lg+): shared chrome, centered card. */}
      <div className="hidden min-h-dvh flex-1 lg:flex">
        <DesktopPage title={title} subtitle="Coming soon">
          <div className="flex min-h-[60vh] items-center justify-center">
            <ComingSoonCard title={title} blurb={blurb} />
          </div>
        </DesktopPage>
      </div>

      <BottomNav />
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
