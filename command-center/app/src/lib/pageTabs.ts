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
  // ad-attribution analysis lives in "Ad Stats".
  { to: "/marketing/paid-ads", label: "Overview", end: true },
  { to: "/marketing/paid-ads/creatives", label: "Your Ads" },
  { to: "/marketing/paid-ads/stats", label: "Ad Stats" },
  { to: "/marketing/paid-ads/media", label: "Media" },
];

export const REVIEWS_TABS: PageTab[] = [
  { to: "/marketing/reviews", label: "Overview", end: true },
  { to: "/marketing/reviews/pipeline", label: "Review Pipeline" },
  { to: "/marketing/reviews/requests", label: "Ask for Reviews" },
];

export const WEBSITE_TABS: PageTab[] = [
  { to: "/marketing/website", label: "Overview", end: true },
  { to: "/marketing/website/pages", label: "Pages" },
  { to: "/marketing/website/insights", label: "Insights" },
];

export const SOCIAL_TABS: PageTab[] = [
  { to: "/marketing/social", label: "Overview", end: true },
  { to: "/marketing/social/ideas", label: "Ideas" },
  { to: "/marketing/social/calendar", label: "Calendar" },
  { to: "/marketing/social/posts", label: "My Posts" },
  { to: "/marketing/social/insights", label: "Insights" },
];

export const COMMERCIAL_OUTREACH_TABS: PageTab[] = [
  { to: "/marketing/outreach", label: "Overview", end: true },
  { to: "/marketing/outreach/schedule", label: "Schedule" },
  { to: "/marketing/outreach/emails", label: "Emails Sent" },
  { to: "/marketing/outreach/data", label: "Full Data" },
  { to: "/marketing/outreach/sms", label: "SMS" },
];

export const REACTIVATION_TABS: PageTab[] = [
  { to: "/marketing/reactivation", label: "Overview", end: true },
  { to: "/marketing/reactivation/pipeline", label: "Pipeline" },
  { to: "/marketing/reactivation/data", label: "Full Data" },
];

export const GROUP_OUTREACH_TABS: PageTab[] = [
  { to: "/marketing/groups", label: "Overview", end: true },
];

// The Inbox is a single unified, grouped-by-stage view (no SMS/Email split), so
// it renders its PageBar with an explicit section label and no tabs.

export const LEADS_TABS: PageTab[] = [
  // Sales = the consolidated sales pipeline board (the section default). Trash =
  // the dead-lead pipeline board. Organic = form + chat leads. All three live
  // under /sales/leads so the single "Leads" sidebar row stays highlighted.
  { to: "/sales/leads", label: "Sales", end: true },
  { to: "/sales/leads/trash", label: "Trash" },
  { to: "/sales/leads/organic", label: "Organic" },
];

// The bold section label <PageBar> shows to the left of the tabs. Matched to the
// tab array by identity so a page only passes `tabs` and the label stays in sync
// with the sidebar's section name. Keep these equal to the nav labels in nav.ts.
export function sectionLabel(tabs: PageTab[]): string {
  if (tabs === WEBSITE_TABS) return "Website";
  if (tabs === SOCIAL_TABS) return "Social Media";
  if (tabs === REVIEWS_TABS) return "Google Reviews";
  if (tabs === PAID_ADS_TABS) return "Paid Ads";
  if (tabs === COMMERCIAL_OUTREACH_TABS) return "Commercial Outreach";
  if (tabs === REACTIVATION_TABS) return "Reactivation";
  if (tabs === GROUP_OUTREACH_TABS) return "Group Outreach";
  if (tabs === LEADS_TABS) return "Leads";
  return "";
}
