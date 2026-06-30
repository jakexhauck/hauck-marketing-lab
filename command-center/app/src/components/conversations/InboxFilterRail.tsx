import {
  CHANNELS,
  ORIGINS,
  countByChannel,
  countByOrigin,
  filterConversations,
  type ChannelKey,
  type OriginKey,
} from "../../lib/inboxFilters";
import type { ApiConversation } from "../../lib/api";

export default function InboxFilterRail({
  items,
  channel,
  source,
  onChannel,
  onSource,
}: {
  items: ApiConversation[];
  channel: ChannelKey | "all";
  source: OriginKey | "all";
  onChannel: (c: ChannelKey | "all") => void;
  onSource: (s: OriginKey | "all") => void;
}) {
  // Channel counts use the full set; source counts respect the active channel
  // so the source list reflects what is actually reachable.
  const channelCounts = countByChannel(items);
  const inChannel = filterConversations(items, {
    channel,
    source: "all",
    search: "",
  });
  const originCounts = countByOrigin(inChannel);

  const rowBase =
    "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors";
  const on = "bg-brand-tint text-brand-text font-semibold";
  const off = "text-muted hover:bg-surface-2";

  return (
    <aside className="w-[200px] shrink-0 overflow-y-auto border-r border-border bg-surface p-3">
      <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">
        Channel
      </div>
      <button
        className={`${rowBase} ${channel === "all" ? on : off}`}
        onClick={() => onChannel("all")}
      >
        <span aria-hidden>📥</span> All channels
        <span className="ml-auto text-[11px] font-semibold text-faint">
          {items.length}
        </span>
      </button>
      {CHANNELS.filter(
        (c) => c.key !== "other" || channelCounts.other > 0,
      ).map((c) => (
        <button
          key={c.key}
          className={`${rowBase} ${channel === c.key ? on : off}`}
          onClick={() => onChannel(c.key)}
        >
          <span aria-hidden>{c.icon}</span> {c.label}
          <span className="ml-auto text-[11px] font-semibold text-faint">
            {channelCounts[c.key]}
          </span>
        </button>
      ))}

      <div className="mt-4 px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint">
        Source
      </div>
      <button
        className={`${rowBase} ${source === "all" ? on : off}`}
        onClick={() => onSource("all")}
      >
        <span className="h-2.5 w-2.5 rounded-[3px] bg-faint" aria-hidden /> All
        sources
        <span className="ml-auto text-[11px] font-semibold text-faint">
          {inChannel.length}
        </span>
      </button>
      {ORIGINS.filter((o) => o.key !== "other" || originCounts.other > 0).map(
        (o) => (
          <button
            key={o.key}
            className={`${rowBase} ${source === o.key ? on : off}`}
            onClick={() => onSource(o.key)}
          >
            <span
              className="h-2.5 w-2.5 rounded-[3px]"
              style={{ background: o.swatch }}
              aria-hidden
            />
            {o.label}
            <span className="ml-auto text-[11px] font-semibold text-faint">
              {originCounts[o.key]}
            </span>
          </button>
        ),
      )}
    </aside>
  );
}
