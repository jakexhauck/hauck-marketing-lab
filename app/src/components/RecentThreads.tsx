import { useMemo, useState } from "react";
import type { ChatSummary } from "../lib/types";

type Props = {
  chats: ChatSummary[];
  onOpen: (chat: ChatSummary) => void;
};

type DateWindow = "all" | "7d" | "30d" | "90d";

const WINDOW_OPTIONS: { key: DateWindow; label: string }[] = [
  { key: "all", label: "All" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
];

const WINDOW_DAYS: Record<DateWindow, number | null> = {
  all: null,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function relativeTime(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "YDAY";
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function agentKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function agentLabel(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "UNKNOWN";
  return v.toUpperCase();
}

export function RecentThreads({ chats, onOpen }: Props) {
  const [query, setQuery] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [window, setWindow] = useState<DateWindow>("all");

  const agentOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of chats) {
      const key = agentKey(c.agent);
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, agentLabel(c.agent));
    }
    return Array.from(seen.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [chats]);

  const trimmedQuery = query.trim().toLowerCase();
  const hasFilters =
    trimmedQuery.length > 0 || selectedAgents.length > 0 || window !== "all";

  const filtered = useMemo(() => {
    if (!hasFilters) return chats;
    const days = WINDOW_DAYS[window];
    const cutoff = days === null ? null : Date.now() - days * 86400000;
    return chats.filter((c) => {
      if (trimmedQuery) {
        const title = c.title?.toLowerCase() ?? "";
        const preview = c.preview?.toLowerCase() ?? "";
        if (!title.includes(trimmedQuery) && !preview.includes(trimmedQuery)) {
          return false;
        }
      }
      if (selectedAgents.length > 0) {
        const key = agentKey(c.agent);
        if (!selectedAgents.includes(key)) return false;
      }
      if (cutoff !== null) {
        const t = new Date(c.modified_at).getTime();
        if (Number.isNaN(t) || t < cutoff) return false;
      }
      return true;
    });
  }, [chats, trimmedQuery, selectedAgents, window, hasFilters]);

  const visible = hasFilters ? filtered : filtered.slice(0, 5);

  const toggleAgent = (key: string) => {
    setSelectedAgents((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const clearFilters = () => {
    setQuery("");
    setSelectedAgents([]);
    setWindow("all");
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">▸ RECENT THREADS</span>
        <span className="panel-meta">
          {hasFilters ? (
            <>
              {filtered.length} {filtered.length === 1 ? "match" : "matches"}
              <button
                type="button"
                className="feed-clear"
                onClick={clearFilters}
              >
                CLEAR
              </button>
            </>
          ) : null}
        </span>
      </div>

      <div className="feed-filters">
        <input
          className="feed-search"
          type="text"
          placeholder="Search threads…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="feed-filter-row">
          {agentOptions.length > 0 && (
            <div className="feed-filter-group">
              {agentOptions.map((a) => {
                const active = selectedAgents.includes(a.key);
                return (
                  <button
                    type="button"
                    key={a.key}
                    className={`chip feed-filter-pill ${active ? "featured" : ""}`}
                    onClick={() => toggleAgent(a.key)}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
          )}
          <div className="feed-filter-group feed-filter-window">
            {WINDOW_OPTIONS.map((opt) => {
              const active = window === opt.key;
              return (
                <button
                  type="button"
                  key={opt.key}
                  className={`chip feed-filter-pill ${active ? "featured" : ""}`}
                  onClick={() => setWindow(opt.key)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {chats.length === 0 ? (
        <div className="feed-empty">No threads yet — your first chat will appear here.</div>
      ) : visible.length === 0 ? (
        <div className="feed-empty">No threads match your filters.</div>
      ) : (
        <ul className="feed-list">
          {visible.map((c) => (
            <li
              key={c.path}
              className="feed-item clickable"
              onClick={() => onOpen(c)}
            >
              <span className="feed-time">{relativeTime(c.modified_at)}</span>
              <span className="feed-msg">
                <strong>{c.title}</strong>
                {c.preview && <div className="feed-quote">"{c.preview}"</div>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
