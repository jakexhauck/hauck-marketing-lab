# Phase 06 - Roles and Onboarding Integration

**Read `00-INDEX.md` first.** Address Jake as **"Sir"**. **No em dashes.**

## Goal
Give the owner a place to manage cosmetic chat roles, and wire role assignment,
the Hauck-line gate, and channel membership into the existing employee onboarding
form so a new hire is fully provisioned for comms in one save.

Two deliverables:

1. **RoleManager** (owner-only) at `src/components/comms/RoleManager.tsx`: list
   `chat_roles`, create a role (name + color), rename, recolor, reorder
   (`sortOrder`), and delete non-preset roles. Preset roles (`isPreset`) recolor
   but never delete. Opened from a **"Manage roles"** button in the Team page
   header.
2. **EmployeeForm extensions** (in `src/routes/Team.tsx`): add cosmetic role
   multi-select (`chatRoleIds`), a **"Can message Hauck"** toggle
   (`canContactHauck`), and a channel-membership multi-select (`channelIds`),
   without touching the existing permission model. Persist all three by extending
   `POST /api/staff` and `PATCH /api/staff/{id}`, and pre-fill them on edit by
   extending `GET /api/staff`.

This phase consumes the Phase 04 hooks (`useChatRoles`, `useCreateRole`,
`usePatchRole`, `useDeleteRole`, `useChannels`) and the Phase 04 client types
(`ChatRole`, `ChatChannel`). It depends on the Phase 03 roles/channels endpoints
and the migration `0016` columns (`chat_roles`, `chat_member_roles`,
`chat_channel_members`, `staff_accounts.can_contact_hauck`).

## Files
- Create: `command-center/app/src/components/comms/RoleManager.tsx`
- Modify: `command-center/app/src/routes/Team.tsx`
  - `Team()` component: import + "Manage roles" button + RoleManager panel state (header at lines 124-152 phone, desktop pass-through at 236-249).
  - `EmployeeForm` (lines 266-505): new state, new UI sections, extended submit bodies.
- Modify: `command-center/app/src/components/team/TeamDesktop.tsx`
  - `StaffMember` interface (lines 14-23): add `chatRoleIds`, `canContactHauck`, `channelIds`.
  - `TeamDesktop` `actions` prop (lines 83-88): add the "Manage roles" button next to "Add employee".
- Modify: `command-center/app/functions/api/staff/index.ts`
  - `GET` handler (lines 22-77): include `chatRoleIds`, `canContactHauck`, `channelIds` per staff row.
  - `CreateBody` (lines 11-17) + `POST` handler (lines 81-168): accept and write the three new fields.
- Modify: `command-center/app/functions/api/staff/[staffId].ts`
  - `PatchBody` (lines 12-18) + `PATCH` handler (lines 45-98): accept and write the three new fields.

No migration is added here; the columns and join tables already exist from Phase 01.

## Work

### 1. RoleManager component

Create `command-center/app/src/components/comms/RoleManager.tsx`. Owner-only,
rendered inside an overlay panel the Team page controls. It reads roles via
`useChatRoles` and mutates via `useCreateRole` / `usePatchRole` / `useDeleteRole`
(Phase 04). Reordering uses simple up/down buttons that swap `sortOrder` with the
neighbour via `usePatchRole` (no drag library; keeps it dependency-free and
keyboard-accessible). Presets recolor but disable the delete control.

The preset swatch palette mirrors the migration `0016` seed colors plus a few
extra so the owner has sensible defaults; the native `<input type="color">` covers
anything else.

```tsx
import { useMemo, useState } from "react";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import {
  useChatRoles,
  useCreateRole,
  usePatchRole,
  useDeleteRole,
} from "../../hooks/useChat";
import { useToast } from "../../context/ToastContext";
import { ApiError } from "../../lib/api";
import type { ChatRole } from "../../lib/api";

// Default swatches: the four preset seed colors (migration 0016) plus a handful
// of complementary tones. The native color input handles anything custom.
const SWATCHES = [
  "#4dbb83", "#6366f1", "#0ea5e9", "#94a3b8",
  "#f59e0b", "#ef4444", "#ec4899", "#14b8a6",
];

export default function RoleManager({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const { data, isLoading, isError } = useChatRoles();
  const createRole = useCreateRole();
  const patchRole = usePatchRole();
  const deleteRole = useDeleteRole();

  // New-role draft.
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(SWATCHES[0]);

  // Roles sorted high-to-low so the highest-priority role sits at the top, the
  // same ordering the roster uses for name color.
  const roles = useMemo(
    () => [...(data?.roles ?? [])].sort((a, b) => b.sortOrder - a.sortOrder),
    [data],
  );

  const onCreate = async () => {
    const name = newName.trim();
    if (!name) {
      showToast("Enter a role name.");
      return;
    }
    try {
      await createRole.mutateAsync({ name, color: newColor });
      setNewName("");
      setNewColor(SWATCHES[0]);
      showToast("Role added");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not add role.");
    }
  };

  const onRename = async (role: ChatRole, name: string) => {
    const next = name.trim();
    if (!next || next === role.name) return;
    try {
      await patchRole.mutateAsync({ id: role.id, name: next });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not rename role.");
    }
  };

  const onRecolor = async (role: ChatRole, color: string) => {
    if (color === role.color) return;
    try {
      await patchRole.mutateAsync({ id: role.id, color });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not recolor role.");
    }
  };

  // Swap sort_order with the neighbour in the requested direction. roles is
  // sorted high-to-low, so "up" means a higher sortOrder.
  const onMove = async (index: number, dir: "up" | "down") => {
    const target = dir === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= roles.length) return;
    const a = roles[index];
    const b = roles[target];
    try {
      await Promise.all([
        patchRole.mutateAsync({ id: a.id, sortOrder: b.sortOrder }),
        patchRole.mutateAsync({ id: b.id, sortOrder: a.sortOrder }),
      ]);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not reorder roles.");
    }
  };

  const onDelete = async (role: ChatRole) => {
    if (role.isPreset) return;
    try {
      await deleteRole.mutateAsync(role.id);
      showToast("Role removed");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not remove role.");
    }
  };

  const inputClass =
    "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[14px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Manage chat roles"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[20px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] sm:rounded-[20px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <span className="font-display text-[15px] font-bold text-[var(--text)]">
            Manage roles
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Create a new role */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
            <span className="label-cap">New role</span>
            <div className="mt-2 flex items-center gap-2">
              <input
                className={inputClass}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Role name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onCreate();
                }}
              />
              <input
                type="color"
                aria-label="Role color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1"
              />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use color ${c}`}
                  aria-pressed={newColor.toLowerCase() === c.toLowerCase()}
                  onClick={() => setNewColor(c)}
                  className="h-6 w-6 rounded-full border border-black/10 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    outline:
                      newColor.toLowerCase() === c.toLowerCase()
                        ? "2px solid var(--ring)"
                        : "none",
                    outlineOffset: "2px",
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => void onCreate()}
              disabled={createRole.isPending}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-[13px] font-bold text-white transition-colors disabled:opacity-60"
            >
              <Plus size={15} />
              {createRole.isPending ? "Adding..." : "Add role"}
            </button>
          </div>

          {/* Existing roles */}
          <div className="mt-4">
            <span className="label-cap">Roles</span>
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <div
                  className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand-primary)]"
                  aria-hidden
                />
              </div>
            ) : isError ? (
              <p className="mt-2 text-[13px] text-rose-600 dark:text-rose-400">
                Could not load roles.
              </p>
            ) : roles.length === 0 ? (
              <p className="mt-2 text-[13px] text-[var(--text-muted)]">
                No roles yet. Add one above.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--divider)] overflow-hidden rounded-xl border border-[var(--border)]">
                {roles.map((role, index) => (
                  <li
                    key={role.id}
                    className="flex items-center gap-2 px-3 py-2.5"
                  >
                    <GripVertical
                      size={15}
                      className="shrink-0 text-[var(--text-faint)]"
                      aria-hidden
                    />
                    <input
                      type="color"
                      aria-label={`${role.name} color`}
                      defaultValue={role.color}
                      onBlur={(e) => void onRecolor(role, e.target.value)}
                      className="h-7 w-9 shrink-0 cursor-pointer rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5"
                    />
                    <input
                      defaultValue={role.name}
                      onBlur={(e) => void onRename(role, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[14px] font-semibold text-[var(--text)] outline-none transition-colors hover:border-[var(--border)] focus:border-[var(--ring)]"
                    />
                    {role.isPreset && (
                      <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-faint)]">
                        Preset
                      </span>
                    )}
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => void onMove(index, "up")}
                        disabled={index === 0 || patchRole.isPending}
                        aria-label={`Move ${role.name} up`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] disabled:opacity-40"
                      >
                        &#8593;
                      </button>
                      <button
                        type="button"
                        onClick={() => void onMove(index, "down")}
                        disabled={index === roles.length - 1 || patchRole.isPending}
                        aria-label={`Move ${role.name} down`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] disabled:opacity-40"
                      >
                        &#8595;
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDelete(role)}
                        disabled={role.isPreset || deleteRole.isPending}
                        aria-label={`Delete ${role.name}`}
                        title={
                          role.isPreset
                            ? "Preset roles cannot be deleted"
                            : "Delete role"
                        }
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-500 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

Phase 04 contract this relies on (do not deviate; if the actual hook shapes
differ, update Phase 04, not this code):
- `useChatRoles()` -> `{ data: { roles: ChatRole[] }, isLoading, isError }`.
- `useCreateRole()` -> mutation with `mutateAsync({ name, color }: { name: string; color: string })`.
- `usePatchRole()` -> mutation with `mutateAsync({ id, name?, color?, sortOrder? }: { id: string; name?: string; color?: string; sortOrder?: number })`.
- `useDeleteRole()` -> mutation with `mutateAsync(id: string)`.

### 2. Surface RoleManager from the Team page

In `command-center/app/src/routes/Team.tsx`, add the import and the panel state to
the `Team()` component, then mount the button in both layouts.

Add to the imports at the top of the file:
```tsx
import RoleManager from "../components/comms/RoleManager";
```

Add the panel state inside `Team()` (next to the existing `showForm` state, around
line 37):
```tsx
const [showRoles, setShowRoles] = useState(false);
```

Phone header (currently lines 137-144) gains a "Manage roles" button to the left of
the add button. Replace the single trailing `<button>` with a small group:
```tsx
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowRoles(true)}
            className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-[var(--text-muted)] transition-colors active:bg-[var(--surface-2)]"
          >
            Manage roles
          </button>
          <button
            type="button"
            onClick={handleAdd}
            aria-label="Add employee"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--brand-text)] transition-colors active:bg-[var(--surface-2)]"
          >
            {showForm && !editing ? <X size={20} /> : <Plus size={20} />}
          </button>
        </div>
```

Pass an `onManageRoles` handler into `TeamDesktop` (the desktop block at lines
237-249):
```tsx
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
          onManageRoles={() => setShowRoles(true)}
        />
```

Render the panel once, just before the closing `</Shell>` so it overlays both
layouts:
```tsx
      {showRoles && <RoleManager onClose={() => setShowRoles(false)} />}
    </Shell>
```

In `command-center/app/src/components/team/TeamDesktop.tsx`, accept the new prop
and add the button beside "Add employee". Add `onManageRoles: () => void;` to the
props type (after `onToggleStatus`), then update the `actions` block (lines 83-88):
```tsx
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
```

### 3. EmployeeForm: new state and pre-fill

The form already pre-fills from `editing: StaffMember`. Extend `StaffMember` so
the three new fields ride along on the staff list (the backend GET adds them in
step 5), then read them into local state.

In `command-center/app/src/components/team/TeamDesktop.tsx`, extend the
`StaffMember` interface (lines 14-23):
```tsx
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
```

In `command-center/app/src/routes/Team.tsx`, add the imports the form needs. Update
the existing `useChat` hook import or add a fresh one for `useChatRoles` and
`useChannels`:
```tsx
import { useChatRoles, useChannels } from "../hooks/useChat";
import type { ChatChannel } from "../lib/api";
```

Add the new state inside `EmployeeForm` (after the `grants` state, around line 285):
```tsx
  const [chatRoleIds, setChatRoleIds] = useState<string[]>(
    editing?.chatRoleIds ?? [],
  );
  const [canContactHauck, setCanContactHauck] = useState<boolean>(
    editing?.canContactHauck ?? false,
  );
  const [channelIds, setChannelIds] = useState<string[]>(
    editing?.channelIds ?? [],
  );

  const { data: rolesData } = useChatRoles();
  const { data: channelsData } = useChannels();
  // Highest-priority role first, matching the roster + RoleManager ordering.
  const chatRoles = useMemo(
    () => [...(rolesData?.roles ?? [])].sort((a, b) => b.sortOrder - a.sortOrder),
    [rolesData],
  );
  // Only real channels are assignable here; DMs and the hauck line are implicit.
  const assignableChannels = useMemo(
    () =>
      (channelsData?.channels ?? []).filter(
        (c: ChatChannel) => c.kind === "channel",
      ),
    [channelsData],
  );

  const toggleChatRole = (id: string) =>
    setChatRoleIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  const toggleChannel = (id: string) =>
    setChannelIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
```

`useMemo` is already imported in `Team.tsx` (line 1). Phase 04 contract:
`useChannels()` -> `{ data: { channels: ChatChannel[] } }`, where `ChatChannel`
has `kind: "channel" | "dm" | "hauck"` (see INDEX client types).

### 4. EmployeeForm: new UI sections

Insert the three new sections after the existing "What they can access" block
(after the closing `</div>` of that block, around line 473, before the `{error && ...}`
line). They reuse `label-cap` headers, the rounded-xl bordered list pattern, the
existing `ToggleChip`, and `var(--surface)` tones so they match the permission UI.

```tsx
      {/* Cosmetic chat roles (purely visual, separate from permissions). */}
      <div className="mt-4">
        <span className="label-cap">Chat roles</span>
        {chatRoles.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-[var(--text-muted)]">
            No chat roles yet. Add some from "Manage roles".
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {chatRoles.map((r) => {
              const on = chatRoleIds.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleChatRole(r.id)}
                  disabled={submitting}
                  aria-pressed={on}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60"
                  style={{
                    borderColor: on ? r.color : "var(--border)",
                    backgroundColor: on ? `${r.color}1f` : "var(--surface)",
                    color: on ? "var(--text)" : "var(--text-muted)",
                  }}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: r.color }}
                    aria-hidden
                  />
                  {r.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Direct line to Hauck (Jake). Off by default. */}
      <div className="mt-4">
        <span className="label-cap">Direct line to Hauck</span>
        <ul className="mt-2 overflow-hidden rounded-xl border border-[var(--border)]">
          <li className="flex items-center justify-between px-3.5 py-2.5">
            <div className="min-w-0 pr-3">
              <span className="text-[14px] font-semibold text-[var(--text)]">
                Can message Hauck
              </span>
              <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                Lets this person open a private thread with Jake.
              </p>
            </div>
            <ToggleChip
              label={canContactHauck ? "On" : "Off"}
              on={canContactHauck}
              disabled={submitting}
              onClick={() => setCanContactHauck((v) => !v)}
            />
          </li>
        </ul>
      </div>

      {/* Channel membership. */}
      <div className="mt-4">
        <span className="label-cap">Channels</span>
        {assignableChannels.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-[var(--text-muted)]">
            No channels yet.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--divider)] overflow-hidden rounded-xl border border-[var(--border)]">
            {assignableChannels.map((c: ChatChannel) => (
              <li
                key={c.id}
                className="flex items-center justify-between px-3.5 py-2.5"
              >
                <span className="truncate text-[14px] font-semibold text-[var(--text)]">
                  {c.name || "Untitled channel"}
                </span>
                <ToggleChip
                  label={channelIds.includes(c.id) ? "Member" : "Add"}
                  on={channelIds.includes(c.id)}
                  disabled={submitting}
                  onClick={() => toggleChannel(c.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
```

### 5. EmployeeForm: extend the submit bodies

In `command-center/app/src/routes/Team.tsx`, the `submit()` function (lines
306-351) sends two bodies. Add the three new fields to both. The PATCH body
(lines 329-336):
```tsx
        await api(`/api/staff/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            role,
            permissions,
            // Saving re-activates a disabled (e.g. imported) account.
            status: "active",
            chatRoleIds,
            canContactHauck,
            channelIds,
            ...(password.trim() ? { password: password.trim() } : {}),
          }),
        });
```

The POST body (lines 340-343):
```tsx
        const res = await api<{ ok: boolean; ghlLinked: boolean }>("/api/staff", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            password: password.trim(),
            role,
            permissions,
            chatRoleIds,
            canContactHauck,
            channelIds,
          }),
        });
```

### 6. Commit (frontend)
```bash
git add command-center/app/src/components/comms/RoleManager.tsx \
  command-center/app/src/routes/Team.tsx \
  command-center/app/src/components/team/TeamDesktop.tsx
git commit -m "feat(comms): role manager UI + chat roles/hauck/channels in employee form"
```

### 7. Backend: extend `GET /api/staff` to pre-fill

In `command-center/app/functions/api/staff/index.ts`, the GET handler returns the
staff list. Add the three new fields per row. After the existing
`staff_permissions` block (after line 63, before the `return Response.json` at line
65):

```ts
  // Team comms (Phase 06): cosmetic role ids, can_contact_hauck, channel ids.
  // can_contact_hauck rides on the staff_accounts select below; the other two
  // come from join tables keyed by staff id.
  const chatRolesByStaff = new Map<string, string[]>();
  const channelsByStaff = new Map<string, string[]>();
  if (ids.length) {
    const { data: roleRows } = await client
      .from("chat_member_roles")
      .select("staff_account_id, chat_role_id")
      .in("staff_account_id", ids);
    for (const row of (roleRows ?? []) as {
      staff_account_id: string;
      chat_role_id: string;
    }[]) {
      const list = chatRolesByStaff.get(row.staff_account_id) ?? [];
      list.push(row.chat_role_id);
      chatRolesByStaff.set(row.staff_account_id, list);
    }

    // chat_channel_members is keyed by (channel_id, member_kind, member_id).
    // Staff members carry member_kind = 'staff'; member_id is the staff id.
    const { data: memberRows } = await client
      .from("chat_channel_members")
      .select("channel_id, member_id")
      .eq("member_kind", "staff")
      .in("member_id", ids);
    for (const row of (memberRows ?? []) as {
      channel_id: string;
      member_id: string;
    }[]) {
      const list = channelsByStaff.get(row.member_id) ?? [];
      list.push(row.channel_id);
      channelsByStaff.set(row.member_id, list);
    }
  }
```

Add `can_contact_hauck` to the staff select (line 32) and its row type (lines
36-44):
```ts
  const { data: staffRows } = await client
    .from("staff_accounts")
    .select("id, name, email, role, status, ghl_user_id, can_contact_hauck, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  const staff = (staffRows ?? []) as {
    id: string;
    name: string;
    email: string;
    role: StaffRole;
    status: string;
    ghl_user_id: string | null;
    can_contact_hauck: boolean;
    created_at: string;
  }[];
```

Extend the mapped response (lines 66-75):
```ts
    staff: staff.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role,
      status: s.status,
      ghlUserId: s.ghl_user_id,
      createdAt: s.created_at,
      permissions: permsByStaff.get(s.id) ?? [],
      chatRoleIds: chatRolesByStaff.get(s.id) ?? [],
      canContactHauck: Boolean(s.can_contact_hauck),
      channelIds: channelsByStaff.get(s.id) ?? [],
    })),
```

### 8. Backend: write the new fields on create

Still in `command-center/app/functions/api/staff/index.ts`. Extend `CreateBody`
(lines 11-17):
```ts
interface CreateBody {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  permissions?: GrantInput[];
  chatRoleIds?: string[];
  canContactHauck?: boolean;
  channelIds?: string[];
}
```

Normalize them near the other field parsing (after line 96, where `role` is set):
```ts
  const chatRoleIds = normalizeIdList(body.chatRoleIds);
  const channelIds = normalizeIdList(body.channelIds);
  const canContactHauck = body.canContactHauck === true;
```

Add this helper at module scope (below the `ROLES` constant, line 19):
```ts
// Dedup + drop blanks from an id array body field. Returns [] for anything
// that is not a string array.
function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && v.trim().length > 0))];
}
```

Write `can_contact_hauck` into the insert (lines 130-138):
```ts
    .insert({
      tenant_id: tenantId,
      ghl_user_id: ghlUser?.id ?? null,
      email,
      name,
      role,
      password_hash,
      status: "active",
      can_contact_hauck: canContactHauck,
    })
```

After the permissions insert/rollback block (after line 156, before the final
`return`), write the chat roles and channel memberships. These are non-critical to
the account itself, so a failure here is logged but does not roll back the login.

```ts
  // Cosmetic chat roles (membership in chat_member_roles). Scope to roles that
  // actually belong to this tenant so a stale or foreign id is ignored.
  if (chatRoleIds.length) {
    await writeChatRoles(client, tenantId, staffId, chatRoleIds);
  }
  // Channel membership (member_kind = 'staff'). Same tenant scoping.
  if (channelIds.length) {
    await writeChannelMembers(client, tenantId, staffId, channelIds);
  }
```

Add these two shared writers at module scope (below `normalizeIdList`). They are
used verbatim by the PATCH handler too, so export them and import in
`[staffId].ts`:

```ts
// Replace a staff member's cosmetic chat roles with exactly `roleIds`,
// delete-then-insert. Only roles belonging to `tenantId` are honored.
export async function writeChatRoles(
  client: SupabaseClient,
  tenantId: string,
  staffId: string,
  roleIds: string[],
): Promise<void> {
  await client.from("chat_member_roles").delete().eq("staff_account_id", staffId);
  if (!roleIds.length) return;
  const { data: valid } = await client
    .from("chat_roles")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", roleIds);
  const ids = (valid ?? []).map((r) => (r as { id: string }).id);
  if (!ids.length) return;
  await client
    .from("chat_member_roles")
    .insert(ids.map((chat_role_id) => ({ staff_account_id: staffId, chat_role_id })));
}

// Set a staff member's channel membership to exactly `channelIds`. Removes the
// member from every channel they are no longer in, then upserts the chosen set.
// Only channels belonging to `tenantId` are honored. member_kind = 'staff'.
export async function writeChannelMembers(
  client: SupabaseClient,
  tenantId: string,
  staffId: string,
  channelIds: string[],
): Promise<void> {
  const { data: valid } = await client
    .from("chat_channels")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", channelIds.length ? channelIds : ["00000000-0000-0000-0000-000000000000"]);
  const wanted = new Set((valid ?? []).map((r) => (r as { id: string }).id));

  // Current channel memberships for this staff member, tenant-scoped via join
  // against the validated channel ids is unnecessary: we simply remove any
  // membership not in `wanted`, then add the missing ones.
  const { data: current } = await client
    .from("chat_channel_members")
    .select("channel_id")
    .eq("member_kind", "staff")
    .eq("member_id", staffId);
  const have = new Set((current ?? []).map((r) => (r as { channel_id: string }).channel_id));

  const toRemove = [...have].filter((id) => !wanted.has(id));
  const toAdd = [...wanted].filter((id) => !have.has(id));

  if (toRemove.length) {
    await client
      .from("chat_channel_members")
      .delete()
      .eq("member_kind", "staff")
      .eq("member_id", staffId)
      .in("channel_id", toRemove);
  }
  if (toAdd.length) {
    await client.from("chat_channel_members").insert(
      toAdd.map((channel_id) => ({
        channel_id,
        member_kind: "staff",
        member_id: staffId,
      })),
    );
  }
}
```

Add the `SupabaseClient` type import at the top of `index.ts` (it is not imported
there yet):
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
```

Note: `writeChannelMembers` removes channels the owner unchecked. On **create**
the member has no existing rows, so it behaves as a pure insert; on **edit** it is
a full reconcile. The placeholder UUID in the `.in()` guard keeps the query valid
when `channelIds` is empty (no real channel matches it), so an empty selection
removes the member from every channel.

### 9. Backend: write the new fields on edit

In `command-center/app/functions/api/staff/[staffId].ts`. Extend `PatchBody`
(lines 12-18):
```ts
interface PatchBody {
  name?: string;
  role?: string;
  status?: string;
  password?: string;
  permissions?: GrantInput[];
  chatRoleIds?: string[];
  canContactHauck?: boolean;
  channelIds?: string[];
}
```

Import the shared writers (add to the imports at the top):
```ts
import { writeChatRoles, writeChannelMembers } from "./index";
```

Set `can_contact_hauck` in the `update` map when present (after the password block,
around line 76):
```ts
  if (typeof body.canContactHauck === "boolean") {
    update.can_contact_hauck = body.canContactHauck;
  }
```

After the permissions replace block (after line 95, before the final `return`),
reconcile chat roles and channels when the field is present. Use `!== undefined`
so omitting a field leaves it untouched, while sending `[]` clears it:
```ts
  if (body.chatRoleIds !== undefined) {
    const roleIds = [...new Set(
      body.chatRoleIds.filter((v): v is string => typeof v === "string" && v.trim().length > 0),
    )];
    await writeChatRoles(client, tenantId, staffId, roleIds);
  }
  if (body.channelIds !== undefined) {
    const channelIds = [...new Set(
      body.channelIds.filter((v): v is string => typeof v === "string" && v.trim().length > 0),
    )];
    await writeChannelMembers(client, tenantId, staffId, channelIds);
  }
```

### 10. Commit (backend)
```bash
git add command-center/app/functions/api/staff/index.ts \
  command-center/app/functions/api/staff/[staffId].ts
git commit -m "feat(comms): persist chat roles, can_contact_hauck, channels on staff create/edit"
```

## Tests
This phase is UI + I/O-bound (React form, Cloudflare handlers, Supabase joins), so
it is verified by **running it**, per the INDEX testing strategy. No "should work"
claims; show evidence.

1. `cd command-center/app && npm run dev`. Sign in as a Willis owner.
2. Team page -> "Manage roles": create a role (name + swatch and custom color),
   rename inline, recolor, reorder with the arrows, delete a non-preset role,
   confirm the delete control is disabled on the four preset roles.
3. Add employee: assign two chat roles, toggle "Can message Hauck" on, add the
   person to a channel, save. Re-open Edit on that member and confirm all three
   pre-fill from `GET /api/staff`.
4. Edit again: uncheck a role and a channel, save, re-open, confirm they cleared.
5. Network tab: the create POST and edit PATCH bodies carry `chatRoleIds`,
   `canContactHauck`, `channelIds`.
6. Supabase: `chat_member_roles` has the expected rows; `chat_channel_members` has
   `member_kind = 'staff'` rows for the chosen channels; `staff_accounts.can_contact_hauck`
   is set. Unchecking removes the corresponding rows.
7. M9 visual proof: Playwright screenshots of RoleManager open and the extended
   EmployeeForm on both the phone (below lg) and desktop (lg+) layouts.

If any pure helper grows non-trivial (it should not here; `normalizeIdList` is
trivial), add a Vitest case in a colocated `*.test.ts` and run `npm run test`.

## Definition of done
- Owner can create, rename, recolor, reorder, and delete non-preset roles from the
  Team header "Manage roles" panel; preset roles recolor but the delete control is
  disabled.
- EmployeeForm shows chat-role chips, a "Can message Hauck" toggle, and channel
  membership toggles, in the same visual language as the permission list, without
  altering the existing permission model.
- Create and edit persist `chatRoleIds` (to `chat_member_roles`), `canContactHauck`
  (to `staff_accounts.can_contact_hauck`), and `channelIds` (to
  `chat_channel_members`, `member_kind = 'staff'`), tenant-scoped, with delete-then-set
  semantics so unchecking removes rows.
- Edit pre-fills all three from the extended `GET /api/staff`.
- All writes go through `getServiceClient(ctx.env)` + `resolveTenantId`, stay
  owner-only, and never roll back the account on a roles/channels write failure.
- `npm run dev` exercises the full flow; screenshots captured (M9).

## MANUAL ACTIONS - JAKE
None.
