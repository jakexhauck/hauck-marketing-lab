import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useConversationMessagesQuery } from "../../hooks/useApi";
import {
  channelFromType,
  otherPageChannel,
  sendLabelForChannel,
  type PageChannel,
} from "../../lib/inboxFilters";

// Task 5: when the open contact also has messages on the OTHER channel (SMS
// while viewing Email, or vice versa), show an honest inline note linking to the
// same contact scoped to that channel. It only renders when such messages
// actually exist in the thread, never a fabricated state. The messages query is
// shared (react-query dedupes) with the thread, so this costs no extra fetch.
export default function BothChannelNote({
  contactId,
  channel,
}: {
  contactId: string;
  channel: PageChannel;
}) {
  const { session } = useAuth();
  const q = useConversationMessagesQuery(
    contactId || null,
    Boolean(session) && !!contactId,
  );
  const other = otherPageChannel(channel);
  const hasOther = (q.data?.messages ?? []).some(
    (m) => channelFromType(m.type) === other,
  );
  if (!hasOther) return null;

  const otherLabel = sendLabelForChannel(other);
  return (
    <Link
      to={`/conversations/${contactId}?ch=${other}`}
      className="flex items-center gap-2 rounded-[11px] border border-brand-primary/20 bg-brand-tint/50 px-3 py-2 text-[12.5px] font-medium text-muted transition-colors hover:border-brand-primary/40"
    >
      <span className="min-w-0 flex-1">
        You're also talking to this person over {otherLabel}.
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-text">
        View {otherLabel}
        <ArrowRight size={13} />
      </span>
    </Link>
  );
}
