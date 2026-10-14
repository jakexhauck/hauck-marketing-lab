import { describe, it, expect } from "vitest";
import { AGENCY_LINKS, isSafeLink, knownLinks, linksReady } from "./agencyLinks";

describe("the link schema", () => {
  it("gives every link a unique key", () => {
    const keys = AGENCY_LINKS.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every link something to say about it", () => {
    for (const link of AGENCY_LINKS) {
      expect(link.label.length).toBeGreaterThan(0);
      expect(link.blurb.length).toBeGreaterThan(10);
    }
  });
});

describe("isSafeLink", () => {
  it("accepts web addresses", () => {
    expect(isSafeLink("https://docs.google.com/document/d/abc")).toBe(true);
    expect(isSafeLink("http://example.com")).toBe(true);
    expect(isSafeLink("  https://example.com  ")).toBe(true);
  });

  it("rejects anything empty or unparseable", () => {
    expect(isSafeLink("")).toBe(false);
    expect(isSafeLink("   ")).toBe(false);
    expect(isSafeLink("docs.google.com/no-scheme")).toBe(false);
  });

  // These end up as an href on an admin page. A javascript: URL in an href is a
  // script that runs on click, so the scheme is checked rather than assumed.
  it("rejects a scheme that would execute", () => {
    expect(isSafeLink("javascript:alert(1)")).toBe(false);
    expect(isSafeLink("JavaScript:alert(1)")).toBe(false);
    expect(isSafeLink("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeLink("vbscript:msgbox(1)")).toBe(false);
  });
});

describe("knownLinks", () => {
  it("keeps the keys we ship", () => {
    const out = knownLinks({ welcome_doc: "https://a.com", contract: "https://b.com" });
    expect(out).toEqual({ welcome_doc: "https://a.com", contract: "https://b.com" });
  });

  it("drops a key we no longer ship, so a stale row cannot render", () => {
    const out = knownLinks({ welcome_doc: "https://a.com", retired: "https://old.com" });
    expect(out.retired).toBeUndefined();
  });

  it("treats a blank as absent", () => {
    expect(knownLinks({ welcome_doc: "   " })).toEqual({});
  });
});

describe("linksReady", () => {
  it("counts only the ones that are really set", () => {
    expect(linksReady({})).toBe(0);
    expect(linksReady({ welcome_doc: "https://a.com" })).toBe(1);
    expect(linksReady({ welcome_doc: "https://a.com", contract: "https://b.com" })).toBe(2);
  });

  it("does not count something that is not a link", () => {
    expect(linksReady({ welcome_doc: "ask jake for it" })).toBe(0);
  });
});
