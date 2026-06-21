import { useMemo, useState } from "react";
import { Receipt, Wallet } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import NotificationBell from "../NotificationBell";
import EmptyState from "../EmptyState";
import { useAuth } from "../../context/AuthContext";
import { useInvoicesQuery, useTransactionsQuery } from "../../hooks/useApi";
import type { ApiInvoice, ApiTransaction } from "../../lib/api";

// The Atelier desktop Billing ledger (lg+). The phone keeps its own NavyHero
// layout; this renders only inside `hidden lg:flex` from the Billing route.
// Gold is reserved strictly for money values, per the Ledger Rule.

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dateFmt.format(d);
}

// Status tone maps to a semantic pill (dot + label, never color alone).
type Tone = "positive" | "danger" | "brand" | "neutral";

const STATUS_TONE: Record<string, { tone: Tone; label: string }> = {
  paid: { tone: "positive", label: "Paid" },
  overdue: { tone: "danger", label: "Overdue" },
  sent: { tone: "brand", label: "Sent" },
  draft: { tone: "neutral", label: "Draft" },
  void: { tone: "neutral", label: "Void" },
};

const TONE_CLASS: Record<Tone, { wrap: string; dot: string }> = {
  positive: {
    wrap: "bg-positive-tint text-positive",
    dot: "bg-positive",
  },
  danger: {
    wrap: "bg-danger-tint text-danger",
    dot: "bg-danger",
  },
  brand: {
    wrap: "bg-brand-tint text-brand-text",
    dot: "bg-brand",
  },
  neutral: {
    wrap: "bg-surface-2 text-muted",
    dot: "bg-faint",
  },
};

function StatusPill({ status }: { status: string }) {
  const { tone, label } = STATUS_TONE[status] ?? STATUS_TONE.draft;
  const cls = TONE_CLASS[tone];
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold " +
        cls.wrap
      }
    >
      <span className={"h-1.5 w-1.5 rounded-full " + cls.dot} aria-hidden />
      {label}
    </span>
  );
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "sent", label: "Sent" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "draft", label: "Draft" },
];

const PAID_STATES = new Set(["succeeded", "paid", "completed", "success"]);

// One ledger KPI tile. Money value uses gold tabular figures.
function MoneyKpi({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)]"
      role="group"
      aria-label={label}
    >
      <div className="flex items-center justify-between">
        <span className="label-cap truncate">{label}</span>
        <span className="text-faint" aria-hidden>
          {icon}
        </span>
      </div>
      <div className="ledger text-[2rem] font-semibold leading-none">{value}</div>
      <div className="text-[12.5px] font-medium text-muted">{sub}</div>
    </div>
  );
}

export default function BillingDesktop() {
  const { session } = useAuth();
  const useReal = Boolean(session);

  const [filter, setFilter] = useState("all");

  const invoicesQuery = useInvoicesQuery("all", useReal);
  const txQuery = useTransactionsQuery(useReal);

  const invoices: ApiInvoice[] = useMemo(
    () => invoicesQuery.data?.invoices ?? [],
    [invoicesQuery.data],
  );
  const transactions: ApiTransaction[] = useMemo(
    () => txQuery.data?.transactions ?? [],
    [txQuery.data],
  );

  const visible = useMemo(
    () =>
      filter === "all"
        ? invoices
        : invoices.filter((i) => i.status === filter),
    [invoices, filter],
  );

  // Real sums only, no fabricated trends.
  const outstanding = useMemo(
    () =>
      invoices
        .filter((i) => i.status === "sent" || i.status === "overdue")
        .reduce((sum, i) => sum + i.total, 0),
    [invoices],
  );

  const paidThisMonth = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    return transactions
      .filter((t) => PAID_STATES.has(t.status) && t.createdAt)
      .filter((t) => {
        const d = new Date(t.createdAt as string);
        return d.getMonth() === m && d.getFullYear() === y;
      })
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  const subtitle = invoicesQuery.isLoading
    ? "Loading..."
    : `${invoices.length} ${invoices.length === 1 ? "invoice" : "invoices"}`;

  return (
    <DesktopPage
      title="Billing"
      subtitle={subtitle}
      actions={<NotificationBell enabled={useReal} variant="surface" />}
    >
      {/* Ledger summary band */}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <MoneyKpi
          label="Outstanding"
          value={money.format(outstanding)}
          sub="Sent and overdue invoices"
          icon={<Receipt size={16} />}
        />
        <MoneyKpi
          label="Paid this month"
          value={money.format(paidThisMonth)}
          sub="Payments received this month"
          icon={<Wallet size={16} />}
        />
      </section>

      {/* Invoices */}
      <section className="mt-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-[16px] font-semibold text-text">
            Invoices
          </h2>
          <div
            role="tablist"
            aria-label="Filter invoices by status"
            className="inline-flex items-center gap-1 rounded-[var(--radius)] border border-border bg-surface-2 p-1"
          >
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f.key)}
                  className={
                    "rounded-[var(--radius-sm)] px-3 py-1.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 " +
                    (active
                      ? "bg-surface text-text shadow-[var(--shadow-sm)]"
                      : "text-muted hover:text-text")
                  }
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {invoicesQuery.isError ? (
          <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
            Failed to load invoices.{" "}
            {(invoicesQuery.error as Error | null)?.message ?? "Try again."}
          </div>
        ) : invoicesQuery.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
              aria-hidden
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface py-6">
            <EmptyState
              title="No invoices"
              message={
                filter === "all"
                  ? "Invoices sent to this client's customers will show up here."
                  : `No ${filter} invoices right now.`
              }
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-divider text-left">
                  <th className="label-cap px-6 py-3 font-semibold">Invoice</th>
                  <th className="label-cap hidden px-6 py-3 font-semibold lg:table-cell">
                    Contact
                  </th>
                  <th className="label-cap px-6 py-3 font-semibold">Status</th>
                  <th className="label-cap hidden px-6 py-3 font-semibold lg:table-cell">
                    Date
                  </th>
                  <th className="label-cap px-6 py-3 text-right font-semibold">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((inv) => {
                  const isPaid = inv.status === "paid";
                  const dateIso = isPaid ? inv.paidAt : inv.dueDate;
                  const datePrefix = isPaid ? "Paid" : "Due";
                  return (
                    <tr
                      key={inv.id}
                      className="border-b border-divider transition-colors last:border-0 hover:bg-surface-2"
                    >
                      <td className="px-6 py-3.5">
                        <div className="font-data text-[13px] text-text tabular-nums">
                          {inv.number || "Invoice"}
                        </div>
                      </td>
                      <td className="hidden px-6 py-3.5 lg:table-cell">
                        <span className="truncate text-[14px] text-text">
                          {inv.contactName || "--"}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <StatusPill status={inv.status} />
                      </td>
                      <td className="hidden px-6 py-3.5 lg:table-cell">
                        {dateIso ? (
                          <span className="font-data text-[12.5px] text-muted tabular-nums">
                            {datePrefix} {fmtDate(dateIso)}
                          </span>
                        ) : (
                          <span className="text-[13px] text-faint">--</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <span className="ledger text-[15px] font-semibold">
                          {money.format(inv.total)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent payments */}
      <section className="mt-7">
        <h2 className="mb-4 font-display text-[16px] font-semibold text-text">
          Recent payments
          {txQuery.data
            ? ` (${txQuery.data.transactions.length.toLocaleString("en-US")}${
                txQuery.data.approximate ? "+" : ""
              })`
            : ""}
        </h2>

        {txQuery.isError ? (
          <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
            Failed to load payments.{" "}
            {(txQuery.error as Error | null)?.message ?? "Try again."}
          </div>
        ) : txQuery.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div
              className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-brand"
              aria-hidden
            />
          </div>
        ) : transactions.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface py-6">
            <EmptyState
              title="No payments yet"
              message="Payments received from this client's customers will show up here."
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-divider text-left">
                  <th className="label-cap px-6 py-3 font-semibold">Contact</th>
                  <th className="label-cap hidden px-6 py-3 font-semibold lg:table-cell">
                    Method
                  </th>
                  <th className="label-cap hidden px-6 py-3 font-semibold lg:table-cell">
                    Date
                  </th>
                  <th className="label-cap px-6 py-3 text-right font-semibold">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 15).map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b border-divider transition-colors last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-6 py-3.5">
                      <span className="truncate text-[14px] font-medium text-text">
                        {tx.contactName || "Payment"}
                      </span>
                    </td>
                    <td className="hidden px-6 py-3.5 lg:table-cell">
                      <span className="text-[13px] text-muted">
                        {tx.method || "--"}
                      </span>
                    </td>
                    <td className="hidden px-6 py-3.5 lg:table-cell">
                      {tx.createdAt ? (
                        <span className="font-data text-[12.5px] text-muted tabular-nums">
                          {fmtDate(tx.createdAt)}
                        </span>
                      ) : (
                        <span className="text-[13px] text-faint">--</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <span className="ledger text-[14px] font-semibold">
                        {money.format(tx.amount)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DesktopPage>
  );
}
