import { describe, it, expect } from "vitest";
import { mapStageNameToGroup, groupConversations, STAGE_GROUPS } from "./stageGroups";
import type { ApiConversation } from "./api";

const conv = (over: Partial<ApiConversation>): ApiConversation => ({
  id: "c",
  contactId: "ct",
  name: "N",
  preview: "p",
  lastMessageType: "TYPE_SMS",
  lastMessageAt: "2026-07-06T00:00:00Z",
  unreadCount: 0,
  channel: "sms",
  origin: "form",
  source: "",
  firstTouchAt: "",
  ...over,
});

// Stage names below are the EXACT live Willis GHL stage names (emoji and all),
// pulled from `ghl opportunities pipelines` on 2026-07-15. The mapping keys off
// the lower-cased name via substring, so the emoji are along for the ride.
describe("mapStageNameToGroup — live Sales pipeline", () => {
  it("New Lead + no opportunity fall to New / Unsorted", () => {
    expect(mapStageNameToGroup("New Lead 🔔")).toBe("new");
    expect(mapStageNameToGroup(null)).toBe("new");
    expect(mapStageNameToGroup("")).toBe("new");
    expect(mapStageNameToGroup("Something Unmapped")).toBe("new");
  });
  it("maps the active Sales spine", () => {
    expect(mapStageNameToGroup("Hot Lead 🔥")).toBe("hot_lead");
    expect(mapStageNameToGroup("Phone Appointment Booked  📞")).toBe("phone_appt");
    expect(mapStageNameToGroup("Estimate Scheduled 📋")).toBe("estimate_scheduled");
    expect(mapStageNameToGroup("Estimate Completed")).toBe("estimate_completed");
    expect(mapStageNameToGroup("Job Booked 💼")).toBe("job_booked");
    expect(mapStageNameToGroup("Job Completed ✅")).toBe("job_completed");
  });
  it("groups Follow Up + Long Term Nurture together", () => {
    expect(mapStageNameToGroup("Follow Up")).toBe("follow_up");
    expect(mapStageNameToGroup("Long Term Nurture 🌱")).toBe("follow_up");
  });
});

describe("mapStageNameToGroup — Reactivation pipeline", () => {
  it("early reactivation stages nurture, dead-ends close", () => {
    expect(mapStageNameToGroup("Lead Contacted")).toBe("follow_up");
    expect(mapStageNameToGroup("Lead Responded")).toBe("follow_up");
    expect(mapStageNameToGroup("No Answer")).toBe("closed");
    expect(mapStageNameToGroup("Not Qualified")).toBe("closed");
  });
});

describe("mapStageNameToGroup — Trash pipeline all closes", () => {
  it("every Trash stage lands in Closed / Inactive", () => {
    expect(mapStageNameToGroup("No Answer 🤷")).toBe("closed");
    expect(mapStageNameToGroup("No Close ⛔")).toBe("closed");
    expect(mapStageNameToGroup("Opted Out 🚫")).toBe("closed");
    expect(mapStageNameToGroup("Phone Appointment No-Show ❌")).toBe("closed");
    // Must NOT read as an active "Phone Appointment" or "Lead In" stage.
    expect(mapStageNameToGroup("Lead In No Call Booked")).toBe("closed");
  });
});

describe("mapStageNameToGroup — Google Reviews out of the active sales view", () => {
  it("review-pipeline stages land in Closed / Inactive, never New", () => {
    expect(mapStageNameToGroup("Asked For Review")).toBe("closed");
    expect(mapStageNameToGroup("Review Link Clicked")).toBe("closed");
    expect(mapStageNameToGroup("Negative Feedback Received")).toBe("closed");
    expect(mapStageNameToGroup("Positive Review Submission")).toBe("closed");
  });
});

describe("groupConversations", () => {
  it("returns all groups in funnel order", () => {
    const out = groupConversations([]);
    expect(out.map((g) => g.meta.key)).toEqual(STAGE_GROUPS.map((g) => g.key));
  });
  it("buckets by resolved stageName and falls back to new", () => {
    const items = [
      conv({ id: "a", stageName: "Hot Lead 🔥" }),
      conv({ id: "b", stageName: "Job Booked 💼" }),
      conv({ id: "c", stageName: undefined }),
    ];
    const byKey = Object.fromEntries(
      groupConversations(items).map((g) => [g.meta.key, g.items.map((i) => i.id)]),
    );
    expect(byKey.hot_lead).toEqual(["a"]);
    expect(byKey.job_booked).toEqual(["b"]);
    expect(byKey.new).toEqual(["c"]);
  });
  it("rises unread to top, longest-wait-first", () => {
    const items = [
      conv({ id: "read", stageName: "Hot Lead 🔥", unreadCount: 0, lastMessageAt: "2026-07-06T10:00:00Z" }),
      conv({ id: "newer-unread", stageName: "Hot Lead 🔥", unreadCount: 1, lastMessageAt: "2026-07-06T09:00:00Z" }),
      conv({ id: "older-unread", stageName: "Hot Lead 🔥", unreadCount: 2, lastMessageAt: "2026-07-06T08:00:00Z" }),
    ];
    const hot = groupConversations(items).find((g) => g.meta.key === "hot_lead")!;
    expect(hot.items.map((i) => i.id)).toEqual(["older-unread", "newer-unread", "read"]);
  });
});
