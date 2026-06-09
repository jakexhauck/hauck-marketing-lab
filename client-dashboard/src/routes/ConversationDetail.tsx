import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import Shell from "../components/Shell";
import NavyHero from "../components/NavyHero";
import { HeroIconButton } from "../components/HeroUi";
import Avatar from "../components/Avatar";
import ConversationThreadByContact from "../components/ConversationThreadByContact";
import MessageComposerByContact from "../components/MessageComposerByContact";
import { useAuth } from "../context/AuthContext";
import { useConversationsQuery } from "../hooks/useApi";

export default function ConversationDetail() {
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
    <Shell>
      <NavyHero rounded={false}>
        <div className="flex items-center gap-3">
          <HeroIconButton label="Back" onClick={() => navigate("/conversations")}>
            <ChevronLeft size={20} />
          </HeroIconButton>
          <Avatar name={name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-base font-bold text-white">
              {name}
            </div>
            <div className="truncate text-[12px] text-white/60">Conversation</div>
          </div>
        </div>
      </NavyHero>

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
