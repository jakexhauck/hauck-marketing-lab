import { useState } from "react";
import { Pencil, Image as ImageIcon, Plus, Send, Link2, Check, Heart, MessageCircle } from "lucide-react";
import { Button } from "../ui";
import { useToast } from "../../context/ToastContext";
import { demoMode } from "../../demo/demoMode";
import { Platform, PLATFORM, PlatformGlyph } from "../../routes/social/shared";
import { useSocialAccounts, useCreatePost } from "../../hooks/useSocial";
import SocialDialog from "./SocialDialog";

const ALL_PLATFORMS: Platform[] = ["ig", "fb", "gb"];

const SAMPLE_CAPTION =
  "Another one done right. 👏 Swapped out an old, leaky water heater for the Thompsons this week, and they've already got hot water back the same day.\n\nIf your unit is making noise or running cold, don't wait for it to quit. We'll take a look and tell you straight.\n\n#WaterHeater #LocalPlumber";

// The "New Post" composer. Interactive UI (caption, platforms, live preview).
// Save draft / Schedule create a real post in a live session (only when a
// connected platform is selected) and just toast in demo. Media upload is still
// out of scope.
export default function SocialComposerDialog({
  open,
  onClose,
  sourceIdea,
}: {
  open: boolean;
  onClose: () => void;
  sourceIdea?: string;
}) {
  const demo = demoMode();
  const { showToast } = useToast();
  const accountsQ = useSocialAccounts(!demo);
  const createPost = useCreatePost();

  const connectedSet = new Set((accountsQ.data?.accounts ?? []).map((a) => a.platform));
  // Demo shows all three; a live session shows only the client's connected ones.
  const shownPlatforms = demo ? ALL_PLATFORMS : ALL_PLATFORMS.filter((p) => connectedSet.has(p));

  const [caption, setCaption] = useState(demo ? SAMPLE_CAPTION : "");
  const [platforms, setPlatforms] = useState<Record<Platform, boolean>>(
    demo ? { ig: true, fb: true, gb: false } : { ig: false, fb: false, gb: false },
  );
  const [previewTab, setPreviewTab] = useState<Platform>("ig");
  const [when, setWhen] = useState("");

  function togglePlatform(p: Platform) {
    setPlatforms((prev) => ({ ...prev, [p]: !prev[p] }));
  }

  // The preview tabs mirror the connected set (same rule as the "Post to"
  // toggles): a real session never offers an Instagram preview when IG is not
  // linked. Fall back to the first shown platform when the current tab is gone.
  const activePreview = shownPlatforms.includes(previewTab) ? previewTab : shownPlatforms[0];

  const selected = shownPlatforms.filter((p) => platforms[p]);
  const hasCaption = caption.trim().length > 0;
  const canDraft = demo || (hasCaption && selected.length > 0 && !createPost.isPending);
  const canSchedule = demo || (hasCaption && selected.length > 0 && !!when && !createPost.isPending);

  function toIso(local: string): string | undefined {
    if (!local) return undefined;
    const d = new Date(local);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  function saveDraft() {
    if (demo) {
      showToast("Saved as a draft (demo)");
      onClose();
      return;
    }
    createPost.mutate(
      { platforms: selected, summary: caption.trim(), status: "draft" },
      {
        onSuccess: () => {
          showToast("Saved as a draft");
          onClose();
        },
        onError: () => showToast("Could not save that draft"),
      },
    );
  }

  function schedule() {
    if (demo) {
      showToast("Scheduled (demo)");
      onClose();
      return;
    }
    const iso = toIso(when);
    if (!iso) {
      showToast("Pick a date and time to schedule");
      return;
    }
    createPost.mutate(
      { platforms: selected, summary: caption.trim(), status: "scheduled", scheduleAt: iso },
      {
        onSuccess: () => {
          showToast("Scheduled");
          onClose();
        },
        onError: () => showToast("Could not schedule that post"),
      },
    );
  }

  const footerHint =
    !demo && !accountsQ.data?.connected
      ? "Saving and publishing turn on once your accounts are connected"
      : "We'll post to the accounts you select above";

  return (
    <SocialDialog
      open={open}
      onClose={onClose}
      title="New post"
      subtitle="Write it once, see it on every platform."
      maxWidth="sm:max-w-3xl"
      footer={
        <>
          <span className="flex items-center gap-1.5 text-[11.5px] text-faint">
            <Link2 size={13} /> {footerHint}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="md" disabled={!canDraft} onClick={saveDraft}>
              Save draft
            </Button>
            <Button variant="primary" size="md" disabled={!canSchedule} onClick={schedule}>
              <Send size={15} /> Schedule
            </Button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px]">
        {/* Editor */}
        <div className="p-5 lg:border-r lg:border-divider">
          {sourceIdea && (
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5">
              <Pencil size={16} className="shrink-0 text-muted" />
              <div>
                <div className="label-cap text-muted">Starting from</div>
                <div className="text-[13px] font-semibold text-text">{sourceIdea}</div>
              </div>
            </div>
          )}

          <div className="mb-2">
            <span className="label-cap">Caption</span>
          </div>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write your post here."
            className="min-h-[150px] w-full resize-y rounded-xl border border-border-strong bg-surface p-3.5 text-[14px] leading-relaxed text-text outline-none placeholder:text-faint focus:border-brand"
          />

          <div className="mt-5">
            <span className="label-cap">Post to</span>
            {shownPlatforms.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2.5">
                {shownPlatforms.map((p) => {
                  const on = platforms[p];
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px] font-medium transition-colors ${
                        on ? "border-brand bg-brand-tint text-brand-text" : "border-border-strong text-muted"
                      }`}
                    >
                      <PlatformGlyph p={p} size={20} />
                      {PLATFORM[p].name}
                      {on && <Check size={14} className="text-brand-text" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-[12.5px] text-faint">
                Connect a social account to choose where this posts.
              </p>
            )}
          </div>

          <div className="mt-5 flex gap-2.5">
            <div className="flex h-[78px] w-[78px] items-center justify-center rounded-xl border border-border bg-surface-2 text-faint">
              <ImageIcon size={20} />
            </div>
            <button
              type="button"
              onClick={() => showToast("Photo upload arrives with the backend")}
              className="flex h-[78px] w-[78px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-strong text-[10.5px] text-faint"
            >
              <Plus size={20} /> Add photo
            </button>
          </div>

          <div className="mt-5">
            <span className="label-cap">Schedule for</span>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="mt-2 w-full rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-[14px] text-text outline-none focus:border-brand"
            />
            <p className="mt-1.5 text-[11px] text-faint">
              Leave blank to save as a draft. Set a time to schedule.
            </p>
          </div>
        </div>

        {/* Live preview */}
        <div className="bg-surface-2 p-5">
          {shownPlatforms.length > 0 && (
            <div className="mb-3 flex gap-2">
              {shownPlatforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreviewTab(p)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-[11px] font-semibold transition-colors ${
                    activePreview === p ? "border-brand bg-brand-tint text-brand-text" : "border-border bg-surface text-muted"
                  }`}
                >
                  <PlatformGlyph p={p} size={18} /> {PLATFORM[p].name}
                </button>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2.5 p-3">
              <div className="h-7 w-7 rounded-full" style={{ backgroundImage: "var(--grad-brand)" }} />
              <div className="text-[12px] font-semibold text-text">
                yourbusiness
                <span className="block text-[10px] font-normal text-faint">just now</span>
              </div>
            </div>
            <div className="flex aspect-[4/3] items-end" style={{ background: "linear-gradient(140deg,#dfe3f4,#c9cef0)" }}>
              <div className="m-3.5 font-display text-[19px] font-bold leading-tight text-[#2b2f45]">
                Your post
                <br />
                preview.
              </div>
            </div>
            <div className="flex gap-4 px-3 pb-1.5 pt-2.5 text-text">
              <Heart size={18} />
              <MessageCircle size={18} />
              <Send size={18} />
            </div>
            <div className="px-3 pb-3 text-[12px] leading-relaxed text-text">
              <span className="font-semibold">yourbusiness</span>{" "}
              {caption.trim() ? caption.slice(0, 140) + (caption.length > 140 ? "…" : "") : "Your caption will show here."}
            </div>
          </div>

          <p className="mt-3 text-[11px] text-faint">Preview only.</p>
        </div>
      </div>
    </SocialDialog>
  );
}
