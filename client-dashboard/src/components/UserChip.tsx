import type { User } from "../types";
import { roleLabel } from "../lib/rolePermissions";

interface UserChipProps {
  user: User;
}

export default function UserChip({ user }: UserChipProps) {
  return (
    <span
      className="inline-flex max-w-[180px] items-center gap-1.5 truncate rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-muted)]"
      aria-label={`Current user ${user.name}, ${roleLabel(user.role)}`}
    >
      <span className="truncate">{user.name}</span>
      <span className="text-[var(--text-faint)]">·</span>
      <span className="text-[9.5px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {roleLabel(user.role)}
      </span>
    </span>
  );
}
