import { useState } from "react";
import Shell from "../components/Shell";
import NavyHero from "../components/NavyHero";
import BottomNav from "../components/BottomNav";
import ChannelList from "../components/comms/ChannelList";
import Roster from "../components/comms/Roster";
import Conversation from "../components/comms/Conversation";
import { useChannels } from "../hooks/useChat";

export default function Comms() {
  const [openChannelId, setOpenChannelId] = useState<string | null>(null);
  const channelsQuery = useChannels(true);
  const openChannel = channelsQuery.data?.channels.find((c) => c.id === openChannelId) ?? null;

  return (
    <Shell>
      {/* Phone: full-screen team surface. The desktop rail (RightRail) covers lg+,
          so this column is the mobile-only experience under lg. */}
      <div className="flex min-h-dvh flex-col lg:hidden">
        {openChannelId ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <Conversation
              channelId={openChannelId}
              title={openChannel?.name || "Conversation"}
              onClose={() => setOpenChannelId(null)}
            />
          </div>
        ) : (
          <>
            <NavyHero>
              <h1 className="font-display text-2xl font-semibold">Team</h1>
              <p className="mt-1 text-sm text-white/70">Channels, DMs, and your roster.</p>
            </NavyHero>
            <main className="flex-1 overflow-y-auto px-3 pb-24 pt-3">
              <ChannelList activeChannelId={openChannelId} onOpenChannel={setOpenChannelId} />
              <div className="my-4 border-t border-[var(--divider)]" />
              <Roster onOpenChannel={setOpenChannelId} />
            </main>
          </>
        )}
      </div>

      {/* lg+: the agency chat now lives in the top-right icon, so the desktop
          route body just points the user there. */}
      <div className="hidden min-h-dvh flex-1 items-center justify-center lg:flex">
        <p className="text-[14px] text-[var(--text-muted)]">
          Chat with the agency from the message icon, top right.
        </p>
      </div>

      <BottomNav active="comms" />
    </Shell>
  );
}
