import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";

// The Paid Ads launch gate, rendered for real (server-side, no DOM needed): a
// client whose ads have not launched sees "coming soon" on every ads page and
// no number is ever fetched for them; a launched client gets the page.

const status = vi.hoisted(() => ({ current: { data: undefined as unknown, isLoading: false, isError: false } }));
const trackerEnabled = vi.hoisted(() => [] as boolean[]);
const metaEnabled = vi.hoisted(() => [] as boolean[]);

vi.mock("../../components/Shell", () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock("../../components/PageBar", () => ({ default: () => null }));
vi.mock("../../components/ads/tracker/DashboardSheet", () => ({ default: () => "DASHBOARD_SHEET" }));
vi.mock("../../components/ads/tracker/MetaDataTable", () => ({ default: () => "META_TABLE" }));
vi.mock("../../components/ads/tracker/LeadTrackerTable", () => ({ default: () => "LEAD_TABLE" }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ session: { mode: "live" } }) }));
vi.mock("../../hooks/useApi", () => ({
  useAdsStatusQuery: () => status.current,
  useAdsTrackerQuery: (_r: unknown, _l: unknown, enabled: boolean) => {
    trackerEnabled.push(enabled);
    return enabled
      ? { data: { leads: [], statusMode: "auto" }, isLoading: false, isError: false }
      : { data: undefined, isLoading: false, isError: false };
  },
  useAdsMetaDataQuery: (enabled: boolean) => {
    metaEnabled.push(enabled);
    return { data: enabled ? { rows: [] } : undefined, isLoading: false, isError: false };
  },
  useMarkLead: () => ({ mutate: () => {} }),
}));

import AdsDashboard from "./AdsDashboard";
import AdsLeadTracker from "./AdsLeadTracker";
import AdsMetaData from "./AdsMetaData";

const PAGES = { AdsDashboard, AdsLeadTracker, AdsMetaData };
const render = (C: () => ReactNode) => renderToString(createElement(C));

beforeEach(() => {
  trackerEnabled.length = 0;
  metaEnabled.length = 0;
});

describe.each(Object.entries(PAGES))("%s", (_name, Page) => {
  it("shows coming soon, and fetches nothing, before launch", () => {
    status.current = { data: { launched: false }, isLoading: false, isError: false };
    const html = render(Page);
    expect(html).toContain("Your ads haven&#x27;t launched yet");
    expect(html).toContain("Coming soon");
    expect(html).not.toMatch(/DASHBOARD_SHEET|META_TABLE|LEAD_TABLE/);
    expect([...trackerEnabled, ...metaEnabled].every((e) => e === false)).toBe(true);
  });

  it("shows the page once launched", () => {
    status.current = { data: { launched: true }, isLoading: false, isError: false };
    const html = render(Page);
    expect(html).not.toContain("launched yet");
    expect(html).toMatch(/DASHBOARD_SHEET|META_TABLE|LEAD_TABLE/);
  });

  it("does not flash coming soon while the status is loading", () => {
    status.current = { data: undefined, isLoading: true, isError: false };
    expect(render(Page)).not.toContain("launched yet");
  });
});
