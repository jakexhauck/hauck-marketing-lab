import { useNavigate } from "react-router-dom";
import { ChevronLeft, FlaskConical, Lock } from "lucide-react";
import Shell from "../components/Shell";
import NavyHero from "../components/NavyHero";
import BottomNav from "../components/BottomNav";
import { HeroIconButton } from "../components/HeroUi";
import AutomationsDesktop from "../components/automations/AutomationsDesktop";
import AutomationCard from "../components/automations/AutomationCard";
import { FOLLOW_UPS, REACTIVATIONS } from "../lib/automations";

// Automations: a read-only view of the follow-up sequences and database
// reactivation campaigns the agency runs for the client. Desktop is the rich
// command view (AutomationsDesktop); the phone gets a stacked version of the
// same cards. Sample data until a live source is wired in.
export default function Automations() {
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
              <div className="font-display text-[17px] font-bold text-white">Automations</div>
              <div className="flex items-center gap-1 truncate text-[12px] text-white/60">
                <Lock size={11} aria-hidden="true" /> Read-only · Managed by Hauck
              </div>
            </div>
          </div>
        </NavyHero>

        <main className="flex-1 space-y-6 px-4 pb-28 pt-4">
          <div className="flex items-center gap-2 rounded-2xl border border-warning/30 bg-warning-tint px-3.5 py-2.5 text-[12.5px] text-warning">
            <FlaskConical size={14} className="shrink-0" aria-hidden="true" />
            <span>Sample data. Live counts switch on once your account is wired in.</span>
          </div>

          <section className="space-y-3">
            <h2 className="font-display text-[16px] font-semibold text-[var(--text)]">
              Follow-Up Sequences
            </h2>
            {FOLLOW_UPS.map((a) => (
              <AutomationCard key={a.id} automation={a} />
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-[16px] font-semibold text-[var(--text)]">
              Database Reactivation
            </h2>
            {REACTIVATIONS.map((c) => (
              <AutomationCard
                key={c.id}
                automation={c}
                wave={{ audience: c.audience, listSize: c.listSize, contacted: c.contacted }}
              />
            ))}
          </section>
        </main>
      </div>

      {/* Desktop layout (lg+). */}
      <div className="hidden min-h-dvh flex-1 lg:flex">
        <AutomationsDesktop />
      </div>

      <BottomNav />
    </Shell>
  );
}
