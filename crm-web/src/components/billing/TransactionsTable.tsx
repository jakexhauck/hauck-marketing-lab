import { Receipt } from "lucide-react";
import type { ApiTransaction } from "@hauck/core";
import { cn } from "@/lib/cn";
import { formatMoney, formatDate } from "@/lib/format";
import { paymentStatus } from "@/lib/status";
import { Avatar, StatusPill, EmptyState, ErrorState, Skeleton } from "@/components/ui";

// The payments ledger. Amount is the gold spine on the left here (payments read
// left-to-right as "money in"), with method and date trailing in the data face.
// Method and date drop on narrow screens.

const COLS = "grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] lg:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]";

function HeadCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("label-cap", className)}>{children}</div>;
}

function methodLabel(raw: string): string {
  if (!raw) return "—";
  return raw.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function TransactionsHeader() {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 grid items-center gap-4 border-b border-divider bg-surface-2/80 px-4 py-2.5 backdrop-blur",
        COLS,
      )}
    >
      <HeadCell>Amount</HeadCell>
      <HeadCell>Contact</HeadCell>
      <HeadCell>Status</HeadCell>
      <HeadCell className="hidden sm:block">Method</HeadCell>
      <HeadCell className="hidden text-right lg:block">Date</HeadCell>
    </div>
  );
}

function TransactionRow({ tx }: { tx: ApiTransaction }) {
  return (
    <div className={cn("grid items-center gap-4 px-4 py-3", COLS)}>
      <div className="ledger text-[14px]">{formatMoney(tx.amount)}</div>
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={tx.contactName} size="sm" />
        <span className="truncate text-[13px] text-text">{tx.contactName || "—"}</span>
      </div>
      <div>
        <StatusPill meta={paymentStatus(tx.status)} />
      </div>
      <div className="hidden font-data text-[12.5px] text-muted sm:block">{methodLabel(tx.method)}</div>
      <div className="hidden font-data text-right text-[12.5px] text-muted lg:block">
        {formatDate(tx.createdAt)}
      </div>
    </div>
  );
}

function TransactionsRowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn("grid items-center gap-4 px-4 py-3", COLS)}>
          <Skeleton className="h-3.5 w-16" />
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-7 w-7 rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="hidden h-3 w-16 sm:block" />
          <Skeleton className="hidden h-3 w-20 justify-self-end lg:block" />
        </div>
      ))}
    </>
  );
}

export function TransactionsTable({
  transactions,
  isLoading,
  isError,
  onRetry,
}: {
  transactions: ApiTransaction[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <div className="max-h-[62vh] overflow-y-auto">
        <TransactionsHeader />
        {isError ? (
          <ErrorState
            title="Couldn't load payments"
            description="The payments ledger didn't come back. Try again."
            onRetry={onRetry}
          />
        ) : isLoading ? (
          <TransactionsRowsSkeleton />
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={<Receipt size={22} />}
            title="No payments yet"
            description="Settled payments will appear here as they come in."
          />
        ) : (
          <div className="divide-y divide-divider">
            {transactions.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
