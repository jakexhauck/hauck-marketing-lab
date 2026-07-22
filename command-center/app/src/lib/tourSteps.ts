import type { Capability } from "./capabilities";

// The first-login product tour, as data. Each step explains one surface and is
// the single source of truth for the walkthrough: the desktop sidebar tour and
// the phone bottom-bar tour both read this list, so they can never drift.
//
// Adding a feature later means appending ONE step with the next `version`
// number. Clients who already finished the tour at a lower version are shown
// only the newer step(s) on their next login ("what's new"); brand-new clients
// get the whole thing. That is the entire "auto-add to the wizard" mechanism.

export interface TourStep {
  // Stable, unique id. Never reuse one; it is only an identifier.
  id: string;
  // Monotonic. The max version across the file is the current tour version.
  // A new step gets (current max + 1) so existing clients see just it.
  version: number;
  // Where the overlay navigates before highlighting. Empty string = no route
  // change (used by the welcome/finish cards).
  route: string;
  // CSS selector for the element to spotlight, per layout. `mobile: null` means
  // the surface has no persistent phone chrome (it is sidebar-only), so the
  // phone tour shows a centered card with no spotlight for this step.
  target: { desktop: string | null; mobile: string | null };
  title: string;
  body: string;
  // Permission gate, mirroring the nav. A step is skipped when the user cannot
  // view this capability. Omit for surfaces everyone with an account can see.
  capability?: Capability;
  // Owner-only surfaces (e.g. Team). Skipped for staff sessions.
  ownerOnly?: boolean;
  // Where the tooltip card sits relative to the target. "center" floats it in
  // the middle of the screen (welcome/finish, and any null-target fallback).
  placement?: "top" | "bottom" | "left" | "right" | "center";
}

// Order is the order of the walkthrough: a welcome, then each surface in nav
// order, then a sign-off. Selectors match the `data-tour="..."` attributes on
// the Sidebar and BottomNav items (nav-<route> / bottomnav-<route>).
export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    version: 1,
    route: "/home",
    target: { desktop: null, mobile: null },
    title: "Welcome to your command center",
    body: "This is where every lead, conversation, and dollar from your ads lives. Give me sixty seconds and you will know your way around the whole thing.",
    placement: "center",
  },
  {
    id: "home",
    version: 1,
    route: "/home",
    target: { desktop: "[data-tour='nav-home']", mobile: "[data-tour='bottomnav-home']" },
    title: "Home",
    body: "Your daily snapshot: new leads, what needs a reply, and how the numbers are tracking. Start here every morning.",
    capability: "overview",
    placement: "right",
  },
  {
    id: "pipeline",
    version: 1,
    route: "/leads",
    target: { desktop: "[data-tour='nav-leads']", mobile: "[data-tour='bottomnav-leads']" },
    title: "Your pipeline",
    body: "Every lead, sorted by the stage they are in. As someone moves from a new enquiry to a booked job, you drag their card forward so you always know exactly where each person stands.",
    capability: "pipeline",
    placement: "right",
  },
  {
    id: "inbox",
    version: 1,
    route: "/conversations",
    target: { desktop: "[data-tour='nav-conversations']", mobile: "[data-tour='bottomnav-conversations']" },
    title: "Inbox",
    body: "Every text and email with a lead, in one thread per person. Reply right from here. No more digging through your phone.",
    capability: "inbox",
    placement: "right",
  },
  {
    id: "contacts",
    version: 1,
    route: "/contacts",
    target: { desktop: "[data-tour='nav-contacts']", mobile: "[data-tour='bottomnav-contacts']" },
    title: "Contacts",
    body: "The full database of everyone who has ever come through your ads. Search anyone, see their history, pick up where you left off.",
    capability: "contacts",
    placement: "right",
  },
  {
    id: "paid-ads",
    version: 1,
    route: "/marketing/paid-ads",
    target: { desktop: "[data-tour='nav-marketing/paid-ads']", mobile: null },
    title: "Paid Ads",
    body: "What your ads are spending and what they are bringing back. This is the scoreboard for the work we do together.",
    capability: "paid_ads",
    placement: "right",
  },
  {
    id: "billing",
    version: 1,
    route: "/billing",
    target: { desktop: "[data-tour='nav-billing']", mobile: null },
    title: "Billing",
    body: "Your invoices and payment status. No surprises, no chasing paper.",
    capability: "billing",
    placement: "right",
  },
  {
    id: "activity",
    version: 1,
    route: "/activity",
    target: { desktop: "[data-tour='nav-activity']", mobile: null },
    title: "Activity",
    body: "A running log of everything happening in the account: new leads in, replies sent, jobs booked. The full story, in order.",
    capability: "activity",
    placement: "right",
  },
  {
    id: "chat",
    version: 1,
    route: "/comms",
    target: { desktop: "[data-tour='nav-comms']", mobile: "[data-tour='bottomnav-comms']" },
    title: "Chat with us",
    body: "Your direct line to the Hauck team. Questions, requests, anything at all: message us here and we will get back to you.",
    placement: "right",
  },
  {
    id: "finish",
    version: 1,
    route: "/home",
    target: { desktop: null, mobile: null },
    title: "That is the lot",
    body: "You have seen the whole command center. Want a refresher later? Replay this tour any time from Settings.",
    placement: "center",
  },
];

// The current tour version: the highest version present in the registry. A
// client whose stored progress equals this has seen everything.
export const CURRENT_TOUR_VERSION = TOUR_STEPS.reduce(
  (max, step) => Math.max(max, step.version),
  0,
);

export interface VisibleStepsOpts {
  isOwner: boolean;
  can: (capability: Capability, action?: "view" | "edit") => boolean;
  // null = full tour (never seen). N = only steps with version > N ("what's
  // new" for a returning client who last finished at version N).
  sinceVersion: number | null;
}

// The steps a given user should be walked through: gated to what they can see
// (same rules as the nav), then narrowed to new steps for a returning client.
// Welcome/finish cards (no capability, no ownerOnly) always pass the gate, so a
// "what's new" run that has at least one real new step still gets a sign-off.
export function visibleSteps(opts: VisibleStepsOpts): TourStep[] {
  const { isOwner, can, sinceVersion } = opts;
  return TOUR_STEPS.filter((step) => {
    if (sinceVersion !== null && step.version <= sinceVersion) return false;
    if (step.ownerOnly && !isOwner) return false;
    if (step.capability && !can(step.capability, "view")) return false;
    return true;
  });
}
