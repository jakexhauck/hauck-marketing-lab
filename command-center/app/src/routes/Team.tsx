import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ShieldCheck, UserPlus, X } from "lucide-react";
import Shell from "../components/Shell";
import BackButton from "../components/BackButton";
import BrandedButton from "../components/BrandedButton";
import TeamDesktop, { type StaffMember } from "../components/team/TeamDesktop";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../lib/api";
import {
  CAPABILITIES,
  defaultGrantsForRole,
  type Capability,
  type StaffRole,
} from "../lib/capabilities";

type GrantMap = Record<Capability, { view: boolean; edit: boolean }>;

const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "Owner",
  manager: "Manager",
  rep: "Rep",
};

const ROLE_OPTIONS: StaffRole[] = ["manager", "rep"];

export default function Team() {
  const navigate = useNavigate();
  const { isOwner } = useAuth();
  const { showToast } = useToast();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [enabled, setEnabled] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  // When set, the form edits this member; when null (with the form open), it
  // adds a new one.
  const [editing, setEditing] = useState<StaffMember | null>(null);

  // Only owners manage staff. A staff session that lands here is bounced home
  // (the backend also enforces owner-only, this just avoids a broken screen).
  useEffect(() => {
    if (!isOwner) navigate("/home", { replace: true });
  }, [isOwner, navigate]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [staffRes, entRes] = await Promise.all([
        api<{ staff: StaffMember[] }>("/api/staff"),
        api<{ capabilities: Capability[] }>("/api/entitlements"),
      ]);
      setStaff(staffRes.staff ?? []);
      setEnabled(entRes.capabilities ?? []);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load your team.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enabledCaps = useMemo(
    () => CAPABILITIES.filter((c) => enabled.includes(c.key)),
    [enabled],
  );

  const toggleStatus = async (m: StaffMember) => {
    const next = m.status === "active" ? "disabled" : "active";
    try {
      if (next === "disabled") {
        await api(`/api/staff/${m.id}`, { method: "DELETE" });
      } else {
        await api(`/api/staff/${m.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "active" }),
        });
      }
      showToast(next === "disabled" ? "Login disabled" : "Login restored");
      void refresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not update");
    }
  };

  // Shared between both layouts: opening the add form (closing it if it is
  // already open in add mode), opening the edit form, and the toggle handler.
  const handleAdd = () => {
    setEditing(null);
    setShowForm((s) => (editing ? true : !s));
  };
  const handleEdit = (m: StaffMember) => {
    setEditing(m);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };
  const onSaved = () => {
    setShowForm(false);
    setEditing(null);
    void refresh();
  };

  // One EmployeeForm instance reused by both the phone and desktop layouts so
  // validation and mutations stay identical.
  const formEl = showForm ? (
    <EmployeeForm
      key={editing?.id ?? "new"}
      editing={editing}
      enabledCaps={enabledCaps.map((c) => c.key)}
      onClose={closeForm}
      onSaved={onSaved}
    />
  ) : null;

  return (
    <Shell>
      {/* Phone layout (below lg). The desktop client app renders TeamDesktop
          instead; both share the same staff state and mutations. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
      <div
        className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
      >
        <BackButton to="/home" />
        <span className="font-display text-[15px] font-bold text-[var(--text)]">
          Team
        </span>
        <button
          type="button"
          onClick={handleAdd}
          aria-label="Add employee"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--brand-text)] transition-colors active:bg-[var(--surface-2)]"
        >
          {showForm && !editing ? <X size={20} /> : <Plus size={20} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-[22px] pb-28 pt-5">
        <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
          Give your team their own logins. Each person signs in with their email
          and password and only sees what you allow.
        </p>

        {formEl}

        {loadError ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {loadError}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand-primary)]"
              aria-hidden="true"
            />
          </div>
        ) : staff.length === 0 ? (
          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-2)]">
              <UserPlus size={22} className="text-[var(--text-faint)]" />
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              No team members yet. Tap the plus to add your first employee.
            </p>
          </div>
        ) : (
          <ul className="mt-5 space-y-2.5">
            {staff.map((m) => {
              const disabled = m.status !== "active";
              return (
                <li
                  key={m.id}
                  className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-display text-[15px] font-bold text-[var(--text)]">
                          {m.name}
                        </span>
                        <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                          {ROLE_LABEL[m.role]}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[12.5px] text-[var(--text-muted)]">
                        {m.email}
                      </div>
                      <div
                        className="mt-1 text-[11.5px] font-semibold"
                        style={{ color: m.ghlUserId ? "#15803d" : "var(--text-faint)" }}
                      >
                        {m.ghlUserId
                          ? "Linked to GoHighLevel"
                          : "App login only (not in GoHighLevel)"}
                      </div>
                      {disabled && (
                        <div className="mt-1 text-[11.5px] font-semibold text-rose-500">
                          Login disabled
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleEdit(m)}
                        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--brand-text)] transition-colors active:bg-[var(--surface-2)]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus(m)}
                        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-muted)] transition-colors active:bg-[var(--surface-2)]"
                      >
                        {disabled ? "Restore" : "Disable"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      </div>

      {/* Desktop client app (lg+): the Atelier team directory. */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <TeamDesktop
          staff={staff}
          loading={loading}
          loadError={loadError}
          showForm={showForm}
          editing={editing}
          form={formEl}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onToggleStatus={toggleStatus}
        />
      </div>
    </Shell>
  );
}

function grantsFromMember(m: StaffMember): GrantMap {
  const base = Object.fromEntries(
    CAPABILITIES.map((c) => [c.key, { view: false, edit: false }]),
  ) as GrantMap;
  for (const p of m.permissions) {
    if (p.capability in base) {
      base[p.capability as Capability] = { view: p.view || p.edit, edit: p.edit };
    }
  }
  return base;
}

function EmployeeForm({
  editing,
  enabledCaps,
  onClose,
  onSaved,
}: {
  editing: StaffMember | null;
  enabledCaps: Capability[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const isEdit = Boolean(editing);
  const [name, setName] = useState(editing?.name ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffRole>(editing?.role ?? "rep");
  const [grants, setGrants] = useState<GrantMap>(() =>
    editing ? grantsFromMember(editing) : defaultGrantsForRole("rep"),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onRoleChange = (next: StaffRole) => {
    setRole(next);
    setGrants(defaultGrantsForRole(next));
  };

  const caps = useMemo(
    () => CAPABILITIES.filter((c) => enabledCaps.includes(c.key)),
    [enabledCaps],
  );

  // Editing an account whose role is not in the normal options (e.g. an 'owner')
  // keeps that option available so saving never silently demotes them.
  const roleOptions =
    editing && !ROLE_OPTIONS.includes(editing.role)
      ? [editing.role, ...ROLE_OPTIONS]
      : ROLE_OPTIONS;

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("Enter a name.");
    if (!isEdit && !email.includes("@")) return setError("Enter a valid email.");
    // Password is required when creating, optional when editing (blank = keep).
    if (!isEdit && password.trim().length < 8)
      return setError("Password must be at least 8 characters.");
    if (isEdit && password.trim() && password.trim().length < 8)
      return setError("New password must be at least 8 characters.");

    const permissions = caps
      .map((c) => ({
        capability: c.key,
        view: grants[c.key].view,
        edit: c.hasEdit ? grants[c.key].edit : false,
      }))
      .filter((g) => g.view || g.edit);

    setSubmitting(true);
    try {
      if (isEdit && editing) {
        await api(`/api/staff/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            role,
            permissions,
            // Saving re-activates a disabled (e.g. imported) account.
            status: "active",
            ...(password.trim() ? { password: password.trim() } : {}),
          }),
        });
        showToast("Employee updated");
      } else {
        const res = await api<{ ok: boolean; ghlLinked: boolean }>("/api/staff", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), email: email.trim(), password: password.trim(), role, permissions }),
        });
        showToast(res.ghlLinked ? "Employee added" : "Employee added (no GHL user)");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save employee.");
      setSubmitting(false);
    }
  };

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-[15px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20 disabled:opacity-60";

  return (
    <div className="mt-4 rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-2">
        <UserPlus size={16} className="text-[var(--brand-text)]" />
        <span className="font-display text-[14px] font-bold text-[var(--text)]">
          {isEdit ? "Edit employee" : "New employee"}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="label-cap">Name</span>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            disabled={submitting}
          />
        </label>
        <label className="block">
          <span className="label-cap">Email</span>
          <input
            className={inputClass}
            type="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@email.com"
            disabled={submitting || isEdit}
          />
        </label>
        <label className="block">
          <span className="label-cap">
            {isEdit ? "New password (optional)" : "Temporary password"}
          </span>
          <input
            className={inputClass}
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isEdit ? "Leave blank to keep current" : "At least 8 characters"}
            disabled={submitting}
          />
        </label>
        <label className="block">
          <span className="label-cap">Role</span>
          <select
            className={inputClass}
            value={role}
            onChange={(e) => onRoleChange(e.target.value as StaffRole)}
            disabled={submitting}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-[var(--text-muted)]" />
          <span className="label-cap">What they can access</span>
        </div>
        {caps.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-[var(--text-muted)]">
            No surfaces are enabled for this account yet.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--divider)] overflow-hidden rounded-xl border border-[var(--border)]">
            {caps.map((c) => (
              <li
                key={c.key}
                className="flex items-center justify-between px-3.5 py-2.5"
              >
                <span className="text-[14px] font-semibold text-[var(--text)]">
                  {c.label}
                </span>
                <div className="flex items-center gap-2">
                  <ToggleChip
                    label="View"
                    on={grants[c.key].view}
                    disabled={submitting}
                    onClick={() =>
                      setGrants((g) => {
                        const view = !g[c.key].view;
                        return {
                          ...g,
                          [c.key]: { view, edit: view ? g[c.key].edit : false },
                        };
                      })
                    }
                  />
                  {c.hasEdit && (
                    <ToggleChip
                      label="Edit"
                      on={grants[c.key].edit}
                      disabled={submitting}
                      onClick={() =>
                        setGrants((g) => {
                          const edit = !g[c.key].edit;
                          return {
                            ...g,
                            [c.key]: { view: edit || g[c.key].view, edit },
                          };
                        })
                      }
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>
      )}

      <div className="mt-4 flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="flex-1 rounded-xl border border-[var(--border)] py-3 text-[14px] font-semibold text-[var(--text-muted)] transition-colors active:bg-[var(--surface-2)] disabled:opacity-60"
        >
          Cancel
        </button>
        <BrandedButton
          type="button"
          className="flex-1"
          onClick={submit}
          disabled={submitting}
        >
          {isEdit
            ? submitting
              ? "Saving..."
              : "Save changes"
            : submitting
              ? "Adding..."
              : "Add employee"}
        </BrandedButton>
      </div>
    </div>
  );
}

function ToggleChip({
  label,
  on,
  disabled,
  onClick,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className="rounded-lg px-2.5 py-1 text-[12px] font-bold transition-colors disabled:opacity-60"
      style={{
        backgroundColor: on ? "var(--brand-primary)" : "var(--surface-2)",
        color: on ? "#fff" : "var(--text-faint)",
      }}
    >
      {label}
    </button>
  );
}
