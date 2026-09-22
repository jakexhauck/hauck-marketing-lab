import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import { Button } from "../ui/Button";
import Avatar from "../Avatar";
import ConversationThread from "../ConversationThread";
import MessageComposer from "../MessageComposer";
import { ChannelFilterProvider } from "../../context/ChannelFilterContext";
import { useAuth } from "../../context/AuthContext";
import { useConversationsQuery } from "../../hooks/useApi";

// The Atelier desktop Conversation thread (lg+). The phone keeps its own
// (NavyHero) full-height layout; this renders only inside `hidden lg:flex` from
// the ConversationDetail route. SMS only: the thread and the reply box are locked
// to texts (Jake, 2026-09-22).
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
        <ChannelFilterProvider key={contactId} initial="SMS">
          <div className="flex min-h-0 flex-1 flex-col rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 pb-4 pt-5">
              <ConversationThread contactId={contactId} fill />
            </div>
            <div className="border-t border-border px-6 py-4">
              <MessageComposer contactId={contactId} lockChannel="SMS" />
            </div>
          </div>
        </ChannelFilterProvider>
      </div>
    </DesktopPage>
  );
}
