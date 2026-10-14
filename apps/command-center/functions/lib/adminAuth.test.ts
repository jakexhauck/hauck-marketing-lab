import { describe, it, expect } from "vitest";
import { getActiveAdmin, AdminLookupError } from "./adminAuth";
import type { SupabaseClient } from "@supabase/supabase-js";

// getActiveAdmin is the single gate on every /api/admin/* route AND on
// /api/auth/me. Whatever it returns decides whether a signed-in admin stays
// signed in, so the one distinction it must never lose is the difference
// between "this account is gone" and "the table could not be read".
//
// It used to lose exactly that. supabase-js does NOT throw on a failed read:
// it RESOLVES with { data: null, error }, and this function destructured only
// `data`. So a database hiccup looked identical to a deleted admin, the
// middleware answered 401, and the browser tore the session down and sent Jake
// back to the login screen mid-shift. The power dialer found it first because
// it polls /api/admin/cold-call/live every eight seconds all day, which is by
// some distance the most requests any page in this app makes.

// Stubs the one chain the function makes:
// client.from("admin_accounts").select(...).eq("id", id).maybeSingle().
function stubClient(result: { data: unknown; error: unknown }) {
  const maybeSingle = () => Promise.resolve(result);
  const eq = () => ({ maybeSingle });
  const select = () => ({ eq });
  return { from: () => ({ select }) } as unknown as SupabaseClient;
}

const ACTIVE = {
  id: "admin-1",
  email: "jake@hauckmarketing.com",
  name: "Jake",
  status: "active",
  role: "owner",
};

describe("getActiveAdmin", () => {
  it("resolves an active admin", async () => {
    const admin = await getActiveAdmin(stubClient({ data: ACTIVE, error: null }), "admin-1");
    expect(admin).toMatchObject({ id: "admin-1", role: "owner" });
  });

  it("returns null for a disabled account, so revoking is immediate", async () => {
    const client = stubClient({ data: { ...ACTIVE, status: "disabled" }, error: null });
    expect(await getActiveAdmin(client, "admin-1")).toBeNull();
  });

  it("returns null when the account no longer exists", async () => {
    expect(await getActiveAdmin(stubClient({ data: null, error: null }), "admin-1")).toBeNull();
  });

  it("treats an unrecognized role as the most restricted one", async () => {
    const client = stubClient({ data: { ...ACTIVE, role: "wizard" }, error: null });
    expect(await getActiveAdmin(client, "admin-1")).toMatchObject({ role: "cold_caller" });
  });

  // REGRESSION. This is the bug that logged Jake out of the power dialer.
  it("throws rather than reporting no admin when the READ ITSELF failed", async () => {
    const client = stubClient({
      data: null,
      error: { message: "TypeError: fetch failed" },
    });
    await expect(getActiveAdmin(client, "admin-1")).rejects.toBeInstanceOf(AdminLookupError);
  });

  it("throws on a database error even when a row comes back with it", async () => {
    const client = stubClient({ data: ACTIVE, error: { message: "canceling statement" } });
    await expect(getActiveAdmin(client, "admin-1")).rejects.toBeInstanceOf(AdminLookupError);
  });

  it("still returns null for an empty id without touching the database", async () => {
    const exploding = {
      from: () => {
        throw new Error("must not be read");
      },
    } as unknown as SupabaseClient;
    expect(await getActiveAdmin(exploding, "")).toBeNull();
  });
});
