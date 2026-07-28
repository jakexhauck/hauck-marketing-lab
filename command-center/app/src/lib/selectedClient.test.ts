import { describe, it, expect } from "vitest";
import { resolveSelectedClient } from "./selectedClient";

const CLIENTS = [{ id: "t1" }, { id: "t2" }, { id: "t3" }];

describe("resolveSelectedClient", () => {
  it("prefers the URL param, so a pasted link opens what it says", () => {
    expect(resolveSelectedClient({ urlParam: "t2", stored: "t3", clients: CLIENTS })).toEqual({
      tenantId: "t2",
      source: "url",
    });
  });

  it("falls back to the stored pick when the URL carries none", () => {
    expect(resolveSelectedClient({ urlParam: null, stored: "t3", clients: CLIENTS })).toEqual({
      tenantId: "t3",
      source: "stored",
    });
  });

  it("falls back to the first client on a first ever visit", () => {
    expect(resolveSelectedClient({ urlParam: null, stored: null, clients: CLIENTS })).toEqual({
      tenantId: "t1",
      source: "first",
    });
  });

  it("ignores a stored client that no longer exists rather than pinning every page to it", () => {
    expect(resolveSelectedClient({ urlParam: null, stored: "gone", clients: CLIENTS })).toEqual({
      tenantId: "t1",
      source: "first",
    });
  });

  it("ignores an unknown URL param the same way", () => {
    expect(resolveSelectedClient({ urlParam: "gone", stored: "t2", clients: CLIENTS })).toEqual({
      tenantId: "t2",
      source: "stored",
    });
  });

  it("reports no client rather than inventing one when the agency has none", () => {
    expect(resolveSelectedClient({ urlParam: "t1", stored: "t2", clients: [] })).toEqual({
      tenantId: null,
      source: "none",
    });
  });

  it("treats an empty string param as absent", () => {
    expect(resolveSelectedClient({ urlParam: "", stored: "t2", clients: CLIENTS })).toEqual({
      tenantId: "t2",
      source: "stored",
    });
  });
});
