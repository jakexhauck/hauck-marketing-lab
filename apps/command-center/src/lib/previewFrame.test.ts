import { afterEach, describe, expect, it, vi } from "vitest";

// previewFrame reads the token at MODULE LOAD, so each case stubs window and
// then imports the module fresh. These tests pin the two properties the design
// depends on: the token is picked up from the fragment, and it is scrubbed from
// the URL immediately so it cannot linger in the address bar or history.

interface FakeWindow {
  location: { hash: string; pathname: string; search: string };
  history: { replaceState: (a: unknown, b: string, url: string) => void };
}

function stubWindow(hash: string, pathname = "/marketing/paid-ads", search = "") {
  const replaced: string[] = [];
  const win: FakeWindow = {
    location: { hash, pathname, search },
    history: {
      replaceState: (_a, _b, url) => {
        replaced.push(url);
      },
    },
  };
  vi.stubGlobal("window", win);
  return replaced;
}

async function loadFresh() {
  vi.resetModules();
  return import("./previewFrame");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("preview frame token", () => {
  it("picks the token up from the URL fragment", async () => {
    stubWindow("#preview_token=abc.def");

    const mod = await loadFresh();

    expect(mod.isPreviewFrame()).toBe(true);
    expect(mod.previewHeaders()).toEqual({ "x-preview-token": "abc.def" });
  });

  it("strips the token from the URL so it cannot linger or be copied", async () => {
    const replaced = stubWindow("#preview_token=abc.def", "/sales/leads", "?q=1");

    await loadFresh();

    expect(replaced).toHaveLength(1);
    expect(replaced[0]).toBe("/sales/leads?q=1");
    expect(replaced[0]).not.toContain("abc.def");
  });

  it("keeps any other fragment content while removing only the token", async () => {
    const replaced = stubWindow("#preview_token=abc.def&section=stats");

    await loadFresh();

    expect(replaced[0]).toContain("section=stats");
    expect(replaced[0]).not.toContain("abc.def");
  });

  it("is inert in a normal tab, so ordinary requests are unchanged", async () => {
    stubWindow("");

    const mod = await loadFresh();

    expect(mod.isPreviewFrame()).toBe(false);
    expect(mod.previewHeaders()).toEqual({});
  });

  it("ignores an unrelated fragment", async () => {
    stubWindow("#section=stats");

    const mod = await loadFresh();

    expect(mod.isPreviewFrame()).toBe(false);
    expect(mod.previewHeaders()).toEqual({});
  });

  it("survives a history API that throws, having already read the token", async () => {
    const win = {
      location: { hash: "#preview_token=abc.def", pathname: "/home", search: "" },
      history: {
        replaceState: () => {
          throw new Error("blocked");
        },
      },
    };
    vi.stubGlobal("window", win);

    const mod = await loadFresh();

    expect(mod.previewHeaders()).toEqual({ "x-preview-token": "abc.def" });
  });

  it("does not persist the token anywhere it could outlive the frame", async () => {
    const sets: string[] = [];
    stubWindow("#preview_token=abc.def");
    vi.stubGlobal("localStorage", {
      setItem: (k: string) => sets.push(k),
      getItem: () => null,
    });
    vi.stubGlobal("sessionStorage", {
      setItem: (k: string) => sets.push(k),
      getItem: () => null,
    });

    await loadFresh();

    expect(sets).toEqual([]);
  });
});
