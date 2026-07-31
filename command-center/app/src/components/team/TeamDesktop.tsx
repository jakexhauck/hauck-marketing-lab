import { useMemo, useState } from "react";
import { Search, ShieldCheck, UserPlus, X } from "lucide-react";
import { Button } from "../ui/Button";
import { Segmented } from "../ui/Segmented";
import DesktopPage from "../desktop/DesktopPage";
import Avatar from "../Avatar";
import EmptyState from "../EmptyState";
import StatCard from "../StatCard";
import {
  CAPABILITIES,
  type Capability,
  type StaffRole,
} from "../../lib/capabilities";

// Shape shared with the Team route. Kept local so the desktop view and the
// phone view drive the exact same staff list, mutations and form.
export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  status: string;
  ghlUserId: string | null;
  createdAt: string;
  permissions: { capability: string; view: boolean; edit: boolean }[];
  // Team comms (Phase 06). Cosmetic role ids, the Hauck-line gate, and the set
  // of channels this member belongs to.
  chatRoleIds: string[];
  canContactHauck: boolean;
  channelIds: string[];
}

const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "Owner",
  manager: "Manager",
  rep: "Rep",
};

const CAP_LABEL: Record<Capability, string> = Object.fromEntries(
  CAPABILITIES.map((c) => [c.key, c.label]),
) as Record<Capability, string>;

// The roster's role/status filter. "all" keeps everyone (including disabled);
// "disabled" isolates the switched-off logins.
type RosterFilter = "all" | "manager" | "rep" | "disabled";

// Human summary of the surfaces a member can reach, deduped by capability and
// ordered to match the canonical CAPABILITIES list so it never shuffles.
function accessSummary(m: StaffMember): string[] {
  const reachable = new Set(
    m.permissions.filter((p) => p.view || p.edit).map((p) => p.capability),
  );
  return CAPABILITIES.filter((c) => reachable.has(c.key)).map(
    (c) => CAP_LABEL[c.key],
  );
}

// The Atelier desktop Team directory (lg+). The phone keeps its own list
// layout; this renders only inside `hidden lg:flex` from the Team route and
// shares the route's data, handlers and form.
export default function TeamDesktop({
  staff,
  loading,
  loadError,
  showForm,
  editing,
  form,
  onAdd,
  onEdit,
  onToggleStatus,
  onManageRoles,
}: {
  staff: StaffMember[];
  loading: boolean;
  loadError: string | null;
  showForm: boolean;
  editing: StaffMember | null;
  // The shared EmployeeForm element, rendered by the route so both layouts use
  // the same instance, validation and mutations.
  form: React.ReactNode;
  onAdd: () => void;
  onEdit: (m: StaffMember) => void;
  onToggleStatus: (m: StaffMember) => void;
  onManageRoles: () => void;
}) {
  // View-only concerns owned by the desktop directory itself; the route keeps
  // the data and mutations, so a search or filter never touches the server.
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");

  const counts = useMemo(() => {
    let active = 0;
    let manager = 0;
    let rep = 0;
    let disabled = 0;
    for (const m of staff) {
      if (m.status === "active") active += 1;
      else disabled += 1;
      if (m.role === "manager") manager += 1;
      else if (m.role === "rep") rep += 1;
    }
    return { total: staff.length, active, manager, rep, disabled };
  }, [staff]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((m) => {
      if (filter === "disabled" && m.status === "active") return false;
      if ((filter === "manager" || filter === "rep") && m.role !== filter)
        return false;
      if (q && !`${m.name} ${m.email}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [staff, filter, search]);

  // True when the form is open in add mode (lets the primary action toggle).
  const adding = showForm && !editing;

  return (
    <DesktopPage
      title="Team"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onManageRoles}>
            Manage roles
          </Button>
          <Button variant="primary" onClick={onAdd}>
            {adding ? <X size={16} /> : <UserPlus size={16} />}
            {adding ? "Close" : "Add employee"}
          </Button>
        </div>
      }
    >
      <p className="mb-5 max-w-[68ch] text-[14px] leading-relaxed text-muted">
        Give your team their own logins. Each person signs in with their email
        and password and only sees what you allow.
      </p>

      {showForm && <div className="mb-6 max-w-2xl">{form}</div>}

      {loadError ? (
        <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
          {loadError}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
            aria-hidden
          />
        </div>
      ) : counts.total === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface py-6">
          <EmptyState
            title="No team members"
            message="Add your first employee to give them a login with just the access they need."
          />
        </div>
      ) : (
        <>
          {/* Summary tiles: how big is the team and how many logins are live. */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total members" value={counts.total} />
            <StatCard label="Active logins" value={counts.active} />
            <StatCard label="Managers" value={counts.manager} />
            <StatCard label="Reps" value={counts.rep} />
          </div>

          {/* Role filter + search. */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Segmented<RosterFilter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: counts.total },
                { value: "manager", label: "Managers", count: counts.manager },
                { value: "rep", label: "Reps", count: counts.rep },
                { value: "disabled", label: "Disabled", count: counts.disabled },
              ]}
            />
            <div className="relative ml-auto w-full max-w-xs">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email"
                aria-label="Search team"
                className="w-full rounded-[var(--radius)] border border-border bg-surface py-2.5 pl-9 pr-3 text-[14px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-border bg-surface py-6">
              <EmptyState
                title="No matches"
                message={
                  search.trim()
                    ? `No team members match "${search.trim()}".`
                    : "No team members in this view."
                }
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-divider text-left">
                    <th className="label-cap px-6 py-3 font-semibold">Member</th>
                    <th className="label-cap hidden px-6 py-3 font-semibold lg:table-cell">
                      Role
                    </th>
                    <th className="label-cap hidden px-6 py-3 font-semibold xl:table-cell">
                      Access
                    </th>
                    <th className="label-cap px-6 py-3 text-right font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="fx-stagger">
                  {visible.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      onEdit={() => onEdit(m)}
                      onToggleStatus={() => onToggleStatus(m)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </DesktopPage>
  );
}

function MemberRow({
  member,
  onEdit,
  onToggleStatus,
}: {
  member: StaffMember;
  onEdit: () => void;
  onToggleStatus: () => void;
}) {
  const disabled = member.status !== "active";
  const access = accessSummary(member);
  const visibleAccess = access.slice(0, 4);
  const extraAccess = access.length - visibleAccess.length;

  return (
    <tr className="fx-item border-b border-divider transition-colors last:border-0 hover:bg-surface-2">
      {/* Member: avatar, name, email */}
      <td className="px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Avatar name={member.name} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-display text-[14.5px] font-semibold text-text">
                {member.name}
              </span>
              {disabled && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-danger-tint px-2 py-0.5 text-[10.5px] font-semibold text-danger">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-danger"
                    aria-hidden
                  />
                  Disabled
                </span>
              )}
            </div>
            <div className="truncate text-[12.5px] text-muted">
              {member.email}
            </div>
          </div>
        </div>
      </td>

      {/* Role */}
      <td className="hidden px-6 py-3.5 lg:table-cell">
        <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold text-muted">
          {ROLE_LABEL[member.role]}
        </span>
      </td>

      {/* Access summary */}
      <td className="hidden px-6 py-3.5 xl:table-cell">
        {visibleAccess.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {visibleAccess.map((label) => (
              <span
                key={label}
                className="inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted"
              >
                {label}
              </span>
            ))}
            {extraAccess > 0 && (
              <span className="text-[11px] font-semibold text-faint">
                +{extraAccess}
              </span>
            )}
          </div>
        ) : (
          <span className="text-[13px] text-faint">No access granted</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-6 py-3.5">
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <ShieldCheck size={14} />
            Edit access
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggleStatus}>
            {disabled ? "Restore" : "Disable"}
          </Button>
        </div>
      </td>
    </tr>
  );
}
