import {
  useConversationMessagesQuery,
  useMessagesQuery,
  useSendConversationMessage,
  useSendLeadMessage,
} from "../hooks/useApi";
import ChannelComposer, { type SendChannelInput } from "./ChannelComposer";

// One composer for both data sources: a lead id (LeadDetail) or a contact id
// (ConversationDetail). Exactly one of the two id props should be set; it
// picks the matching messages query (for channel discovery) and send hook.
interface Props {
  leadId?: string;
  contactId?: string;
  // True when the contact has no phone, so SMS is unavailable (other channels work).
  disabled?: boolean;
}

export default function MessageComposer({ leadId, contactId, disabled }: Props) {
  // Hooks run unconditionally; the enabled flags pick the active source.
  const leadMessages = useMessagesQuery(leadId ?? null, !!leadId);
  const contactMessages = useConversationMessagesQuery(
    contactId ?? null,
    !!contactId,
  );
  const sendLead = useSendLeadMessage();
  const sendContact = useSendConversationMessage();

  const messages = leadId ? leadMessages : contactMessages;
  const send = leadId ? sendLead : sendContact;

  const onSend = (input: SendChannelInput) =>
    leadId
      ? sendLead.mutateAsync({ leadId, ...input })
      : sendContact.mutateAsync({ contactId: contactId ?? "", ...input });

  return (
    <ChannelComposer
      availableChannels={messages.data?.availableChannels ?? []}
      defaultChannel={messages.data?.defaultChannel ?? "SMS"}
      isPending={send.isPending}
      error={send.error as Error | null}
      smsDisabled={disabled}
      onSend={onSend}
    />
  );
}
