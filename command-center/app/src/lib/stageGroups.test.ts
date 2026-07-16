import { describe, it, expect } from "vitest";
import { mapStageNameToGroup, sortForQueue } from "./stageGroups";
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
  // Long Term Nurture is a LIVE Sales stage and now owns an Inbox tab, so it no
  // longer folds into the tab-less follow_up bucket (which hid it entirely).
  it("gives the live Long Term Nurture stage its own group, apart from Follow Up", () => {
    expect(mapStageNameToGroup("Follow Up")).toBe("follow_up");
    expect(mapStageNameToGroup("Long Term Nurture 🌱")).toBe("long_term_nurture");
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

describe("sortForQueue", () => {
  it("rises unread to top longest-wait-first, and reads newest-first below", () => {
    const items = [
      conv({ id: "read-old", unreadCount: 0, lastMessageAt: "2026-07-06T07:00:00Z" }),
      conv({ id: "read-new", unreadCount: 0, lastMessageAt: "2026-07-06T10:00:00Z" }),
      conv({ id: "newer-unread", unreadCount: 1, lastMessageAt: "2026-07-06T09:00:00Z" }),
      conv({ id: "older-unread", unreadCount: 2, lastMessageAt: "2026-07-06T08:00:00Z" }),
    ];
    expect(sortForQueue(items).map((i) => i.id)).toEqual([
      "older-unread",
      "newer-unread",
      "read-new",
      "read-old",
    ]);
  });
  it("does not mutate its input", () => {
    const items = [
      conv({ id: "a", unreadCount: 0, lastMessageAt: "2026-07-06T07:00:00Z" }),
      conv({ id: "b", unreadCount: 1, lastMessageAt: "2026-07-06T10:00:00Z" }),
    ];
    sortForQueue(items);
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
