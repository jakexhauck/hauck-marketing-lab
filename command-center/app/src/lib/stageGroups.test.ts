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

describe("mapStageNameToGroup", () => {
  it("maps early stages", () => {
    expect(mapStageNameToGroup("Lead In")).toBe("lead_in");
    expect(mapStageNameToGroup("Lead In No Appointment Booked")).toBe("lead_in");
    expect(mapStageNameToGroup("Lead Responded")).toBe("lead_responded");
  });
  it("maps sales stages", () => {
    expect(mapStageNameToGroup("Estimate Scheduled")).toBe("estimate_scheduled");
    expect(mapStageNameToGroup("Estimate Completed/Quote Given")).toBe("estimate_completed");
    expect(mapStageNameToGroup("Apt Completed/ Quote Given")).toBe("estimate_completed");
    expect(mapStageNameToGroup("Job Booked")).toBe("job_booked");
    expect(mapStageNameToGroup("Job Completed")).toBe("job_completed");
  });
  it("maps follow-up and dead-ends", () => {
    expect(mapStageNameToGroup("Follow Up - Not Ready")).toBe("follow_up");
    expect(mapStageNameToGroup("Followup - Not ready")).toBe("follow_up");
    expect(mapStageNameToGroup("No Answer")).toBe("closed");
    expect(mapStageNameToGroup("Not Qualified")).toBe("closed");
    expect(mapStageNameToGroup("No-Close")).toBe("closed");
    expect(mapStageNameToGroup("Abandoned")).toBe("closed");
  });
  it("defaults unknown and empty to new", () => {
    expect(mapStageNameToGroup("Intro Call Confirmed")).toBe("new");
    expect(mapStageNameToGroup("Intro Call Waiting Confirmation")).toBe("new");
    expect(mapStageNameToGroup(null)).toBe("new");
    expect(mapStageNameToGroup("")).toBe("new");
  });
});

describe("groupConversations", () => {
  it("returns all nine groups in order", () => {
    const out = groupConversations([]);
    expect(out.map((g) => g.meta.key)).toEqual(STAGE_GROUPS.map((g) => g.key));
  });
  it("buckets by resolved stageName and falls back to new", () => {
    const items = [
      conv({ id: "a", stageName: "Lead In" }),
      conv({ id: "b", stageName: "Job Booked" }),
      conv({ id: "c", stageName: undefined }),
    ];
    const byKey = Object.fromEntries(
      groupConversations(items).map((g) => [g.meta.key, g.items.map((i) => i.id)]),
    );
    expect(byKey.lead_in).toEqual(["a"]);
    expect(byKey.job_booked).toEqual(["b"]);
    expect(byKey.new).toEqual(["c"]);
  });
  it("rises unread to top, longest-wait-first", () => {
    const items = [
      conv({ id: "read", stageName: "Lead In", unreadCount: 0, lastMessageAt: "2026-07-06T10:00:00Z" }),
      conv({ id: "newer-unread", stageName: "Lead In", unreadCount: 1, lastMessageAt: "2026-07-06T09:00:00Z" }),
      conv({ id: "older-unread", stageName: "Lead In", unreadCount: 2, lastMessageAt: "2026-07-06T08:00:00Z" }),
    ];
    const leadIn = groupConversations(items).find((g) => g.meta.key === "lead_in")!;
    expect(leadIn.items.map((i) => i.id)).toEqual(["older-unread", "newer-unread", "read"]);
  });
});
