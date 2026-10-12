import {
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import BrandedButton from "./BrandedButton";
import { haptic } from "../lib/haptics";
import { useChannelFilter } from "../context/ChannelFilterContext";

const MAX_CHARS = 5000;
const WARN_CHARS = 1400;

// The inbox is SMS + Email only. Any other channel string a contact might carry
// falls through label()'s `?? channel` to render its raw name, but no FB/IG/etc
// chip is ever offered because inbox pages lock the composer to one channel.
const CHANNEL_LABEL: Record<string, string> = {
  SMS: "SMS",
  Email: "Email",
};

function label(channel: string): string {
  return CHANNEL_LABEL[channel] ?? channel;
}

export interface SendChannelInput {
  channel: string;
  body: string;
  subject?: string;
  attachments?: string[];
}

// A picked photo: local preview while GHL takes it, then its hosted URL.
interface Photo {
  key: number;
  preview: string;
  url: string | null;
}

const MAX_PHOTOS = 5;

interface Props {
  availableChannels: string[];
  defaultChannel: string;
  isPending: boolean;
  error: Error | null;
  // SMS is unavailable when the contact has no phone; other channels still work.
  smsDisabled?: boolean;
  // When set, the composer is locked to this one channel (the inbox page's
  // channel): no channel chips render and every send goes over it, so an SMS
  // page never sends over Email and no other medium leaks in.
  lockChannel?: string;
  onSend: (input: SendChannelInput) => Promise<unknown>;
  // When set, texts can carry photos (MMS). Returns the uploaded URL.
  onUploadPhoto?: (file: File) => Promise<string>;
}

export default function ChannelComposer({
  availableChannels,
  defaultChannel,
  isPending,
  error,
  smsDisabled,
  lockChannel,
  onSend,
  onUploadPhoto,
}: Props) {
  const channels = lockChannel
    ? [lockChannel]
    : availableChannels.length > 0
      ? availableChannels
      : ["SMS", "Email"];
  // The active channel is shared with the thread (see ChannelFilterContext):
  // tapping a chip both retargets the send and filters the history shown above.
  // `selected` is null until the user taps, so we fall back to the default. A
  // locked channel wins over both (single-channel inbox page).
  const { selected, select } = useChannelFilter();
  const channel = lockChannel ?? selected ?? defaultChannel;
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef(0);

  const isEmail = channel === "Email";
  const blocked = channel === "SMS" && smsDisabled;
  const canPhoto = Boolean(onUploadPhoto) && channel === "SMS";
  const uploading = photos.some((p) => p.url === null);
  const ready = photos.filter((p) => p.url).map((p) => p.url as string);
  const canSend =
    (!!text.trim() || (canPhoto && ready.length > 0)) &&
    !uploading &&
    !isPending &&
    !blocked &&
    (!isEmail || subject.trim().length > 0);

  const addPhotos = (files: FileList | null) => {
    if (!files || !onUploadPhoto) return;
    setPhotoError(null);
    const picked = Array.from(files).slice(0, MAX_PHOTOS - photos.length);
    for (const file of picked) {
      const key = ++keyRef.current;
      const preview = URL.createObjectURL(file);
      setPhotos((cur) => [...cur, { key, preview, url: null }]);
      onUploadPhoto(file).then(
        (url) => setPhotos((cur) => cur.map((p) => (p.key === key ? { ...p, url } : p))),
        () => {
          URL.revokeObjectURL(preview);
          setPhotos((cur) => cur.filter((p) => p.key !== key));
          setPhotoError("That photo did not upload. Try another.");
        },
      );
    }
  };

  const removePhoto = (key: number) =>
    setPhotos((cur) => {
      const gone = cur.find((p) => p.key === key);
      if (gone) URL.revokeObjectURL(gone.preview);
      return cur.filter((p) => p.key !== key);
    });

  const submit = () => {
    if (!canSend) return;
    haptic();
    onSend({
      channel,
      body: text.trim(),
      subject: isEmail ? subject.trim() : undefined,
      attachments: canPhoto && ready.length > 0 ? ready : undefined,
    }).then(() => {
      setText("");
      setSubject("");
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPhotos([]);
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isEmail) {
      e.preventDefault();
      submit();
    }
  };

  const count = text.length;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      {!lockChannel && channels.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {channels.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => select(c)}
              aria-pressed={channel === c}
              className="shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors"
              style={{
                background:
                  channel === c ? "var(--brand-primary)" : "var(--surface-2)",
                color: channel === c ? "#fff" : "var(--text-muted)",
              }}
            >
              {label(c)}
            </button>
          ))}
        </div>
      )}

      {isEmail && (
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--ring)]"
        />
      )}

      {canPhoto && photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {photos.map((p) => (
            <div key={p.key} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--border)]">
              <img src={p.preview} alt="" className="h-full w-full object-cover" />
              {p.url === null && (
                <div className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              )}
              <button
                type="button"
                onClick={() => removePhoto(p.key)}
                aria-label="Remove photo"
                className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Message box and Send on one row. Send used to sit on its own line
          under the box, which doubled the composer's height for one button. */}
      <div className="flex items-stretch gap-2">
        {canPhoto && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={isPending || photos.length >= MAX_PHOTOS}
              aria-label="Add photo"
              className="grid w-11 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              <ImagePlus size={18} />
            </button>
          </>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={onKeyDown}
          placeholder={isEmail ? "Write an email" : "Type a message"}
          rows={2}
          disabled={isPending}
          className="min-w-0 flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--ring)] disabled:opacity-60"
        />
        <BrandedButton type="submit" variant="primary" disabled={!canSend} className="shrink-0">
          {isPending ? "Sending..." : `Send ${label(channel)}`}
        </BrandedButton>
      </div>

      {count >= WARN_CHARS && (
        <span className="text-xs text-[var(--text-muted)]">
          {count} / {MAX_CHARS}
        </span>
      )}

      {blocked && (
        <p className="text-xs text-[var(--text-muted)]">
          No phone number on file. Pick another channel to reach this contact.
        </p>
      )}
      {photoError && <p className="text-xs text-rose-600 dark:text-rose-400">{photoError}</p>}
      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400">
          Send failed: {error.message}
        </p>
      )}
    </form>
  );
}
