import ConversationThread from "../ConversationThread";
import MessageComposer from "../MessageComposer";
import { ChannelFilterProvider } from "../../context/ChannelFilterContext";

// The reusable lead conversation stack: thread + channel-aware composer sharing
// one ChannelFilter, keyed by lead id. Used by the lead page and LeadChatModal.
export default function LeadConversationPanel({
  leadId,
  hasPhone = true,
}: {
  leadId: string;
  hasPhone?: boolean;
}) {
  return (
    <ChannelFilterProvider key={leadId}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <ConversationThread leadId={leadId} fill />
        <div className="mt-auto">
          <MessageComposer leadId={leadId} disabled={!hasPhone} />
        </div>
      </div>
    </ChannelFilterProvider>
  );
}
