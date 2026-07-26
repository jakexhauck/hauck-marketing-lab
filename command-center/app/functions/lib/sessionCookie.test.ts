import { describe, expect, it } from "vitest";
import { isPlainHttpLocalRequest } from "./session";

// The one exception to the Secure flag on session cookies. Production must never
// match this, so the negative cases matter more than the positive ones.

function req(url: string): Request {
  return new Request(url);
}

describe("isPlainHttpLocalRequest", () => {
  it("matches plain http on loopback", () => {
    expect(isPlainHttpLocalRequest(req("http://localhost:5173/api/auth/admin-login"))).toBe(true);
    expect(isPlainHttpLocalRequest(req("http://127.0.0.1:8788/api/auth/login"))).toBe(true);
  });

  it("matches plain http on a private LAN address, which is the case that needed fixing", () => {
    // A phone or a second machine on the same wifi hitting the dev server.
    expect(isPlainHttpLocalRequest(req("http://10.0.0.198:5173/api/auth/admin-login"))).toBe(true);
    expect(isPlainHttpLocalRequest(req("http://192.168.1.44:5173/x"))).toBe(true);
    expect(isPlainHttpLocalRequest(req("http://172.16.5.9:5173/x"))).toBe(true);
    expect(isPlainHttpLocalRequest(req("http://172.31.255.1:5173/x"))).toBe(true);
  });

  it("NEVER matches production", () => {
    expect(isPlainHttpLocalRequest(req("https://app.hauckmarketing.com/api/auth/admin-login"))).toBe(
      false,
    );
    expect(isPlainHttpLocalRequest(req("https://hauck-command-center.pages.dev/x"))).toBe(false);
    // Even plain http to a public host keeps Secure: the exception is for a
    // local dev box, not for any unencrypted request.
    expect(isPlainHttpLocalRequest(req("http://app.hauckmarketing.com/x"))).toBe(false);
    expect(isPlainHttpLocalRequest(req("http://8.8.8.8/x"))).toBe(false);
  });

  it("does not match public addresses that merely look private", () => {
    // 172.15 and 172.32 are outside the private 172.16-172.31 block.
    expect(isPlainHttpLocalRequest(req("http://172.15.0.1/x"))).toBe(false);
    expect(isPlainHttpLocalRequest(req("http://172.32.0.1/x"))).toBe(false);
    // A hostname that merely starts with a private-looking string.
    expect(isPlainHttpLocalRequest(req("http://10.0.0.198.evil.com/x"))).toBe(false);
    expect(isPlainHttpLocalRequest(req("http://localhost.evil.com/x"))).toBe(false);
  });

  it("fails closed with no request", () => {
    expect(isPlainHttpLocalRequest(undefined)).toBe(false);
  });

  it("keeps HTTPS secure even on a local address", () => {
    expect(isPlainHttpLocalRequest(req("https://localhost:5173/x"))).toBe(false);
    expect(isPlainHttpLocalRequest(req("https://10.0.0.198/x"))).toBe(false);
  });
});
