import { describe, it, expect } from "vitest";
import { FakeDb } from "./agentFakeDb";
import { agentTick } from "./briefTicks";
import { sopTaskKey } from "../../src/lib/sopChecklists";

const T1 = "11111111-1111-4111-8111-111111111111";
const C1 = "55555555-5555-4555-8555-555555555555";
const M1 = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-10-17T12:00:00.000Z");

function world(over: { agent?: string; tenant?: string | null; status?: string } = {}) {
  return new FakeDb()
    .seed("agent_chats", [{ id: C1, tenant_id: over.tenant === undefined ? T1 : over.tenant, agent: over.agent ?? "ads", title: "x", auto: false }])
    .seed("agent_messages", [{ id: M1, chat_id: C1, role: "me", body: "Go", status: over.status ?? "running", meta: {} }]);
}

const ADS_LIVE = sopTaskKey("full-setup", "Facebook Ads", "Ads LIVE");

describe("agentTick", () => {
  it("ticks the agent's own box, as that agent", async () => {
    const db = world();
    const res = await agentTick(db.client(), { messageId: M1, labels: ["Ads LIVE"] }, now);
    expect(res).toEqual({ tenantId: T1, ticked: ["Ads LIVE"], refused: [] });
    expect(db.rows("onboarding_checklist")).toEqual([
      expect.objectContaining({ tenant_id: T1, task_key: ADS_LIVE, done: true, done_by: "agent:ads", done_at: now.toISOString() }),
    ]);
  });

  it("refuses a box in another agent's section and writes nothing for it", async () => {
    const db = world({ agent: "creative" });
    const res = await agentTick(db.client(), { messageId: M1, labels: ["Ads LIVE", "Invoice Paid"] }, now);
    expect(res).toMatchObject({ ticked: [], refused: ["Ads LIVE", "Invoice Paid"] });
    expect(db.rows("onboarding_checklist")).toEqual([]);
  });

  it("lets the Manager tick the call checklists", async () => {
    const db = world({ agent: "manager" });
    const res = await agentTick(db.client(), { messageId: M1, labels: ["Go Over Creatives", "Invoice Paid"] }, now);
    expect(res).toMatchObject({ ticked: ["Go Over Creatives", "Invoice Paid"], refused: [] });
    expect(db.rows("onboarding_checklist").map((r) => r.task_key).sort()).toEqual(
      [sopTaskKey("launch-call", "Todo", "Go Over Creatives"), sopTaskKey("full-setup", "Operations / Onboarding Call", "Invoice Paid")].sort(),
    );
  });

  it("ignores any section or agent in the request", async () => {
    const db = world({ agent: "research" });
    const res = await agentTick(db.client(), { messageId: M1, labels: ["Ads LIVE"], agent: "ads", section: "ads" } as never, now);
    expect(res).toMatchObject({ ticked: [], refused: ["Ads LIVE"] });
  });

  it("refuses a turn that is not running, at the agency, or a bad body", async () => {
    expect(await agentTick(world({ status: "done" }).client(), { messageId: M1, labels: ["Ads LIVE"] }, now)).toMatchObject({ error: 409 });
    expect(await agentTick(world({ tenant: null }).client(), { messageId: M1, labels: ["Ads LIVE"] }, now)).toMatchObject({ error: 403 });
    expect(await agentTick(world().client(), { messageId: "nope", labels: ["Ads LIVE"] }, now)).toMatchObject({ error: 400 });
    expect(await agentTick(world().client(), { messageId: M1, labels: "Ads LIVE" } as never, now)).toMatchObject({ error: 400 });
  });
});
