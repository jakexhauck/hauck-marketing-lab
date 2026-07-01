import ConversationInbox, {
  type InboxConfig,
} from "../../components/sales/ConversationInbox";
import { useChatWidget } from "../../hooks/useChatWidget";

// The Chat Widget surface: a conversation inbox over inbound website-chat leads
// (Organic Pipeline, source = "chat widget"). It is the shared ConversationInbox
// with chat-flavoured copy + the chat dataset — the twin of Estimate Forms,
// which is the same surface with source = "Website Form".

const CHAT_CONFIG: InboxConfig = {
  title: "Chat Widget",
  description: "Conversations from your website chat widget, with auto follow-up.",
  countLabel: (n) => `${n} chats · auto follow-up`,
  emptyTitle: "No chats yet",
  emptyBody:
    "When someone messages your website chat widget, they will show up here with their reply, ready to call.",
  notConnectedMessage:
    "Conversations from your website chat widget land here automatically once your chat widget and phone are connected.",
  gatedNote: "This turns on once your chat widget and phone are connected.",
};

export default function ChatWidget() {
  const data = useChatWidget();
  return <ConversationInbox config={CHAT_CONFIG} data={data} />;
}
