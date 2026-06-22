import { useState } from "react";
import { MessagesSquare } from "lucide-react";
import ChannelList from "./ChannelList";
import Roster from "./Roster";
import Conversation from "./Conversation";
import { useChannels } from "../../hooks/useChat";

export default function RightRail() {
  const [openChannelId, setOpenChannelId] = useState<string | null>(null);
  const channelsQuery = useChannels(true);

  const openChannel = channelsQuery.data?.channels.find((c) => c.id === openChannelId) ?? null;

  return (
    <aside className="relative hidden h-dvh w-[300px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)] lg:sticky lg:top-0 lg:flex">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <MessagesSquare size={18} style={{ color: "var(--brand-primary)" }} />
        <span className="font-display text-[15px] font-semibold text-[var(--text)]">Team</span>
      </div>

      {/* List column: channels then roster, single scroll. */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <ChannelList activeChannelId={openChannelId} onOpenChannel={setOpenChannelId} />
        <div className="my-3 border-t border-[var(--divider)]" />
        <Roster onOpenChannel={setOpenChannelId} />
      </div>

      {/* Conversation overlay: covers the rail when a channel or DM is open. */}
      {openChannelId && (
        <div className="absolute inset-0 z-10 bg-[var(--bg)]">
          <Conversation
            channelId={openChannelId}
            title={openChannel?.name || "Conversation"}
            onClose={() => setOpenChannelId(null)}
          />
        </div>
      )}
    </aside>
  );
}
