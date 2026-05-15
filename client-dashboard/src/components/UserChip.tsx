import type { User } from "../types";
import { roleLabel } from "../lib/rolePermissions";

interface UserChipProps {
  user: User;
}

export default function UserChip({ user }: UserChipProps) {
  return (
    <span
      className="inline-flex max-w-[180px] items-center gap-1.5 truncate rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700"
      aria-label={`Current user ${user.name}, ${roleLabel(user.role)}`}
    >
      <span className="truncate">{user.name}</span>
      <span className="text-slate-300">·</span>
      <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
        {roleLabel(user.role)}
      </span>
    </span>
  );
}
