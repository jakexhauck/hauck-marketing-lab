import type { Env, ApiData } from "../../lib/env";
import { altQuery, ghlJson } from "../../lib/ghl";

interface GhlLineItem {
  name?: string;
  description?: string;
  qty?: number;
  quantity?: number;
  amount?: number;
  price?: number;
}

interface GhlInvoiceDetail {
  _id?: string;
  id?: string;
  invoiceNumber?: string;
  number?: string;
  name?: string;
  status?: string;
  total?: number;
  amountDue?: number;
  amountPaid?: number;
  currency?: string;
  issueDate?: string;
  dueDate?: string;
  paidDate?: string;
  contactDetails?: { name?: string; email?: string };
  invoiceItems?: GhlLineItem[];
  items?: GhlLineItem[];
}

interface ApiInvoiceLineItem {
  name: string;
  qty: number;
  amount: number;
}

function shapeItems(detail: GhlInvoiceDetail): ApiInvoiceLineItem[] {
  const raw = detail.invoiceItems ?? detail.items ?? [];
  return raw.map((li) => ({
    name: li.name ?? li.description ?? "",
    qty: li.qty ?? li.quantity ?? 1,
    amount: typeof li.amount === "number" ? li.amount : (li.price ?? 0),
  }));
}

export const onRequestGet: PagesFunction<
  Env,
  "invoiceId",
  ApiData
> = async (ctx) => {
  const t = ctx.data.tenant;
  const invoiceId = ctx.params.invoiceId as string;
  if (!invoiceId) {
    return Response.json({ error: "missing_invoice_id" }, { status: 400 });
  }

  const detail = await ghlJson<GhlInvoiceDetail>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/invoices/${encodeURIComponent(invoiceId)}?${altQuery(t.ghl_location_id)}`,
  );

  return Response.json({
    invoice: {
      id: detail._id ?? detail.id ?? invoiceId,
      number: detail.invoiceNumber ?? detail.number ?? detail.name ?? "",
      contactName: detail.contactDetails?.name ?? "",
      status: detail.status ?? "",
      total: typeof detail.total === "number" ? detail.total : 0,
      amountPaid:
        typeof detail.amountPaid === "number" ? detail.amountPaid : 0,
      amountDue: typeof detail.amountDue === "number" ? detail.amountDue : 0,
      currency: detail.currency ?? "USD",
      issueDate: detail.issueDate ?? null,
      dueDate: detail.dueDate ?? null,
      paidAt: detail.paidDate ?? null,
      items: shapeItems(detail),
    },
  });
};
