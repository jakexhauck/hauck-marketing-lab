import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GhlConversation, GhlOpportunity } from "../../../../lib/ghl";

// The route's pure core (limit/cursor parsing, search matching, shaping and
// paging) is tested directly. The handler itself is tested against mocked
// transport: the one thing that must never regress here is the credential
// seam, so getGhlContextForTenant is mocked and asserted on rather than
// stubbed away silently.

vi.mock("../../../../lib/ghl", async (importActual) => {
  const actual = await importActual<typeof import("../../../../lib/ghl")>();
  return { ...actual, fetchAllConversations: vi.fn() };
});
vi.mock("../../../../lib/tenantGhl", async (importActual) => {
  const actual = await importActual<typeof import("../../../../lib/tenantGhl")>();
  return { ...actual, getGhlContextForTenant: vi.fn() };
});

import { fetchAllConversations } from "../../../../lib/ghl";
import { getGhlContextForTenant, TenantGhlError } from "../../../../lib/tenantGhl";
import {
  onRequestGet,
  parseLimit,
  parseCursor,
  matchesQuery,
  shapeThread,
  pagesNeeded,
  pageThreads,
  buildPlacementIndex,
  buildDndIndex,
  isUpstreamCapped,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from "./index";

const GCTX = { token: "tok_tenant_real", locationId: "loc_tenant_real", slug: "test-client", mode: "live" as const };

function conv(over: Partial<GhlConversation> = {}): GhlConversation {
  return {
    id: over.id ?? "cv1",
    contactId: over.contactId ?? "ct1",
    fullName: "Jane Doe",
    phone: "+15551234567",
    lastMessageBody: "hello there",
    lastMessageType: "TYPE_SMS",
    lastMessageDate: 1_700_000_000_000,
    unreadCount: 0,
    ...over,
  };
}

// N conversations, newest first, one minute apart.
function manyConvs(n: number): GhlConversation[] {
  const base = 1_700_000_000_000;
  return Array.from({ length: n }, (_, i) =>
    conv({
      id: `cv${i}`,
      contactId: `ct${i}`,
      fullName: `Contact ${i}`,
      lastMessageDate: base - i * 60_000,
    }),
  );
}

function makeCtx(url: string) {
  return {
    request: new Request(url),
    env: {} as Record<string, unknown>,
    data: { admin: { id: "admin-1" } },
  } as unknown as Parameters<typeof onRequestGet>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGhlContextForTenant).mockResolvedValue(GCTX);
});

describe("parseLimit", () => {
  it("defaults to 50 when absent or unparseable", () => {
    expect(parseLimit(null)).toBe(DEFAULT_LIMIT);
    expect(parseLimit("")).toBe(DEFAULT_LIMIT);
    expect(parseLimit("banana")).toBe(DEFAULT_LIMIT);
  });

  it("caps at MAX_LIMIT however large the caller asks", () => {
    expect(parseLimit(String(MAX_LIMIT))).toBe(MAX_LIMIT);
    expect(parseLimit(String(MAX_LIMIT + 1))).toBe(MAX_LIMIT);
    expect(parseLimit("100000")).toBe(MAX_LIMIT);
  });

  // The client grows its window in steps from the top, so a mid-range limit has
  // to pass through untouched. Written against MAX_LIMIT rather than a literal:
  // the previous version hardcoded the old cap of 100 and started failing the
  // moment the ceiling moved, which is noise rather than signal.
  it("passes a limit below the cap through unchanged", () => {
    expect(parseLimit("150")).toBe(150);
  });

  it("rejects zero and negatives, falling back to the default", () => {
    expect(parseLimit("0")).toBe(DEFAULT_LIMIT);
    expect(parseLimit("-5")).toBe(DEFAULT_LIMIT);
  });

  it("honours a sane explicit limit", () => {
    expect(parseLimit("10")).toBe(10);
  });
});

describe("parseCursor", () => {
  it("is 0 when absent or junk", () => {
    expect(parseCursor(null)).toBe(0);
    expect(parseCursor("nope")).toBe(0);
    expect(parseCursor("-3")).toBe(0);
  });

  it("reads a numeric offset", () => {
    expect(parseCursor("150")).toBe(150);
  });
});

describe("matchesQuery", () => {
  it("matches on name, case-insensitively", () => {
    expect(matchesQuery(conv({ fullName: "Jane Doe" }), "jane")).toBe(true);
    expect(matchesQuery(conv({ fullName: "Jane Doe" }), "DOE")).toBe(true);
    expect(matchesQuery(conv({ fullName: "Jane Doe" }), "bob")).toBe(false);
  });

  it("falls back to contactName when fullName is absent", () => {
    const c = conv({ fullName: undefined, contactName: "Bob Ross" });
    expect(matchesQuery(c, "ross")).toBe(true);
  });

  it("matches a phone regardless of formatting on either side", () => {
    const c = conv({ fullName: "Jane Doe", phone: "+1 (555) 123-4567" });
    expect(matchesQuery(c, "5551234567")).toBe(true);
    expect(matchesQuery(c, "(555) 123")).toBe(true);
    expect(matchesQuery(c, "5559999999")).toBe(false);
  });

  it("matches everything on an empty query", () => {
    expect(matchesQuery(conv(), "")).toBe(true);
  });
});

describe("shapeThread", () => {
  it("shapes the contract fields and normalizes the message type", () => {
    const t = shapeThread(conv({ lastMessageType: "TYPE_SMS" }));
    expect(t).toEqual({
      contactId: "ct1",
      name: "Jane Doe",
      preview: "hello there",
      lastMessageAt: new Date(1_700_000_000_000).toISOString(),
      lastMessageType: "SMS",
      unreadCount: 0,
      pipelineId: null,
      pipelineName: null,
      stageName: null,
      dnd: null,
    });
  });

  it("blanks the preview for system activity messages", () => {
    const t = shapeThread(
      conv({ lastMessageType: "TYPE_ACTIVITY_OPPORTUNITY", lastMessageBody: "stage moved" }),
    );
    expect(t.preview).toBe("");
  });

  it("falls back through name candidates to Unknown", () => {
    const t = shapeThread(
      conv({ fullName: undefined, contactName: undefined, phone: undefined, email: undefined }),
    );
    expect(t.name).toBe("Unknown");
  });
});

describe("pagesNeeded", () => {
  it("asks for a single page for the first small page of results", () => {
    expect(pagesNeeded(0, 50, false)).toBe(1);
  });

  it("grows with the cursor offset rather than fetching everything", () => {
    expect(pagesNeeded(100, 50, false)).toBe(2);
    expect(pagesNeeded(300, 100, false)).toBe(5);
  });

  it("never exceeds the hard page cap", () => {
    expect(pagesNeeded(100_000, 100, false)).toBeLessThanOrEqual(10);
  });

  it("scans a wider bounded window when searching", () => {
    expect(pagesNeeded(0, 50, true)).toBeGreaterThan(pagesNeeded(0, 50, false));
    expect(pagesNeeded(0, 50, true)).toBeLessThanOrEqual(10);
  });
});

// REGRESSION GUARD. The upstream read is capped, and a capped read used to be
// indistinguishable from a complete one: nextCursor came back null and the UI
// rendered "no matches" or a finished list. A setter on the phone would then
// tell a customer they are not in the system when they are simply further down
// than we looked. `truncated` is the fourth state that keeps that honest.
describe("isUpstreamCapped", () => {
  it("is true when the fetch came back full, so more probably exist", () => {
    expect(isUpstreamCapped(1000, 10)).toBe(true);
    expect(isUpstreamCapped(100, 1)).toBe(true);
  });

  it("is false when the fetch came back short of its cap", () => {
    expect(isUpstreamCapped(999, 10)).toBe(false);
    expect(isUpstreamCapped(0, 1)).toBe(false);
  });
});

describe("pageThreads truncation", () => {
  it("reports truncated when the upstream read was capped", () => {
    const r = pageThreads(manyConvs(100), {
      q: "nobody-matches-this",
      limit: 50,
      offset: 0,
      upstreamCapped: true,
    });
    // Zero matches AND truncated: the empty result is not proof of absence.
    expect(r.threads).toHaveLength(0);
    expect(r.truncated).toBe(true);
  });

  it("reports not truncated when the whole inbox was read", () => {
    const r = pageThreads(manyConvs(10), {
      q: "",
      limit: 50,
      offset: 0,
      upstreamCapped: false,
    });
    expect(r.truncated).toBe(false);
  });

  it("defaults to not truncated when the caller says nothing", () => {
    expect(pageThreads(manyConvs(10), { q: "", limit: 50, offset: 0 }).truncated).toBe(false);
  });
});

describe("pageThreads", () => {
  it("returns one page and a cursor when more remain", () => {
    const r = pageThreads(manyConvs(120), { q: "", limit: 50, offset: 0 });
    expect(r.threads).toHaveLength(50);
    expect(r.threads[0].contactId).toBe("ct0");
    expect(r.nextCursor).toBe("50");
  });

  it("follows the cursor to the next page", () => {
    const r = pageThreads(manyConvs(120), { q: "", limit: 50, offset: 50 });
    expect(r.threads).toHaveLength(50);
    expect(r.threads[0].contactId).toBe("ct50");
    expect(r.nextCursor).toBe("100");
  });

  it("returns a null cursor on the last page", () => {
    const r = pageThreads(manyConvs(120), { q: "", limit: 50, offset: 100 });
    expect(r.threads).toHaveLength(20);
    expect(r.nextCursor).toBeNull();
  });

  it("sorts newest first even when GHL returns them jumbled", () => {
    const convs = [
      conv({ id: "a", contactId: "a", lastMessageDate: 1000 }),
      conv({ id: "b", contactId: "b", lastMessageDate: 3000 }),
      conv({ id: "c", contactId: "c", lastMessageDate: 2000 }),
    ];
    const r = pageThreads(convs, { q: "", limit: 50, offset: 0 });
    expect(r.threads.map((t) => t.contactId)).toEqual(["b", "c", "a"]);
  });

  it("drops conversations with no contactId", () => {
    const r = pageThreads([conv({ contactId: undefined })], { q: "", limit: 50, offset: 0 });
    expect(r.threads).toHaveLength(0);
  });

  it("filters by the query before paging, not after", () => {
    const convs = [
      ...manyConvs(60),
      conv({ id: "z", contactId: "ctz", fullName: "Zebedee Zzz", lastMessageDate: 1 }),
    ];
    // "Zebedee" sorts last by date, so a filter applied after slicing would
    // lose it entirely.
    const r = pageThreads(convs, { q: "zebedee", limit: 50, offset: 0 });
    expect(r.threads).toHaveLength(1);
    expect(r.threads[0].contactId).toBe("ctz");
    expect(r.nextCursor).toBeNull();
  });
});

describe("GET /api/admin/setter/inbox", () => {
  it("400s without a tenantId", async () => {
    const res = await onRequestGet(makeCtx("https://x/api/admin/setter/inbox"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "missing_tenant_id" });
    expect(fetchAllConversations).not.toHaveBeenCalled();
  });

  it("rejects placeholder credentials rather than falling back to env creds", async () => {
    vi.mocked(getGhlContextForTenant).mockRejectedValue(
      new TenantGhlError(400, "ghl_not_connected", "Connect this client first."),
    );
    const res = await onRequestGet(makeCtx("https://x/api/admin/setter/inbox?tenantId=t1"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "ghl_not_connected" });
    // The credential failure must abort before any CRM traffic.
    expect(fetchAllConversations).not.toHaveBeenCalled();
  });

  it("resolves creds per tenant and never fetches the whole location unbounded", async () => {
    vi.mocked(fetchAllConversations).mockResolvedValue(manyConvs(120));
    const res = await onRequestGet(makeCtx("https://x/api/admin/setter/inbox?tenantId=t1"));
    expect(res.status).toBe(200);
    expect(getGhlContextForTenant).toHaveBeenCalledWith(expect.anything(), "t1");
    const [passedCtx, opts] = vi.mocked(fetchAllConversations).mock.calls[0];
    expect(passedCtx).toEqual(GCTX);
    expect(opts?.maxPages).toBe(1);
  });

  it("returns a page plus a nextCursor", async () => {
    vi.mocked(fetchAllConversations).mockResolvedValue(manyConvs(120));
    const res = await onRequestGet(makeCtx("https://x/api/admin/setter/inbox?tenantId=t1"));
    const body = (await res.json()) as { threads: unknown[]; nextCursor: string | null };
    expect(body.threads).toHaveLength(DEFAULT_LIMIT);
    expect(body.nextCursor).toBe("50");
  });

  it("caps the returned window at MAX_LIMIT even when asked for more", async () => {
    // More conversations than the cap, so the cap is what truncates the result
    // rather than the fixture running out.
    vi.mocked(fetchAllConversations).mockResolvedValue(manyConvs(MAX_LIMIT + 50));
    const res = await onRequestGet(
      makeCtx(`https://x/api/admin/setter/inbox?tenantId=t1&limit=${MAX_LIMIT * 2}`),
    );
    const body = (await res.json()) as { threads: unknown[] };
    expect(body.threads).toHaveLength(MAX_LIMIT);
  });

  // The growing-window client asks for a bigger window rather than walking an
  // offset, so serving a large window from the top is the normal path, not an
  // edge case.
  it("serves a grown window from the top", async () => {
    vi.mocked(fetchAllConversations).mockResolvedValue(manyConvs(300));
    const res = await onRequestGet(
      makeCtx("https://x/api/admin/setter/inbox?tenantId=t1&limit=150"),
    );
    const body = (await res.json()) as {
      threads: { contactId: string }[];
      nextCursor: string | null;
    };
    expect(body.threads).toHaveLength(150);
    // Still starts at the newest row: growing the window must never shift the
    // start, or it would reintroduce the skip that offset paging caused.
    expect(body.threads[0].contactId).toBe("ct0");
    expect(body.nextCursor).toBe("150");
  });

  it("filters server-side on q", async () => {
    vi.mocked(fetchAllConversations).mockResolvedValue([
      conv({ id: "a", contactId: "a", fullName: "Jane Doe" }),
      conv({ id: "b", contactId: "b", fullName: "Bob Ross" }),
    ]);
    const res = await onRequestGet(
      makeCtx("https://x/api/admin/setter/inbox?tenantId=t1&q=bob"),
    );
    const body = (await res.json()) as { threads: { contactId: string }[] };
    expect(body.threads).toHaveLength(1);
    expect(body.threads[0].contactId).toBe("b");
  });

  it("maps a GHL failure to 502", async () => {
    vi.mocked(fetchAllConversations).mockRejectedValue(new Error("GHL GET returned 500"));
    const res = await onRequestGet(makeCtx("https://x/api/admin/setter/inbox?tenantId=t1"));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "ghl_unavailable" });
  });
});

describe("buildPlacementIndex", () => {
  const PIPELINES = [
    { id: "p1", name: "1) Lead Form Pipeline", stages: [{ id: "s1", name: "Opted In" }] },
    { id: "p4", name: "4) Sales Pipeline", stages: [{ id: "s9", name: "Booked" }] },
  ];

  const opp = (over: Partial<GhlOpportunity> = {}): GhlOpportunity => ({
    id: over.id ?? "o1",
    contactId: "ct1",
    pipelineId: "p1",
    pipelineStageId: "s1",
    status: "open",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...over,
  });

  it("maps a contact to its pipeline and live stage name", () => {
    const index = buildPlacementIndex([opp()], PIPELINES);
    expect(index.get("ct1")).toEqual({
      pipelineId: "p1",
      pipelineName: "1) Lead Form Pipeline",
      stageName: "Opted In",
    });
  });

  it("reads the contact id off the nested contact when the flat one is absent", () => {
    const index = buildPlacementIndex(
      [opp({ contactId: undefined, contact: { id: "ct9" } })],
      PIPELINES,
    );
    expect(index.get("ct9")?.pipelineId).toBe("p1");
  });

  it("prefers an open opportunity over a closed one, whatever the dates say", () => {
    const index = buildPlacementIndex(
      [
        opp({ id: "won", pipelineId: "p4", pipelineStageId: "s9", status: "won", updatedAt: "2026-07-28T00:00:00.000Z" }),
        opp({ id: "open", status: "open", updatedAt: "2026-07-02T00:00:00.000Z" }),
      ],
      PIPELINES,
    );
    expect(index.get("ct1")?.pipelineId).toBe("p1");
  });

  it("takes the most recently touched when both are open", () => {
    const index = buildPlacementIndex(
      [
        opp({ id: "old", updatedAt: "2026-07-01T00:00:00.000Z" }),
        opp({ id: "new", pipelineId: "p4", pipelineStageId: "s9", updatedAt: "2026-07-20T00:00:00.000Z" }),
      ],
      PIPELINES,
    );
    expect(index.get("ct1")?.pipelineId).toBe("p4");
  });

  it("sorts on lastStatusChangeAt ahead of updatedAt", () => {
    const index = buildPlacementIndex(
      [
        opp({ id: "a", updatedAt: "2026-07-25T00:00:00.000Z" }),
        opp({
          id: "b",
          pipelineId: "p4",
          pipelineStageId: "s9",
          updatedAt: "2026-07-01T00:00:00.000Z",
          lastStatusChangeAt: "2026-07-27T00:00:00.000Z",
        }),
      ],
      PIPELINES,
    );
    expect(index.get("ct1")?.pipelineId).toBe("p4");
  });

  // An unresolvable pipeline would render as an empty chip, which reads as
  // "no stage" rather than "we could not tell".
  it("skips an opportunity whose pipeline this location no longer returns", () => {
    const index = buildPlacementIndex([opp({ pipelineId: "gone" })], PIPELINES);
    expect(index.size).toBe(0);
  });

  it("still places a lead whose stage id is unknown, with an empty stage", () => {
    const index = buildPlacementIndex([opp({ pipelineStageId: "retired" })], PIPELINES);
    expect(index.get("ct1")).toEqual({
      pipelineId: "p1",
      pipelineName: "1) Lead Form Pipeline",
      stageName: "",
    });
  });

  it("ignores opportunities with no contact", () => {
    const index = buildPlacementIndex([opp({ contactId: undefined })], PIPELINES);
    expect(index.size).toBe(0);
  });
});

describe("shapeThread placement", () => {
  it("attaches the contact's pipeline and stage", () => {
    const index = new Map([
      ["ct1", { pipelineId: "p1", pipelineName: "1) Lead Form Pipeline", stageName: "Opted In" }],
    ]);
    const t = shapeThread(conv({ contactId: "ct1" }), index);
    expect(t.pipelineId).toBe("p1");
    expect(t.stageName).toBe("Opted In");
  });

  it("nulls the placement for a contact holding no opportunity", () => {
    const t = shapeThread(conv({ contactId: "ct2" }), new Map());
    expect(t.pipelineId).toBeNull();
    expect(t.pipelineName).toBeNull();
    expect(t.stageName).toBeNull();
  });
});

describe("buildDndIndex", () => {
  it("indexes the roster the internal-recipient filter already fetched", () => {
    const index = buildDndIndex([
      { id: "ct1", dnd: false, dndSettings: { SMS: { status: "active" } } },
      { id: "ct2", dnd: true },
    ]);
    expect(index.get("ct1")?.channels).toEqual(["SMS"]);
    expect(index.get("ct2")?.all).toBe(true);
  });

  // Present-and-clear must be distinguishable from never-seen, so a contact
  // with nothing blocked is still indexed.
  it("keeps a contact with nothing blocked", () => {
    const index = buildDndIndex([{ id: "ct1", dnd: false }]);
    expect(index.get("ct1")).toEqual({ all: false, channels: [], reasons: {} });
  });

  it("skips a record that says nothing about DND at all", () => {
    expect(buildDndIndex([{ id: "ct1" }]).size).toBe(0);
  });

  it("skips a record with no id", () => {
    expect(buildDndIndex([{ dnd: true }]).size).toBe(0);
  });
});

describe("shapeThread DND", () => {
  it("attaches the contact's blocked channels", () => {
    const index = new Map([
      ["ct1", { all: false, channels: ["SMS"], reasons: { SMS: "TWILIO_ERROR_CODE: 30006" } }],
    ]);
    expect(shapeThread(conv({ contactId: "ct1" }), undefined, index).dnd).toEqual({
      all: false,
      channels: ["SMS"],
      reasons: { SMS: "TWILIO_ERROR_CODE: 30006" },
    });
  });

  // Null is "not in the roster we read", which the UI renders as no claim.
  it("nulls DND for a contact the roster did not hold", () => {
    expect(shapeThread(conv({ contactId: "ct2" }), undefined, new Map()).dnd).toBeNull();
  });
});
