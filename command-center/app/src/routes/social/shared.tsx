import { Link2 } from "lucide-react";
import { Panel, Button } from "../../components/ui";

// Shared bits for the Social surfaces. The golden rule: a real (connected) client
// must never see fabricated content. Pages render their designed, populated layout
// only in demo/preview mode (`?demo=1`); in a real session they show the empty /
// zeroed state plus <NotConnectedNotice/> until the accounts are linked via GHL.

export type Platform = "ig" | "fb" | "gb";

export const PLATFORM: Record<Platform, { bg: string; label: string; name: string }> = {
  ig: { bg: "linear-gradient(135deg,#feda75,#d62976,#962fbf)", label: "IG", name: "Instagram" },
  fb: { bg: "#1877f2", label: "f", name: "Facebook" },
  gb: { bg: "#1a73e8", label: "G", name: "Google" },
};

export function PlatformGlyph({ p, size = 22 }: { p: Platform; size?: number }) {
  const meta = PLATFORM[p];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[7px] font-bold text-white"
      style={{ width: size, height: size, background: meta.bg, fontSize: size * 0.45 }}
      aria-label={meta.name}
    >
      {meta.label}
    </span>
  );
}

// The standing "nothing is linked yet" banner. Shown on every Social surface in a
// real session so the empty state is never mistaken for a bug.
export function NotConnectedNotice({ message }: { message?: string }) {
  return (
    <Panel className="mb-4 flex flex-col gap-3 border-brand/30 bg-brand-tint p-4 sm:flex-row sm:items-center">
      <Link2 size={20} className="shrink-0 text-brand-text" />
      <div className="flex-1 text-[13px] leading-snug text-text">
        <span className="font-semibold">Not connected yet.</span>{" "}
        {message ??
          "To see real posts and results, we still need to connect your social accounts (Facebook, Instagram, Google) through GoHighLevel."}
      </div>
      <Button variant="secondary" size="sm" disabled className="shrink-0">
        Connect accounts (coming soon)
      </Button>
    </Panel>
  );
}

// Shared scroll container for a Social page.
export const SOCIAL_CONTAINER =
  "mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-5 pb-12 pt-5 lg:px-8";
