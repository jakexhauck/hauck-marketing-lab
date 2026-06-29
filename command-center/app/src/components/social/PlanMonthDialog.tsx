import { useState } from "react";
import { Minus, Plus, Link2, X } from "lucide-react";
import { Button } from "../ui";
import { useToast } from "../../context/ToastContext";
import { demoMode } from "../../demo/demoMode";
import { Platform, PLATFORM } from "../../routes/social/shared";
import SocialDialog from "./SocialDialog";

const MIX = ["Job photos", "Reviews", "Tips", "Offers", "Behind the scenes"];

const SAMPLE_BATCH: { date: string; title: string; meta: string; platform: Platform }[] = [
  { date: "Wed 1", title: "Mid-summer tune-up reminder", meta: "Tip · Facebook", platform: "fb" },
  { date: "Fri 3", title: "Thompson water-heater before/after", meta: "Job photo · Instagram + Facebook", platform: "ig" },
  { date: "Sat 4", title: "Happy 4th from the crew", meta: "Behind the scenes · Instagram", platform: "ig" },
  { date: "Tue 7", title: '"One drain mistake homeowners make"', meta: "Tip · Google", platform: "gb" },
];

// "Plan My Month" — set cadence + content mix, generate a month of drafts. The
// generated batch is demo-only; the add action is gated until the backend is wired.
export default function PlanMonthDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const demo = demoMode();
  const { showToast } = useToast();

  const [perWeek, setPerWeek] = useState(3);
  const [mix, setMix] = useState<Record<string, boolean>>({
    "Job photos": true,
    Reviews: true,
    Tips: true,
    Offers: false,
    "Behind the scenes": false,
  });
  const total = perWeek * 4 + 1;

  return (
    <SocialDialog
      open={open}
      onClose={onClose}
      title="Plan my month"
      subtitle="We'll draft a month of posts from your jobs and offers. You approve them."
      maxWidth="sm:max-w-2xl"
      footer={
        <>
          <span className="flex items-center gap-1.5 text-[11.5px] text-faint">
            <Link2 size={13} /> Saved as drafts once your accounts are connected
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="md" disabled={!demo} onClick={() => showToast("Regenerated (demo)")}>
              Regenerate
            </Button>
            <Button
              variant="primary"
              size="md"
              disabled={!demo}
              onClick={() => {
                showToast(`Added ${total} drafts (demo)`);
                onClose();
              }}
            >
              Add {total} drafts
            </Button>
          </div>
        </>
      }
    >
      <div className="p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <div className="mb-2.5 text-[12px] text-muted">How often?</div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPerWeek((n) => Math.max(1, n - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong text-muted"
              >
                <Minus size={14} />
              </button>
              <span className="min-w-[28px] text-center font-data text-[20px] font-semibold text-text">{perWeek}</span>
              <button
                type="button"
                onClick={() => setPerWeek((n) => Math.min(7, n + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong text-muted"
              >
                <Plus size={14} />
              </button>
              <span className="text-[12px] text-faint">posts / week</span>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <div className="mb-2.5 text-[12px] text-muted">Which month?</div>
            <div className="flex items-center gap-2.5">
              <span className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-text">
                July 2026
              </span>
              <span className="text-[12px] text-faint">≈ {total} posts</span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <span className="label-cap">Mix of content</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {MIX.map((m) => {
              const on = mix[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMix((prev) => ({ ...prev, [m]: !prev[m] }))}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    on ? "border-brand bg-brand-tint text-brand-text" : "border-border-strong text-muted"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" /> {m}
                </button>
              );
            })}
          </div>
        </div>

        {demo ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <div className="flex items-center justify-between bg-surface-2 px-3.5 py-2.5 text-[12.5px] font-semibold text-text">
              <span>Preview · {total} drafts for July</span>
              <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] text-brand-text">All editable later</span>
            </div>
            {SAMPLE_BATCH.map((b, i) => (
              <div key={b.title} className="flex items-center gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0">
                <span className="w-12 shrink-0 font-data text-[11px] text-faint">{b.date}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-text">{b.title}</div>
                  <div className="text-[11px] text-faint">{b.meta}</div>
                </div>
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ background: PLATFORM[b.platform].bg }}
                  aria-hidden
                />
                {i === SAMPLE_BATCH.length - 1 ? (
                  <X size={15} className="text-faint" />
                ) : (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">Keep</span>
                )}
              </div>
            ))}
            <div className="px-3.5 py-2.5 text-[12px] text-faint">+ {Math.max(0, total - SAMPLE_BATCH.length)} more…</div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-border-strong bg-surface-2 px-4 py-8 text-center">
            <p className="text-[13px] text-muted">
              Connect your accounts and we'll fill this month with ready-to-approve drafts built from your jobs and offers.
            </p>
          </div>
        )}
      </div>
    </SocialDialog>
  );
}
