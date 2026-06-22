import { useState, useRef } from "react";
import type { KeyboardEvent } from "react";
import { Send, Paperclip, FileText, X } from "lucide-react";
import { useSendMessage, useUploadAttachment } from "../../hooks/useChat";
import { validateAttachment } from "../../lib/chatLogic";

// One file the user picked, tracked through its upload lifecycle so we can show a
// thumbnail and block send until every upload settles.
interface PendingAttachment {
  localId: string;
  file: File;
  previewUrl: string | null; // object URL for images, null for PDFs
  status: "uploading" | "done" | "error";
  attachmentId: string | null;
  error: string | null;
}

export default function Composer({ channelId }: { channelId: string }) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendMessage = useSendMessage();
  const uploadAttachment = useUploadAttachment();

  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const check = validateAttachment(file.type, file.size);
      const localId = crypto.randomUUID();
      if (!check.ok) {
        setPending((p) => [
          ...p,
          {
            localId,
            file,
            previewUrl: null,
            status: "error",
            attachmentId: null,
            error:
              check.reason === "too_large" ? "Over 25MB" : "Unsupported type",
          },
        ]);
        continue;
      }
      const previewUrl = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null;
      setPending((p) => [
        ...p,
        {
          localId,
          file,
          previewUrl,
          status: "uploading",
          attachmentId: null,
          error: null,
        },
      ]);
      uploadAttachment.mutate(file, {
        onSuccess: (attachmentId) =>
          setPending((p) =>
            p.map((a) =>
              a.localId === localId
                ? { ...a, status: "done", attachmentId }
                : a,
            ),
          ),
        onError: (err) =>
          setPending((p) =>
            p.map((a) =>
              a.localId === localId
                ? { ...a, status: "error", error: (err as Error).message }
                : a,
            ),
          ),
      });
    }
  };

  const removePending = (localId: string) =>
    setPending((p) => {
      const target = p.find((a) => a.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return p.filter((a) => a.localId !== localId);
    });

  const uploadsBusy = pending.some((a) => a.status === "uploading");
  const attachmentIds = pending
    .filter((a) => a.status === "done" && a.attachmentId)
    .map((a) => a.attachmentId as string);

  const send = () => {
    const text = body.trim();
    if (uploadsBusy || sendMessage.isPending) return;
    if (!text && attachmentIds.length === 0) return;
    sendMessage.mutate(
      { channelId, body: text, attachmentIds },
      {
        onSuccess: () => {
          setBody("");
          for (const a of pending) {
            if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
          }
          setPending([]);
          taRef.current?.focus();
        },
      },
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="border-t border-[var(--divider)] bg-[var(--surface)] p-2.5">
      {pending.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1 pb-2">
          {pending.map((a) => (
            <div
              key={a.localId}
              className="relative flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 pr-7 text-xs"
            >
              {a.previewUrl ? (
                <img
                  src={a.previewUrl}
                  alt={a.file.name}
                  className={`h-12 w-12 rounded object-cover ${
                    a.status === "uploading" ? "opacity-50" : ""
                  }`}
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded bg-[var(--surface-2)]">
                  <FileText className="h-5 w-5 text-[var(--text-muted)]" />
                </div>
              )}
              <div className="max-w-[7rem]">
                <div className="truncate font-medium text-[var(--text)]">
                  {a.file.name}
                </div>
                <div className="text-[var(--text-muted)]">
                  {a.status === "uploading" && "Uploading..."}
                  {a.status === "done" && "Ready"}
                  {a.status === "error" && (
                    <span className="text-red-500">{a.error}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removePending(a.localId)}
                className="absolute right-1 top-1 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text)]"
                aria-label="Remove attachment"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 focus-within:border-[var(--brand-primary)]">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
          className="hidden"
          onChange={(e) => {
            onPickFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 rounded-lg p-1.5 text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          aria-label="Attach a file"
        >
          <Paperclip size={18} />
        </button>
        <textarea
          ref={taRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Write a message"
          className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[14px] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={
            (!body.trim() && attachmentIds.length === 0) ||
            uploadsBusy ||
            sendMessage.isPending
          }
          aria-label="Send message"
          className="shrink-0 rounded-lg p-1.5 transition-colors disabled:opacity-40"
          style={{ color: "var(--brand-primary)" }}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
