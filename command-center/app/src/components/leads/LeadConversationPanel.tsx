import ConversationThread from "../ConversationThread";
import MessageComposer from "../MessageComposer";
import { ChannelFilterProvider } from "../../context/ChannelFilterContext";

// The reusable lead conversation stack: thread + channel-aware composer sharing
// one ChannelFilter, keyed by lead id. Used by the lead page and LeadChatModal.
export default function LeadConversationPanel({
  leadId,
  hasPhone = true,
  wrapProvider = true,
}: {
  leadId: string;
  hasPhone?: boolean;
  // When a caller (e.g. a one-touch action rail rendered alongside this
  // panel) needs to reach the same channel filter, it can wrap both in its
  // own ChannelFilterProvider and pass false here to skip this nested one.
  wrapProvider?: boolean;
}) {
  const content = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ConversationThread leadId={leadId} fill />
      <div className="mt-auto">
        <MessageComposer leadId={leadId} disabled={!hasPhone} />
      </div>
    </div>
  );

  if (!wrapProvider) return content;

  return (
    <ChannelFilterProvider key={leadId}>{content}</ChannelFilterProvider>
  );
}
