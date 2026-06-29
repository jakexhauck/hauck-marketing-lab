import { useState } from "react";
import { Sparkles, RefreshCw, Image as ImageIcon, Plus, Send, Link2, Check, Heart, MessageCircle } from "lucide-react";
import { Button } from "../ui";
import { useToast } from "../../context/ToastContext";
import { demoMode } from "../../demo/demoMode";
import { Platform, PLATFORM, PlatformGlyph } from "../../routes/social/shared";
import SocialDialog from "./SocialDialog";

const TONES = ["Friendly", "Shorter", "More fun", "Salesy"];

const SAMPLE_CAPTION =
  "Another one done right. 👏 Swapped out an old, leaky water heater for the Thompsons this week, and they've already got hot water back the same day.\n\nIf your unit is making noise or running cold, don't wait for it to quit. We'll take a look and tell you straight.\n\n#WaterHeater #LocalPlumber";

// The "New Post" composer. Interactive UI (caption, tone, platforms, live
// preview); the AI rewrite and the publish/schedule actions are gated until the
// backend is wired. Demo pre-fills the sample post; a real session starts empty.
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

  const [caption, setCaption] = useState(demo ? SAMPLE_CAPTION : "");
  const [tone, setTone] = useState("Friendly");
  const [platforms, setPlatforms] = useState<Record<Platform, boolean>>(
    demo ? { ig: true, fb: true, gb: false } : { ig: false, fb: false, gb: false },
  );
  const [previewTab, setPreviewTab] = useState<Platform>("ig");

  function togglePlatform(p: Platform) {
    setPlatforms((prev) => ({ ...prev, [p]: !prev[p] }));
  }

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
            <Link2 size={13} /> Saving and publishing turn on once your accounts are connected
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="md"
              disabled={!demo}
              onClick={() => {
                showToast("Saved as a draft (demo)");
                onClose();
              }}
            >
              Save draft
            </Button>
            <Button
              variant="primary"
              size="md"
              disabled={!demo}
              onClick={() => {
                showToast("Scheduled (demo)");
                onClose();
              }}
            >
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
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-brand/30 bg-brand-tint px-3.5 py-2.5">
              <Sparkles size={16} className="shrink-0 text-brand-text" />
              <div>
                <div className="label-cap text-brand-text">From your idea</div>
                <div className="text-[13px] font-semibold text-text">{sourceIdea}</div>
              </div>
            </div>
          )}

          <div className="mb-2 flex items-center justify-between">
            <span className="label-cap">Caption</span>
            {demo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-positive-tint px-2 py-0.5 text-[11px] font-semibold text-positive">
                <Check size={11} /> In your voice
              </span>
            )}
          </div>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write your post here. Once connected, we'll draft it in your voice for you."
            className="min-h-[150px] w-full resize-y rounded-xl border border-border-strong bg-surface p-3.5 text-[14px] leading-relaxed text-text outline-none placeholder:text-faint focus:border-brand"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                  tone === t
                    ? "text-white shadow-brand"
                    : "border border-border-strong text-muted hover:text-text"
                }`}
                style={tone === t ? { backgroundImage: "var(--grad-brand)" } : undefined}
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              disabled={!demo}
              onClick={() => showToast("AI rewrite arrives with the next update")}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border-strong px-3.5 py-1.5 text-[12.5px] font-medium text-muted disabled:opacity-50"
            >
              <RefreshCw size={13} /> Rewrite
            </button>
          </div>

          <div className="mt-5">
            <span className="label-cap">Post to</span>
            <div className="mt-2 flex flex-wrap gap-2.5">
              {(["ig", "fb", "gb"] as Platform[]).map((p) => {
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
        </div>

        {/* Live preview */}
        <div className="bg-surface-2 p-5">
          <div className="mb-3 flex gap-2">
            {(["ig", "fb", "gb"] as Platform[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreviewTab(p)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-[11px] font-semibold transition-colors ${
                  previewTab === p ? "border-brand bg-brand-tint text-brand-text" : "border-border bg-surface text-muted"
                }`}
              >
                <PlatformGlyph p={p} size={18} /> {PLATFORM[p].name}
              </button>
            ))}
          </div>

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

          <p className="mt-3 text-[11px] text-faint">
            Preview only. Connect your accounts to schedule and publish.
          </p>
        </div>
      </div>
    </SocialDialog>
  );
}
