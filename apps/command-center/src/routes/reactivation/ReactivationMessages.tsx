import { useMemo, useState } from "react";
import { MessageSquareText } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { REACTIVATION_TABS } from "../../lib/pageTabs";
import { Panel, EmptyState, Segmented, type SegmentOption } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { PAGE_CONTAINER } from "../../lib/layout";
import { useReactivationMessages } from "../../hooks/useReactivationMessages";
import { ChannelChip, ChannelGlyph, NotConnectedNotice } from "../campaigns/shared";

// Reactivation > Messages: a READ-ONLY view of the recent texts and emails the
// win-back campaign exchanges with dormant customers. We do the sending; the
// client just reads what went out here. Customer language only, never name any
// internal tool. Populated in demo/preview via `?demo=1`; a real session shows
// the honest empty state until reactivation messages are flowing.
//
// TODO(wiring): the real endpoint scopes conversations to reactivation-origin
// contacts (source/tags match "reactivat|win-back|dormant"). If a tenant tags
// its win-back customers differently, this reads empty until the origin rule or
// tagging is aligned. Verify against a live Willis session.

type Filter = "all" | "sms" | "email";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ReactivationMessages() {
  const { session } = useAuth();
  const { data } = useReactivationMessages(Boolean(session));
  const [filter, setFilter] = useState<Filter>("all");

  const messages = data?.messages ?? [];
  const populated = messages.length > 0;

  const counts = useMemo(
    () => ({
      all: messages.length,
      sms: messages.filter((m) => m.channel === "sms").length,
      email: messages.filter((m) => m.channel === "email").length,
    }),
    [messages],
  );

  const shown = useMemo(
    () => (filter === "all" ? messages : messages.filter((m) => m.channel === filter)),
    [messages, filter],
  );

  const filterOptions: SegmentOption<Filter>[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "sms", label: "SMS", count: counts.sms },
    { value: "email", label: "Email", count: counts.email },
  ];

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageBar
          tabs={REACTIVATION_TABS}
          actions={
            populated ? (
              <Segmented options={filterOptions} value={filter} onChange={setFilter} size="sm" />
            ) : undefined
          }
        />

        {!populated ? (
          <>
            <NotConnectedNotice message="Once we start reaching out to your dormant customers, the texts and emails we send will appear here." />
            <Panel className="overflow-hidden">
              <div className="px-4 py-10">
                <EmptyState
                  icon={<MessageSquareText size={22} />}
                  title="No messages yet"
                  description="When the win-back campaign starts texting and emailing your past customers, you'll see those messages here."
                />
              </div>
            </Panel>
          </>
        ) : (
          <Panel className="overflow-hidden">
            <ul>
              {shown.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start gap-3 border-b border-divider px-4 py-3.5 last:border-b-0"
                >
                  <ChannelGlyph ch={m.channel} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate font-display text-[14px] text-text">{m.name}</div>
                      <div className="shrink-0 text-[12px] text-faint">{formatWhen(m.at)}</div>
                    </div>
                    <div className="mt-1 truncate text-[13px] leading-snug text-muted">{m.preview}</div>
                    <div className="mt-1.5">
                      <ChannelChip ch={m.channel} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </Shell>
  );
}
