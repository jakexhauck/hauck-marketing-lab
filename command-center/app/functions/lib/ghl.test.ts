import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchAllOpportunities, type GhlContext } from "./ghl";

// fetchAllOpportunities pages until either a short (natural last) page, or the
// maxPages cap. Return value alone cannot distinguish "the tenant has exactly
// maxPages*100 records and there truly is no more" from "there IS more but we
// stopped fetching it": both leave `all.length === maxPages * 100`. The
// optional `truncated` output parameter is the only honest way to tell the
// two apart, so it is asserted directly here rather than inferred from length.

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonRes(data: unknown) {
  return { ok: true, json: async () => data };
}

const ctx: GhlContext = { token: "tok", locationId: "loc-1" };

function opp(id: string) {
  return { id, contactId: `c-${id}`, pipelineStageId: "s1" };
}

describe("fetchAllOpportunities truncation reporting", () => {
  it("does not report truncated when the last page is short", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonRes({
          opportunities: [opp("1"), opp("2")],
          meta: { total: 2 },
        }),
      ),
    );

    const truncated = { value: false };
    const all = await fetchAllOpportunities(ctx, { maxPages: 10, truncated });

    expect(all).toHaveLength(2);
    expect(truncated.value).toBe(false);
  });

  it("does not report truncated when a full final page is genuinely the last (no next cursor)", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => opp(String(i)));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonRes({
          opportunities: fullPage,
          // No nextPageUrl/startAfterId: this really is the last page even
          // though it is full.
          meta: { total: 100 },
        }),
      ),
    );

    const truncated = { value: false };
    const all = await fetchAllOpportunities(ctx, { maxPages: 10, truncated });

    expect(all).toHaveLength(100);
    expect(truncated.value).toBe(false);
  });

  it("reports truncated when pagination stops because maxPages was hit, not because data ran out", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        call += 1;
        const page = Array.from({ length: 100 }, (_, i) => opp(`${call}-${i}`));
        // Always claims there is a next page: the tenant genuinely has more
        // than maxPages * 100 records.
        return jsonRes({
          opportunities: page,
          meta: { startAfterId: `cursor-${call}`, startAfter: String(call) },
        });
      }),
    );

    const truncated = { value: false };
    const all = await fetchAllOpportunities(ctx, { maxPages: 3, truncated });

    expect(all).toHaveLength(300);
    expect(truncated.value).toBe(true);
  });

  it("leaves an unsupplied truncated output alone (backward compatible for existing callers)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonRes({ opportunities: [opp("1")], meta: {} })),
    );

    // No truncated param passed: must not throw, matching every one of the
    // 21 existing call sites that predate this option.
    await expect(fetchAllOpportunities(ctx, { maxPages: 10 })).resolves.toHaveLength(1);
  });
});
