import { describe, it, expect } from "vitest";
import { selectAllPages } from "./pagedSelect";

// PostgREST returns at most 1000 rows per read and says nothing. These pin that
// selectAllPages keeps asking until a short page, and never swallows an error.
describe("selectAllPages", () => {
  const table = Array.from({ length: 2345 }, (_, i) => ({ i }));
  const capped = (from: number, to: number) =>
    Promise.resolve({ data: table.slice(from, Math.min(to + 1, from + 1000)), error: null });

  it("reads past the 1000-row cap", async () => {
    const rows = await selectAllPages<{ i: number }>(capped);
    expect(rows).toHaveLength(2345);
    expect(rows[2344].i).toBe(2344);
  });

  it("stops on an exact multiple of the page size", async () => {
    const two = table.slice(0, 2000);
    const rows = await selectAllPages((from, to) =>
      Promise.resolve({ data: two.slice(from, to + 1), error: null }),
    );
    expect(rows).toHaveLength(2000);
  });

  it("throws on a page error rather than returning what arrived", async () => {
    let calls = 0;
    await expect(
      selectAllPages((from, to) => {
        calls++;
        return Promise.resolve(
          calls === 2
            ? { data: null, error: { message: "timeout" } }
            : { data: table.slice(from, to + 1), error: null },
        );
      }),
    ).rejects.toThrow("timeout");
  });
});
