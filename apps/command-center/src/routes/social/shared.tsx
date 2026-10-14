import { Link2 } from "lucide-react";
import { Panel, Button } from "../../components/ui";
import { PAGE_CONTAINER } from "../../lib/layout";
import type { Tone } from "../../lib/status";
import type { SocialStatus } from "../../lib/social";

// Shared bits for the Social surfaces. The golden rule: a real (connected) client
// must never see fabricated content. Pages render their designed, populated layout
// only in demo/preview mode (`?demo=1`); in a real session they show the empty /
// zeroed state plus <NotConnectedNotice/> until the accounts are linked via GHL.

export type Platform = "ig" | "fb" | "gb";

// ENGAGEMENT DATA SOURCE FLAGS (single source of truth for the Social surfaces).
// The posting backend exposes NO reach / likes / comments / DMs data. Real
// engagement needs read access to Meta Graph (Facebook + Instagram) and Google
// Business Profile, wired per tenant with the account's own tokens (the app does
// not hold these yet). Until then, a real session shows only what we can honestly
// compute from posts plus a "connecting your accounts" note, and never fabricates
// numbers. `?demo=1` still shows the full designed layout.
//
// - ENGAGEMENT_SOURCE_READY: read path (likes/comments/DMs) is live.
// - REPLY_WRITE_READY: comment-reply write path + permission is confirmed.
//
// TODO(engagement): build functions/api/social/engagement.ts (read) + a gated
// reply endpoint, add hooks, then flip these to true. Jake must confirm the
// source and the reply permission per tenant before either flips.
export const ENGAGEMENT_SOURCE_READY = false;
export const REPLY_WRITE_READY = false;

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
          "To see real posts and results, we still need to connect your social accounts (Facebook, Instagram, Google)."}
      </div>
      <Button variant="secondary" size="sm" disabled className="shrink-0">
        Connect accounts (coming soon)
      </Button>
    </Panel>
  );
}

// Real-post status -> badge tone + label. One vocabulary for Overview + My Posts.
export function statusBadge(status: SocialStatus): { tone: Tone; label: string } {
  if (status === "draft") return { tone: "warning", label: "Draft" };
  if (status === "failed") return { tone: "danger", label: "Failed" };
  if (status === "posted") return { tone: "positive", label: "Posted" };
  return { tone: "brand", label: "Scheduled" };
}

// The softer banner for a client who IS connected but has no posts yet, so we
// never tell a connected client "not connected". Used once accounts resolve.
export function ConnectedEmptyNotice({ message }: { message?: string }) {
  return (
    <Panel className="mb-4 flex items-center gap-3 border-brand/30 bg-brand-tint p-4">
      <Link2 size={20} className="shrink-0 text-brand-text" />
      <div className="flex-1 text-[13px] leading-snug text-text">
        <span className="font-semibold">You're connected.</span>{" "}
        {message ?? "Once you schedule or publish a post, it shows up here."}
      </div>
    </Panel>
  );
}

// Shared scroll container for a Social page. The one app-wide page container.
export const SOCIAL_CONTAINER = PAGE_CONTAINER;
