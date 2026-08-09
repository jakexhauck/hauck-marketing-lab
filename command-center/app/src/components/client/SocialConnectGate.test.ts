import { describe, expect, it } from "vitest";
import { readAccountId } from "./SocialConnectGate";

// readAccountId is the single most fragile thing in the connect flow. GHL's
// finish page hands the new oauth record back by postMessage and NOTHING else:
// there is no endpoint that lists an oauth record before it is attached, so a
// missed message cannot be recovered from.
//
// The real payload has never been observed, because seeing it needs a human to
// complete a Facebook consent screen. So this reads liberally and these tests
// pin the shapes it must tolerate rather than the one it happens to get.

describe("readAccountId", () => {
  const ID = "6a4aaa380cfce0eb1ac34866";

  it("reads the obvious shape", () => {
    expect(readAccountId({ accountId: ID })).toBe(ID);
  });

  it("reads the shapes GHL might plausibly use instead", () => {
    expect(readAccountId({ account_id: ID })).toBe(ID);
    expect(readAccountId({ id: ID })).toBe(ID);
    expect(readAccountId({ data: { accountId: ID } })).toBe(ID);
    expect(readAccountId({ payload: { id: ID } })).toBe(ID);
    expect(readAccountId({ account: { accountId: ID } })).toBe(ID);
  });

  it("parses a JSON string, since postMessage is often sent as text", () => {
    expect(readAccountId(JSON.stringify({ accountId: ID }))).toBe(ID);
  });

  it("ignores the noise every page receives", () => {
    // React DevTools, Vite HMR and browser extensions all postMessage freely.
    expect(readAccountId({ source: "react-devtools-bridge" })).toBeNull();
    expect(readAccountId("webpackHotUpdate")).toBeNull();
    expect(readAccountId(null)).toBeNull();
    expect(readAccountId(undefined)).toBeNull();
    expect(readAccountId(42)).toBeNull();
    expect(readAccountId([])).toBeNull();
  });

  it("refuses a value that is not id-shaped", () => {
    // This lands in a URL path, so anything with a slash or a query is out.
    expect(readAccountId({ accountId: "../../admin" })).toBeNull();
    expect(readAccountId({ accountId: "abc/def" })).toBeNull();
    expect(readAccountId({ accountId: "short" })).toBeNull();
    expect(readAccountId({ accountId: "x".repeat(65) })).toBeNull();
    expect(readAccountId({ accountId: 12345678 })).toBeNull();
  });
});
