import type { ChatSummary } from "../lib/types";

type Props = {
  chats: ChatSummary[];
  onOpen: (chat: ChatSummary) => void;
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

export function RecentThreads({ chats, onOpen }: Props) {
  const recent = chats.slice(0, 5);
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">▸ RECENT THREADS</span>
      </div>
      {recent.length === 0 ? (
        <div className="feed-empty">No threads yet — your first chat will appear here.</div>
      ) : (
        <ul className="feed-list">
          {recent.map((c) => (
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
