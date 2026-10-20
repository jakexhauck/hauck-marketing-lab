import { afterEach, describe, expect, it, vi } from "vitest";
import { getColdSmsBoard } from "./api";

// The day view: parts read one after another, the head's replies laid over them
// (2026-10-20, all parts at once went past GHL's 100 calls per 10 seconds).

const card = (id: string, contactId: string) => ({
  id,
  contactId,
  business: "Shop",
  person: "",
  phone: "",
  tags: [],
  variation: null,
  stageId: "s1",
  movedAt: null,
  firstContactedAt: null,
  reply: null,
  verdict: null,
});

afterEach(() => vi.unstubAllGlobals());

describe("getColdSmsBoard (day)", () => {
  it("reads parts one at a time and lays the replies over the cards", async () => {
    let inFlight = 0;
    let most = 0;
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        inFlight++;
        most = Math.max(most, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        const body = !url.includes("part=")
          ? {
              configured: true,
              day: "2026-10-20",
              pipeline: { id: "p1", name: "Cold SMS" },
              parts: 3,
              pages: 25,
              replies: [["c1", { body: "yes please", at: 200 }]],
              stages: [{ id: "s1", name: "Replied", total: 0, cursor: null, cards: [] }],
            }
          : url.includes("part=0")
            ? {
                cards: [card("o1", "c1")],
                verdicts: [{ contact_id: "c1", reply_key: "200", reply_body: "yes please", verdict: "positive", classified_at: "" }],
              }
            : url.includes("part=1")
              ? { cards: [card("o2", "c2")], verdicts: [] }
              : { cards: [], verdicts: [] };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );

    const board = await getColdSmsBoard("2026-10-20");

    expect(most).toBe(1);
    expect(urls.filter((u) => u.includes("part=")).every((u) => u.includes("pipeline=p1"))).toBe(true);
    const cards = board.stages![0].cards;
    expect(cards.map((c) => c.id)).toEqual(["o1", "o2"]);
    expect(cards[0].reply).toEqual({ body: "yes please", at: 200 });
    expect(cards[0].verdict).toBe("positive");
    expect(cards[1].reply).toBeNull();
    expect("replies" in board).toBe(false);
  });
});
