import { describe, it, expect } from "vitest";
import { decorate, shapeCard, type StoredVerdict } from "./coldSmsAgency";

const card = shapeCard({
  id: "o1",
  name: "Opp name",
  pipelineStageId: "s1",
  contact: { id: "c1", name: "Mike Smith", companyName: "Pro Doors", phone: "+13135550100", tags: ["sms v2"] },
});

describe("shapeCard", () => {
  it("names the card by the company, keeps the person apart", () => {
    expect(card).toMatchObject({ business: "Pro Doors", person: "Mike Smith", variation: "sms v2", contactId: "c1" });
    expect(shapeCard({ id: "o", createdAt: "2026-10-08T14:00:00Z" }).firstContactedAt).toBe("2026-10-08T14:00:00Z");
  });
  it("drops the person when it is just the company again", () => {
    expect(shapeCard({ id: "o", contact: { id: "c", name: "Pro Doors", companyName: "Pro Doors" } }).person).toBe("");
  });
});

describe("decorate", () => {
  const row = (key: string, verdict: StoredVerdict["verdict"]): StoredVerdict => ({
    contact_id: "c1",
    reply_key: key,
    reply_body: "old reply",
    verdict,
    classified_at: "",
  });

  it("shows the verdict when it is for this reply", () => {
    const [c] = decorate([card], new Map([["c1", { body: "yes", at: 100 }]]), new Map([["c1", row("100", "positive")]]));
    expect(c.verdict).toBe("positive");
    expect(c.reply?.body).toBe("yes");
  });
  it("hides a verdict that was for an older reply", () => {
    const [c] = decorate([card], new Map([["c1", { body: "STOP", at: 200 }]]), new Map([["c1", row("100", "positive")]]));
    expect(c.verdict).toBeNull();
    expect(c.reply?.body).toBe("STOP");
  });
  it("keeps the stored reply once Jake has answered", () => {
    const [c] = decorate([card], new Map(), new Map([["c1", row("100", "negative")]]));
    expect(c).toMatchObject({ verdict: "negative", reply: { body: "old reply", at: 100 } });
  });
});
