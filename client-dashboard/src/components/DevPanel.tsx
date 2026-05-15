import { useEffect, useMemo, useState } from "react";
import { Settings, X } from "lucide-react";
import type { Role } from "../types";
import { useAuth } from "../context/AuthContext";
import { useClient } from "../context/ClientContext";
import { getOwnerForClient, getUsersForClient } from "../mock";
import { roleLabel } from "../lib/rolePermissions";
import { devMode } from "../lib/devMode";

const ROLES: Role[] = ["owner", "manager", "rep"];

export default function DevPanel() {
  const { currentUser, setUser } = useAuth();
  const { client, setClient, allClients } = useClient();
  const [open, setOpen] = useState(false);

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
        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors active:scale-[0.96] active:bg-slate-100"
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
            className="absolute right-0 top-0 flex h-full w-4/5 max-w-sm flex-col bg-white shadow-xl"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="label-cap-strong">Dev Panel</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close dev panel"
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors active:bg-slate-100"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
              <fieldset>
                <legend className="label-cap mb-2">Client</legend>
                <div className="flex flex-col gap-2">
                  {allClients.map((c) => (
                    <label
                      key={c.id}
                      className="flex min-h-[44px] items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
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
                      className="flex min-h-[44px] items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
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
                  className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
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
