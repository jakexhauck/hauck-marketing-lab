import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import { Button } from "../ui/Button";
import Avatar from "../Avatar";
import ConversationThread from "../ConversationThread";
import MessageComposer from "../MessageComposer";
import SourceBadge from "./SourceBadge";
import BothChannelNote from "./BothChannelNote";
import { ChannelFilterProvider } from "../../context/ChannelFilterContext";
import { useAuth } from "../../context/AuthContext";
import { useConversationsQuery } from "../../hooks/useApi";
import {
  convOrigin,
  pageChannelFromParam,
  pageChannelOf,
  sendLabelForChannel,
} from "../../lib/inboxFilters";

// The Atelier desktop Conversation thread (lg+). The phone keeps its own
// (NavyHero) full-height layout; this renders only inside `hidden lg:flex`
// from the ConversationDetail route. It reuses the exact same thread,
// composer, channel logic and send mutation as the phone screen, scoped to the
// page channel (SMS or Email).
export default function ConversationDetailDesktop() {
  const { contactId = "" } = useParams<{ contactId: string }>();
  const [searchParams] = useSearchParams();
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
  // The page channel: the explicit ?ch= param wins (set by the list rows and the
  // both-channel note), else the conversation's own channel, else SMS.
  const channel =
    pageChannelFromParam(searchParams.get("ch")) ??
    (conv ? pageChannelOf(conv) : null) ??
    "sms";
  const sendLabel = sendLabelForChannel(channel);

  return (
    <DesktopPage
      title={
        <span className="flex items-center gap-3">
          <Avatar name={name} size="sm" />
          <span className="truncate">{name}</span>
          {conv && <SourceBadge origin={convOrigin(conv)} />}
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
          key={`${contactId}:${channel}`}
          initial={sendLabel}
        >
          <div className="flex min-h-0 flex-1 flex-col rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-6 pb-4 pt-5">
              <BothChannelNote contactId={contactId} channel={channel} />
              <ConversationThread contactId={contactId} fill />
            </div>
            <div className="border-t border-border px-6 py-4">
              <MessageComposer contactId={contactId} lockChannel={sendLabel} />
            </div>
          </div>
        </ChannelFilterProvider>
      </div>
    </DesktopPage>
  );
}
