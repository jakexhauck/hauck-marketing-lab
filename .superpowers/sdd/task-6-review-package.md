# Review package: Task 6 (3b32c9a..1774821)

## Commits
1774821 feat(setter): live slot lookup and booking via the existing appointments lib

## Stat
 .../app/functions/api/admin/setter/book.test.ts    |  96 +++++++++++++++++
 .../app/functions/api/admin/setter/book.ts         | 117 +++++++++++++++++++++
 .../app/functions/api/admin/setter/slots.test.ts   |  69 ++++++++++++
 .../app/functions/api/admin/setter/slots.ts        |  95 +++++++++++++++++
 4 files changed, 377 insertions(+)

## Diff
```diff
diff --git a/command-center/app/functions/api/admin/setter/book.test.ts b/command-center/app/functions/api/admin/setter/book.test.ts
new file mode 100644
index 0000000..106208c
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/book.test.ts
@@ -0,0 +1,96 @@
+import { describe, it, expect } from "vitest";
+import { validateBookBody } from "./book";
+
+// validateBookBody is the only pure logic in this route (the rest is a live
+// CRM round-trip through the non-retrying createAppointment), so this covers
+// every 400 path before a request can reach the booking write.
+
+describe("validateBookBody", () => {
+  it("requires tenantId", () => {
+    const r = validateBookBody({
+      calendarName: "Home Estimate",
+      contactId: "c1",
+      startTime: "2026-08-01T10:00:00-05:00",
+      endTime: "2026-08-01T11:00:00-05:00",
+    });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("missing_tenant_id");
+  });
+
+  it("requires calendarName", () => {
+    const r = validateBookBody({
+      tenantId: "t1",
+      contactId: "c1",
+      startTime: "2026-08-01T10:00:00-05:00",
+      endTime: "2026-08-01T11:00:00-05:00",
+    });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("missing_calendar_name");
+  });
+
+  it("requires contactId", () => {
+    const r = validateBookBody({
+      tenantId: "t1",
+      calendarName: "Home Estimate",
+      startTime: "2026-08-01T10:00:00-05:00",
+      endTime: "2026-08-01T11:00:00-05:00",
+    });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("missing_contact_id");
+  });
+
+  it("requires both startTime and endTime", () => {
+    const missingEnd = validateBookBody({
+      tenantId: "t1",
+      calendarName: "Home Estimate",
+      contactId: "c1",
+      startTime: "2026-08-01T10:00:00-05:00",
+    });
+    expect(missingEnd.ok).toBe(false);
+    expect(missingEnd.code).toBe("missing_time_range");
+
+    const missingStart = validateBookBody({
+      tenantId: "t1",
+      calendarName: "Home Estimate",
+      contactId: "c1",
+      endTime: "2026-08-01T11:00:00-05:00",
+    });
+    expect(missingStart.ok).toBe(false);
+    expect(missingStart.code).toBe("missing_time_range");
+  });
+
+  it("rejects blank strings the same as missing fields", () => {
+    const r = validateBookBody({
+      tenantId: "  ",
+      calendarName: "Home Estimate",
+      contactId: "c1",
+      startTime: "2026-08-01T10:00:00-05:00",
+      endTime: "2026-08-01T11:00:00-05:00",
+    });
+    expect(r.ok).toBe(false);
+    expect(r.code).toBe("missing_tenant_id");
+  });
+
+  it("accepts a complete body, title optional", () => {
+    const r = validateBookBody({
+      tenantId: "t1",
+      calendarName: "Home Estimate",
+      contactId: "c1",
+      startTime: "2026-08-01T10:00:00-05:00",
+      endTime: "2026-08-01T11:00:00-05:00",
+    });
+    expect(r.ok).toBe(true);
+  });
+
+  it("accepts a complete body with a title", () => {
+    const r = validateBookBody({
+      tenantId: "t1",
+      calendarName: "Home Estimate",
+      contactId: "c1",
+      startTime: "2026-08-01T10:00:00-05:00",
+      endTime: "2026-08-01T11:00:00-05:00",
+      title: "Estimate with Jane",
+    });
+    expect(r.ok).toBe(true);
+  });
+});
diff --git a/command-center/app/functions/api/admin/setter/book.ts b/command-center/app/functions/api/admin/setter/book.ts
new file mode 100644
index 0000000..2482d1c
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/book.ts
@@ -0,0 +1,117 @@
+import type { Env, ApiData } from "../../../lib/env";
+import { readJsonBody } from "../../../lib/body";
+import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
+import { getServiceClient } from "../../../lib/supabase";
+import { logAdminAction } from "../../../lib/adminAuth";
+import { resolveCalendarByName, createAppointment } from "../../lib/appointments";
+
+// POST /api/admin/setter/book (admin-only, gated in _middleware.ts). Books a
+// real appointment on a named calendar the moment a setter gets someone on
+// the phone and locks in a time. Calendar resolved BY NAME (never a
+// hardcoded id, which differs per client) via the same
+// resolveCalendarByName used by the client-facing booking endpoint
+// (functions/api/appointments/index.ts), and the write goes through the
+// same createAppointment in ../../lib/appointments unchanged.
+//
+// Terminal write: createAppointment deliberately does not retry on failure,
+// because a retried POST can double-book a real customer into a real
+// calendar. This route must honour that: the call below runs exactly once,
+// no retry wrapper, no "for robustness" resend.
+//
+// Degrades honestly: a round-robin calendar with no team members assigned
+// returns 422 { error: "needs_staff" } so the setter sees "this calendar
+// has no staff assigned" instead of a generic failure that reads as their
+// own mistake.
+
+export interface BookBody {
+  tenantId?: string;
+  calendarName?: string;
+  contactId?: string;
+  startTime?: string;
+  endTime?: string;
+  title?: string;
+}
+
+export interface ValidationResult {
+  ok: boolean;
+  code?: string;
+  error?: string;
+}
+
+// Pure, split out so it is unit-testable without a request.
+export function validateBookBody(body: BookBody): ValidationResult {
+  if (!body.tenantId || !body.tenantId.trim()) {
+    return { ok: false, code: "missing_tenant_id", error: "tenantId is required" };
+  }
+  if (!body.calendarName || !body.calendarName.trim()) {
+    return { ok: false, code: "missing_calendar_name", error: "calendarName is required" };
+  }
+  if (!body.contactId || !body.contactId.trim()) {
+    return { ok: false, code: "missing_contact_id", error: "contactId is required" };
+  }
+  if (!body.startTime || !body.endTime) {
+    return { ok: false, code: "missing_time_range", error: "startTime and endTime are required" };
+  }
+  return { ok: true };
+}
+
+export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
+  const body = await readJsonBody<BookBody>(ctx.request);
+  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
+
+  const validation = validateBookBody(body);
+  if (!validation.ok) return Response.json({ error: validation.code }, { status: 400 });
+
+  const tenantId = body.tenantId!.trim();
+  const calendarName = body.calendarName!.trim();
+  const contactId = body.contactId!.trim();
+
+  try {
+    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
+
+    const calendarId = await resolveCalendarByName(gctx, calendarName);
+    if (!calendarId) {
+      return Response.json(
+        { error: "calendar_not_found", calendar: calendarName },
+        { status: 422 },
+      );
+    }
+
+    // Single attempt, no retry: see the file header. A second call here on a
+    // timeout or transient error could create two appointments for the same
+    // slot.
+    const result = await createAppointment(gctx, {
+      calendarId,
+      contactId,
+      startTime: body.startTime!,
+      endTime: body.endTime!,
+      title: body.title,
+    });
+
+    if (!result.ok) {
+      if (result.needsStaff) {
+        return Response.json({ error: "needs_staff" }, { status: 422 });
+      }
+      return Response.json(
+        { error: "ghl_error", status: result.status, body: result.body },
+        { status: 502 },
+      );
+    }
+
+    const client = getServiceClient(ctx.env);
+    if (client) {
+      await logAdminAction(client, ctx.data.admin!.id, "setter.book", tenantId, {
+        contactId,
+        calendarName,
+        appointmentId: result.id,
+        startTime: body.startTime,
+        endTime: body.endTime,
+      });
+    }
+
+    return Response.json({ ok: true, id: result.id }, { status: 201 });
+  } catch (e) {
+    if (!(e instanceof TenantGhlError)) throw e;
+    return Response.json({ error: e.code }, { status: e.status });
+  }
+};
diff --git a/command-center/app/functions/api/admin/setter/slots.test.ts b/command-center/app/functions/api/admin/setter/slots.test.ts
new file mode 100644
index 0000000..67b1bcc
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/slots.test.ts
@@ -0,0 +1,69 @@
+import { describe, it, expect } from "vitest";
+import { parseSlotsQuery } from "./slots";
+
+// parseSlotsQuery is the only pure logic in this route (the rest is a live
+// CRM round-trip), so this covers every 400 path plus the days clamp before
+// a request ever reaches the calendars API.
+
+function qs(pairs: Record<string, string>): URLSearchParams {
+  return new URLSearchParams(pairs);
+}
+
+describe("parseSlotsQuery", () => {
+  it("requires tenantId", () => {
+    const r = parseSlotsQuery(qs({ calendarName: "Home Estimate" }));
+    expect(r.ok).toBe(false);
+    if (!r.ok) expect(r.code).toBe("missing_tenant_id");
+  });
+
+  it("requires calendarName", () => {
+    const r = parseSlotsQuery(qs({ tenantId: "t1" }));
+    expect(r.ok).toBe(false);
+    if (!r.ok) expect(r.code).toBe("missing_calendar_name");
+  });
+
+  it("rejects a blank calendarName", () => {
+    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "   " }));
+    expect(r.ok).toBe(false);
+    if (!r.ok) expect(r.code).toBe("missing_calendar_name");
+  });
+
+  it("defaults days to 14 when absent", () => {
+    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "Home Estimate" }));
+    expect(r.ok).toBe(true);
+    if (r.ok) expect(r.query.days).toBe(14);
+  });
+
+  it("falls back to 14 when days is 0, matching the client-facing endpoint's falsy-catch behavior", () => {
+    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "Home Estimate", days: "0" }));
+    expect(r.ok).toBe(true);
+    if (r.ok) expect(r.query.days).toBe(14);
+  });
+
+  it("clamps a negative days value up to 1", () => {
+    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "Home Estimate", days: "-5" }));
+    expect(r.ok).toBe(true);
+    if (r.ok) expect(r.query.days).toBe(1);
+  });
+
+  it("clamps days above 31 down to 31", () => {
+    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "Home Estimate", days: "90" }));
+    expect(r.ok).toBe(true);
+    if (r.ok) expect(r.query.days).toBe(31);
+  });
+
+  it("falls back to 14 when days is not a number", () => {
+    const r = parseSlotsQuery(qs({ tenantId: "t1", calendarName: "Home Estimate", days: "abc" }));
+    expect(r.ok).toBe(true);
+    if (r.ok) expect(r.query.days).toBe(14);
+  });
+
+  it("trims tenantId and calendarName", () => {
+    const r = parseSlotsQuery(qs({ tenantId: "  t1  ", calendarName: "  Home Estimate  " }));
+    expect(r.ok).toBe(true);
+    if (r.ok) {
+      expect(r.query.tenantId).toBe("t1");
+      expect(r.query.calendarName).toBe("Home Estimate");
+    }
+  });
+});
diff --git a/command-center/app/functions/api/admin/setter/slots.ts b/command-center/app/functions/api/admin/setter/slots.ts
new file mode 100644
index 0000000..7cd59fd
--- /dev/null
+++ b/command-center/app/functions/api/admin/setter/slots.ts
@@ -0,0 +1,95 @@
+import type { Env, ApiData } from "../../../lib/env";
+import { tenantTimezone } from "../../../lib/env";
+import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
+import { resolveCalendarByName, getFreeSlots } from "../../lib/appointments";
+
+// GET /api/admin/setter/slots?tenantId=&calendarName=&days= (admin-only,
+// gated in _middleware.ts). Live free-slot lookup for the booking panel: a
+// setter who has someone on the phone picks a calendar by NAME (never a
+// hardcoded id, which differs per client) and sees real open windows before
+// offering a time. Read-only, so unlike book.ts this is safe to hit
+// repeatedly while the setter narrows down a slot.
+//
+// Reuses resolveCalendarByName + getFreeSlots from ../../lib/appointments
+// unchanged, including the calendars API's Version 2021-04-15 quirk baked
+// into that file's local calFetch.
+//
+// Degrades honestly: a round-robin calendar with no team members assigned
+// 422s "no team members" at the CRM; that is surfaced here as
+// needsStaff:true so the setter sees a plain "this calendar has no staff
+// assigned" message rather than an empty grid that reads as "nobody
+// available today". Those are different problems with different fixes.
+
+export interface ValidationResult {
+  ok: boolean;
+  code?: string;
+  error?: string;
+}
+
+export interface SlotsQuery {
+  tenantId: string;
+  calendarName: string;
+  days: number;
+}
+
+export type ParsedSlotsQuery =
+  | { ok: true; query: SlotsQuery }
+  | { ok: false; code: string };
+
+// Pure: validate + normalize the query params, including clamping days into
+// [1, 31] the same way the client-facing /api/appointments/slots does.
+// Unit-testable without a request.
+export function parseSlotsQuery(params: URLSearchParams): ParsedSlotsQuery {
+  const tenantId = params.get("tenantId");
+  if (!tenantId || !tenantId.trim()) {
+    return { ok: false, code: "missing_tenant_id" };
+  }
+  const calendarName = params.get("calendarName");
+  if (!calendarName || !calendarName.trim()) {
+    return { ok: false, code: "missing_calendar_name" };
+  }
+  const days = Math.min(Math.max(Number(params.get("days")) || 14, 1), 31);
+  return {
+    ok: true,
+    query: { tenantId: tenantId.trim(), calendarName: calendarName.trim(), days },
+  };
+}
+
+export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
+  const url = new URL(ctx.request.url);
+  const parsed = parseSlotsQuery(url.searchParams);
+  if (!parsed.ok) return Response.json({ error: parsed.code }, { status: 400 });
+  const { tenantId, calendarName, days } = parsed.query;
+
+  try {
+    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
+
+    const calendarId = await resolveCalendarByName(gctx, calendarName);
+    if (!calendarId) {
+      return Response.json(
+        { error: "calendar_not_found", calendar: calendarName },
+        { status: 422 },
+      );
+    }
+
+    const now = Date.now();
+    const endMs = now + days * 24 * 60 * 60_000;
+    const timezone = tenantTimezone(ctx.env);
+
+    const result = await getFreeSlots(gctx, calendarId, now, endMs, timezone);
+    if (!result.ok) {
+      if (result.needsStaff) {
+        return Response.json({ error: "needs_staff" }, { status: 422 });
+      }
+      return Response.json(
+        { error: "ghl_error", status: result.status, body: result.body },
+        { status: 502 },
+      );
+    }
+
+    return Response.json({ ok: true, timezone, days: result.days });
+  } catch (e) {
+    if (!(e instanceof TenantGhlError)) throw e;
+    return Response.json({ error: e.code }, { status: e.status });
+  }
+};
```
