import { FileText } from "lucide-react";
import type { ApiInvoice } from "@hauck/core";
import { cn } from "@/lib/cn";
import { formatMoney, formatDate } from "@/lib/format";
import { invoiceStatus } from "@/lib/status";
import { Avatar, StatusPill, EmptyState, ErrorState, Skeleton } from "@/components/ui";

// The invoices ledger. A sticky-headed table where the Total column is the gold
// spine; everything else is quiet data face so the eye tracks money down the
// right edge. Narrow screens drop the Due and Paid columns first.

const COLS = "grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1.4fr)_auto_auto_auto] lg:grid-cols-[minmax(0,1.4fr)_auto_auto_auto_auto]";

function HeadCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("label-cap", className)}>{children}</div>;
}

export function InvoicesTableHeader() {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 grid items-center gap-4 border-b border-divider bg-surface-2/80 px-4 py-2.5 backdrop-blur",
        COLS,
      )}
    >
      <HeadCell>Invoice</HeadCell>
      <HeadCell className="hidden text-right sm:block">Total</HeadCell>
      <HeadCell className="hidden sm:block">Status</HeadCell>
      <HeadCell className="hidden lg:block">Due</HeadCell>
      <HeadCell className="text-right">Paid</HeadCell>
    </div>
  );
}

function InvoiceRow({ invoice, onOpen }: { invoice: ApiInvoice; onOpen: (id: string) => void }) {
  const meta = invoiceStatus(invoice.status);
  return (
    <button
      type="button"
      onClick={() => onOpen(invoice.id)}
      className={cn(
        "grid w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-2/60",
        COLS,
      )}
    >
      {/* Invoice + contact */}
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={invoice.contactName} size="sm" />
        <div className="min-w-0">
          <div className="font-data text-[13px] text-text">{invoice.number || "—"}</div>
          <div className="truncate text-[12.5px] text-muted">{invoice.contactName || "—"}</div>
        </div>
      </div>

      {/* Total (gold). On narrow screens this collapses into the row via the
          status/paid columns being hidden, so keep total visible from sm up. */}
      <div className="ledger hidden text-right text-[14px] sm:block">
        {formatMoney(invoice.total)}
      </div>

      {/* Status */}
      <div className="hidden sm:block">
        <StatusPill meta={meta} />
      </div>

      {/* Due date */}
      <div className="hidden font-data text-[12.5px] text-muted lg:block">
        {formatDate(invoice.dueDate)}
      </div>

      {/* Paid: gold figure if paid, else a dash. On mobile this column carries
          the money signal since Total is hidden, so show total when unpaid. */}
      <div className="text-right">
        {invoice.paidAt ? (
          <span className="font-data text-[12.5px] text-positive">{formatDate(invoice.paidAt)}</span>
        ) : (
          <>
            <span className="ledger text-[14px] sm:hidden">{formatMoney(invoice.total)}</span>
            <span className="hidden font-data text-[12.5px] text-faint sm:inline">—</span>
          </>
        )}
      </div>
    </button>
  );
}

export function InvoicesTableRowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn("grid items-center gap-4 px-4 py-3", COLS)}>
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-7 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-2.5 w-28" />
            </div>
          </div>
          <Skeleton className="hidden h-3.5 w-16 justify-self-end sm:block" />
          <Skeleton className="hidden h-5 w-16 rounded-full sm:block" />
          <Skeleton className="hidden h-3 w-20 lg:block" />
          <Skeleton className="h-3 w-14 justify-self-end" />
        </div>
      ))}
    </>
  );
}

export function InvoicesTable({
  invoices,
  isLoading,
  isError,
  onRetry,
  onOpen,
  emptyLabel,
}: {
  invoices: ApiInvoice[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onOpen: (id: string) => void;
  emptyLabel: string;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <div className="max-h-[62vh] overflow-y-auto">
        <InvoicesTableHeader />
        {isError ? (
          <ErrorState
            title="Couldn't load invoices"
            description="The billing ledger didn't come back. Try again."
            onRetry={onRetry}
          />
        ) : isLoading ? (
          <InvoicesTableRowsSkeleton />
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={<FileText size={22} />}
            title="No invoices here"
            description={emptyLabel}
          />
        ) : (
          <div className="divide-y divide-divider">
            {invoices.map((inv) => (
              <InvoiceRow key={inv.id} invoice={inv} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
