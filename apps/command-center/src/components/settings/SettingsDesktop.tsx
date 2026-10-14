import { useNavigate } from "react-router-dom";
import { ChevronRight, Compass, LogOut, Users } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import { Button } from "../ui/Button";
import {
  AppearanceControl,
  ThisDeviceControl,
  ChangePasswordControl,
} from "./SettingsControls";
import { useAuth } from "../../context/AuthContext";
import { useTour } from "../../context/TourContext";
import { useClient } from "../../context/ClientContext";
import { roleLabel } from "../../lib/rolePermissions";
import { APP_BRAND } from "../../lib/appBrand";

// The Atelier desktop Settings (lg+): grouped setting rows in two columns. The phone keeps its own stacked layout; this renders only inside
// `hidden lg:flex` from the Settings route and shares the same auth, client and
// notification-preference state and handlers as the phone screen.

// One labelled group: a quiet mono kicker above a single bordered panel. No
// nested cards: the panel is the only surface in the group.
function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fx-item">
      <h2 className="label-cap mb-2">{label}</h2>
      {children}
    </section>
  );
}

export default function SettingsDesktop() {
  const navigate = useNavigate();
  const { currentUser, isOwner, signOut } = useAuth();
  const { client } = useClient();
  const { startFull } = useTour();

  return (
    <DesktopPage
      title="Settings"

    >
      {/* Two columns across the full width. The old centred max-w-3xl column
          left a wide empty band down both sides of the page. */}
      <div className="fx-stagger grid w-full grid-cols-1 items-start gap-x-6 gap-y-8 xl:grid-cols-2">
        {/* Account */}
        <Group label="Account">
          <div className="rounded-[18px] border border-border bg-surface px-4 py-3.5 shadow-[var(--shadow-sm)]">
            <div className="font-display text-[15px] font-bold text-text">
              {client.name}
            </div>
            <div className="mt-0.5 text-[12px] text-muted">
              Signed in as {currentUser?.name ?? "you"}
              {currentUser ? ` (${roleLabel(currentUser.role)})` : ""}
            </div>
          </div>
        </Group>

        {/* Appearance */}
        <Group label="Appearance">
          <AppearanceControl />
        </Group>

        {/* Notifications */}
        <Group label="Notifications">
          <div className="space-y-3">
            <ThisDeviceControl />
          </div>
        </Group>

        {/* Manage (owner only) */}
        {isOwner && (
          <Group label="Manage">
            <div className="overflow-hidden rounded-[18px] border border-border bg-surface shadow-[var(--shadow-sm)]">
              <button
                type="button"
                onClick={() => navigate("/team")}
                className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-text">
                  <Users size={18} strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[15px] font-semibold text-text">
                    Team
                  </div>
                </div>
                <ChevronRight size={18} className="shrink-0 text-faint" />
              </button>
            </div>
          </Group>
        )}

        {/* Security */}
        <Group label="Security">
          <ChangePasswordControl />
        </Group>

        {/* Help */}
        <Group label="Help">
          <div className="overflow-hidden rounded-[18px] border border-border bg-surface shadow-[var(--shadow-sm)]">
            <button
              type="button"
              onClick={startFull}
              className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-text">
                <Compass size={18} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[15px] font-semibold text-text">
                  Take the tour
                </div>
              </div>
              <ChevronRight size={18} className="shrink-0 text-faint" />
            </button>
          </div>
        </Group>

        {/* Session: destructive, so it sits last */}
        <Group label="Session">
          <div className="flex items-center justify-between gap-4 rounded-[18px] border border-border bg-surface px-4 py-3.5 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-3.5">
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-danger-tint text-danger">
                <LogOut size={18} strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <div className="font-display text-[15px] font-semibold text-text">
                  Sign out
                </div>
              </div>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                void signOut().then(() =>
                  navigate("/login", { replace: true }),
                )
              }
            >
              Sign out
            </Button>
          </div>
        </Group>

        <p className="pt-2 text-center text-[12px] font-medium text-faint xl:col-span-2">
          {client.brand.appName}. Secured by {APP_BRAND.securedBy}. Version{" "}
          {__APP_VERSION__}
        </p>
      </div>
    </DesktopPage>
  );
}
