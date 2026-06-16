import { useMemo, useState } from "react";
import { Search, MessageSquare, Mail, Phone, StickyNote } from "lucide-react";
import type { ApiConversation } from "@hauck/core";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";
import { Avatar, Input, LoadingState, EmptyState, ErrorState } from "@/components/ui";

// Channel hint icon mirrored from MessageThread so the list and thread agree.
function channelIcon(type: string) {
  const t = (type || "").toLowerCase();
  if (t.includes("email")) return Mail;
  if (t.includes("call")) return Phone;
  if (t.includes("note") || t.includes("activity")) return StickyNote;
  return MessageSquare;
}

function ConversationRow({
  convo,
  active,
  onSelect,
}: {
  convo: ApiConversation;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = channelIcon(convo.lastMessageType);
  const unread = convo.unreadCount > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-start gap-3 border-l-2 px-3.5 py-3 text-left transition-colors",
        active
          ? "border-brand bg-brand-tint"
          : "border-transparent hover:bg-surface-2",
      )}
    >
      <Avatar name={convo.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13.5px] leading-snug",
              unread ? "font-semibold text-text" : "font-medium text-text",
            )}
          >
            {convo.name || "Unnamed"}
          </span>
          <span className="font-data shrink-0 text-[10.5px] text-faint">
            {relativeTime(convo.lastMessageAt)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <Icon size={12} className="shrink-0 text-faint" />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[12px] leading-snug",
              unread ? "text-muted" : "text-faint",
            )}
          >
            {convo.preview || "No preview"}
          </span>
          {unread && (
            <span className="font-data bg-brand text-brand-fg ml-1 inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold">
              {convo.unreadCount > 99 ? "99+" : convo.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function ConversationList({
  conversations,
  loading,
  error,
  activeContactId,
  onSelect,
  onRetry,
  className,
}: {
  conversations: ApiConversation[];
  loading: boolean;
  error: boolean;
  activeContactId?: string;
  onSelect: (contactId: string) => void;
  onRetry: () => void;
  className?: string;
}) {
  const [search, setSearch] = useState("");

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...conversations]
      .filter((c) => {
        if (!q) return true;
        return (
          (c.name || "").toLowerCase().includes(q) ||
          (c.preview || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const ta = new Date(a.lastMessageAt).getTime() || 0;
        const tb = new Date(b.lastMessageAt).getTime() || 0;
        return tb - ta;
      });
  }, [conversations, search]);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col border-r border-border bg-surface",
        className,
      )}
    >
      <div className="shrink-0 border-b border-border p-3">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations"
            className="pl-9"
            aria-label="Search conversations"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <ErrorState
            title="Couldn't load conversations"
            description="The inbox failed to load. Try again."
            onRetry={onRetry}
          />
        ) : loading && conversations.length === 0 ? (
          <LoadingState label="Loading conversations" />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={22} />}
            title={search.trim() ? "No matches" : "No conversations"}
            description={
              search.trim()
                ? "No conversations match your search."
                : "Inbound and outbound messages will show up here."
            }
          />
        ) : (
          <ul className="divide-y divide-divider">
            {sorted.map((c) => (
              <li key={c.id}>
                <ConversationRow
                  convo={c}
                  active={c.contactId === activeContactId}
                  onSelect={() => onSelect(c.contactId)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
