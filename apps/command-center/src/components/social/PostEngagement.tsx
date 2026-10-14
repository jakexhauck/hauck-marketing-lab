import { Heart, MessageCircle, CornerDownRight, Send } from "lucide-react";
import { REPLY_WRITE_READY } from "../../routes/social/shared";

export interface PostComment {
  id: string;
  author: string;
  text: string;
  when: string;
}

// Per-post engagement (likes + comments) with a gated reply affordance, shown
// under a posted item on My Posts. Real likes/comments are not fetchable until
// the engagement source is wired (see routes/social/shared), so a real posted
// item passes no data and shows an honest "connecting your accounts" note.
// Replying is a separate write gated on REPLY_WRITE_READY: until it is confirmed
// the reply box is read-only with a "coming soon" note. We never fake a send.
export default function PostEngagement({
  demo,
  likes,
  comments,
}: {
  demo: boolean;
  likes?: number;
  comments?: PostComment[];
}) {
  const list = comments ?? [];
  const hasData = demo && (list.length > 0 || likes != null);

  if (!hasData) {
    return (
      <div className="border-t border-divider bg-surface-2 px-4 py-4 text-[12.5px] text-faint">
        We're connecting your accounts to pull likes and comments. Your post
        engagement will show up here soon.
      </div>
    );
  }

  return (
    <div className="border-t border-divider bg-surface-2 px-4 py-3.5">
      <div className="mb-3 flex items-center gap-4 text-[12.5px] text-muted">
        <span className="flex items-center gap-1.5">
          <Heart size={14} className="text-faint" /> {likes ?? 0} likes
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle size={14} className="text-faint" /> {list.length} comments
        </span>
      </div>

      {list.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {list.map((c) => (
            <li key={c.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-semibold text-text">{c.author}</span>
                <span className="text-[11px] text-faint">{c.when}</span>
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{c.text}</p>
              <div className="mt-2.5 flex items-center gap-2">
                <div className="flex flex-1 items-center gap-1.5 text-faint">
                  <CornerDownRight size={13} className="shrink-0" />
                  <input
                    type="text"
                    disabled
                    placeholder="Reply to this comment"
                    className="w-full flex-1 rounded-lg border border-border-strong bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none placeholder:text-faint disabled:cursor-not-allowed"
                  />
                </div>
                <button
                  type="button"
                  disabled={!REPLY_WRITE_READY}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-strong text-faint disabled:opacity-50"
                  aria-label="Send reply"
                >
                  <Send size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-faint">No comments yet.</p>
      )}

      {!REPLY_WRITE_READY && list.length > 0 && (
        <p className="mt-3 text-[11px] text-faint">Replies coming soon.</p>
      )}
    </div>
  );
}
