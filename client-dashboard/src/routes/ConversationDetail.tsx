import { useMemo } from "react";
import { useParams } from "react-router-dom";
import Shell from "../components/Shell";
import BackButton from "../components/BackButton";
import Avatar from "../components/Avatar";
import ConversationThreadByContact from "../components/ConversationThreadByContact";
import MessageComposerByContact from "../components/MessageComposerByContact";
import { useAuth } from "../context/AuthContext";
import { useConversationsQuery } from "../hooks/useApi";

export default function ConversationDetail() {
  const { contactId = "" } = useParams<{ contactId: string }>();
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
    <Shell>
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
        <BackButton to="/conversations" label="" />
        <Avatar name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-base font-bold text-[var(--text)]">
            {name}
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-3 px-5 pb-4 pt-4">
        <div className="flex-1 overflow-y-auto">
          <ConversationThreadByContact contactId={contactId} />
        </div>
        <div className="border-t border-[var(--border)] pt-3">
          <MessageComposerByContact contactId={contactId} />
        </div>
      </main>
    </Shell>
  );
}
