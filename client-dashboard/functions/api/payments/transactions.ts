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

  const data = await ghlJson<TransactionsResp>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/payments/transactions?${altQuery(t.ghl_location_id)}&limit=100`,
  );

  const raw = data.data ?? data.transactions ?? [];
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

  return Response.json({
    transactions,
    total: data.total ?? data.totalCount ?? transactions.length,
  });
};
