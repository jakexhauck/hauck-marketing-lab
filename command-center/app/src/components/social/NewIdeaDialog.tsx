import { useState } from "react";
import { ArrowRight, Link2 } from "lucide-react";
import { Button } from "../ui";
import { useToast } from "../../context/ToastContext";
import { demoMode } from "../../demo/demoMode";
import { Platform, PlatformGlyph } from "../../routes/social/shared";
import SocialDialog from "./SocialDialog";

const KINDS = ["Social proof", "Tip", "Review", "Offer", "Behind the scenes", "Seasonal"];
const QUICK = ["Quick: a tip", "A recent review", "A seasonal offer"];

// "New Post Idea" — describe it for the AI to shape, or write your own. The idea
// preview and generation are demo-only; the add actions are gated until the
// backend is wired.
export default function NewIdeaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const demo = demoMode();
  const { showToast } = useToast();

  const [mode, setMode] = useState<"describe" | "own">("describe");
  const [prompt, setPrompt] = useState(
    demo ? "We finished a big water-heater replacement for the Thompsons, same-day hot water. Make it a before/after." : "",
  );
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState(KINDS[0]);
  const [platforms, setPlatforms] = useState<Record<Platform, boolean>>({ ig: true, fb: true, gb: false });

  function togglePlatform(p: Platform) {
    setPlatforms((prev) => ({ ...prev, [p]: !prev[p] }));
  }

  return (
    <SocialDialog
      open={open}
      onClose={onClose}
      title="New post idea"
      subtitle="Drops into your Ideas feed, ready to write later."
      maxWidth="sm:max-w-lg"
      footer={
        <>
          <span className="flex items-center gap-1.5 text-[11.5px] text-faint">
            <Link2 size={13} /> Saving ideas turns on once connected
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="md"
              disabled={!demo}
              onClick={() => {
                showToast("Added to Ideas (demo)");
                onClose();
              }}
            >
              Add to Ideas
            </Button>
            <Button variant="primary" size="md" disabled={!demo} onClick={() => showToast("Added — opening the composer (demo)")}>
              Add &amp; write now
            </Button>
          </div>
        </>
      }
    >
      <div className="p-5">
        <div className="mb-4 flex gap-1 rounded-full border border-border bg-surface-2 p-1">
          <button
            type="button"
            onClick={() => setMode("describe")}
            className={`flex-1 rounded-full py-2 text-[12.5px] font-semibold transition-colors ${
              mode === "describe" ? "text-white shadow-brand" : "text-muted"
            }`}
            style={mode === "describe" ? { backgroundImage: "var(--grad-brand)" } : undefined}
          >
            ✨ Describe it
          </button>
          <button
            type="button"
            onClick={() => setMode("own")}
            className={`flex-1 rounded-full py-2 text-[12.5px] font-semibold transition-colors ${
              mode === "own" ? "text-white shadow-brand" : "text-muted"
            }`}
            style={mode === "own" ? { backgroundImage: "var(--grad-brand)" } : undefined}
          >
            Write my own
          </button>
        </div>

        {mode === "describe" ? (
          <>
            <span className="label-cap">What's it about?</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A finished job, a review, a seasonal offer…"
              className="mt-2 min-h-[80px] w-full resize-y rounded-xl border border-border-strong bg-surface p-3 text-[14px] leading-relaxed text-text outline-none placeholder:text-faint focus:border-brand"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setPrompt(q)}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-[11.5px] text-muted hover:text-text"
                >
                  {q}
                </button>
              ))}
            </div>

            {demo && (
              <div className="relative mt-4 overflow-hidden rounded-2xl border border-border bg-surface p-4 pl-5">
                <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundImage: "var(--grad-brand)" }} />
                <div className="label-cap text-brand-text">Social proof · suggested</div>
                <h4 className="mt-1.5 font-display text-[15px] text-text">Show off the Thompson water-heater job</h4>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                  Before/after of the same-day swap. Job photos get you the most calls, so lead with the result.
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex gap-1">
                    <PlatformGlyph p="ig" size={19} />
                    <PlatformGlyph p="fb" size={19} />
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand-text">
                    Suggested for Sat 6 PM
                  </span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="label-cap">Idea title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Show off the Thompson water-heater job"
                className="rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-[14px] text-text outline-none placeholder:text-faint focus:border-brand"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label-cap">Type</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-[14px] font-medium text-text outline-none focus:border-brand"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className="label-cap">Platforms</span>
              <div className="mt-2 flex gap-2">
                {(["ig", "fb", "gb"] as Platform[]).map((p) => {
                  const on = platforms[p];
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-medium transition-colors ${
                        on ? "border-brand bg-brand-tint text-brand-text" : "border-border-strong text-muted"
                      }`}
                    >
                      <PlatformGlyph p={p} size={18} />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[12px] text-muted">
              <ArrowRight size={13} /> It'll land in your Ideas feed for you to write later.
            </div>
          </div>
        )}
      </div>
    </SocialDialog>
  );
}
