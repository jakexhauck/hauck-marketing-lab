import { describe, it, expect } from "vitest";
import { resolveScriptId } from "./selectedScript";

// resolveScriptId is the whole rule behind "tracked every single time", and it
// is pure, so it is tested directly. The localStorage half of the module is a
// browser store with no logic worth asserting about.

const scripts = [{ id: "v1" }, { id: "v2" }, { id: "v3" }, { id: "v4" }];

describe("resolveScriptId", () => {
  it("keeps a selection that still exists", () => {
    expect(resolveScriptId("v3", scripts)).toBe("v3");
  });

  // The reason the fallback exists: a caller who never opens the script panel
  // must still have their dials attributed, or the test has a silent hole in it
  // exactly where the least engaged caller is.
  it("falls back to the first script when nothing is selected", () => {
    expect(resolveScriptId(null, scripts)).toBe("v1");
  });

  // A stale localStorage value must not outlive the script it names, or dials
  // get credited to a variation that has been retired.
  it("drops a selection naming a script that is gone", () => {
    expect(resolveScriptId("archived-one", scripts)).toBe("v1");
  });

  it("has nothing to attribute a dial to when there are no scripts", () => {
    expect(resolveScriptId("v1", [])).toBeNull();
    expect(resolveScriptId(null, [])).toBeNull();
  });

  it("selects the only script there is", () => {
    expect(resolveScriptId(null, [{ id: "only" }])).toBe("only");
  });
});
