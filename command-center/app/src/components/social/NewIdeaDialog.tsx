import { useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "../ui";
import { useToast } from "../../context/ToastContext";
import { demoMode } from "../../demo/demoMode";
import { Platform, PlatformGlyph } from "../../routes/social/shared";
import SocialDialog from "./SocialDialog";

const KINDS = ["Social proof", "Tip", "Review", "Offer", "Behind the scenes", "Seasonal"];

// "New Post Idea" dialog: jot down an idea by hand to write later. Saving is
// gated until an idea store is wired (demo just confirms with a toast).
export default function NewIdeaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const demo = demoMode();
  const { showToast } = useToast();

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
      subtitle="Save an idea to write later."
      maxWidth="sm:max-w-lg"
      footer={
        <>
          <span className="flex items-center gap-1.5 text-[11.5px] text-faint">
            <Link2 size={13} /> Saving ideas turns on once connected
          </span>
          <Button
            variant="primary"
            size="md"
            disabled={!demo || !title.trim()}
            onClick={() => {
              showToast("Added to Ideas (demo)");
              onClose();
            }}
          >
            Add to Ideas
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 p-5">
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
      </div>
    </SocialDialog>
  );
}
