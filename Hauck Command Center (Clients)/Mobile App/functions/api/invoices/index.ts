import { tenantTimezone, type Env, type ApiData } from "../../lib/env";
import { altQuery, ghlJson } from "../../lib/ghl";
import { dateStringInZone } from "../../lib/tz";

// GHL invoice shape is loosely typed; only the fields we read are declared.
interface GhlInvoice {
  _id?: string;
  id?: string;
  invoiceNumber?: string;
  number?: string;
  name?: string;
  title?: string;
  status?: string;
  total?: number;
  amountDue?: number;
  dueDate?: string;
  paidDate?: string;
  updatedAt?: string;
  contactDetails?: { name?: string; email?: string };
  contactName?: string;
}

interface InvoicesResp {
  invoices?: GhlInvoice[];
  total?: number;
}

interface ApiInvoice {
  id: string;
  number: string;
  contactName: string;
  total: number;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
}

// Collapse GHL's many status strings into a small, predictable set, and derive
// "overdue" when GHL reports a due-but-unpaid invoice past its due date. An
// invoice is overdue starting the day AFTER its due date, in tenant time, so
// one due "today" never reads overdue before the day ends.
function normalizeStatus(
  raw: string | undefined,
  dueDate: string | undefined,
  zone: string,
): string {
  const s = (raw ?? "").toLowerCase();
  if (s === "paid") return "paid";
  if (s === "void" || s === "cancelled" || s === "canceled") return "void";
  if (s === "draft") return "draft";
  if (s.includes("overdue")) return "overdue";
  // sent / partially_paid / payment_processing all read as "sent" unless past due.
  if (dueDate) {
    const due = new Date(dueDate).getTime();
    if (
      !Number.isNaN(due) &&
      dateStringInZone(zone, due) < dateStringInZone(zone, Date.now())
    ) {
      return "overdue";
    }
  }
  return s ? "sent" : "draft";
}

function shapeInvoice(inv: GhlInvoice, zone: string): ApiInvoice {
  return {
    id: inv._id ?? inv.id ?? "",
    number: inv.invoiceNumber ?? inv.number ?? inv.name ?? inv.title ?? "",
    contactName: inv.contactDetails?.name ?? inv.contactName ?? "",
    total: typeof inv.total === "number" ? inv.total : 0,
    status: normalizeStatus(inv.status, inv.dueDate, zone),
    dueDate: inv.dueDate ?? null,
    paidAt: inv.paidDate ?? null,
  };
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const url = new URL(ctx.request.url);
  const statusFilter = url.searchParams.get("status");

  // Billing endpoints use offset paging (limit/offset), NOT the cursor loop that
  // leads/contacts use. Page until a short page or the cap.
  const limit = 100;
  const maxPages = 10;
  const all: GhlInvoice[] = [];
  let offset = 0;
  let pageCount = 0;

  while (pageCount < maxPages) {
    const data = await ghlJson<InvoicesResp>(
      { token: t.ghl_token, locationId: t.ghl_location_id },
      `/invoices/?${altQuery(t.ghl_location_id)}&limit=${limit}&offset=${offset}`,
    );
    const page = data.invoices ?? [];
    all.push(...page);
    if (page.length < limit) break;
    offset += limit;
    pageCount += 1;
  }

  if (pageCount >= maxPages) {
    console.warn(
      `invoices pagination hit maxPages cap for location ${t.ghl_location_id}`,
    );
  }

  const zone = tenantTimezone(ctx.env);
  let invoices = all.map((inv) => shapeInvoice(inv, zone)).filter((i) => i.id);
  if (statusFilter && statusFilter !== "all") {
    invoices = invoices.filter((i) => i.status === statusFilter);
  }
  invoices.sort(
    (a, b) => +new Date(b.dueDate ?? 0) - +new Date(a.dueDate ?? 0),
  );

  return Response.json({ invoices, total: invoices.length });
};
