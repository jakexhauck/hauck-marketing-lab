import {
  ArrowLeft,
  MessageSquare,
  Mail,
  Phone,
  StickyNote,
} from "lucide-react";
import type { ApiConversation } from "@hauck/core";
import { cn } from "@/lib/cn";
import { useToast } from "@/context/ToastContext";
import {
  useConversationMessagesQuery,
  useSendConversationMessage,
} from "@/hooks/useApi";
import { Avatar, ErrorState } from "@/components/ui";
import { MessageThread } from "@/components/shared/MessageThread";
import { Composer } from "@/components/shared/Composer";

function channelLabel(type: string) {
  const t = (type || "").toLowerCase();
  if (t.includes("email")) return { Icon: Mail, label: "Email" };
  if (t.includes("call")) return { Icon: Phone, label: "Call" };
  if (t.includes("note") || t.includes("activity"))
    return { Icon: StickyNote, label: "Note" };
  if (t.includes("sms")) return { Icon: MessageSquare, label: "SMS" };
  return { Icon: MessageSquare, label: "Message" };
}

export function ThreadPanel({
  convo,
  contactId,
  onBack,
  className,
}: {
  convo: ApiConversation | undefined;
  contactId: string;
  onBack?: () => void;
  className?: string;
}) {
  const { toast } = useToast();
  const messagesQuery = useConversationMessagesQuery(contactId);
  const sendMutation = useSendConversationMessage();

  const data = messagesQuery.data;
  const messages = data?.messages ?? [];
  const name = convo?.name || "Conversation";
  const { Icon, label } = channelLabel(convo?.lastMessageType ?? "");

  async function handleSend(vars: {
    body: string;
    channel: string;
    subject?: string;
  }) {
    try {
      await sendMutation.mutateAsync({ contactId, ...vars });
    } catch {
      toast("Message failed to send. Please try again.", "error");
    }
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-bg",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to conversations"
            className="-ml-1 rounded-[var(--radius-sm)] p-1.5 text-muted hover:bg-surface-2 hover:text-text"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <Avatar name={name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[15px] leading-tight text-text">
            {name}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-faint">
            <Icon size={12} />
            <span className="label-cap">{label}</span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {messagesQuery.isError ? (
          <ErrorState
            title="Couldn't load messages"
            description="This thread failed to load. Try again."
            onRetry={() => messagesQuery.refetch()}
          />
        ) : (
          <MessageThread
            messages={messages}
            loading={messagesQuery.isLoading}
          />
        )}
      </div>

      <Composer
        availableChannels={data?.availableChannels}
        defaultChannel={data?.defaultChannel}
        onSend={handleSend}
        sending={sendMutation.isPending}
        disabled={messagesQuery.isError}
      />
    </div>
  );
}
