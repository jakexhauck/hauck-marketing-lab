import type { Env, ApiData } from "../../../../lib/env";
import { readJsonBody } from "../../../../lib/body";
import { ghlFetch, type GhlContext } from "../../../../lib/ghl";

// POST /api/sales/jobs/:id/payment: mark a completed job paid.
//
// Willis (and, so far, every probed tenant) does not use GHL invoices: the
// invoices list is empty, so there is nothing to "record a payment against".
// Per the spike decision we record the payment as a contact NOTE (an honest,
// durable record on the customer) rather than faking an invoice. When invoices
// are actually in use for a tenant this endpoint is where true record-payment
// wiring lands, behind a config flag.
//
// Body: { contactId, amount? }  (amount is whole dollars; optional)

interface PaymentBody {
  contactId?: string;
  amount?: number;
}

export const onRequestPost: PagesFunction<Env, "id", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const body = await readJsonBody<PaymentBody>(ctx.request);
  if (!body || !body.contactId) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const amountStr =
    typeof body.amount === "number" && body.amount > 0
      ? ` ($${body.amount.toLocaleString("en-US")})`
      : "";
  const noteBody = `Payment recorded${amountStr}. Job marked paid.`;

  const res = await ghlFetch(
    gctx,
    `/contacts/${encodeURIComponent(body.contactId)}/notes`,
    { method: "POST", body: JSON.stringify({ body: noteBody }) },
  );
  if (!res.ok) {
    const text = await res.text();
    return Response.json(
      { error: "ghl_error", status: res.status, body: text.slice(0, 300) },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, paid: true });
};
