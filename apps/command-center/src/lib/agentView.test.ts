import { describe, it, expect } from "vitest";
import type { AgentItem, AgentMessage, ChatSummary } from "./agentWire";
import { clientRowView, groupChats, itemPayload, messageView, needsOkCounts, onlineLabel, pollMs } from "./agentView";

const chat = (id: string, updatedAt: string): ChatSummary => ({
  id,
  title: id,
  auto: false,
  hasRequest: false,
  lastLine: "",
  updatedAt,
});

const msg = (over: Partial<AgentMessage> = {}): AgentMessage => ({
  id: "m1",
  chatId: "c1",
  role: "ai",
  body: "",
  status: "done",
  tools: [],
  used: [],
  learned: [],
  itemId: null,
  fromAgent: null,
  followUpOf: null,
  grant: null,
  answerOf: null,
  error: null,
  createdAt: "2026-10-17T12:00:00",
  ...over,
});

const item = (over: Partial<AgentItem> = {}): AgentItem => ({
  id: "i1",
  tenantId: "t1",
  agent: "ads",
  chatId: null,
  fromAgent: null,
  kind: "ad",
  title: "Winter ads",
  status: "building",
  payload: {},
  approvedAt: null,
  updatedAt: "2026-10-17T12:00:00",
  ...over,
});

describe("groupChats", () => {
  // Local times on purpose: "Today" starts at the viewer's own midnight.
  const now = new Date(2026, 9, 17, 9, 30);

  it("splits at local midnight", () => {
    const groups = groupChats(
      [chat("a", new Date(2026, 9, 17, 0, 0).toISOString()), chat("b", new Date(2026, 9, 16, 23, 59).toISOString())],
      now,
    );
    expect(groups.map((g) => g.label)).toEqual(["Today", "This week"]);
    expect(groups[0].chats.map((c) => c.id)).toEqual(["a"]);
    expect(groups[1].chats.map((c) => c.id)).toEqual(["b"]);
  });

  it("splits at seven days", () => {
    const inside = new Date(now.getTime() - 7 * 86_400_000 + 60_000).toISOString();
    const outside = new Date(now.getTime() - 7 * 86_400_000 - 60_000).toISOString();
    const groups = groupChats([chat("old", outside), chat("week", inside)], now);
    expect(groups.map((g) => [g.label, g.chats.map((c) => c.id)])).toEqual([
      ["This week", ["week"]],
      ["Earlier", ["old"]],
    ]);
  });

  it("drops empty groups and sorts newest first", () => {
    const groups = groupChats(
      [chat("x", new Date(2026, 9, 17, 8).toISOString()), chat("y", new Date(2026, 9, 17, 9).toISOString())],
      now,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].chats.map((c) => c.id)).toEqual(["y", "x"]);
  });
});

describe("messageView", () => {
  it("maps used, learned and tools to chips", () => {
    const v = messageView(
      msg({ used: ["Client brain: before/after beats quotes"], learned: ["Willis daily cap is $40"], tools: ["Read Meta"] }),
    );
    expect(v.chips).toEqual([
      { kind: "used", text: "Client brain: before/after beats quotes" },
      { kind: "learned", text: "Learned: Willis daily cap is $40" },
    ]);
    expect(v.tools).toEqual(["Read Meta"]);
  });

  it("does not double a Learned prefix", () => {
    expect(messageView(msg({ learned: ["Learned: cap is $40"] })).chips).toEqual([
      { kind: "learned", text: "Learned: cap is $40" },
    ]);
  });

  it("flags pending messages", () => {
    expect(messageView(msg({ status: "queued" })).pending).toBe(true);
    expect(messageView(msg({ status: "running" })).pending).toBe(true);
    expect(messageView(msg({ status: "done" })).pending).toBe(false);
  });
});

describe("onlineLabel", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const at = (s: number) => ({ online: true, lastSeenAt: new Date(now.getTime() - s * 1000).toISOString() });

  it("is online at 89s and offline at 91s", () => {
    expect(onlineLabel(at(89), now)).toEqual({ online: true, label: "Agents online on Jake's PC" });
    expect(onlineLabel(at(91), now)).toEqual({ online: false, label: "Agents offline" });
  });

  it("is offline with no heartbeat or no status", () => {
    expect(onlineLabel({ online: false, lastSeenAt: null }, now).online).toBe(false);
    expect(onlineLabel(undefined, now).online).toBe(false);
  });
});

describe("pollMs", () => {
  it("polls fast while anything is queued or running", () => {
    expect(pollMs([msg(), msg({ status: "queued" })])).toBe(2000);
    expect(pollMs([msg({ status: "running" })])).toBe(2000);
    expect(pollMs([msg()])).toBe(15000);
    expect(pollMs(undefined)).toBe(15000);
  });
});

describe("needsOkCounts", () => {
  it("counts needs_ok per agent", () => {
    const counts = needsOkCounts([
      item({ agent: "ads", status: "needs_ok" }),
      item({ agent: "ads", status: "needs_ok" }),
      item({ agent: "ghl", status: "needs_ok" }),
      item({ agent: "ghl", status: "live" }),
    ]);
    expect(counts).toEqual({ ads: 2, ghl: 1 });
  });
});

describe("clientRowView", () => {
  it("says what is waiting and draws one dot per working agent", () => {
    const v = clientRowView([
      item({ agent: "ads", status: "needs_ok", updatedAt: "2026-10-17T10:00:00Z" }),
      item({ agent: "ads", status: "live", updatedAt: "2026-10-16T10:00:00Z" }),
      item({ agent: "research", status: "done" }),
      item({ agent: "creative", status: "building" }),
    ]);
    expect(v.next).toBe("1 waiting on you");
    expect(v.dots).toEqual(["d", "s", "w", "", "", ""]);
  });

  it("falls back to the newest building item, then All quiet", () => {
    expect(clientRowView([item({ title: "Winter page", agent: "landing" })]).next).toBe("Winter page");
    expect(clientRowView([]).next).toBe("All quiet");
  });
});

describe("itemPayload, a tasks card", () => {
  it("spells out each task change with its owner and reason, junk dropped", () => {
    const v = itemPayload({
      taskOps: [
        { op: "add", phase: "ghl", owner: "client", name: "Ask: who answers the phone", reason: "Not on the intake" },
        { op: "change", key: "ghl:a2p-submitted", owner: "jake", reason: "Jake does A2P here" },
        { op: "cut", key: "follow:job-reminders", reason: "No jobs in GHL" },
        "junk",
      ],
    });
    expect(v.taskChanges).toEqual([
      { kind: "Add", text: "Ask: who answers the phone (Client)", reason: "Not on the intake" },
      { kind: "Change", text: "ghl:a2p-submitted, owner Jake", reason: "Jake does A2P here" },
      { kind: "Cut", text: "follow:job-reminders", reason: "No jobs in GHL" },
    ]);
    expect(v.changes).toEqual([]);
  });
});

describe("itemPayload", () => {
  // What Jake approves on a GHL card must be what the server will allow: the
  // card lists its ops, in words, not just the agent's own plan text.
  it("spells out a GHL card's exact changes from its ops", () => {
    const v = itemPayload({
      ops: [
        { op: "write.customValue", args: { key: "Winter Page", value: "https://x.pages.dev" } },
        { op: "write.customField", args: { name: "Winter Offer", type: "TEXT" } },
        { op: "write.tag", args: { contactId: "c1", tag: "winter-offer" } },
        { op: "write.moveOpportunity", args: { opportunityId: "o1", pipelineId: "p1", stageId: "s2" } },
        { op: "write.somethingNew", args: { a: 1 } },
        "junk",
      ],
    });
    expect(v.changes.map((c) => c.text)).toEqual([
      'Set custom value "Winter Page" to "https://x.pages.dev"',
      'Create custom field "Winter Offer" (TEXT)',
      'Tag contact c1 with "winter-offer"',
      "Move opportunity o1 to stage s2 in pipeline p1",
      'write.somethingNew {"a":1}',
    ]);
    expect(itemPayload({}).changes).toEqual([]);
  });

  it("spells out an Ads card's Meta changes, budgets in dollars", () => {
    const v = itemPayload({
      ops: [
        { op: "pause", args: { level: "ad", id: "120210000000001", name: "Winter 2", adsetName: "Willis Winter", campaignName: "Fall" } },
        { op: "resume", args: { level: "adset", id: "120210000000002", name: "Willis Winter", campaignName: "Fall" } },
        { op: "dailyBudget", args: { level: "campaign", id: "120210000000003", name: "Fall", from: 4000, to: 5000 } },
      ],
    });
    expect(v.changes.every((c) => c.bold === undefined)).toBe(true);
    expect(v.changes.map((c) => c.text)).toEqual([
      'Pause ad "Winter 2" (id ending 000001) in ad set "Willis Winter" (campaign "Fall")',
      'Resume ad set "Willis Winter" (id ending 000002) (campaign "Fall")',
      'Campaign "Fall" (id ending 000003) daily budget $40.00 to $50.00',
    ]);
  });

  it("writes a budget in the account's own currency", () => {
    const v = itemPayload({
      ops: [
        { op: "dailyBudget", args: { level: "campaign", id: "120210000000003", name: "Fall", from: 4000, to: 5000, currency: "EUR" } },
        { op: "dailyBudget", args: { level: "campaign", id: "120210000000004", name: "Tokyo", from: 4000, to: 5000, currency: "JPY" } },
      ],
    });
    expect(v.changes.map((c) => c.text)).toEqual([
      'Campaign "Fall" (id ending 000003) daily budget 40.00 EUR to 50.00 EUR',
      'Campaign "Tokyo" (id ending 000004) daily budget 4000 JPY to 5000 JPY',
    ]);
  });

  it("shows a new ad's copy, button, destination and status, the status in bold", () => {
    const v = itemPayload({
      ops: [
        {
          op: "createAd",
          args: {
            adsetId: "120210000000009", adsetName: "Willis Winter", campaignName: "Fall", fileId: "f", fileName: "winter-3.jpg",
            name: "Winter 3", message: "Line one.\nLine two.", headline: "Free quote", description: "This week only",
            cta: "SIGN_UP", link: "http://fb.me/", leadFormId: "1234567890",
          },
        },
      ],
    });
    expect(v.changes).toEqual([
      { text: 'Create ad "Winter 3" in ad set "Willis Winter" (id ending 000009) (campaign "Fall") from Creatives file "winter-3.jpg"' },
      { text: "Primary text: Line one.\nLine two." },
      { text: "Headline: Free quote" },
      { text: "Description: This week only" },
      { text: "Button: SIGN_UP" },
      { text: "Link: http://fb.me/" },
      { text: "Lead form: 1234567890" },
      { text: "Status: ", bold: "PAUSED" },
    ]);
    const bare = itemPayload({ ops: [{ op: "createAd", args: { name: "W", adsetName: "A", campaignName: "C", videoId: "777", videoName: "v 4:5.mp4", message: "m", cta: "LEARN_MORE", link: "https://x.example", status: "ACTIVE" } }] });
    expect(bare.changes.map((c) => c.text)).toContain("Headline: none");
    expect(bare.changes.map((c) => c.text)).toContain("Description: none");
    expect(bare.changes[bare.changes.length - 1]).toEqual({ text: "Status: ", bold: "ACTIVE" });
  });

  it("reads a spend card's credits and what it makes", () => {
    const v = itemPayload({ credits: 24, what: "3 square images", grant: { kind: "spend", limit: 24 } });
    expect(v.credits).toBe(24);
    expect(v.what).toBe("3 square images");
    // The number shown is the grant's limit, the one Approve passes on,
    // never a separate figure the model wrote beside it.
    expect(itemPayload({ credits: 5, grant: { kind: "spend", limit: 500 } }).credits).toBe(500);
    expect(itemPayload({ credits: 24 }).credits).toBeNull();
    expect(itemPayload({ grant: { kind: "spend", limit: "24" } }).credits).toBeNull();
    expect(itemPayload({ grant: { kind: "spend", limit: -1 } }).credits).toBeNull();
    expect(itemPayload({ grant: { kind: "file", limit: 24 } }).credits).toBeNull();
    expect(itemPayload({}).what).toBeNull();
  });

  it("reads the known keys and drops bad shapes", () => {
    const v = itemPayload({
      steps: [{ label: "Angles", state: "done" }, { label: "Headline", state: "now" }, { label: "Push" }, { nope: 1 }],
      stats: [{ label: "CPL", value: "$41" }, { label: "Leads", value: 23 }, { label: "x" }],
      quote: "Fixed before the snow.",
      plan: ["Add step 1", 4],
      previewUrl: "javascript:alert(1)",
      thumbs: ["https://x/1.jpg", "http://x/2.jpg"],
    });
    expect(v.steps).toEqual([
      { label: "Angles", state: "done" },
      { label: "Headline", state: "now" },
      { label: "Push", state: "todo" },
    ]);
    expect(v.stats).toEqual([
      { label: "CPL", value: "$41" },
      { label: "Leads", value: "23" },
    ]);
    expect(v.quote).toBe("Fixed before the snow.");
    expect(v.plan).toEqual(["Add step 1"]);
    expect(v.previewUrl).toBeNull();
    expect(v.thumbs).toEqual(["https://x/1.jpg"]);
  });

  it("is empty for an empty payload", () => {
    expect(itemPayload({})).toEqual({
      steps: [],
      stats: [],
      quote: null,
      plan: [],
      previewUrl: null,
      liveUrl: null,
      deploy: false,
      thumbs: [],
      credits: null,
      what: null,
      changes: [],
      taskChanges: [],
    });
  });

  it("reads a landing page's preview, live URL and deploy grant", () => {
    const v = itemPayload({
      previewUrl: "https://d-1.hm-a.pages.dev",
      liveUrl: "https://hm-a.pages.dev",
      grant: { kind: "deploy" },
    });
    expect(v).toMatchObject({ previewUrl: "https://d-1.hm-a.pages.dev", liveUrl: "https://hm-a.pages.dev", deploy: true });
    expect(itemPayload({ grant: { kind: "spend" }, liveUrl: "javascript:x" })).toMatchObject({ deploy: false, liveUrl: null });
  });
});
