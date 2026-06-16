import { X } from "lucide-react";
import { useInvoiceQuery } from "@/hooks/useApi";
import { cn } from "@/lib/cn";
import { formatMoney, formatDate } from "@/lib/format";
import { invoiceStatus } from "@/lib/status";
import {
  Drawer,
  Avatar,
  StatusPill,
  LoadingState,
  ErrorState,
  Skeleton,
} from "@/components/ui";

// The invoice document. Opens as a right drawer so the ledger stays visible
// behind it. Reads top-down like a real invoice: masthead (number + status),
// who it's for, the line items, then the totals block where amount due lands in
// gold as the bottom line.

function DateRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="label-cap">{label}</span>
      <span className="font-data text-[12.5px] text-text">{formatDate(value)}</span>
    </div>
  );
}

function TotalRow({
  label,
  value,
  currency,
  strong,
}: {
  label: string;
  value: number;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={cn(strong ? "text-[13px] font-semibold text-text" : "text-[13px] text-muted")}>
        {label}
      </span>
      <span className={cn("ledger", strong ? "text-[18px]" : "text-[14px]")}>
        {formatMoney(value, { currency, cents: true })}
      </span>
    </div>
  );
}

export function InvoiceDetail({ invoiceId, onClose }: { invoiceId: string | null; onClose: () => void }) {
  const open = !!invoiceId;
  const { data, isLoading, isError, refetch } = useInvoiceQuery(invoiceId ?? undefined);
  const invoice = data?.invoice;
  const currency = invoice?.currency ?? "USD";

  return (
    <Drawer open={open} onClose={onClose} width="max-w-md">
      <header className="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
        <div className="min-w-0">
          <div className="label-cap mb-1">Invoice</div>
          {isLoading ? (
            <Skeleton className="h-5 w-28" />
          ) : (
            <div className="font-data text-[17px] text-text">{invoice?.number || "—"}</div>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-faint hover:bg-surface-2 hover:text-text"
          aria-label="Close invoice"
        >
          <X size={18} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isError ? (
          <ErrorState
            title="Couldn't load this invoice"
            description="The invoice details didn't come back. Try again."
            onRetry={() => refetch()}
          />
        ) : isLoading || !invoice ? (
          <LoadingState label="Loading invoice" />
        ) : (
          <div className="flex flex-col gap-5">
            {/* Billed to + status */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={invoice.contactName} size="md" />
                <div className="min-w-0">
                  <div className="label-cap">Billed to</div>
                  <div className="truncate text-[14px] text-text">{invoice.contactName || "—"}</div>
                </div>
              </div>
              <StatusPill meta={invoiceStatus(invoice.status)} />
            </div>

            {/* Dates */}
            <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-divider bg-surface-2/40 px-3.5 py-3">
              <DateRow label="Issued" value={invoice.issueDate} />
              <DateRow label="Due" value={invoice.dueDate} />
              <DateRow label="Paid" value={invoice.paidAt} />
            </div>

            {/* Line items */}
            <div>
              <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-4 px-1">
                <span className="label-cap">Item</span>
                <span className="label-cap text-right">Qty</span>
                <span className="label-cap text-right">Amount</span>
              </div>
              {invoice.items.length === 0 ? (
                <div className="rounded-[var(--radius)] border border-dashed border-border px-3.5 py-4 text-center text-[12.5px] text-faint">
                  No line items on this invoice.
                </div>
              ) : (
                <div className="divide-y divide-divider rounded-[var(--radius)] border border-divider">
                  {invoice.items.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-3.5 py-2.5">
                      <span className="min-w-0 truncate text-[13px] text-text">{item.name || "—"}</span>
                      <span className="font-data text-right text-[12.5px] text-muted tnum">{item.qty}</span>
                      <span className="ledger text-right text-[13px]">
                        {formatMoney(item.amount, { currency, cents: true })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Totals block: amount due is the bottom line, in gold and weight. */}
            <div className="border-t border-border-strong pt-2">
              <TotalRow label="Total" value={invoice.total} currency={currency} />
              <TotalRow label="Amount paid" value={invoice.amountPaid} currency={currency} />
              <div className="my-1 border-t border-divider" />
              <TotalRow label="Amount due" value={invoice.amountDue} currency={currency} strong />
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
