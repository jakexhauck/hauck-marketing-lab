import { describe, it, expect } from "vitest";
import { MAX_IDS, parseIds } from "./leads";

// The Power dialer asks for the two or three prospects the phone has been on
// instead of the whole book. The book at 746 rows is what made this handler
// exceed Cloudflare's Worker CPU budget, so "how many ids may be asked for" is
// the thing that has to stay bounded.
describe("parseIds", () => {
  it("returns null when the parameter is absent, which means the whole book", () => {
    expect(parseIds(null)).toBeNull();
  });

  it("returns an empty list for an empty parameter rather than the whole book", () => {
    // ?ids= with nothing after it is "nobody is on the phone", and that must not
    // silently widen into a request for every lead.
    expect(parseIds("")).toEqual([]);
  });

  it("splits, trims and drops the gaps", () => {
    expect(parseIds(" a , b ,, c ")).toEqual(["a", "b", "c"]);
  });

  it("dedupes, because the live-calls list can name one prospect twice", () => {
    expect(parseIds("a,b,a")).toEqual(["a", "b"]);
  });

  it("caps the list, so an id list cannot become the request it replaced", () => {
    const many = Array.from({ length: MAX_IDS + 25 }, (_, i) => `id-${i}`).join(",");
    expect(parseIds(many)).toHaveLength(MAX_IDS);
  });
});
