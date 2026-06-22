import { Hash, AtSign, ShieldCheck } from "lucide-react";
import { cn } from "../../lib/cn";
import { useChannels, useOpenHauck } from "../../hooks/useChat";
import { useAuth } from "../../context/AuthContext";
import type { ChatChannel } from "../../lib/api";

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none text-[var(--brand-fg)]"
      style={{ background: "var(--brand-primary)" }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function ChannelRow({
  channel,
  active,
  onOpen,
  icon: Icon,
}: {
  channel: ChatChannel;
  active: boolean;
  onOpen: (id: string) => void;
  icon: typeof Hash;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(channel.id)}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] font-medium transition-colors",
        active
          ? "text-[var(--brand-text)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
      )}
      style={active ? { background: "var(--brand-primary-tint)" } : undefined}
    >
      <Icon size={15} className="shrink-0 opacity-70" />
      <span className="truncate">{channel.name || "Untitled"}</span>
      <UnreadBadge count={channel.unread} />
    </button>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
      {children}
    </div>
  );
}

export default function ChannelList({
  activeChannelId,
  onOpenChannel,
}: {
  activeChannelId: string | null;
  onOpenChannel: (id: string) => void;
}) {
  const { isOwner } = useAuth();
  const channelsQuery = useChannels(true);
  const openHauck = useOpenHauck();

  const channels = channelsQuery.data?.channels ?? [];
  const roomChannels = channels.filter((c) => c.kind === "channel");
  const dmChannels = channels.filter((c) => c.kind === "dm");

  // The Hauck line is offered to the owner only in this phase (Phase 07 adds
  // can_contact_hauck per staff member). Gate on isOwner so it never flickers.
  const canContactHauck = isOwner;

  return (
    <div className="flex flex-col">
      <SectionLabel>Channels</SectionLabel>
      {roomChannels.length === 0 ? (
        <div className="px-2.5 py-1 text-[12.5px] text-[var(--text-faint)]">No channels yet.</div>
      ) : (
        roomChannels.map((c) => (
          <ChannelRow
            key={c.id}
            channel={c}
            active={c.id === activeChannelId}
            onOpen={onOpenChannel}
            icon={Hash}
          />
        ))
      )}

      <SectionLabel>Direct Messages</SectionLabel>
      {dmChannels.length === 0 ? (
        <div className="px-2.5 py-1 text-[12.5px] text-[var(--text-faint)]">
          Pick someone in the roster to start a chat.
        </div>
      ) : (
        dmChannels.map((c) => (
          <ChannelRow
            key={c.id}
            channel={c}
            active={c.id === activeChannelId}
            onOpen={onOpenChannel}
            icon={AtSign}
          />
        ))
      )}

      {canContactHauck && (
        <>
          <SectionLabel>Direct line</SectionLabel>
          <button
            type="button"
            disabled={openHauck.isPending}
            onClick={() => {
              // No-op-safe: if /api/chat/hauck is not live yet (Phase 07) the mutation
              // rejects and onError surfaces it; the UI just stays put.
              openHauck.mutate(undefined, {
                onSuccess: (data) => onOpenChannel(data.channel.id),
              });
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-50"
          >
            <ShieldCheck size={15} className="shrink-0" style={{ color: "var(--brand-primary)" }} />
            <span className="truncate">Message Jake Hauck</span>
          </button>
        </>
      )}
    </div>
  );
}
