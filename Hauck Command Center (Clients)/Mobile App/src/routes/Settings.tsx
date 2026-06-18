import { useNavigate } from "react-router-dom";
import { ChevronRight, LogOut, Users } from "lucide-react";
import Shell from "../components/Shell";
import BackButton from "../components/BackButton";
import { useAuth } from "../context/AuthContext";
import { useClient } from "../context/ClientContext";
import { roleLabel } from "../lib/rolePermissions";
import { APP_BRAND } from "../lib/appBrand";

export default function Settings() {
  const navigate = useNavigate();
  const { currentUser, isOwner, signOut } = useAuth();
  const { client } = useClient();

  return (
    <Shell>
      <div
        className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
      >
        <BackButton to="/home" />
        <span className="font-display text-[15px] font-bold text-[var(--text)]">
          Settings
        </span>
        <span className="w-9" aria-hidden="true" />
      </div>

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
                    className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: "#1a4d8f" }}
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
          </>
        )}

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
    </Shell>
  );
}
