import Avatar from "../Avatar";
import SourceBadge from "./SourceBadge";
import { convOrigin } from "../../lib/inboxFilters";
import { useNow } from "../../context/NowContext";
import { timeAgo } from "../../lib/timeAgo";
import type { ApiConversation } from "../../lib/api";

// A flat, ungrouped list of conversation rows for the active Inbox tab. The
// grouping and source chips moved up into the tab strip, so this is just the
// rows, already filtered and sorted by the caller. Works full-width on the phone
// and inside the desktop's fixed left column.
export default function ConversationList({
  items,
  selectedId,
  onOpen,
  emptyLabel = "No conversations here.",
}: {
  items: ApiConversation[];
  selectedId: string | null;
  onOpen: (contactId: string) => void;
  emptyLabel?: string;
}) {
  const now = useNow();

  if (items.length === 0) {
    return (
      <p className="px-4 py-16 text-center text-[13px] text-faint">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="min-h-0 flex-1 overflow-y-auto">
      {items.map((c) => (
        <li key={c.id}>
          <ConversationRow
            conv={c}
            now={now}
            active={c.contactId === selectedId}
            onOpen={() => onOpen(c.contactId)}
          />
        </li>
      ))}
    </ul>
  );
}

function ConversationRow({
  conv,
  now,
  active,
  onOpen,
}: {
  conv: ApiConversation;
  now: number;
  active: boolean;
  onOpen: () => void;
}) {
  const hasUnread = conv.unreadCount > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={
        "relative flex w-full gap-3 border-b border-divider py-3 pl-5 pr-4 text-left transition-colors " +
        (active ? "bg-brand-tint" : "hover:bg-surface-2")
      }
    >
      {active && (
        <span className="absolute inset-y-0 left-0 w-[3px] bg-brand" aria-hidden />
      )}
      <Avatar name={conv.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={
              "min-w-0 flex-1 truncate font-display text-[14px] text-text " +
              (hasUnread ? "font-bold" : "font-semibold")
            }
          >
            {conv.name}
          </span>
          <span
            className={
              "tnum shrink-0 text-[11px] " +
              (hasUnread ? "font-bold text-brand" : "text-faint")
            }
          >
            {timeAgo(conv.lastMessageAt, now)}
          </span>
        </div>
        <div
          className={
            "mt-1 truncate text-[12.5px] " +
            (hasUnread ? "text-text" : "text-muted")
          }
        >
          {conv.preview || "No recent message"}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <SourceBadge origin={convOrigin(conv)} size="sm" />
        </div>
      </div>
    </button>
  );
}
