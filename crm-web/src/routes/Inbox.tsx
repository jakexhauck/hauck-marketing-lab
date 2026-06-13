import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";
import { useConversationsQuery } from "@/hooks/useApi";
import { EmptyState } from "@/components/ui";
import { ConversationList } from "@/components/inbox/ConversationList";
import { ThreadPanel } from "@/components/inbox/ThreadPanel";

// Inbox: a desktop master-detail. The active conversation lives in ?c=<contactId>
// so the command palette can deep-link straight to a thread. On wide screens both
// panes show; under 768px the list and thread swap (selecting pushes to the thread).
export function Inbox() {
  const [params, setParams] = useSearchParams();
  const activeContactId = params.get("c") ?? undefined;

  const conversationsQuery = useConversationsQuery();
  const conversations = useMemo(
    () => conversationsQuery.data?.conversations ?? [],
    [conversationsQuery.data],
  );

  // The newest conversation, used for auto-select when no ?c is present.
  const firstContactId = useMemo(() => {
    if (conversations.length === 0) return undefined;
    return [...conversations].sort((a, b) => {
      const ta = new Date(a.lastMessageAt).getTime() || 0;
      const tb = new Date(b.lastMessageAt).getTime() || 0;
      return tb - ta;
    })[0]?.contactId;
  }, [conversations]);

  // Auto-select the first conversation once loaded and nothing is selected.
  useEffect(() => {
    if (!activeContactId && firstContactId) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("c", firstContactId);
          return next;
        },
        { replace: true },
      );
    }
  }, [activeContactId, firstContactId, setParams]);

  function select(contactId: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("c", contactId);
      return next;
    });
  }

  function clearSelection() {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("c");
      return next;
    });
  }

  const activeConvo = useMemo(
    () => conversations.find((c) => c.contactId === activeContactId),
    [conversations, activeContactId],
  );

  const hasConversations = conversations.length > 0;

  return (
    <div className="flex h-[calc(100vh-6.25rem)] min-h-0 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
      {/* Left pane: hidden on narrow widths when a thread is open. */}
      <div
        className={cn(
          "min-h-0 w-full md:w-[340px] md:shrink-0",
          activeContactId ? "hidden md:flex" : "flex",
        )}
      >
        <ConversationList
          conversations={conversations}
          loading={conversationsQuery.isLoading}
          error={conversationsQuery.isError}
          activeContactId={activeContactId}
          onSelect={select}
          onRetry={() => conversationsQuery.refetch()}
          className="w-full"
        />
      </div>

      {/* Right pane: hidden on narrow widths when no thread is open. */}
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1",
          activeContactId ? "flex" : "hidden md:flex",
        )}
      >
        {activeContactId ? (
          <ThreadPanel
            key={activeContactId}
            convo={activeConvo}
            contactId={activeContactId}
            onBack={clearSelection}
            className="w-full"
          />
        ) : (
          <div className="flex w-full items-center justify-center bg-bg">
            <EmptyState
              icon={<MessageSquare size={22} />}
              title={hasConversations ? "Select a conversation" : "No conversations"}
              description={
                hasConversations
                  ? "Choose a conversation from the list to view the thread."
                  : "Inbound and outbound messages will appear here."
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
