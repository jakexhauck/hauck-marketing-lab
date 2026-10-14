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
  // Always enabled: RoleManager is only mounted when the owner opens the panel.
  const { data, isLoading, isError } = useChatRoles(true);
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
      // Real hook uses roleId, not id.
      await patchRole.mutateAsync({ roleId: role.id, name: next });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not rename role.");
    }
  };

  const onRecolor = async (role: ChatRole, color: string) => {
    if (color === role.color) return;
    try {
      await patchRole.mutateAsync({ roleId: role.id, color });
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
        patchRole.mutateAsync({ roleId: a.id, sortOrder: b.sortOrder }),
        patchRole.mutateAsync({ roleId: b.id, sortOrder: a.sortOrder }),
      ]);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not reorder roles.");
    }
  };

  const onDelete = async (role: ChatRole) => {
    if (role.isPreset) return;
    try {
      // Real hook takes { roleId } object, not a bare string.
      await deleteRole.mutateAsync({ roleId: role.id });
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
