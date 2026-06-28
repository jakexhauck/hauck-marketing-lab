import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Compass, LogOut, Users } from "lucide-react";
import Shell from "../components/Shell";
import SettingsDesktop from "../components/settings/SettingsDesktop";
import NavyHero from "../components/NavyHero";
import { HeroIconButton } from "../components/HeroUi";
import { useAuth } from "../context/AuthContext";
import { useTour } from "../context/TourContext";
import { useClient } from "../context/ClientContext";
import { roleLabel } from "../lib/rolePermissions";
import { APP_BRAND } from "../lib/appBrand";
import { api } from "../lib/api";

type Audience = "everyone" | "assigned";

const AUDIENCE_OPTIONS: { value: Audience; title: string; sub: string }[] = [
  {
    value: "everyone",
    title: "Everyone",
    sub: "Every signed-in device gets a buzz for new leads, messages, and wins.",
  },
  {
    value: "assigned",
    title: "Assigned rep only",
    sub: "Only the rep a lead is assigned to is buzzed. Unassigned leads still go to everyone.",
  },
];

// Owner-only control for who gets pushed when a new lead, message, or win lands.
// Reads and writes tenants.notify_audience via /api/settings/notifications.
// Exported so the lg+ desktop layout (SettingsDesktop) reuses the exact same
// state and mutation rather than duplicating the preference logic.
export function NotifyAudienceCard() {
  const [audience, setAudience] = useState<Audience | null>(null);
  const [saving, setSaving] = useState<Audience | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    api<{ audience: Audience }>("/api/settings/notifications")
      .then((r) => mounted && setAudience(r.audience))
      .catch(() => mounted && setError(true));
    return () => {
      mounted = false;
    };
  }, []);

  const choose = async (next: Audience) => {
    if (next === audience || saving) return;
    setSaving(next);
    setError(false);
    try {
      const r = await api<{ audience: Audience }>(
        "/api/settings/notifications",
        { method: "PATCH", body: JSON.stringify({ audience: next }) },
      );
      setAudience(r.audience);
    } catch {
      setError(true);
    } finally {
      setSaving(null);
    }
  };

  return (
    <ul className="mt-2 overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)]">
      {AUDIENCE_OPTIONS.map((opt) => {
        const active = audience === opt.value;
        return (
          <li key={opt.value} className="border-b border-[var(--border)] last:border-b-0">
            <button
              type="button"
              onClick={() => void choose(opt.value)}
              disabled={audience === null || saving !== null}
              className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors active:bg-[var(--surface-2)] disabled:opacity-60"
            >
              <span
                className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 ${
                  active
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[var(--brand-fg)]"
                    : "border-[var(--border)] text-transparent"
                }`}
              >
                <Check size={13} strokeWidth={3} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[15px] font-bold text-[var(--text)]">
                  {opt.title}
                </div>
                <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                  {opt.sub}
                </div>
              </div>
              {saving === opt.value && (
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                  Saving
                </span>
              )}
            </button>
          </li>
        );
      })}
      {error && (
        <li className="px-4 py-2.5 text-[12px] text-[#be123c]">
          Could not save. Check your connection and try again.
        </li>
      )}
    </ul>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { currentUser, isOwner, signOut } = useAuth();
  const { client } = useClient();
  const { startFull } = useTour();

  return (
    <Shell>
      {/* Phone layout (below lg). The desktop client app renders
          SettingsDesktop instead; both share the same auth, client and
          notification-preference state. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
      <NavyHero>
        <div className="flex items-center gap-2.5">
          <HeroIconButton label="Back to home" onClick={() => navigate("/home")}>
            <ChevronLeft size={20} />
          </HeroIconButton>
          <div className="font-display text-[17px] font-bold text-white">
            Settings
          </div>
        </div>
      </NavyHero>

      <div className="flex-1 overflow-y-auto px-[22px] pb-28 pt-5">
        {/* Account */}
        <span className="sec-kicker">Account</span>
        <div className="mt-2 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="font-display text-[16px] font-bold text-[var(--text)]">
            {client.name}
          </div>
          <div className="mt-1 text-[13px] text-[var(--text-muted)]">
            Signed in as {currentUser?.name ?? "you"}
            {currentUser ? ` (${roleLabel(currentUser.role)})` : ""}
          </div>
        </div>

        {/* Manage (owner only) */}
        {isOwner && (
          <>
            <div className="pt-6">
              <span className="sec-kicker">Manage</span>
            </div>
            <ul className="mt-2 overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)]">
              <li>
                <button
                  type="button"
                  onClick={() => navigate("/team")}
                  className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors active:bg-[var(--surface-2)]"
                >
                  <span
                    className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl text-[var(--brand-fg)]"
                    style={{ backgroundColor: "var(--brand-primary)" }}
                  >
                    <Users size={18} strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[15px] font-bold text-[var(--text)]">
                      Team
                    </div>
                    <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                      Add employees and set what they can see
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-[var(--text-faint)]" />
                </button>
              </li>
            </ul>

            <div className="pt-6">
              <span className="sec-kicker">Notifications</span>
            </div>
            <NotifyAudienceCard />
          </>
        )}

        {/* Help */}
        <div className="pt-6">
          <span className="sec-kicker">Help</span>
        </div>
        <ul className="mt-2 overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)]">
          <li>
            <button
              type="button"
              onClick={startFull}
              className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors active:bg-[var(--surface-2)]"
            >
              <span
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl text-[var(--brand-fg)]"
                style={{ backgroundColor: "var(--brand-primary)" }}
              >
                <Compass size={18} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[15px] font-bold text-[var(--text)]">
                  Take the tour
                </div>
                <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                  A quick walkthrough of everything in here
                </div>
              </div>
              <ChevronRight size={18} className="text-[var(--text-faint)]" />
            </button>
          </li>
        </ul>

        {/* Session */}
        <div className="pt-6">
          <span className="sec-kicker">Session</span>
        </div>
        <ul className="mt-2 overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)]">
          <li>
            <button
              type="button"
              onClick={() =>
                void signOut().then(() => navigate("/login", { replace: true }))
              }
              className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors active:bg-[var(--surface-2)]"
            >
              <span
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl text-white"
                style={{ backgroundColor: "#be123c" }}
              >
                <LogOut size={18} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[15px] font-bold text-[var(--text)]">
                  Sign out
                </div>
                <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                  Log out of this device
                </div>
              </div>
              <ChevronRight size={18} className="text-[var(--text-faint)]" />
            </button>
          </li>
        </ul>

        <p className="mt-8 text-center text-[11px] font-medium text-[var(--text-faint)]">
          {client.brand.appName}. Secured by {APP_BRAND.securedBy}.
        </p>
      </div>
      </div>

      {/* Desktop client app (lg+): the Atelier settings column. */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <SettingsDesktop />
      </div>
    </Shell>
  );
}
