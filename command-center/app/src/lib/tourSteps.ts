import type { Capability } from "./capabilities";
import type { DataGate } from "./nav";

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
  // Mirrors NavItem.dataGate: the page only exists for some clients (Organic),
  // so its step is skipped where the sidebar row is.
  dataGate?: DataGate;
  // Where the tooltip card sits relative to the target. "center" floats it in
  // the middle of the screen (welcome/finish, and any null-target fallback).
  placement?: "top" | "bottom" | "left" | "right" | "center";
}

// Order is the order of the walkthrough: a welcome, then every sidebar page in
// sidebar order, then Team and Settings from the footer, then a sign-off.
// Selectors match the `data-tour="..."` attributes on the Sidebar and BottomNav
// items (nav-<route> / bottomnav-<route>). A page with no phone tab has
// `mobile: null` and shows as a centred card on a phone.
//
// tourSteps.test.ts fails if a sidebar page has no step here, so a new page
// cannot ship without being added to the tour.
//
// Version 2 (2026-09-22): the tour caught up with the app. Customers, Activity
// and Chat left (their pages are gone), and every page added since the first
// tour got a step. Clients who finished version 1 see only the version 2 steps.
export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    version: 1,
    route: "/marketing/paid-ads/leads",
    target: { desktop: null, mobile: null },
    title: "Welcome to your command center",
    body: "Every lead, conversation and dollar from your ads lives here. Give it sixty seconds and you will know your way around.",
    placement: "center",
  },
  {
    // Kept as "home" so a client who finished version 1 is not shown it again.
    id: "home",
    version: 1,
    route: "/marketing/paid-ads/leads",
    target: {
      desktop: "[data-tour='nav-marketing/paid-ads/leads']",
      mobile: "[data-tour='bottomnav-marketing/paid-ads/leads']",
    },
    title: "Lead Tracker",
    body: "Every lead your ads bring in, newest first. Mark who picked up, who booked and who bought.",
    capability: "paid_ads",
    placement: "right",
  },
  {
    id: "paid-ads",
    version: 1,
    route: "/marketing/paid-ads",
    target: {
      desktop: "[data-tour='nav-marketing/paid-ads']",
      mobile: "[data-tour='bottomnav-marketing/paid-ads']",
    },
    title: "Ads Dashboard",
    body: "What your ads spent and what they brought back, by campaign, ad set or ad.",
    capability: "ads_dashboard",
    placement: "right",
  },
  {
    id: "meta-data",
    version: 2,
    route: "/marketing/paid-ads/meta",
    target: { desktop: "[data-tour='nav-marketing/paid-ads/meta']", mobile: null },
    title: "Meta Data",
    body: "The raw numbers from Meta, day by day.",
    capability: "meta_data",
    placement: "right",
  },
  {
    id: "creatives",
    version: 2,
    route: "/marketing/paid-ads/creatives",
    target: { desktop: "[data-tour='nav-marketing/paid-ads/creatives']", mobile: null },
    title: "Creatives",
    body: "Every photo and video running in your ads.",
    capability: "creatives",
    placement: "right",
  },
  {
    id: "organic",
    version: 2,
    route: "/organic",
    target: { desktop: "[data-tour='nav-organic']", mobile: null },
    title: "Organic",
    body: "Leads that came from your website rather than an ad.",
    capability: "organic",
    dataGate: "organic",
    placement: "right",
  },
  {
    id: "sales-leads",
    version: 2,
    route: "/sales",
    target: { desktop: "[data-tour='nav-sales']", mobile: "[data-tour='bottomnav-sales']" },
    title: "Leads",
    body: "Every lead by where they stand, from first call to closed job. Book an estimate straight from the card.",
    capability: "pipeline",
    placement: "right",
  },
  {
    id: "schedule",
    version: 2,
    route: "/sales/schedule",
    target: { desktop: "[data-tour='nav-sales/schedule']", mobile: null },
    title: "Schedule",
    body: "Your estimates and jobs on a calendar. Link your Google Calendar so booked hours are blocked off.",
    capability: "calendar",
    placement: "right",
  },
  {
    id: "inbox",
    version: 1,
    route: "/conversations",
    target: { desktop: "[data-tour='nav-conversations']", mobile: null },
    title: "Inbox",
    body: "Every text with a lead, one thread per person. Reply right from here.",
    capability: "inbox",
    placement: "right",
  },
  {
    id: "contacts",
    version: 1,
    route: "/contacts",
    target: { desktop: "[data-tour='nav-contacts']", mobile: "[data-tour='bottomnav-contacts']" },
    title: "Contacts",
    body: "Everyone who has come through your ads. Find anyone and message them in one tap.",
    capability: "contacts",
    placement: "right",
  },
  {
    id: "team",
    version: 2,
    route: "/team",
    target: { desktop: "[data-tour='nav-team']", mobile: null },
    title: "Team",
    body: "Give your staff their own logins and choose which pages each person can open.",
    ownerOnly: true,
    placement: "right",
  },
  {
    id: "settings",
    version: 2,
    route: "/settings",
    target: { desktop: "[data-tour='nav-settings']", mobile: null },
    title: "Settings",
    body: "Turn on notifications for this device, switch light or dark, and replay this tour any time.",
    placement: "right",
  },
  {
    id: "finish",
    version: 1,
    route: "/marketing/paid-ads/leads",
    target: { desktop: null, mobile: null },
    title: "That is the lot",
    body: "You have seen the whole command center. Replay this tour any time from Settings.",
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
  // Answers TourStep.dataGate, as it does for the nav. Omitted = gate closed.
  hasData?: (gate: DataGate) => boolean;
}

// The steps a given user should be walked through: gated to what they can see
// (same rules as the nav), then narrowed to new steps for a returning client.
// Welcome/finish cards (no capability, no ownerOnly) always pass the gate, so a
// "what's new" run that has at least one real new step still gets a sign-off.
export function visibleSteps(opts: VisibleStepsOpts): TourStep[] {
  const { isOwner, can, sinceVersion, hasData } = opts;
  return TOUR_STEPS.filter((step) => {
    if (sinceVersion !== null && step.version <= sinceVersion) return false;
    if (step.ownerOnly && !isOwner) return false;
    if (step.dataGate && !(hasData?.(step.dataGate) ?? false)) return false;
    if (step.capability && !can(step.capability, "view")) return false;
    return true;
  });
}
