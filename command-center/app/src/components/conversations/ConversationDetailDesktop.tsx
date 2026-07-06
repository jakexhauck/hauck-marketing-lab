import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import { Button } from "../ui/Button";
import Avatar from "../Avatar";
import ConversationThread from "../ConversationThread";
import SourceBadge from "./SourceBadge";
import ThreadChannelTabs, { ActiveChannelComposer } from "./ThreadChannelTabs";
import { ChannelFilterProvider } from "../../context/ChannelFilterContext";
import { useAuth } from "../../context/AuthContext";
import { useConversationsQuery } from "../../hooks/useApi";
import { convOrigin } from "../../lib/inboxFilters";

// The Atelier desktop Conversation thread (lg+). The phone keeps its own
// (NavyHero) full-height layout; this renders only inside `hidden lg:flex` from
// the ConversationDetail route. SMS and Email are two separate threads on their
// own tabs, each with its own reply box.
export default function ConversationDetailDesktop() {
  const { contactId = "" } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const useReal = Boolean(session);

  const listQuery = useConversationsQuery(useReal);

  const conv = useMemo(
    () =>
      listQuery.data?.conversations.find((c) => c.contactId === contactId) ??
      null,
    [listQuery.data, contactId],
  );

  const name = conv?.name ?? "Conversation";

  return (
    <DesktopPage
      title={
        <span className="flex items-center gap-3">
          <Avatar name={name} size="sm" />
          <span className="truncate">{name}</span>
          {conv && <SourceBadge origin={convOrigin(conv)} />}
        </span>
      }
      actions={
        <Button variant="secondary" onClick={() => navigate("/conversations")}>
          <ArrowLeft size={16} />
          Inbox
        </Button>
      }
    >
      <div
        className="mx-auto flex w-full max-w-3xl flex-col"
        style={{ height: "calc(100dvh - 64px - 56px)" }}
      >
        <ChannelFilterProvider key={contactId} initial={null}>
          <div className="flex min-h-0 flex-1 flex-col rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 pb-4 pt-5">
              <ThreadChannelTabs contactId={contactId} />
              <ConversationThread contactId={contactId} fill />
            </div>
            <div className="border-t border-border px-6 py-4">
              <ActiveChannelComposer contactId={contactId} />
            </div>
          </div>
        </ChannelFilterProvider>
      </div>
    </DesktopPage>
  );
}
