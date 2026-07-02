// One source of truth for every in-page tab bar. Pages render <PageTabs> with
// the matching array; nav.test.ts asserts these routes exist and do not collide
// with sidebar rows. Labels follow the client-facing copy rules (no GHL naming,
// no em dashes).
export interface PageTab {
  to: string;
  label: string;
  // Exact-match the route so an overview tab (whose path prefixes its siblings)
  // does not stay active on deeper pages.
  end?: boolean;
}

export const PAID_ADS_TABS: PageTab[] = [
  // No "Leads" tab: a marketing channel must not host a lead list (that is the
  // Leads section's job). The Overview's lead count links into Leads; the
  // ad-attribution analysis lives in "What's working".
  { to: "/marketing/paid-ads", label: "Overview", end: true },
  { to: "/marketing/paid-ads/creatives", label: "Your Ads" },
  { to: "/marketing/paid-ads/insights", label: "What's working" },
];

export const REVIEWS_TABS: PageTab[] = [
  { to: "/marketing/reviews", label: "Overview", end: true },
  { to: "/marketing/reviews/requests", label: "Ask for Reviews" },
  { to: "/marketing/reviews/all", label: "All Reviews" },
  { to: "/marketing/reviews/insights", label: "What's working" },
];

export const CAMPAIGNS_TABS: PageTab[] = [
  { to: "/marketing/campaigns", label: "Overview", end: true },
  { to: "/marketing/campaigns/all", label: "Campaigns" },
  { to: "/marketing/campaigns/audiences", label: "Audiences" },
  { to: "/marketing/campaigns/templates", label: "Templates" },
  { to: "/marketing/campaigns/reactivation", label: "Reactivation" },
  { to: "/marketing/campaigns/insights", label: "What's working" },
];

export const WEBSITE_TABS: PageTab[] = [
  { to: "/marketing/website", label: "Overview", end: true },
  { to: "/marketing/website/pages", label: "Pages" },
  { to: "/marketing/website/request", label: "Request a Change" },
  { to: "/marketing/website/insights", label: "What's working" },
];

export const SOCIAL_TABS: PageTab[] = [
  { to: "/marketing/social", label: "Overview", end: true },
  { to: "/marketing/social/ideas", label: "Ideas" },
  { to: "/marketing/social/calendar", label: "Calendar" },
  { to: "/marketing/social/posts", label: "My Posts" },
  { to: "/marketing/social/insights", label: "What's working" },
];

export const LEADS_TABS: PageTab[] = [
  { to: "/sales/leads", label: "New Leads", end: true },
  // Pipeline is the interactive board (drag stages, mark won/lost). Nested under
  // /sales/leads so the sidebar's single "Leads" row stays highlighted on both.
  { to: "/sales/leads/pipeline", label: "Pipeline" },
];

// The bold section label <PageBar> shows to the left of the tabs. Matched to the
// tab array by identity so a page only passes `tabs` and the label stays in sync
// with the sidebar's section name. Keep these equal to the nav labels in nav.ts.
export function sectionLabel(tabs: PageTab[]): string {
  if (tabs === WEBSITE_TABS) return "Website";
  if (tabs === SOCIAL_TABS) return "Social Media";
  if (tabs === REVIEWS_TABS) return "Google Reviews";
  if (tabs === PAID_ADS_TABS) return "Paid Ads";
  if (tabs === CAMPAIGNS_TABS) return "Campaigns";
  if (tabs === LEADS_TABS) return "Leads";
  return "";
}
