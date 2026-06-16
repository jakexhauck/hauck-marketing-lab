import { useMemo, useState } from "react";
import type { ApiInvoice } from "@hauck/core";
import { PageHeader } from "@/components/PageHeader";
import { Segmented, type SegmentOption } from "@/components/ui";
import { useInvoicesQuery, useTransactionsQuery } from "@/hooks/useApi";
import { BillingStats, BillingStatsSkeleton, type BillingStat } from "@/components/billing/BillingStats";
import { InvoicesTable } from "@/components/billing/InvoicesTable";
import { InvoiceDetail } from "@/components/billing/InvoiceDetail";
import { TransactionsTable } from "@/components/billing/TransactionsTable";

type View = "invoices" | "payments";
type InvoiceFilter = "all" | "sent" | "paid" | "overdue" | "draft";

const VIEW_OPTIONS: SegmentOption<View>[] = [
  { value: "invoices", label: "Invoices" },
  { value: "payments", label: "Payments" },
];

const FILTER_OPTIONS: SegmentOption<InvoiceFilter>[] = [
  { value: "all", label: "All" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "draft", label: "Draft" },
];

const EMPTY_LABEL: Record<InvoiceFilter, string> = {
  all: "No invoices have been raised for this account yet.",
  sent: "Nothing is currently awaiting payment.",
  paid: "No invoices have been paid yet.",
  overdue: "Nothing is past due. The ledger is current.",
  draft: "No draft invoices are in progress.",
};

// Sum a money field across rows, guarding nulls. We only ever sum or count real
// returned values; no rates or projections.
function sumBy(rows: ApiInvoice[], pick: (r: ApiInvoice) => number | null | undefined): number {
  return rows.reduce((acc, r) => acc + (pick(r) ?? 0), 0);
}

export function Billing() {
  const [view, setView] = useState<View>("invoices");
  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);

  // The summary band reads the full ledger ("all"), independent of the table
  // filter, so the headline figures don't shift as you tab through statuses.
  const allInvoicesQ = useInvoicesQuery("all");
  const filteredInvoicesQ = useInvoicesQuery(filter);
  const transactionsQ = useTransactionsQuery();

  const allInvoices = allInvoicesQ.data?.invoices ?? [];

  const stats = useMemo<BillingStat[]>(() => {
    const unpaid = allInvoices.filter((i) => i.status !== "paid" && i.status !== "void");
    const overdue = allInvoices.filter((i) => i.status === "overdue");
    const paid = allInvoices.filter((i) => i.status === "paid");

    const outstanding = sumBy(unpaid, (i) => i.total);
    const collected = sumBy(paid, (i) => i.total);
    const overdueTotal = sumBy(overdue, (i) => i.total);

    const invoiceCount = (n: number) => `${n} ${n === 1 ? "invoice" : "invoices"}`;

    return [
      {
        label: "Outstanding",
        money: outstanding,
        caption: invoiceCount(unpaid.length),
      },
      {
        label: "Collected",
        money: collected,
        captionTone: "positive",
        caption: invoiceCount(paid.length),
      },
      {
        label: "Overdue",
        money: overdueTotal,
        captionTone: overdue.length ? "danger" : "muted",
        caption: invoiceCount(overdue.length),
      },
      {
        label: "Invoices",
        count: allInvoices.length,
        caption: "all statuses",
      },
    ];
  }, [allInvoices]);

  const txTotal = transactionsQ.data?.total ?? 0;
  const txApproximate = transactionsQ.data?.approximate;
  const txCountLabel = txApproximate ? `${txTotal}+` : `${txTotal}`;

  const headerCount =
    view === "invoices"
      ? allInvoicesQ.isSuccess
        ? `${allInvoices.length}`
        : undefined
      : transactionsQ.isSuccess
        ? txCountLabel
        : undefined;

  return (
    <div>
      <PageHeader
        title="Billing"
        count={headerCount}
        description="Invoices and settled payments for this account."
        actions={
          <Segmented options={VIEW_OPTIONS} value={view} onChange={setView} />
        }
      />

      {/* Ledger band. Skeleton while the full invoice set loads; if it errors we
          omit the band rather than show fabricated zeros. */}
      {allInvoicesQ.isLoading ? (
        <BillingStatsSkeleton />
      ) : allInvoicesQ.isError ? null : (
        <BillingStats stats={stats} />
      )}

      {view === "invoices" ? (
        <div className="mt-5 flex flex-col gap-4">
          <Segmented options={FILTER_OPTIONS} value={filter} onChange={setFilter} size="sm" />
          <InvoicesTable
            invoices={filteredInvoicesQ.data?.invoices ?? []}
            isLoading={filteredInvoicesQ.isLoading}
            isError={filteredInvoicesQ.isError}
            onRetry={() => filteredInvoicesQ.refetch()}
            onOpen={setOpenInvoiceId}
            emptyLabel={EMPTY_LABEL[filter]}
          />
        </div>
      ) : (
        <div className="mt-5">
          <TransactionsTable
            transactions={transactionsQ.data?.transactions ?? []}
            isLoading={transactionsQ.isLoading}
            isError={transactionsQ.isError}
            onRetry={() => transactionsQ.refetch()}
          />
        </div>
      )}

      <InvoiceDetail invoiceId={openInvoiceId} onClose={() => setOpenInvoiceId(null)} />
    </div>
  );
}
