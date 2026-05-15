import type { User } from "../types";
import { roleLabel } from "../lib/rolePermissions";

interface UserChipProps {
  user: User;
}

export default function UserChip({ user }: UserChipProps) {
  return (
    <span
      className="inline-flex max-w-[160px] items-center truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700"
      aria-label={`Current user ${user.name}, ${roleLabel(user.role)}`}
    >
      <span className="truncate">{user.name}</span>
      <span className="mx-1 text-slate-400">{"·"}</span>
      <span className="text-slate-500">{roleLabel(user.role)}</span>
    </span>
  );
}
