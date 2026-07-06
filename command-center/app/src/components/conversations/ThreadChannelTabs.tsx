import { useConversationMessagesQuery } from "../../hooks/useApi";
import { useChannelFilter } from "../../context/ChannelFilterContext";
import MessageComposer from "../MessageComposer";

const CHANNELS = ["SMS", "Email"] as const;
type Channel = (typeof CHANNELS)[number];

function useActiveChannel(contactId: string): {
  active: Channel;
  select: (c: string) => void;
  counts: Record<Channel, number>;
} {
  const { data } = useConversationMessagesQuery(contactId, Boolean(contactId));
  const { selected, select } = useChannelFilter();
  const def = data?.defaultChannel === "Email" ? "Email" : "SMS";
  const active: Channel = selected === "Email" ? "Email" : selected === "SMS" ? "SMS" : def;
  const counts: Record<Channel, number> = { SMS: 0, Email: 0 };
  for (const m of data?.messages ?? []) {
    if (m.type === "SMS") counts.SMS += 1;
    else if (m.type === "Email") counts.Email += 1;
  }
  return { active, select, counts };
}

// The two-thread selector for one contact: SMS and Email are separate threads,
// each with its own reply box. Tapping a tab retargets both the history shown
// (via ChannelFilterContext) and the composer below. Rendered inside a
// ChannelFilterProvider.
export default function ThreadChannelTabs({ contactId }: { contactId: string }) {
  const { active, select, counts } = useActiveChannel(contactId);
  return (
    <div className="flex shrink-0 gap-1.5">
      {CHANNELS.map((c) => {
        const on = active === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => select(c)}
            aria-pressed={on}
            className={
              "flex flex-1 items-center justify-center gap-2 rounded-[10px] border px-3 py-2.5 font-display text-[13px] font-semibold transition-colors " +
              (on
                ? "border-brand bg-brand text-white"
                : "border-border bg-surface-2 text-muted hover:text-text")
            }
          >
            {c}
            <span
              className={
                "tnum rounded-full px-2 py-0.5 text-[10.5px] " +
                (on ? "bg-white/25 text-white" : "bg-surface-3 text-faint")
              }
            >
              {counts[c]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// The reply box, locked to whichever thread tab is active. No channel chips of
// its own: the tabs above are the only switch, so a text can never go out as an
// email or vice versa.
export function ActiveChannelComposer({ contactId }: { contactId: string }) {
  const { active } = useActiveChannel(contactId);
  return <MessageComposer contactId={contactId} lockChannel={active} />;
}
