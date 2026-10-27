import { describe, expect, it } from "vitest";
import {
  MAX_SCRIPT_HTML,
  safeHref,
  scriptColumn,
  tagDecision,
  validateScriptBody,
} from "./setterScript";
import scriptRoute from "../api/admin/setter/script.ts?raw";

// sanitizeScriptHtml itself needs the runtime's HTMLRewriter (wrangler/prod
// only), so the tests pin the pure decisions it applies.

describe("scriptColumn", () => {
  it("is the notes only when asked for by name; anything else is the script", () => {
    expect(scriptColumn("notes")).toBe("notes_html");
    for (const doc of [undefined, null, "", "script", "NOTES", 1]) expect(scriptColumn(doc)).toBe("html");
  });

  it("notes are sanitized on the way in exactly like the script", () => {
    const patch = scriptRoute.slice(scriptRoute.indexOf("onRequestPatch"));
    const sanitized = patch.indexOf("await sanitizeScriptHtml(body.html!)");
    expect(sanitized).toBeGreaterThan(0);
    expect(patch.indexOf("[column]: html")).toBeGreaterThan(sanitized);
  });
});

describe("tagDecision", () => {
  it("keeps formatting tags", () => {
    for (const t of ["p", "h1", "ul", "li", "strong", "em", "a", "br"]) {
      expect(tagDecision(t)).toBe("keep");
    }
  });

  it("is case-insensitive", () => {
    expect(tagDecision("STRONG")).toBe("keep");
    expect(tagDecision("SCRIPT")).toBe("drop");
  });

  it("drops executable/invisible containers with their contents", () => {
    for (const t of ["script", "style", "iframe", "object", "embed", "svg", "template"]) {
      expect(tagDecision(t)).toBe("drop");
    }
  });

  it("unwraps everything else, keeping the text", () => {
    for (const t of ["table", "img", "form", "input", "video", "article"]) {
      expect(tagDecision(t)).toBe("unwrap");
    }
  });
});

describe("safeHref", () => {
  it("allows http and https", () => {
    expect(safeHref("https://docs.google.com/doc")).toBe("https://docs.google.com/doc");
    expect(safeHref("http://example.com")).toBe("http://example.com");
  });

  it("rejects javascript:, data:, relative and empty values", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("/relative")).toBeNull();
    expect(safeHref("")).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});

describe("validateScriptBody", () => {
  it("requires tenantId", () => {
    expect(validateScriptBody({ html: "" }).code).toBe("missing_tenant_id");
  });

  it("requires html to be a string (empty is a legal script)", () => {
    expect(validateScriptBody({ tenantId: "t" }).code).toBe("missing_html");
    expect(validateScriptBody({ tenantId: "t", html: "" }).ok).toBe(true);
  });

  it("caps the size", () => {
    const big = "x".repeat(MAX_SCRIPT_HTML + 1);
    expect(validateScriptBody({ tenantId: "t", html: big }).code).toBe("too_long");
  });
});
