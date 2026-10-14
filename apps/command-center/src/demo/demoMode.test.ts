import { afterEach, describe, expect, it, vi } from "vitest";
import { demoMode, clearDemoMode, __resetDemoModeCache } from "./demoMode";

// The app's vitest env is "node" (no DOM), so we install a minimal fake window
// with a query string and a sessionStorage shim, then reset the module cache.
function installWindow(search: string) {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    location: { search, href: "" },
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  return store;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  __resetDemoModeCache();
  vi.restoreAllMocks();
});

describe("demoMode", () => {
  it("is off by default with no flag", () => {
    installWindow("");
    expect(demoMode()).toBe(false);
  });

  it("turns on from ?demo=1 and persists to sessionStorage", () => {
    const store = installWindow("?demo=1");
    expect(demoMode()).toBe(true);
    expect(store.get("hml_demo")).toBe("1");
  });

  it("stays on from sessionStorage when the query string is gone", () => {
    installWindow("");
    (globalThis as { window: { sessionStorage: Storage } }).window.sessionStorage.setItem(
      "hml_demo",
      "1",
    );
    __resetDemoModeCache();
    expect(demoMode()).toBe(true);
  });

  it("clearDemoMode removes the flag and re-evaluates to off", () => {
    installWindow("?demo=1");
    expect(demoMode()).toBe(true);
    clearDemoMode();
    // location.search still has the flag, so without it demoMode would re-arm;
    // simulate a clean reload by dropping the query string too.
    (globalThis as { window: { location: { search: string } } }).window.location.search = "";
    expect(demoMode()).toBe(false);
  });
});
