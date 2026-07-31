// The views inside Onboarding.
//
// Two questions, kept apart because they have different answers: what is left to
// do for this one client (setup), and what the process itself should say
// (management). Naming them here keeps the tab strip, the URL and the redirects
// agreeing.
//
// There was a third, a pipeline board of intake submissions waiting to be
// approved. It went when the approval did: a finished funnel form now creates
// the client on the spot, so the board was a queue of one state, showing clients
// whose real work was on the setup page anyway. Old ?view=pipeline links land on
// setup rather than on nothing.

export type OnboardingView = "setup" | "management" | "keys";

export interface OnboardingViewDef {
  id: OnboardingView;
  label: string;
  /** What this view is for, one line, used as the page subtitle. */
  blurb: string;
}

export const ONBOARDING_VIEWS: OnboardingViewDef[] = [
  {
    id: "setup",
    label: "Client setup",
    blurb: "One client, from the day they sign to the day they go live.",
  },
  {
    id: "management",
    label: "Management",
    blurb: "The process itself. Editing a step here changes it for every client.",
  },
  {
    // Agency-wide, not per client, and here anyway: standing a client up is
    // when a missing key is discovered, and Settings is the wrong side of the
    // app to go hunting mid-onboarding. Same component either way.
    id: "keys",
    label: "Keys",
    blurb: "The agency credentials every client depends on. Paste, apply, live.",
  },
];

export const DEFAULT_ONBOARDING_VIEW: OnboardingView = "setup";

/** The view named in the URL, or the default when it names nothing we ship. */
export function resolveOnboardingView(raw: string | null): OnboardingView {
  const match = ONBOARDING_VIEWS.find((v) => v.id === raw);
  return match ? match.id : DEFAULT_ONBOARDING_VIEW;
}

export function onboardingViewDef(view: OnboardingView): OnboardingViewDef {
  return ONBOARDING_VIEWS.find((v) => v.id === view) ?? ONBOARDING_VIEWS[0];
}

/**
 * Where a link to one client's setup points.
 *
 * Every caller goes through this rather than building the query itself: the old
 * shape was a path segment (/admin/onboarding/:tenantId), and the redirect that
 * keeps those links alive has to agree with what the app now generates.
 */
export function clientSetupPath(tenantId: string): string {
  return `/admin/onboarding?view=setup&client=${encodeURIComponent(tenantId)}`;
}
