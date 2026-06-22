import { useMemo } from "react";
import { cn } from "../../lib/cn";
import Avatar from "../Avatar";
import PresenceDot from "./PresenceDot";
import { useRoster, useOpenDm } from "../../hooks/useChat";
import { useChat } from "../../context/ChatContext";
import { highestRole, isOnline } from "../../lib/chatLogic";
import type { ChatMember } from "../../lib/api";

const NO_ROLE = "__none__";

export default function Roster({
  onOpenChannel,
}: {
  onOpenChannel: (id: string) => void;
}) {
  const { me, presentIds } = useChat();
  const rosterQuery = useRoster(true);
  const openDm = useOpenDm();
  const members = rosterQuery.data?.members ?? [];

  // Group by highest role, preserving role rank (highest sortOrder first) so the
  // strongest roles render at the top, mirroring Discord's grouped sidebar.
  const groups = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; color: string; rank: number; members: ChatMember[] }>();
    for (const m of members) {
      const top = highestRole(m.roles);
      const key = top?.id ?? NO_ROLE;
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          label: top?.name ?? "Members",
          color: top?.color ?? "var(--text-muted)",
          rank: top?.sortOrder ?? -1,
          members: [],
        });
      }
      byKey.get(key)!.members.push(m);
    }
    return [...byKey.values()].sort((a, b) => b.rank - a.rank);
  }, [members]);

  if (rosterQuery.isLoading) {
    return <div className="px-2.5 py-2 text-[12.5px] text-[var(--text-faint)]">Loading roster.</div>;
  }

  return (
    <div className="flex flex-col">
      {groups.map((g) => (
        <div key={g.key} className="mb-1">
          <div className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
            {g.label} ({g.members.length})
          </div>
          {g.members.map((m) => {
            const online = isOnline(`staff:${m.id}`, presentIds);
            const isSelf = me?.kind === "staff" && me.id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={isSelf}
                onClick={() => {
                  // Get-or-create a DM with this member, then open it.
                  openDm.mutate(
                    { memberId: m.id },
                    { onSuccess: (data) => onOpenChannel(data.channel.id) },
                  );
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                  isSelf
                    ? "cursor-default opacity-90"
                    : "hover:bg-[var(--surface-2)]",
                )}
              >
                <span className="relative shrink-0">
                  <Avatar name={m.name} size="sm" />
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <PresenceDot online={online} />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[13.5px] font-medium"
                    style={{ color: g.color }}
                  >
                    {m.name}
                    {isSelf && <span className="ml-1 text-[var(--text-faint)]">(you)</span>}
                  </span>
                  {!online && m.lastSeen && (
                    <span className="block truncate text-[11px] text-[var(--text-faint)]">
                      last seen {new Date(m.lastSeen).toLocaleDateString()}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
