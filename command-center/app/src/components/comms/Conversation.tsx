import { useEffect, useRef, useState } from "react";
import { X, Pencil, Trash2, FileText } from "lucide-react";
import Avatar from "../Avatar";
import Composer from "./Composer";
import {
  useChannelMessages,
  useMarkRead,
  useEditMessage,
  useDeleteMessage,
} from "../../hooks/useChat";
import { useAuth } from "../../context/AuthContext";
import { useChat } from "../../context/ChatContext";
import type { ChatAttachment, ChatMessageDTO } from "../../lib/api";

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function AttachmentView({ a }: { a: ChatAttachment }) {
  const isImage = a.mimeType.startsWith("image/");
  if (isImage) {
    // Phase 08 swaps this for the signed download URL. Until then we render the
    // metadata frame so the layout is correct; no network fetch happens here.
    return (
      <div className="mt-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
        <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-[var(--text-muted)]">
          <FileText size={14} /> {a.fileName}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-1 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-[12.5px] text-[var(--text-muted)]">
      <FileText size={14} /> {a.fileName}
    </div>
  );
}

function MessageRow({
  msg,
  canEdit,
  canDelete,
}: {
  msg: ChatMessageDTO;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.body);
  const editMessage = useEditMessage();
  const deleteMessage = useDeleteMessage();

  if (msg.deletedAt) {
    return (
      <div className="px-3 py-1.5 text-[13px] italic text-[var(--text-faint)]">
        message deleted
      </div>
    );
  }

  return (
    <div className="group flex gap-2.5 px-3 py-1.5 hover:bg-[var(--surface-2)]">
      <Avatar name={msg.senderName} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[13.5px] font-semibold text-[var(--text)]">{msg.senderName}</span>
          <span className="text-[11px] text-[var(--text-faint)]">{timeLabel(msg.createdAt)}</span>
          {msg.editedAt && <span className="text-[11px] text-[var(--text-faint)]">(edited)</span>}
        </div>

        {editing ? (
          <div className="mt-1 flex flex-col gap-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              className="resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[14px] text-[var(--text)] focus:border-[var(--brand-primary)] focus:outline-none"
            />
            <div className="flex gap-2 text-[12.5px]">
              <button
                type="button"
                onClick={() => {
                  const text = draft.trim();
                  if (text && text !== msg.body) {
                    editMessage.mutate({ messageId: msg.id, channelId: msg.channelId, body: text });
                  }
                  setEditing(false);
                }}
                className="font-semibold"
                style={{ color: "var(--brand-primary)" }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(msg.body);
                  setEditing(false);
                }}
                className="text-[var(--text-muted)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="whitespace-pre-wrap break-words text-[14px] text-[var(--text)]">{msg.body}</div>
            {msg.attachments.map((a) => (
              <AttachmentView key={a.id} a={a} />
            ))}
          </>
        )}
      </div>

      {(canEdit || canDelete) && !editing && (
        <div className="flex shrink-0 items-start gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit message"
              className="rounded p-1 text-[var(--text-faint)] hover:text-[var(--text)]"
            >
              <Pencil size={14} />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => deleteMessage.mutate({ messageId: msg.id, channelId: msg.channelId })}
              aria-label="Delete message"
              className="rounded p-1 text-[var(--text-faint)] hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Conversation({
  channelId,
  title,
  onClose,
}: {
  channelId: string;
  title: string;
  onClose?: () => void;
}) {
  const { isOwner } = useAuth();
  const { me } = useChat();
  const messagesQuery = useChannelMessages(channelId, true);
  const markRead = useMarkRead();
  const endRef = useRef<HTMLDivElement>(null);

  const messages = messagesQuery.data?.messages ?? [];

  // Clear unread when the channel is open and whenever new messages land.
  useEffect(() => {
    if (messages.length > 0) markRead.mutate({ channelId });
    // markRead identity is stable; channelId drives the re-run when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, messages.length]);

  // Keep the latest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg)]">
      <header className="flex items-center gap-2 border-b border-[var(--divider)] bg-[var(--surface)] px-3 py-2.5">
        <h2 className="truncate font-display text-[15px] font-semibold text-[var(--text)]">{title}</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close conversation"
            className="ml-auto rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <X size={18} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto py-2">
        {messagesQuery.isLoading ? (
          <div className="px-3 py-6 text-[13px] text-[var(--text-faint)]">Loading messages.</div>
        ) : messages.length === 0 ? (
          <div className="px-3 py-6 text-[13px] text-[var(--text-faint)]">
            No messages yet. Say hello.
          </div>
        ) : (
          messages.map((m) => {
            const isAuthor =
              me?.kind === m.senderKind && me?.id === m.senderId;
            return (
              <MessageRow
                key={m.id}
                msg={m}
                canEdit={isAuthor}
                canDelete={isAuthor || isOwner}
              />
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <Composer channelId={channelId} />
    </div>
  );
}
