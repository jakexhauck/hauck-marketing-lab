import { useNavigate } from "react-router-dom";
import { ChevronRight, Compass, LogOut, Users } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import { Button } from "../ui/Button";
import { NotifyAudienceCard } from "../../routes/Settings";
import {
  AppearanceControl,
  ThisDeviceControl,
  ChannelsControl,
  ChangePasswordControl,
} from "./SettingsControls";
import { useAuth } from "../../context/AuthContext";
import { useTour } from "../../context/TourContext";
import { useClient } from "../../context/ClientContext";
import { roleLabel } from "../../lib/rolePermissions";
import { APP_BRAND } from "../../lib/appBrand";

// The Atelier desktop Settings (lg+): a calm, centred column of grouped setting
// rows. The phone keeps its own stacked layout; this renders only inside
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
      <div className="fx-stagger mx-auto flex w-full max-w-3xl flex-col gap-8">
        {/* Account */}
        <Group label="Account">
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-[var(--shadow-sm)]">
            <div className="font-display text-[18px] font-bold text-text">
              {client.name}
            </div>
            <div className="mt-1.5 text-[14px] text-muted">
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
            {isOwner && (
              <>
                <ChannelsControl />
                <NotifyAudienceCard />
              </>
            )}
          </div>
        </Group>

        {/* Manage (owner only) */}
        {isOwner && (
          <Group label="Manage">
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
              <button
                type="button"
                onClick={() => navigate("/team")}
                className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-brand-tint text-brand-text">
                  <Users size={18} strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[15px] font-semibold text-text">
                    Team
                  </div>
                  <div className="mt-0.5 text-[13px] text-muted">
                    Add employees and set what they can see
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
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
            <button
              type="button"
              onClick={startFull}
              className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-brand-tint text-brand-text">
                <Compass size={18} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[15px] font-semibold text-text">
                  Take the tour
                </div>
                <div className="mt-0.5 text-[13px] text-muted">
                  A quick walkthrough of everything in here
                </div>
              </div>
              <ChevronRight size={18} className="shrink-0 text-faint" />
            </button>
          </div>
        </Group>

        {/* Session — destructive, spatially separated below a divider */}
        <Group label="Session">
          <div className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-border bg-surface px-6 py-5 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-danger-tint text-danger">
                <LogOut size={18} strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <div className="font-display text-[15px] font-semibold text-text">
                  Sign out
                </div>
                <div className="mt-0.5 text-[13px] text-muted">
                  Log out of this device
                </div>
              </div>
            </div>
            <Button
              variant="danger"
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

        <p className="pt-2 text-center text-[12px] font-medium text-faint">
          {client.brand.appName}. Secured by {APP_BRAND.securedBy}. Version{" "}
          {__APP_VERSION__}
        </p>
      </div>
    </DesktopPage>
  );
}
