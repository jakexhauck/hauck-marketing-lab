import { useEffect, useState } from "react";
import { api } from "../lib/api";
import BrandedButton from "./BrandedButton";
import BrandedLogo from "./BrandedLogo";

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

interface TeamResponse {
  team: TeamMember[];
}

interface Props {
  // Called with the chosen GHL user id (the same value GHL puts in
  // opportunity.assignedTo, so rep filtering matches end to end).
  onPick: (ghlUserId: string) => void;
}

// One-time "who are you?" step shown after the shared-password login when no
// identity is stored. Lists the real GHL team and stores the chosen GHL user id.
// Purely additive: if the team cannot be loaded the user can skip, and the app
// falls back to the hardcoded-owner default.
export default function IdentityPicker({ onPick }: Props) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api<TeamResponse>("/api/team")
      .then((res) => {
        if (!mounted) return;
        setTeam(res.team ?? []);
        setPhase("ready");
      })
      .catch(() => {
        if (mounted) setPhase("error");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const confirm = () => {
    if (selected) onPick(selected);
  };

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center px-5 py-12"
      style={{
        background: "linear-gradient(165deg, #13294a 0%, #0d1f38 100%)",
        paddingTop: "calc(env(safe-area-inset-top) + 48px)",
      }}
    >
      <div className="w-full rounded-3xl bg-white p-8 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]">
        <div className="flex flex-col items-center text-center">
          <BrandedLogo size="lg" />
          <span className="label-cap mt-6">Who are you?</span>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--text)]">
            Pick your name
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Choose your team member so the app shows your leads.
          </p>
        </div>

        {phase === "loading" && (
          <p className="mt-8 text-center text-sm text-[var(--text-muted)]">
            Loading team...
          </p>
        )}

        {phase === "error" && (
          <div className="mt-8 space-y-4">
            <p className="text-center text-sm text-[var(--text-muted)]">
              Could not load the team. You can continue and the app will use
              the default view.
            </p>
            <BrandedButton
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => onPick("")}
            >
              Continue
            </BrandedButton>
          </div>
        )}

        {phase === "ready" && (
          <div className="mt-8 space-y-4">
            <ul className="space-y-2">
              {team.map((m) => {
                const active = selected === m.id;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(m.id)}
                      className={
                        "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors " +
                        (active
                          ? "border-[var(--ring)] bg-[var(--ring)]/10"
                          : "border-[var(--border)] bg-[var(--surface)]")
                      }
                    >
                      <span className="flex flex-col">
                        <span className="text-base font-medium text-[var(--text)]">
                          {m.name}
                        </span>
                        {m.email && (
                          <span className="text-xs text-[var(--text-muted)]">
                            {m.email}
                          </span>
                        )}
                      </span>
                      {active && (
                        <span className="text-sm font-bold text-[var(--ring)]">
                          Selected
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {team.length === 0 && (
              <p className="text-center text-sm text-[var(--text-muted)]">
                No team members found.
              </p>
            )}

            <BrandedButton
              type="button"
              className="w-full"
              disabled={!selected}
              onClick={confirm}
            >
              Continue
            </BrandedButton>
          </div>
        )}
      </div>
    </div>
  );
}
