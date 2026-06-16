import { useEffect, useMemo, useState } from "react";
import { Settings, X, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Role } from "../types";
import { useAuth } from "../context/AuthContext";
import { useClient } from "../context/ClientContext";
import { useTheme, type ThemePref } from "../context/ThemeContext";
import { getOwnerForClient, getUsersForClient } from "../mock";
import { roleLabel } from "../lib/rolePermissions";
import { devMode } from "../lib/devMode";

const ROLES: Role[] = ["owner", "manager", "rep"];
const THEMES: { value: ThemePref; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export default function DevPanel() {
  const { currentUser, setUser } = useAuth();
  const { client, setClient, allClients } = useClient();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const clientUsers = useMemo(() => getUsersForClient(client.id), [client.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!currentUser) return null;
  if (!devMode()) return null;

  const activeRole = currentUser.role;
  const usersForRole = clientUsers.filter((u) => u.role === activeRole);

  const handleRoleChange = (role: Role) => {
    const first = clientUsers.find((u) => u.role === role);
    if (first) setUser(first);
  };

  const handleUserChange = (userId: string) => {
    const next = clientUsers.find((u) => u.id === userId);
    if (next) setUser(next);
  };

  const handleClientChange = (newId: string) => {
    if (newId === client.id) return;
    setClient(newId);
    setUser(getOwnerForClient(newId));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open dev panel"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-colors active:scale-[0.96] active:bg-[var(--surface-2)]"
      >
        <Settings size={18} aria-hidden="true" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Dev panel"
        >
          <button
            type="button"
            aria-label="Close dev panel backdrop"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
          />
          <div
            className="absolute right-0 top-0 flex h-full w-4/5 max-w-sm flex-col bg-[var(--surface)] shadow-xl"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div className="label-cap-strong">Dev Panel</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close dev panel"
                className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors active:bg-[var(--surface-2)]"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate("/showroom");
                }}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition-colors active:scale-[0.98]"
              >
                <Play size={16} aria-hidden="true" />
                <span>Launch Showroom</span>
              </button>

              <fieldset>
                <legend className="label-cap mb-2">Theme</legend>
                <div className="flex flex-col gap-2">
                  {THEMES.map((t) => (
                    <label
                      key={t.value}
                      className="flex min-h-[44px] items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"
                    >
                      <input
                        type="radio"
                        name="dev-theme"
                        value={t.value}
                        checked={theme === t.value}
                        onChange={() => setTheme(t.value)}
                        className="h-4 w-4"
                        style={{ accentColor: "var(--brand-primary)" }}
                      />
                      <span className="font-medium">{t.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="label-cap mb-2">Client</legend>
                <div className="flex flex-col gap-2">
                  {allClients.map((c) => (
                    <label
                      key={c.id}
                      className="flex min-h-[44px] items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"
                    >
                      <input
                        type="radio"
                        name="dev-client"
                        value={c.id}
                        checked={client.id === c.id}
                        onChange={() => handleClientChange(c.id)}
                        className="h-4 w-4"
                        style={{ accentColor: "var(--brand-primary)" }}
                      />
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold text-white font-display"
                        style={{ backgroundColor: c.brand.color }}
                        aria-hidden="true"
                      >
                        {c.brand.initials}
                      </span>
                      <span className="font-medium">{c.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="label-cap mb-2">Role</legend>
                <div className="flex flex-col gap-2">
                  {ROLES.map((role) => (
                    <label
                      key={role}
                      className="flex min-h-[44px] items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"
                    >
                      <input
                        type="radio"
                        name="dev-role"
                        value={role}
                        checked={activeRole === role}
                        onChange={() => handleRoleChange(role)}
                        className="h-4 w-4"
                        style={{ accentColor: "var(--brand-primary)" }}
                      />
                      <span className="font-medium">{roleLabel(role)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex flex-col gap-2">
                <label htmlFor="dev-as-user" className="label-cap">
                  As user
                </label>
                <select
                  id="dev-as-user"
                  value={currentUser.id}
                  onChange={(e) => handleUserChange(e.target.value)}
                  className="min-h-[44px] rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)]"
                >
                  {usersForRole.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
