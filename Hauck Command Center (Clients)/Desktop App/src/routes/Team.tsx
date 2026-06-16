import { useMemo, useState, type FormEvent } from "react";
import { UserPlus, ShieldCheck, Eye, Pencil, Link2, Link2Off, Check } from "lucide-react";
import {
  CAPABILITIES,
  type Capability,
  type CapabilityDef,
  type ApiStaffAccount,
  type Role,
  type StaffPermission,
} from "@hauck/core";
import {
  useStaffQuery,
  useEntitlementsQuery,
  useCreateStaff,
  useUpdateStaff,
  useDisableStaff,
} from "@/hooks/useApi";
import { useToast } from "@/context/ToastContext";
import { ApiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import {
  Button,
  Input,
  Field,
  Modal,
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui";
import { cn } from "@/lib/cn";

type GrantMap = Partial<Record<Capability, { view: boolean; edit: boolean }>>;

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  rep: "Rep",
};

// Role presets pre-fill the grant grid; the owner can still adjust any toggle.
// Bounded by the capabilities the business actually has, passed in.
function presetFor(role: Role, enabled: CapabilityDef[]): GrantMap {
  const map: GrantMap = {};
  for (const c of enabled) {
    if (role === "manager") {
      map[c.key] = { view: true, edit: c.hasEdit };
    } else {
      // rep: hands-on the day-to-day surfaces, read-only elsewhere.
      const handsOn = c.key === "pipeline" || c.key === "inbox";
      const readOnly = c.key === "contacts" || c.key === "calendar";
      map[c.key] = { view: handsOn || readOnly, edit: handsOn && c.hasEdit };
    }
  }
  return map;
}

export function Team() {
  const staffQuery = useStaffQuery();
  const entitlementsQuery = useEntitlementsQuery();
  const [editing, setEditing] = useState<ApiStaffAccount | null | "new">(null);

  // The capabilities this business has, in registry order, with their labels.
  const enabled = useMemo<CapabilityDef[]>(() => {
    const set = new Set(entitlementsQuery.data?.capabilities ?? []);
    return CAPABILITIES.filter((c) => set.has(c.key));
  }, [entitlementsQuery.data]);

  const staff = staffQuery.data?.staff ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Team"
        count={staff.length || undefined}
        description="Add staff and choose exactly what each person can see and change."
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            <UserPlus size={16} /> Add staff
          </Button>
        }
      />

      {staffQuery.isLoading ? (
        <LoadingState label="Loading team" />
      ) : staffQuery.isError ? (
        <ErrorState description="Couldn't load the team." onRetry={() => void staffQuery.refetch()} />
      ) : staff.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={22} />}
          title="No staff yet"
          description="Add an employee to give them their own login with the access you choose."
          action={
            <Button variant="primary" onClick={() => setEditing("new")}>
              <UserPlus size={16} /> Add staff
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          {staff.map((s, i) => (
            <StaffRow
              key={s.id}
              staff={s}
              enabled={enabled}
              divided={i > 0}
              onEdit={() => setEditing(s)}
            />
          ))}
        </div>
      )}

      {editing !== null && (
        <StaffModal
          mode={editing === "new" ? { type: "create" } : { type: "edit", staff: editing }}
          enabled={enabled}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// One staff member: identity on the left, a compact readout of granted surfaces
// on the right. The grant chips are the at-a-glance signature of this screen.
function StaffRow({
  staff,
  enabled,
  divided,
  onEdit,
}: {
  staff: ApiStaffAccount;
  enabled: CapabilityDef[];
  divided: boolean;
  onEdit: () => void;
}) {
  const byCap = new Map(staff.permissions.map((p) => [p.capability, p]));
  const disabled = staff.status === "disabled";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 px-4 py-3.5",
        divided && "border-t border-divider",
        disabled && "opacity-60",
      )}
    >
      <div className="min-w-[180px] flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text">{staff.name}</span>
          <Badge tone={staff.role === "owner" ? "brand" : "neutral"}>{ROLE_LABEL[staff.role]}</Badge>
          {disabled && <Badge tone="danger">Disabled</Badge>}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
          {staff.email}
          <span className="text-faint" title={staff.ghlUserId ? "Linked to a GoHighLevel user" : "Not linked to a GoHighLevel user"}>
            {staff.ghlUserId ? <Link2 size={13} /> : <Link2Off size={13} />}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        {staff.role === "owner" ? (
          <span className="text-[13px] text-muted">Full access</span>
        ) : (
          enabled.map((c) => {
            const g = byCap.get(c.key);
            if (!g || (!g.view && !g.edit)) return null;
            return (
              <span
                key={c.key}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11.5px] text-muted"
              >
                {c.label}
                {g.edit ? <Pencil size={11} className="text-brand-text" /> : <Eye size={11} className="text-faint" />}
              </span>
            );
          })
        )}
        {staff.role !== "owner" && staff.permissions.every((p) => !p.view && !p.edit) && (
          <span className="text-[13px] text-faint">No surfaces</span>
        )}
      </div>

      <Button variant="secondary" size="sm" onClick={onEdit}>
        Edit
      </Button>
    </div>
  );
}

type ModalMode = { type: "create" } | { type: "edit"; staff: ApiStaffAccount };

function StaffModal({
  mode,
  enabled,
  onClose,
}: {
  mode: ModalMode;
  enabled: CapabilityDef[];
  onClose: () => void;
}) {
  const isEdit = mode.type === "edit";
  const existing = isEdit ? mode.staff : null;
  const { toast } = useToast();
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const disableStaff = useDisableStaff();

  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(existing?.role ?? "rep");
  const [grants, setGrants] = useState<GrantMap>(() => {
    if (existing) {
      const map: GrantMap = {};
      for (const p of existing.permissions) map[p.capability] = { view: p.view, edit: p.edit };
      return map;
    }
    return presetFor("rep", enabled);
  });
  const [error, setError] = useState<string | null>(null);

  const busy = createStaff.isPending || updateStaff.isPending || disableStaff.isPending;
  const isOwnerRole = role === "owner";

  function applyRolePreset(next: Role) {
    setRole(next);
    // Re-seed the grid from the preset, but only when creating. On edit we keep
    // the owner's existing hand-tuned grants so a role change doesn't wipe them.
    if (!isEdit && next !== "owner") setGrants(presetFor(next, enabled));
  }

  function toggle(cap: Capability, action: "view" | "edit") {
    setGrants((prev) => {
      const cur = prev[cap] ?? { view: false, edit: false };
      let next = { ...cur };
      if (action === "view") {
        next.view = !cur.view;
        if (!next.view) next.edit = false; // edit implies view
      } else {
        next.edit = !cur.edit;
        if (next.edit) next.view = true;
      }
      return { ...prev, [cap]: next };
    });
  }

  function collectPermissions(): StaffPermission[] {
    return enabled
      .map((c) => {
        const g = grants[c.key] ?? { view: false, edit: false };
        return { capability: c.key, view: g.view, edit: g.edit && c.hasEdit };
      })
      .filter((p) => p.view || p.edit);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (!name.trim()) return setError("Enter a name.");
    if (!email.trim() || !email.includes("@")) return setError("Enter a valid email.");
    if (!isEdit && password.trim().length < 8) {
      return setError("Set a password of at least 8 characters.");
    }
    if (isEdit && password.trim() && password.trim().length < 8) {
      return setError("New password must be at least 8 characters.");
    }

    const permissions = isOwnerRole ? [] : collectPermissions();

    try {
      if (isEdit && existing) {
        await updateStaff.mutateAsync({
          id: existing.id,
          input: {
            name: name.trim(),
            email: existing.email,
            role,
            permissions,
            ...(password.trim() ? { password: password.trim() } : {}),
          },
        });
        toast("Staff updated.", "success");
      } else {
        const res = await createStaff.mutateAsync({
          name: name.trim(),
          email: email.trim(),
          password: password.trim(),
          role,
          permissions,
        });
        if (!res.ghlLinked) {
          toast(
            res.ghlProvisioning
              ? "Staff added. GoHighLevel user could not be created (check the connection)."
              : "Staff added. Link to GoHighLevel is off until provisioning is enabled.",
            "info",
          );
        } else {
          toast("Staff added.", "success");
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
  }

  async function onDisable() {
    if (!existing || busy) return;
    try {
      await disableStaff.mutateAsync(existing.id);
      toast(`${existing.name} can no longer sign in.`, "success");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't disable this staff member.");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Edit ${existing?.name}` : "Add staff"}
      className="max-w-xl"
      footer={
        <div className="flex w-full items-center justify-between">
          <div>
            {isEdit && existing?.status === "active" && (
              <Button variant="ghost" size="sm" onClick={() => void onDisable()} className="text-danger hover:bg-danger-tint">
                Disable login
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={onSubmit}>
              {isEdit ? "Save changes" : "Create staff"}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" autoFocus />
          </Field>
          <Field label="Email" hint={isEdit ? "The login email can't be changed." : undefined}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@business.com"
              disabled={isEdit}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <div className="flex rounded-[var(--radius-sm)] border border-border bg-surface-2 p-0.5 text-[13px] font-medium">
              {(["rep", "manager", "owner"] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => applyRolePreset(r)}
                  className={cn(
                    "flex-1 rounded-[calc(var(--radius-sm)-2px)] py-1.5 transition-colors",
                    role === r ? "bg-surface text-text shadow-[var(--shadow-sm)]" : "text-muted hover:text-text",
                  )}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </Field>
          <Field label={isEdit ? "Reset password" : "Password"} hint={isEdit ? "Leave blank to keep current." : "At least 8 characters."}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? "••••••••" : "Set a password"}
              autoComplete="new-password"
            />
          </Field>
        </div>

        {/* Permission matrix: the signature of this screen. Only the surfaces the
            business actually has appear, and Owners skip it (full access). */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="label-cap">Access</span>
            {!isOwnerRole && (
              <span className="text-[11.5px] text-faint">Edit includes view</span>
            )}
          </div>

          {isOwnerRole ? (
            <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-3 text-[13px] text-muted">
              <ShieldCheck size={15} className="text-brand-text" />
              Owners have full access to every surface the business has.
            </div>
          ) : enabled.length === 0 ? (
            <p className="text-[13px] text-faint">This business has no surfaces enabled yet.</p>
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-sm)] border border-border">
              <div className="flex items-center bg-surface-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                <span className="flex-1">Surface</span>
                <span className="w-14 text-center">View</span>
                <span className="w-14 text-center">Edit</span>
              </div>
              {enabled.map((c, i) => {
                const g = grants[c.key] ?? { view: false, edit: false };
                return (
                  <div key={c.key} className={cn("flex items-center px-3 py-2", i > 0 && "border-t border-divider")}>
                    <span className="flex-1 text-[13.5px] text-text">{c.label}</span>
                    <div className="flex w-14 justify-center">
                      <GrantToggle on={g.view} onClick={() => toggle(c.key, "view")} />
                    </div>
                    <div className="flex w-14 justify-center">
                      {c.hasEdit ? (
                        <GrantToggle on={g.edit} onClick={() => toggle(c.key, "edit")} />
                      ) : (
                        <span className="text-[11px] text-faint" title="This surface is view-only today">
                          n/a
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-[var(--radius-sm)] bg-danger-tint px-3 py-2 text-[13px] text-danger">{error}</p>
        )}
      </form>
    </Modal>
  );
}

function GrantToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-[6px] border transition-colors",
        on
          ? "border-brand bg-brand text-brand-fg"
          : "border-border-strong bg-surface text-transparent hover:border-brand",
      )}
    >
      <Check size={13} strokeWidth={3} />
    </button>
  );
}
