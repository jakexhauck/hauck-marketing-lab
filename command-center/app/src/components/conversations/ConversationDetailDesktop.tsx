import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import { Button } from "../ui/Button";
import Avatar from "../Avatar";
import ConversationThread from "../ConversationThread";
import MessageComposer from "../MessageComposer";
import SourceBadge from "./SourceBadge";
import OtherChannelNote from "./OtherChannelNote";
import { ChannelFilterProvider } from "../../context/ChannelFilterContext";
import {
  channelKeyToType,
  convOrigin,
  otherInboxChannel,
} from "../../lib/inboxFilters";
import { useAuth } from "../../context/AuthContext";
import { useConversationsQuery } from "../../hooks/useApi";

// The Atelier desktop Conversation thread (lg+). The phone keeps its own
// (NavyHero) full-height layout; this renders only inside `hidden lg:flex`
// from the ConversationDetail route. It reuses the exact same thread,
// composer, channel logic and send mutation as the phone screen.
export default function ConversationDetailDesktop() {
  const { contactId = "" } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const channel = searchParams.get("ch") === "email" ? "email" : "sms";
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
  const otherChannel = otherInboxChannel(
    listQuery.data?.conversations ?? [],
    contactId,
    channel,
  );

  return (
    <DesktopPage
      title={
        <span className="flex items-center gap-3">
          <Avatar name={name} size="sm" />
          <span className="truncate">{name}</span>
          {conv && <SourceBadge origin={convOrigin(conv)} size="sm" />}
        </span>
      }
      actions={
        <Button
          variant="secondary"
          onClick={() => navigate(`/conversations/${channel}`)}
        >
          <ArrowLeft size={16} />
          Inbox
        </Button>
      }
    >
      {/* A readable centered column; the thread scrolls, the composer pins to
          the bottom of the content area. The header (64px) plus DesktopPage's
          vertical padding (28px top + 28px bottom) are subtracted so the
          column fills the viewport without spilling. */}
      <div
        className="mx-auto flex w-full max-w-3xl flex-col"
        style={{ height: "calc(100dvh - 64px - 56px)" }}
      >
        <ChannelFilterProvider
          key={contactId}
          initial={channelKeyToType(channel)}
        >
          <div className="flex min-h-0 flex-1 flex-col rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-6 pb-4 pt-5">
              {otherChannel && (
                <OtherChannelNote contactId={contactId} other={otherChannel} />
              )}
              <ConversationThread contactId={contactId} fill />
            </div>
            <div className="border-t border-border px-6 py-4">
              <MessageComposer contactId={contactId} />
            </div>
          </div>
        </ChannelFilterProvider>
      </div>
    </DesktopPage>
  );
}
