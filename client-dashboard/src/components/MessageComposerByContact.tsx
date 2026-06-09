import {
  useConversationMessagesQuery,
  useSendConversationMessage,
} from "../hooks/useApi";
import ChannelComposer, { type SendChannelInput } from "./ChannelComposer";

interface Props {
  contactId: string;
  // True when the contact has no phone, so SMS is unavailable (other channels work).
  disabled?: boolean;
}

export default function MessageComposerByContact({ contactId, disabled }: Props) {
  const messages = useConversationMessagesQuery(contactId, true);
  const send = useSendConversationMessage();

  const onSend = (input: SendChannelInput) =>
    send.mutateAsync({ contactId, ...input });

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
