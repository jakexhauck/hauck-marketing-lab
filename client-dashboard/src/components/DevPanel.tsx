import { useEffect, useMemo, useState } from "react";
import type { Role } from "../types";
import { useAuth } from "../context/AuthContext";
import { useClient } from "../context/ClientContext";
import { getUsersForClient } from "../mock";
import { roleLabel } from "../lib/rolePermissions";

const GEAR_PATH =
  "M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z";

const ROLES: Role[] = ["owner", "manager", "rep"];

export default function DevPanel() {
  const { currentUser, setUser } = useAuth();
  const { client } = useClient();
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open dev panel"
        className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-200"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <path d={GEAR_PATH} fill="currentColor" />
        </svg>
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
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">Dev panel</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close dev panel"
                className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M6 6 L18 18 M18 6 L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
              <fieldset>
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Role
                </legend>
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
                      <span>{roleLabel(role)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="dev-as-user"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  As user
                </label>
                <select
                  id="dev-as-user"
                  value={currentUser.id}
                  onChange={(e) => handleUserChange(e.target.value)}
                  className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
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
