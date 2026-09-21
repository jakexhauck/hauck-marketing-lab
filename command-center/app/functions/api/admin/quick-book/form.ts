import type { Env, ApiData } from "../../../lib/env";
import { tenantTimezone } from "../../../lib/env";
import { ghlFetch, type GhlContext } from "../../../lib/ghl";
import { getGhlContextForTenant, TenantGhlError } from "../../../lib/tenantGhl";
import { getCalendar } from "../../lib/appointments";
import { cleanBookingZone } from "../../../lib/bookingZone";

// GET /api/admin/quick-book/form?tenantId=&calendarId= (owner only: a new
// admin path is invisible to hired roles until adminRoles.ts names it).
//
// Quick Book asks the caller the same questions the client's own booking
// widget asks, so this reads them live off the calendar's GHL form instead of
// keeping a copy that drifts the day someone edits the form in GHL.
//
// Also hands back the two facts the booking screen cannot know on its own:
// the client's clock (their GHL location zone, NOT the env default, which is
// Chicago while Willis is Detroit) and how long one slot runs.

export interface QuickBookField {
  // A standard contact key ("address", "city") or a custom field id. On a GHL
  // form, a custom question's tag IS the contact custom field id (confirmed on
  // Willis: "Services" tag Fi3SrCzg5d5YpDzcaRrA = custom field of that id).
  key: string;
  label: string;
  custom: boolean;
  multiline: boolean;
  options?: string[];
}

// Step 1 of the booking screen owns these, prefilled from the picked contact.
// Country is dropped too: every client is US, and a select with no option list
// on the wire would be a text box asking the caller to spell a country.
const HANDLED_ELSEWHERE = new Set([
  "first_name",
  "last_name",
  "full_name",
  "name",
  "phone",
  "email",
  "country",
  "button",
]);

const STANDARD_KEYS = new Set([
  "address",
  "city",
  "state",
  "postal_code",
  "company_name",
  "website",
  "date_of_birth",
  "source",
]);

const MULTILINE = new Set(["large_text", "textarea"]);
const SKIP_TYPES = new Set(["group", "submit", "html", "captcha", "h1", "image", "source"]);

interface RawField {
  label?: unknown;
  tag?: unknown;
  type?: unknown;
  picklistOptions?: unknown;
}

// Pure. Exported for tests.
export function shapeFormFields(raw: unknown): QuickBookField[] {
  const fields = (raw as { form?: { formData?: { form?: { fields?: unknown } } } } | null)?.form
    ?.formData?.form?.fields;
  if (!Array.isArray(fields)) return [];
  const out: QuickBookField[] = [];
  for (const f of fields as RawField[]) {
    const key = typeof f.tag === "string" ? f.tag.trim() : "";
    const type = typeof f.type === "string" ? f.type : "";
    if (!key || SKIP_TYPES.has(type) || HANDLED_ELSEWHERE.has(key)) continue;
    const field: QuickBookField = {
      key,
      label: typeof f.label === "string" && f.label.trim() ? f.label.trim() : key,
      custom: !STANDARD_KEYS.has(key),
      multiline: MULTILINE.has(type),
    };
    if (Array.isArray(f.picklistOptions)) {
      const options = f.picklistOptions.filter((o): o is string => typeof o === "string");
      if (options.length > 0) field.options = options;
    }
    out.push(field);
  }
  return out;
}

// The client's clock. Falls back to the env default rather than failing the
// screen: a slot instant carries its own offset, so only labels would be off.
export async function locationZone(env: Env, gctx: GhlContext): Promise<string> {
  try {
    const res = await ghlFetch(gctx, `/locations/${encodeURIComponent(gctx.locationId)}`);
    if (res.ok) {
      const data = (await res.json()) as { location?: { timezone?: string } };
      const zone = cleanBookingZone(data.location?.timezone);
      if (zone) return zone;
    }
  } catch {
    // fall through to the default
  }
  return tenantTimezone(env);
}

function slotMinutes(duration?: number, unit?: string): number {
  const n = Number(duration);
  if (!Number.isFinite(n) || n <= 0) return 60;
  return unit === "hours" ? n * 60 : n;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const tenantId = (url.searchParams.get("tenantId") ?? "").trim();
  const calendarId = (url.searchParams.get("calendarId") ?? "").trim();
  if (!tenantId) return Response.json({ error: "missing_tenant_id" }, { status: 400 });
  if (!calendarId) return Response.json({ error: "missing_calendar_id" }, { status: 400 });

  try {
    const gctx = await getGhlContextForTenant(ctx.env, tenantId);
    const [calendar, timezone] = await Promise.all([
      getCalendar(gctx, calendarId),
      locationZone(ctx.env, gctx),
    ]);
    if (!calendar) {
      return Response.json({ error: "calendar_not_found", calendar: calendarId }, { status: 422 });
    }

    // A calendar with no form still books; the Details step just has nothing
    // to ask. A form read that fails degrades the same way.
    let fields: QuickBookField[] = [];
    if (calendar.formId) {
      const res = await ghlFetch(gctx, `/forms/${encodeURIComponent(calendar.formId)}`);
      if (res.ok) fields = shapeFormFields(await res.json());
    }

    return Response.json({
      timezone,
      slotMinutes: slotMinutes(calendar.slotDuration, calendar.slotDurationUnit),
      fields,
    });
  } catch (e) {
    if (!(e instanceof TenantGhlError)) throw e;
    return Response.json({ error: e.code }, { status: e.status });
  }
};
