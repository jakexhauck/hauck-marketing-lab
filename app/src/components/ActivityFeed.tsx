import type { ChatSummary } from "../lib/types";

type Props = {
  chats: ChatSummary[];
  knowledgeCount: number;
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
  if (days < 7) return `${days}d`;
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function ActivityFeed({ chats, knowledgeCount }: Props) {
  const recent = chats.slice(0, 5);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">▸ ACTIVITY · MEDIA-BUYING/</span>
        <span className="panel-meta">
          {knowledgeCount} chunks · refresh on focus
        </span>
      </div>

      {recent.length === 0 ? (
        <div className="feed-empty">
          No chats yet. Open the chat drawer to start the first conversation —
          it will save to <code>chats/</code> as a markdown file.
        </div>
      ) : (
        <ul className="feed-list">
          {recent.map((c) => {
            const agent = c.agent ?? "agent";
            const path = c.path.split(/[\\/]/).slice(-2).join("/");
            return (
              <li key={c.path} className="feed-item">
                <span className="feed-time">{relativeTime(c.modified_at)}</span>
                <span className="feed-msg">
                  <span className="agent">{agent.toUpperCase()}</span>{" "}
                  <strong>{c.title}</strong>
                  <div className="feed-path">› {path}</div>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
