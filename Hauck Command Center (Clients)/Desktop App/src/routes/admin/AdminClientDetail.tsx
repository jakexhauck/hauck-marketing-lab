import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, UserPlus, ShieldCheck, Eye, Pencil, Check } from "lucide-react";
import {
  CAPABILITIES,
  type Capability,
  type CapabilityDef,
  type ApiStaffAccount,
  type AdminClientDetail as AdminClientDetailData,
  type Role,
  type StaffPermission,
} from "@hauck/core";
import {
  useAdminClientQuery,
  useUpdateClient,
  useSetClientEntitlement,
  useCreateClientStaff,
  useUpdateClientStaff,
  useDisableClientStaff,
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
  ErrorState,
  LoadingState,
} from "@/components/ui";
import { cn } from "@/lib/cn";

type GrantMap = Partial<Record<Capability, { view: boolean; edit: boolean }>>;

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", manager: "Manager", rep: "Rep" };

function money(n: number): string {
  return n ? `$${n.toLocaleString()}` : "$0";
}
function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function AdminClientDetail() {
  const { id } = useParams();
  const detailQuery = useAdminClientQuery(id);

  if (detailQuery.isLoading) return <LoadingState label="Loading client" />;
  if (detailQuery.isError || !detailQuery.data) {
    return <ErrorState description="Couldn't load this client." onRetry={() => void detailQuery.refetch()} />;
  }

  return <ClientDetailBody id={id ?? ""} detail={detailQuery.data} />;
}

function ClientDetailBody({ id, detail }: { id: string; detail: AdminClientDetailData }) {
  const { client, entitlements, staff, members, activity } = detail;
  const [editingBusiness, setEditingBusiness] = useState(false);

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/admin" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-text">
        <ArrowLeft size={14} /> All clients
      </Link>

      <PageHeader
        title={client.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{client.niche}</Badge>
            <span className="text-faint">·</span>
            <span>{money(client.monthlySpend)}/mo</span>
            <span className="text-faint">·</span>
            <span>since {when(client.createdAt)}</span>
            {client.ghlLocationId === "pending" && (
              <>
                <span className="text-faint">·</span>
                <Badge tone="warning">GoHighLevel not connected</Badge>
              </>
            )}
          </span>
        }
        actions={
          <Button variant="secondary" onClick={() => setEditingBusiness(true)}>
            <Pencil size={15} /> Edit details
          </Button>
        }
      />

      <div className="space-y-6">
        <FeaturesCard id={id} enabled={entitlements} />
        <TeamCard id={id} staff={staff} enabled={entitlements} />
        {members.length > 0 && <PeopleCard members={members} />}
        <ActivityCard activity={activity} />
      </div>

      {editingBusiness && (
        <BusinessModal id={id} client={client} onClose={() => setEditingBusiness(false)} />
      )}
    </div>
  );
}

// --- Features (entitlements) -----------------------------------------------

function FeaturesCard({ id, enabled }: { id: string; enabled: Capability[] }) {
  const setEntitlement = useSetClientEntitlement(id);
  const { toast } = useToast();
  const enabledSet = new Set(enabled);
  const [pending, setPending] = useState<Capability | null>(null);

  async function toggle(cap: Capability, next: boolean) {
    setPending(cap);
    try {
      await setEntitlement.mutateAsync({ capability: cap, enabled: next });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't change that feature.", "error");
    } finally {
      setPending(null);
    }
  }

  return (
    <Section title="Features" subtitle="What this client's app includes. Turning one off hides it for everyone on the account, instantly.">
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
        {CAPABILITIES.map((c, i) => {
          const on = enabledSet.has(c.key);
          return (
            <div key={c.key} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-divider")}>
              <span className="flex-1 text-[14px] text-text">{c.label}</span>
              <Switch on={on} busy={pending === c.key} onClick={() => void toggle(c.key, !on)} />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// --- Team (staff accounts) --------------------------------------------------

function TeamCard({ id, staff, enabled }: { id: string; staff: ApiStaffAccount[]; enabled: Capability[] }) {
  const [editing, setEditing] = useState<ApiStaffAccount | "new" | null>(null);
  const enabledDefs = useMemo<CapabilityDef[]>(() => {
    const set = new Set(enabled);
    return CAPABILITIES.filter((c) => set.has(c.key));
  }, [enabled]);

  return (
    <Section
      title="Team"
      subtitle="The employees the owner assigned, and exactly what each can see and change."
      action={
        <Button variant="secondary" size="sm" onClick={() => setEditing("new")}>
          <UserPlus size={15} /> Add employee
        </Button>
      }
    >
      {staff.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface px-4 py-6 text-center text-[13px] text-muted">
          No employees yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          {staff.map((s, i) => (
            <StaffRow key={s.id} staff={s} enabled={enabledDefs} divided={i > 0} onEdit={() => setEditing(s)} />
          ))}
        </div>
      )}

      {editing !== null && (
        <StaffModal
          id={id}
          mode={editing === "new" ? { type: "create" } : { type: "edit", staff: editing }}
          enabled={enabledDefs}
          onClose={() => setEditing(null)}
        />
      )}
    </Section>
  );
}

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
    <div className={cn("flex flex-wrap items-center gap-3 px-4 py-3.5", divided && "border-t border-divider", disabled && "opacity-60")}>
      <div className="min-w-[170px] flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text">{staff.name}</span>
          <Badge tone={staff.role === "owner" ? "brand" : "neutral"}>{ROLE_LABEL[staff.role]}</Badge>
          {disabled && <Badge tone="danger">Disabled</Badge>}
        </div>
        <div className="mt-0.5 text-[13px] text-muted">{staff.email}</div>
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        {staff.role === "owner" ? (
          <span className="text-[13px] text-muted">Full access</span>
        ) : (
          enabled.map((c) => {
            const g = byCap.get(c.key);
            if (!g || (!g.view && !g.edit)) return null;
            return (
              <span key={c.key} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11.5px] text-muted">
                {c.label}
                {g.edit ? <Pencil size={11} className="text-brand-text" /> : <Eye size={11} className="text-faint" />}
              </span>
            );
          })
        )}
      </div>
      <Button variant="secondary" size="sm" onClick={onEdit}>
        Edit
      </Button>
    </div>
  );
}

type StaffModalMode = { type: "create" } | { type: "edit"; staff: ApiStaffAccount };

function presetFor(role: Role, enabled: CapabilityDef[]): GrantMap {
  const map: GrantMap = {};
  for (const c of enabled) {
    if (role === "manager") {
      map[c.key] = { view: true, edit: c.hasEdit };
    } else {
      const handsOn = c.key === "pipeline" || c.key === "inbox";
      const readOnly = c.key === "contacts" || c.key === "calendar";
      map[c.key] = { view: handsOn || readOnly, edit: handsOn && c.hasEdit };
    }
  }
  return map;
}

function StaffModal({
  id,
  mode,
  enabled,
  onClose,
}: {
  id: string;
  mode: StaffModalMode;
  enabled: CapabilityDef[];
  onClose: () => void;
}) {
  const isEdit = mode.type === "edit";
  const existing = isEdit ? mode.staff : null;
  const { toast } = useToast();
  const createStaff = useCreateClientStaff(id);
  const updateStaff = useUpdateClientStaff(id);
  const disableStaff = useDisableClientStaff(id);

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
    if (!isEdit && next !== "owner") setGrants(presetFor(next, enabled));
  }

  function toggle(cap: Capability, action: "view" | "edit") {
    setGrants((prev) => {
      const cur = prev[cap] ?? { view: false, edit: false };
      const next = { ...cur };
      if (action === "view") {
        next.view = !cur.view;
        if (!next.view) next.edit = false;
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
    if (!isEdit && password.trim().length < 8) return setError("Set a password of at least 8 characters.");
    if (isEdit && password.trim() && password.trim().length < 8) return setError("New password must be at least 8 characters.");

    const permissions = isOwnerRole ? [] : collectPermissions();
    try {
      if (isEdit && existing) {
        await updateStaff.mutateAsync({
          staffId: existing.id,
          input: {
            name: name.trim(),
            email: existing.email,
            role,
            permissions,
            ...(password.trim() ? { password: password.trim() } : {}),
          },
        });
        toast("Employee updated.", "success");
      } else {
        await createStaff.mutateAsync({
          name: name.trim(),
          email: email.trim(),
          password: password.trim(),
          role,
          permissions,
        });
        toast("Employee added.", "success");
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
      setError(err instanceof ApiError ? err.message : "Couldn't disable this employee.");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Edit ${existing?.name}` : "Add employee"}
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
              {isEdit ? "Save changes" : "Create employee"}
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
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@business.com" disabled={isEdit} />
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
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isEdit ? "••••••••" : "Set a password"} autoComplete="new-password" />
          </Field>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="label-cap">Access</span>
            {!isOwnerRole && <span className="text-[11.5px] text-faint">Edit includes view</span>}
          </div>
          {isOwnerRole ? (
            <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-3 text-[13px] text-muted">
              <ShieldCheck size={15} className="text-brand-text" />
              Owners have full access to every feature the business has.
            </div>
          ) : enabled.length === 0 ? (
            <p className="text-[13px] text-faint">This business has no features enabled yet.</p>
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-sm)] border border-border">
              <div className="flex items-center bg-surface-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                <span className="flex-1">Feature</span>
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
                        <span className="text-[11px] text-faint" title="This feature is view-only today">n/a</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="rounded-[var(--radius-sm)] bg-danger-tint px-3 py-2 text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

// --- Account people (tenant_users, informational) ---------------------------

function PeopleCard({ members }: { members: AdminClientDetailData["members"] }) {
  return (
    <Section title="Account contacts" subtitle="People linked to this client's GoHighLevel account.">
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
        {members.map((m, i) => (
          <div key={`${m.email}-${i}`} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-divider")}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] text-text">{m.name}</div>
              {m.email && <div className="truncate text-[12.5px] text-muted">{m.email}</div>}
            </div>
            <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{m.role}</Badge>
          </div>
        ))}
      </div>
    </Section>
  );
}

// --- Recent activity --------------------------------------------------------

function ActivityCard({ activity }: { activity: AdminClientDetailData["activity"] }) {
  return (
    <Section title="Recent activity">
      {activity.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface px-4 py-6 text-center text-[13px] text-muted">
          No recent activity.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          {activity.map((a, i) => (
            <div key={a.id} className={cn("flex items-center gap-3 px-4 py-2.5", i > 0 && "border-t border-divider")}>
              <span className="flex-1 truncate text-[13.5px] text-text">{a.summary ?? a.action}</span>
              <span className="shrink-0 text-[12px] text-faint">{when(a.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// --- Business details editor ------------------------------------------------

function BusinessModal({
  id,
  client,
  onClose,
}: {
  id: string;
  client: AdminClientDetailData["client"];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const update = useUpdateClient(id);
  const [name, setName] = useState(client.name);
  const [niche, setNiche] = useState(client.niche);
  const [appName, setAppName] = useState(client.appName);
  const [wonLabel, setWonLabel] = useState(client.wonLabel);
  const [valueLabel, setValueLabel] = useState(client.valueLabel);
  const [brandColor, setBrandColor] = useState(client.brandColor);
  const [brandInitials, setBrandInitials] = useState(client.brandInitials);
  const [spend, setSpend] = useState(String(client.monthlySpend ?? 0));
  const [ghlLocationId, setGhlLocationId] = useState(client.ghlLocationId === "pending" ? "" : client.ghlLocationId);
  const [ghlToken, setGhlToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (update.isPending) return;
    setError(null);
    try {
      await update.mutateAsync({
        name: name.trim(),
        niche: niche.trim(),
        appName: appName.trim(),
        wonLabel: wonLabel.trim(),
        valueLabel: valueLabel.trim(),
        brandColor: brandColor.trim(),
        brandInitials: brandInitials.trim(),
        monthlySpend: Number(spend) || 0,
        ...(ghlLocationId.trim() ? { ghlLocationId: ghlLocationId.trim() } : {}),
        ...(ghlToken.trim() ? { ghlToken: ghlToken.trim() } : {}),
      });
      toast("Client updated.", "success");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save changes.");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit business details"
      className="max-w-xl"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={update.isPending} onClick={onSubmit}>Save changes</Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Business name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Niche"><Input value={niche} onChange={(e) => setNiche(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="App name" hint="What the client sees."><Input value={appName} onChange={(e) => setAppName(e.target.value)} /></Field>
          <Field label="Monthly spend"><Input value={spend} onChange={(e) => setSpend(e.target.value)} inputMode="numeric" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="“Won” label" hint="e.g. Won, Booked, Closed"><Input value={wonLabel} onChange={(e) => setWonLabel(e.target.value)} /></Field>
          <Field label="Value label" hint="e.g. Job Value, Deal Size"><Input value={valueLabel} onChange={(e) => setValueLabel(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand colour" hint="Hex, e.g. #1d6fb8"><Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} /></Field>
          <Field label="Initials" hint="Up to 3 letters"><Input value={brandInitials} onChange={(e) => setBrandInitials(e.target.value)} maxLength={3} /></Field>
        </div>

        <div className="rounded-[var(--radius-sm)] border border-border bg-surface-2 p-3">
          <div className="label-cap mb-2">GoHighLevel connection</div>
          <div className="grid grid-cols-1 gap-3">
            <Field label="Location ID"><Input value={ghlLocationId} onChange={(e) => setGhlLocationId(e.target.value)} placeholder="GHL sub-account location id" /></Field>
            <Field label="API token" hint="Write-only. Leave blank to keep the current token."><Input type="password" value={ghlToken} onChange={(e) => setGhlToken(e.target.value)} placeholder="••••••••" autoComplete="off" /></Field>
          </div>
        </div>

        {error && <p className="rounded-[var(--radius-sm)] bg-danger-tint px-3 py-2 text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

// --- Shared bits ------------------------------------------------------------

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-[16px] text-text">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Switch({ on, busy, onClick }: { on: boolean; busy?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={onClick}
      className={cn(
        "relative h-5 w-9 rounded-full transition-colors disabled:opacity-50",
        on ? "bg-brand" : "bg-border-strong",
      )}
    >
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-sm transition-transform", on ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
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
        on ? "border-brand bg-brand text-brand-fg" : "border-border-strong bg-surface text-transparent hover:border-brand",
      )}
    >
      <Check size={13} strokeWidth={3} />
    </button>
  );
}
