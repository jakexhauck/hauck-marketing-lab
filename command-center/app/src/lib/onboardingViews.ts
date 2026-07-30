// The views inside Onboarding.
//
// Three questions, kept apart because they have different answers and different
// audiences: who is coming through and where are they stuck (pipeline), what is
// left to do for this one client (setup), and what the process itself should say
// (management). Naming them here keeps the tab strip, the URL and the redirects
// agreeing.

export type OnboardingView = "pipeline" | "setup" | "management";

export interface OnboardingViewDef {
  id: OnboardingView;
  label: string;
  /** What this view is for, one line, used as the page subtitle. */
  blurb: string;
}

export const ONBOARDING_VIEWS: OnboardingViewDef[] = [
  {
    id: "pipeline",
    label: "Pipeline",
    blurb: "Every client we are standing up, and where each one has got to.",
  },
  {
    id: "setup",
    label: "Client setup",
    blurb: "One client: their GoHighLevel build, their ads, and their wiring.",
  },
  {
    id: "management",
    label: "Management",
    blurb: "The process itself. Editing a step here changes it for every client.",
  },
];

export const DEFAULT_ONBOARDING_VIEW: OnboardingView = "pipeline";

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
