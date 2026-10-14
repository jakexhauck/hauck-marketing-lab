import type { Env, ApiData } from "../../lib/env";
import { altQuery, ghlJson } from "../../lib/ghl";

interface GhlTransaction {
  _id?: string;
  id?: string;
  amount?: number;
  status?: string;
  createdAt?: string;
  entitySourceType?: string;
  paymentProvider?: { type?: string };
  contactSnapshot?: { name?: string; firstName?: string; lastName?: string };
  contactName?: string;
}

interface TransactionsResp {
  data?: GhlTransaction[];
  transactions?: GhlTransaction[];
  total?: number;
  totalCount?: number;
}

interface ApiTransaction {
  id: string;
  amount: number;
  status: string;
  contactName: string;
  createdAt: string | null;
  method: string;
}

function contactName(tx: GhlTransaction): string {
  if (tx.contactName) return tx.contactName;
  const snap = tx.contactSnapshot;
  if (!snap) return "";
  return (
    snap.name ??
    [snap.firstName, snap.lastName].filter(Boolean).join(" ").trim()
  );
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };

  // Offset pagination to the standard 10-page cap. If GHL reports more than
  // what was fetched, the response is flagged approximate for the UI.
  const raw: GhlTransaction[] = [];
  const seen = new Set<string>();
  let reportedTotal: number | undefined;
  let pageCount = 0;
  const maxPages = 10;

  while (pageCount < maxPages) {
    const data = await ghlJson<TransactionsResp>(
      gctx,
      `/payments/transactions?${altQuery(t.ghl_location_id)}&limit=100&offset=${raw.length}`,
    );
    const page = data.data ?? data.transactions ?? [];
    reportedTotal = data.total ?? data.totalCount ?? reportedTotal;
    let added = 0;
    for (const tx of page) {
      const id = tx._id ?? tx.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        raw.push(tx);
        added += 1;
      }
    }
    if (page.length < 100 || added === 0) break;
    if (typeof reportedTotal === "number" && raw.length >= reportedTotal) break;
    pageCount += 1;
  }

  if (pageCount >= maxPages) {
    console.warn(
      `payments pagination hit maxPages cap for location ${t.ghl_location_id}`,
    );
  }

  const transactions: ApiTransaction[] = raw.map((tx) => ({
    id: tx._id ?? tx.id ?? "",
    amount: typeof tx.amount === "number" ? tx.amount : 0,
    status: (tx.status ?? "").toLowerCase(),
    contactName: contactName(tx),
    createdAt: tx.createdAt ?? null,
    method: tx.paymentProvider?.type ?? tx.entitySourceType ?? "",
  }));

  transactions.sort(
    (a, b) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0),
  );

  const total = reportedTotal ?? transactions.length;
  return Response.json({
    transactions,
    total,
    approximate: total > transactions.length,
  });
};
