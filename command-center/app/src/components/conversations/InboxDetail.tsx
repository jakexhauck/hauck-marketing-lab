import Avatar from "../Avatar";
import ConversationThread from "../ConversationThread";
import SourceBadge from "./SourceBadge";
import ThreadChannelTabs, { ActiveChannelComposer } from "./ThreadChannelTabs";
import { ChannelFilterProvider } from "../../context/ChannelFilterContext";
import { convOrigin } from "../../lib/inboxFilters";
import type { ApiConversation } from "../../lib/api";

// The right pane of the desktop inbox. One contact, two threads: SMS and Email
// sit on their own tabs (ThreadChannelTabs), each reading and sending over its
// own medium. The lead is a single row in the list, so the two threads never
// drift into two separate conversations with the same person.
//
// `stageLabel` overrides the stage shown under the name. `conv.stageName` is
// whichever single opportunity the backend chose, so on a page scoped to ONE
// pipeline (Reviews Chats) it would show the contact's Sales stage instead of
// the stage that page is about. Defaults to conv.stageName for the Inbox.
export default function InboxDetail({
  conv,
  stageLabel,
}: {
  conv: ApiConversation | null;
  stageLabel?: string;
}) {
  if (!conv) {
    return (
      <section className="flex flex-1 items-center justify-center bg-brand-bg">
        <p className="text-[13px] text-faint">
          Select a conversation to read it.
        </p>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-brand-bg">
      <div className="border-b border-border bg-surface px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Avatar name={conv.name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[16px] font-semibold text-text">
              {conv.name}
            </div>
            {(stageLabel ?? conv.stageName) && (
              <div className="mt-0.5 truncate text-[11.5px] text-faint">
                {stageLabel ?? conv.stageName}
              </div>
            )}
          </div>
          <SourceBadge origin={convOrigin(conv)} />
        </div>
      </div>

      <ChannelFilterProvider key={conv.contactId} initial={null}>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 pb-3 pt-4">
          <ThreadChannelTabs contactId={conv.contactId} />
          <ConversationThread contactId={conv.contactId} fill />
        </div>
        <div className="border-t border-border bg-surface px-6 py-3.5">
          <ActiveChannelComposer contactId={conv.contactId} />
        </div>
      </ChannelFilterProvider>
    </section>
  );
}
