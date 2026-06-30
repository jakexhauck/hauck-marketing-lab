import Avatar from "../Avatar";
import ConversationThread from "../ConversationThread";
import MessageComposer from "../MessageComposer";
import SourceBadge from "./SourceBadge";
import { ChannelFilterProvider } from "../../context/ChannelFilterContext";
import {
  CHANNEL_BY_KEY,
  convChannel,
  convOrigin,
  ORIGIN_BY_KEY,
} from "../../lib/inboxFilters";
import type { ApiConversation } from "../../lib/api";

function firstTouchLabel(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function InboxDetail({ conv }: { conv: ApiConversation | null }) {
  if (!conv) {
    return (
      <section className="flex flex-1 items-center justify-center bg-brand-bg">
        <p className="text-[13px] text-faint">
          Select a conversation to read it.
        </p>
      </section>
    );
  }

  const origin = convOrigin(conv);
  const channelMeta = CHANNEL_BY_KEY[convChannel(conv)];
  const originMeta = ORIGIN_BY_KEY[origin];
  const touch = firstTouchLabel(conv.firstTouchAt);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-brand-bg">
      <div className="border-b border-border bg-surface px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Avatar name={conv.name} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-display text-[16px] font-semibold text-text">
              {conv.name}
            </div>
            <div className="mt-0.5 text-[11.5px] text-muted">
              {channelMeta.icon} {channelMeta.label}
            </div>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5 rounded-[11px] border border-brand-primary/15 bg-brand-tint/50 px-3 py-2">
          <SourceBadge origin={origin} />
          <span className="text-[11.5px] text-muted">
            First touch via <b className="text-text">{originMeta.label}</b>
            {touch ? ` . ${touch}` : ""}
            {conv.source ? ` . ${conv.source}` : ""}
          </span>
        </div>
      </div>

      <ChannelFilterProvider key={conv.contactId}>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-6 pb-3 pt-4">
          <ConversationThread contactId={conv.contactId} fill />
        </div>
        <div className="border-t border-border bg-surface px-6 py-3.5">
          <MessageComposer contactId={conv.contactId} />
        </div>
      </ChannelFilterProvider>
    </section>
  );
}
