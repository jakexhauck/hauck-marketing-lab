import { useMessagesQuery, useSendLeadMessage } from "../hooks/useApi";
import ChannelComposer, { type SendChannelInput } from "./ChannelComposer";

interface Props {
  leadId: string;
  // True when the lead has no phone, so SMS is unavailable (other channels work).
  disabled?: boolean;
}

export default function MessageComposer({ leadId, disabled }: Props) {
  const messages = useMessagesQuery(leadId, true);
  const send = useSendLeadMessage();

  const onSend = (input: SendChannelInput) =>
    send.mutateAsync({ leadId, ...input });

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
