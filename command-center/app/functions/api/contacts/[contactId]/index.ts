import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { ghlFetch, type GhlContext } from "../../../lib/ghl";

interface UpsertBody {
  firstName?: string;
  lastName?: string;
  email?: string;
  postalCode?: string;
  source?: string;
}

// PUT /api/contacts/:contactId - update the caller's real details on the GHL
// contact GHL auto-created for the inbound call. Only writes fields that are
// present so a partial capture never blanks existing data.
export const onRequestPut: PagesFunction<Env, "contactId", ApiData> = async (
  ctx,
) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const contactId = ctx.params.contactId as string;
  if (!contactId) {
    return Response.json({ error: "missing_contact_id" }, { status: 400 });
  }

  const input = await readJsonBody<UpsertBody>(ctx.request);
  if (!input) return Response.json({ error: "invalid_json" }, { status: 400 });

  const fields: Record<string, unknown> = {};
  if (input.firstName?.trim()) fields.firstName = input.firstName.trim();
  if (input.lastName?.trim()) fields.lastName = input.lastName.trim();
  if (input.email?.trim()) fields.email = input.email.trim();
  if (input.postalCode?.trim()) fields.postalCode = input.postalCode.trim();
  if (input.source?.trim()) fields.source = input.source.trim();

  if (Object.keys(fields).length === 0) {
    return Response.json({ error: "nothing_to_write" }, { status: 400 });
  }

  const res = await ghlFetch(
    gctx,
    `/contacts/${encodeURIComponent(contactId)}`,
    { method: "PUT", body: JSON.stringify(fields) },
  );
  if (!res.ok) {
    const body = (await res.text()).slice(0, 500);
    return Response.json({ error: "ghl_error", status: res.status, body }, { status: 502 });
  }
  return Response.json({ ok: true });
};
