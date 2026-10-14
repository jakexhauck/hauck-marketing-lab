import { Share } from "lucide-react";

// The one thing an iPhone owner has to do before notifications are even
// offered: install the app to the home screen. Shown wherever we would
// otherwise dead-end them with "install first" and no way to do it.
// Deliberately plain-language: the reader is a business owner, not a developer.
const STEPS = [
  "Tap the Share button in Safari (the square with an arrow pointing up).",
  'Scroll down and tap "Add to Home Screen".',
  'Tap "Add", then open Hauck from your home screen.',
  "Come back to Settings and turn notifications on.",
];

export default function InstallSteps({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-muted">
        <Share size={13} strokeWidth={2.5} />
        How to install
      </div>
      <ol className="mt-2 space-y-1.5">
        {STEPS.map((step, i) => (
          <li key={step} className="flex gap-2.5 text-[12.5px] text-muted">
            <span className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-bold text-text">
              {i + 1}
            </span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
