import { useMemo, useState } from "react";
import Avatar from "../Avatar";
import SourceBadge from "./SourceBadge";
import { convOrigin } from "../../lib/inboxFilters";
import {
  groupConversations,
  type StageGroupKey,
} from "../../lib/stageGroups";
import { useNow } from "../../context/NowContext";
import { timeAgo } from "../../lib/timeAgo";
import type { ApiConversation } from "../../lib/api";

type SourceFilter = "all" | "organic" | "facebook";

const ORGANIC_ORIGINS = new Set(["form", "chat", "call", "react"]);

function matchesSource(conv: ApiConversation, filter: SourceFilter): boolean {
  if (filter === "all") return true;
  const o = convOrigin(conv);
  return filter === "facebook" ? o === "paid" : ORGANIC_ORIGINS.has(o);
}

// The unified inbox list: every conversation bucketed under its pipeline-stage
// group, in funnel order. Source (organic vs Facebook) is a subtle tag on each
// row; the stage group is the loud, organizing element. Works full-width on the
// phone and inside the desktop's fixed left column.
export default function StageGroupList({
  items,
  selectedId,
  onOpen,
  search = "",
}: {
  items: ApiConversation[];
  selectedId: string | null;
  onOpen: (contactId: string) => void;
  search?: string;
}) {
  const now = useNow();
  const [source, setSource] = useState<SourceFilter>("all");
  const [collapsed, setCollapsed] = useState<Partial<Record<StageGroupKey, boolean>>>({});

  const counts = useMemo(() => {
    let organic = 0;
    let facebook = 0;
    for (const c of items) {
      if (convOrigin(c) === "paid") facebook += 1;
      else if (ORGANIC_ORIGINS.has(convOrigin(c))) organic += 1;
    }
    return { all: items.length, organic, facebook };
  }, [items]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = items.filter((c) => {
      if (!matchesSource(c, source)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q)
      );
    });
    return groupConversations(filtered).filter((g) => g.items.length > 0);
  }, [items, source, search]);

  const chips: { key: SourceFilter; label: string; count: number; dot?: string }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "organic", label: "Organic", count: counts.organic, dot: "#16a34a" },
    { key: "facebook", label: "Facebook", count: counts.facebook, dot: "#2563eb" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Source filter */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-3 pt-1">
        {chips.map((c) => {
          const on = source === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setSource(c.key)}
              className={
                "flex items-center gap-1.5 rounded-full border px-3 py-1 font-display text-[12px] font-semibold transition-colors " +
                (on
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-surface text-muted hover:text-text")
              }
            >
              {c.dot && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: on ? "currentColor" : c.dot }}
                />
              )}
              {c.label}
              <span className="tnum opacity-60">{c.count}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="px-4 py-16 text-center text-[13px] text-faint">
            No conversations match.
          </p>
        ) : (
          groups.map((g) => {
            const isCollapsed = collapsed[g.meta.key] ?? g.meta.defaultCollapsed;
            const oldest = g.items[g.items.length - 1];
            const oldestUnread = g.items.some((i) => i.unreadCount > 0);
            return (
              <section key={g.meta.key}>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((s) => ({ ...s, [g.meta.key]: !isCollapsed }))
                  }
                  className="sticky top-0 z-[1] flex w-full items-center gap-2.5 border-b border-t border-divider bg-surface-2 px-4 py-2.5 text-left"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={
                      "text-faint transition-transform " +
                      (isCollapsed ? "-rotate-90" : "")
                    }
                    aria-hidden
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: g.meta.swatch }}
                  />
                  <span className="font-display text-[12.5px] font-bold text-text">
                    {g.meta.label}
                  </span>
                  <span className="tnum rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-faint">
                    {g.items.length}
                  </span>
                  {oldestUnread && oldest && (
                    <span className="ml-auto text-[10.5px] text-faint">
                      oldest waiting {timeAgo(oldest.lastMessageAt, now)}
                    </span>
                  )}
                </button>

                {!isCollapsed && (
                  <ul>
                    {g.items.map((c) => (
                      <li key={c.id}>
                        <ConversationRow
                          conv={c}
                          now={now}
                          active={c.contactId === selectedId}
                          onOpen={() => onOpen(c.contactId)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  conv,
  now,
  active,
  onOpen,
}: {
  conv: ApiConversation;
  now: number;
  active: boolean;
  onOpen: () => void;
}) {
  const hasUnread = conv.unreadCount > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={
        "relative flex w-full gap-3 border-b border-divider py-3 pl-5 pr-4 text-left transition-colors " +
        (active ? "bg-brand-tint" : "hover:bg-surface-2")
      }
    >
      {active && (
        <span className="absolute inset-y-0 left-0 w-[3px] bg-brand" aria-hidden />
      )}
      <Avatar name={conv.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={
              "min-w-0 flex-1 truncate font-display text-[14px] text-text " +
              (hasUnread ? "font-bold" : "font-semibold")
            }
          >
            {conv.name}
          </span>
          <span
            className={
              "tnum shrink-0 text-[11px] " +
              (hasUnread ? "font-bold text-brand" : "text-faint")
            }
          >
            {timeAgo(conv.lastMessageAt, now)}
          </span>
        </div>
        <div
          className={
            "mt-1 truncate text-[12.5px] " +
            (hasUnread ? "text-text" : "text-muted")
          }
        >
          {conv.preview || "No recent message"}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <SourceBadge origin={convOrigin(conv)} size="sm" />
        </div>
      </div>
    </button>
  );
}
