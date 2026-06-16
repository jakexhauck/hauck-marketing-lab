import { useMemo } from "react";
import { Inbox } from "lucide-react";
import { Panel, PanelHeader, Avatar, Badge, EmptyState } from "@/components/ui";
import { formatNumber, relativeTime } from "@/lib/format";
import type { ApiConversation } from "@hauck/core";

const MAX_ROWS = 4;

// Secondary strip: conversations with unread inbound messages, most recent first.
// Loading/error are intentionally quiet here since this is a non-critical aside;
// it simply renders nothing extra while the parent's data settles.
export function NeedsAttention({
  conversations,
}: {
  conversations: ApiConversation[] | undefined;
}) {
  const rows = useMemo(() => {
    return (conversations ?? [])
      .filter((c) => c.unreadCount > 0)
      .sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
      )
      .slice(0, MAX_ROWS);
  }, [conversations]);

  const totalUnread = (conversations ?? []).filter((c) => c.unreadCount > 0).length;

  return (
    <Panel className="flex min-h-0 flex-col overflow-hidden">
      <PanelHeader
        kicker="Needs attention"
        title="Unread conversations"
        action={
          totalUnread > 0 ? (
            <Badge tone="brand">
              <span className="font-data tnum">{formatNumber(totalUnread)}</span>
            </Badge>
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Inbox size={22} />}
          title="Inbox is clear"
          description="No conversations are waiting on a reply."
        />
      ) : (
        <ul className="divide-y divide-divider">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={c.name} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[13.5px] font-medium text-text">{c.name}</p>
                  <span className="shrink-0 font-data text-[11px] text-faint tnum">
                    {relativeTime(c.lastMessageAt)}
                  </span>
                </div>
                <p className="truncate text-[12.5px] text-muted">{c.preview || "New message"}</p>
              </div>
              <Badge tone="brand" className="shrink-0">
                <span className="font-data tnum">{formatNumber(c.unreadCount)}</span>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
