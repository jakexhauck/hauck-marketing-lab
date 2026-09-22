import { useNavigate } from "react-router-dom";
import { ChevronRight, Compass, LogOut, Users } from "lucide-react";
import Shell from "../components/Shell";
import SettingsDesktop from "../components/settings/SettingsDesktop";
import {
  AppearanceControl,
  ThisDeviceControl,
  ChangePasswordControl,
} from "../components/settings/SettingsControls";
import { PageHeader } from "../components/PageHeader";
import { PAGE_CONTAINER } from "../lib/layout";
import { useAuth } from "../context/AuthContext";
import { useTour } from "../context/TourContext";
import { useClient } from "../context/ClientContext";
import { roleLabel } from "../lib/rolePermissions";
import { APP_BRAND } from "../lib/appBrand";

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
      <div className={PAGE_CONTAINER + " lg:hidden"}>
      {/* No onBack: <PageHeader> supplies the chevron back to All features, the
          list this page is opened from. It used to send you to the Lead Tracker
          instead, which is not where you came from. */}
      <PageHeader title="Settings" />

      <div className="flex-1">
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

        {/* Appearance */}
        <div className="pt-6">
          <span className="sec-kicker">Appearance</span>
        </div>
        <div className="mt-2">
          <AppearanceControl />
        </div>

        {/* Notifications */}
        <div className="pt-6">
          <span className="sec-kicker">Notifications</span>
        </div>
        <div className="mt-2 space-y-3">
          <ThisDeviceControl />
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
                  </div>
                  <ChevronRight size={18} className="text-[var(--text-faint)]" />
                </button>
              </li>
            </ul>
          </>
        )}

        {/* Security */}
        <div className="pt-6">
          <span className="sec-kicker">Security</span>
        </div>
        <div className="mt-2">
          <ChangePasswordControl />
        </div>

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
              </div>
              <ChevronRight size={18} className="text-[var(--text-faint)]" />
            </button>
          </li>
        </ul>

        <p className="mt-8 text-center text-[11px] font-medium text-[var(--text-faint)]">
          {client.brand.appName}. Secured by {APP_BRAND.securedBy}.
          <br />
          Version {__APP_VERSION__}
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
