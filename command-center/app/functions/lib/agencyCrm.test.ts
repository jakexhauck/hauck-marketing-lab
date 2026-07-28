import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pushColdCallOutcome, readableError, toE164, upsertAgencyContact } from "./agencyCrm";
import { ALL_CC_TAGS, CC_TAGS, tagsForOutcome } from "./agencyGhl";
import type { Env } from "./env";

const env = {
  AGENCY_GHL_LOCATION_ID: "loc_1",
  AGENCY_GHL_TOKEN: "tok_1",
  AGENCY_TIMEZONE: "America/New_York",
} as unknown as Env;

function lead(over: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    firstName: "Marcus",
    lastName: "Bell",
    phone: "(313) 555-0142",
    email: "",
    source: "Roofers list",
    ghlContactId: null,
    ...over,
  };
}

let calls: { url: string; method: string; body: Record<string, unknown> }[] = [];

function mockGhl(handler?: (url: string, method: string) => { status?: number; body?: unknown }) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({
      url: String(url),
      method,
      body: init.body ? JSON.parse(String(init.body)) : {},
    });
    const custom = handler?.(String(url), method);
    if (custom?.status && custom.status >= 400) {
      return new Response(JSON.stringify(custom.body ?? {}), { status: custom.status });
    }
    if (custom?.body) return Response.json(custom.body);
    if (String(url).includes("/contacts/upsert")) {
      return Response.json({ contact: { id: "contact_1" } });
    }
    return Response.json({ succeeded: true });
  }));
}

const tagCall = (method: string) => calls.find((c) => c.url.endsWith("/tags") && c.method === method);

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toE164", () => {
  it("builds a US number from ten digits", () => {
    expect(toE164("(313) 555-0142")).toBe("+13135550142");
  });

  it("keeps a number that already carries the country code", () => {
    expect(toE164("1-313-555-0142")).toBe("+13135550142");
  });

  it("refuses to invent a number it cannot read", () => {
    expect(toE164("555-0142")).toBeNull();
    expect(toE164("")).toBeNull();
  });
});

describe("tagsForOutcome", () => {
  it("tags the first unanswered call day 1 and every one after it day 2", () => {
    expect(tagsForOutcome("no_answer", 1)?.tag).toBe(CC_TAGS.noAnswerDay1);
    expect(tagsForOutcome("no_answer", 2)?.tag).toBe(CC_TAGS.noAnswerDay2);
    // Stops at 2 rather than inventing a day 7 nobody built a workflow for.
    expect(tagsForOutcome("no_answer", 7)?.tag).toBe(CC_TAGS.noAnswerDay2);
  });

  it("gives the talking outcomes their own tag", () => {
    expect(tagsForOutcome("brush_off")?.tag).toBe(CC_TAGS.brushOff);
    expect(tagsForOutcome("not_interested")?.tag).toBe(CC_TAGS.notInterested);
    expect(tagsForOutcome("callback")?.tag).toBe(CC_TAGS.callBack);
  });

  it("leaves no tag on a booking, because the appointment is the state change", () => {
    const tags = tagsForOutcome("booked");
    expect(tags?.tag).toBeNull();
    // And still clears whatever the prospect was carrying, so a booked
    // prospect cannot stay in a no-answer sequence.
    expect(tags?.removeTags).toEqual(ALL_CC_TAGS);
  });

  it("removes every other cc tag, so a contact carries exactly one", () => {
    const tags = tagsForOutcome("callback")!;
    expect(tags.removeTags).not.toContain(CC_TAGS.callBack);
    expect(tags.removeTags.sort()).toEqual(
      ALL_CC_TAGS.filter((t) => t !== CC_TAGS.callBack).sort(),
    );
  });

  it("only ever touches tags the app owns", () => {
    for (const outcome of ["no_answer", "brush_off", "not_interested", "callback", "booked"]) {
      const tags = tagsForOutcome(outcome)!;
      for (const tag of [...tags.removeTags, tags.tag].filter(Boolean)) {
        expect(tag as string).toMatch(/^cc /);
      }
    }
  });

  it("returns nothing for an outcome with no GHL meaning", () => {
    expect(tagsForOutcome("voicemail")).toBeNull();
  });
});

describe("upsertAgencyContact", () => {
  it("sends the prospect in E.164 with the list as the source", async () => {
    mockGhl();
    const result = await upsertAgencyContact(env, lead());
    expect(result.ok).toBe(true);
    expect(result.contactId).toBe("contact_1");
    expect(calls[0].body).toMatchObject({
      locationId: "loc_1",
      phone: "+13135550142",
      source: "Roofers list",
    });
  });

  it("refuses a prospect with nothing to key on, rather than creating a duplicate every call", async () => {
    mockGhl();
    const result = await upsertAgencyContact(env, lead({ phone: "", email: "" }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no phone or email/i);
    expect(calls).toHaveLength(0);
  });

  it("reports the account being unconnected as configuration, not failure", async () => {
    mockGhl();
    const result = await upsertAgencyContact({} as Env, lead());
    expect(result.notConfigured).toBe(true);
    expect(result.error).toBeNull();
  });
});

describe("pushColdCallOutcome", () => {
  it("creates the contact and leaves one tag on it", async () => {
    mockGhl();
    const result = await pushColdCallOutcome(env, { lead: lead(), outcome: "no_answer" });

    expect(result.ok).toBe(true);
    expect(result.contactId).toBe("contact_1");
    expect(tagCall("POST")?.body.tags).toEqual([CC_TAGS.noAnswerDay1]);
    expect(tagCall("DELETE")?.body.tags).not.toContain(CC_TAGS.noAnswerDay1);
  });

  it("reuses a contact it already knows rather than upserting again", async () => {
    mockGhl();
    await pushColdCallOutcome(env, {
      lead: lead({ ghlContactId: "contact_9" }),
      outcome: "brush_off",
    });
    expect(calls.some((c) => c.url.includes("/contacts/upsert"))).toBe(false);
    expect(tagCall("POST")?.url).toContain("contact_9");
  });

  it("moves a prospect from day 1 to day 2 on the second unanswered call", async () => {
    mockGhl();
    await pushColdCallOutcome(env, {
      lead: lead({ ghlContactId: "c" }),
      outcome: "no_answer",
      attempt: 2,
    });
    expect(tagCall("POST")?.body.tags).toEqual([CC_TAGS.noAnswerDay2]);
    expect(tagCall("DELETE")?.body.tags).toContain(CC_TAGS.noAnswerDay1);
  });

  it("adds no tag for a booking but still clears the old one", async () => {
    mockGhl();
    await pushColdCallOutcome(env, { lead: lead({ ghlContactId: "c" }), outcome: "booked" });
    expect(tagCall("POST")).toBeUndefined();
    expect(tagCall("DELETE")?.body.tags).toEqual(ALL_CC_TAGS);
  });

  it("drops a task on the contact for the morning of the agreed callback", async () => {
    mockGhl();
    await pushColdCallOutcome(env, {
      lead: lead({ ghlContactId: "c" }),
      outcome: "callback",
      followUpDate: "2026-07-29",
    });
    const task = calls.find((c) => c.url.endsWith("/tasks"));
    expect(task?.body).toMatchObject({
      title: "Call back: Marcus Bell",
      completed: false,
      assignedTo: "kQawsNSJbC7UApa6f4Am",
    });
    // 9am New York on 29 July is 13:00 UTC (daylight saving).
    expect(task?.body.dueDate).toBe("2026-07-29T13:00:00.000Z");
  });

  // 0064: before this, a prospect who said "call me at two" got a task saying
  // nine, and the caller found out by being an hour into somebody's lunch.
  it("puts the task at the agreed time when one was given", async () => {
    mockGhl();
    await pushColdCallOutcome(env, {
      lead: lead({ ghlContactId: "c" }),
      outcome: "callback",
      followUpDate: "2026-07-29",
      followUpTime: "14:30",
    });
    const task = calls.find((c) => c.url.endsWith("/tasks"));
    // 2:30pm New York on 29 July is 18:30 UTC.
    expect(task?.body.dueDate).toBe("2026-07-29T18:30:00.000Z");
  });

  // A `time` column comes back with seconds attached, and the same value can
  // arrive from the picker without them. Both are the same o'clock.
  it("accepts the time in the shape the database returns it", async () => {
    mockGhl();
    await pushColdCallOutcome(env, {
      lead: lead({ ghlContactId: "c" }),
      outcome: "callback",
      followUpDate: "2026-07-29",
      followUpTime: "14:30:00",
    });
    const task = calls.find((c) => c.url.endsWith("/tasks"));
    expect(task?.body.dueDate).toBe("2026-07-29T18:30:00.000Z");
  });

  // "Thursday, some time" is a real thing a prospect says. It must not become
  // an invented appointment, so it stays the start of the working day.
  it("falls back to 9am when the time is missing or unusable", async () => {
    for (const time of [null, "", "half two"]) {
      mockGhl();
      await pushColdCallOutcome(env, {
        lead: lead({ ghlContactId: "c" }),
        outcome: "callback",
        followUpDate: "2026-07-29",
        followUpTime: time,
      });
      const task = calls.find((c) => c.url.endsWith("/tasks"));
      expect(task?.body.dueDate).toBe("2026-07-29T13:00:00.000Z");
    }
  });

  it("makes no task when no date was agreed", async () => {
    mockGhl();
    await pushColdCallOutcome(env, { lead: lead({ ghlContactId: "c" }), outcome: "callback" });
    expect(calls.some((c) => c.url.endsWith("/tasks"))).toBe(false);
  });

  it("never deletes a contact, only tags", async () => {
    mockGhl();
    for (const outcome of ["no_answer", "brush_off", "not_interested", "callback", "booked"]) {
      await pushColdCallOutcome(env, { lead: lead({ ghlContactId: "c" }), outcome });
    }
    const destructive = calls.filter((c) => c.method === "DELETE" && !c.url.endsWith("/tags"));
    expect(destructive).toEqual([]);
  });

  it("never creates or moves an opportunity: the pipeline is Jake's to drive", async () => {
    mockGhl();
    for (const outcome of ["no_answer", "brush_off", "not_interested", "callback", "booked"]) {
      await pushColdCallOutcome(env, { lead: lead({ ghlContactId: "c" }), outcome });
    }
    expect(calls.some((c) => c.url.includes("/opportunities"))).toBe(false);
  });

  it("hands back a readable error rather than throwing at the caller", async () => {
    mockGhl((url) =>
      url.endsWith("/tags")
        ? { status: 403, body: { message: "The token does not have contacts.write" } }
        : {},
    );
    const result = await pushColdCallOutcome(env, { lead: lead(), outcome: "no_answer" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("The token does not have contacts.write");
    // The contact it did manage to create is still reported, so the next press
    // does not create a second one.
    expect(result.contactId).toBe("contact_1");
  });

  it("does nothing in GHL for an outcome nobody mapped", async () => {
    mockGhl();
    const result = await pushColdCallOutcome(env, { lead: lead(), outcome: "voicemail" });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("readableError", () => {
  it("pulls the message out of a GHL error body", () => {
    expect(
      readableError(new Error('GHL POST /contacts returned 422: {"message":"phone is invalid"}')),
    ).toBe("phone is invalid");
  });

  it("truncates anything else so the console can show it", () => {
    expect(readableError(new Error("x".repeat(400)))).toHaveLength(160);
  });
});
