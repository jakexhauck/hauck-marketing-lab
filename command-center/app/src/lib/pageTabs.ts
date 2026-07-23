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
  // The client tracking sheet, trimmed to what earns a tab (2026-07-23). Lead
  // Tracker = the lead list (the section default); Meta Data = the raw daily ad
  // snapshot. Media (live ad creatives) is kept from the old Paid Ads: the one
  // useful thing the sheet never had. Dashboard, Pipeline Stats and How to Use
  // were removed at Jake's call.
  { to: "/marketing/paid-ads", label: "Lead Tracker", end: true },
  { to: "/marketing/paid-ads/meta", label: "Meta Data" },
  { to: "/marketing/paid-ads/media", label: "Media" },
];

export const REVIEWS_TABS: PageTab[] = [
  { to: "/marketing/reviews/pipeline", label: "Review Pipeline" },
  { to: "/marketing/reviews/requests", label: "Ask for Reviews" },
  { to: "/marketing/reviews/chats", label: "Chats" },
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
  // One page: the Lead Tracker (ported from the client tracking sheet). The
  // old Sales/Trash boards and Organic list folded into it 2026-07-23.
  { to: "/sales/leads", label: "Lead Tracker", end: true },
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
