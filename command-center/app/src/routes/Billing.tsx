import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, RefreshCw, X } from "lucide-react";
import Shell from "../components/Shell";
import BillingDesktop from "../components/billing/BillingDesktop";
import NavyHero from "../components/NavyHero";
import { HeroIconButton } from "../components/HeroUi";
import TestBanner from "../components/TestBanner";
import EmptyState from "../components/EmptyState";
import PullToRefresh from "../components/PullToRefresh";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useNow } from "../context/NowContext";
import {
  useInvoiceQuery,
  useInvoicesQuery,
  useTransactionsQuery,
} from "../hooks/useApi";
import { freshnessLabel } from "../lib/freshness";
import { outstandingTotal, revenueThisMonth } from "../lib/revenue";
import type { ApiInvoice } from "../lib/api";

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

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  paid: { bg: "#dcfce7", fg: "#15803d", label: "Paid" },
  overdue: { bg: "#ffe4e6", fg: "#e11d48", label: "Overdue" },
  sent: { bg: "#dbeafe", fg: "#1d4ed8", label: "Sent" },
  draft: { bg: "#f1f5f9", fg: "#64748b", label: "Draft" },
  void: { bg: "#f1f5f9", fg: "#94a3b8", label: "Void" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "sent", label: "Sent" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "draft", label: "Draft" },
];

export default function Billing() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, mode } = useAuth();
  const now = useNow();
  const useReal = Boolean(session);
  const isTest = mode === "test";

  // Tapping the freshness line re-pulls the same data pull-to-refresh does, so
  // a client can trust the revenue figures are current without leaving the hero.
  const refreshAll = () => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["invoices"] }),
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
    ]);
  };

  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  // The status filter is applied client-side over the full list so switching
  // tabs is instant and the summary always reflects every invoice.
  const invoicesQuery = useInvoicesQuery("all", useReal);
  const txQuery = useTransactionsQuery(useReal);

  const invoices: ApiInvoice[] = useMemo(
    () => invoicesQuery.data?.invoices ?? [],
    [invoicesQuery.data],
  );
  const transactions = useMemo(
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

  // Real sums only, no fabricated trends. Shared with the Home revenue glance
  // so both screens show the exact same figures.
  const outstanding = useMemo(() => outstandingTotal(invoices), [invoices]);
  const paidThisMonth = useMemo(
    () => revenueThisMonth(transactions, now),
    [transactions, now],
  );

  const updatedLabel = freshnessLabel(invoicesQuery.dataUpdatedAt, now);

  return (
    <Shell>
      {/* Phone layout (below lg). The desktop client app renders
          BillingDesktop instead; both share the same query cache. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
      <PullToRefresh queryKeys={[["invoices"], ["transactions"]]} />
      {isTest && <TestBanner />}

      <NavyHero flushTop={isTest}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <HeroIconButton label="Back to home" onClick={() => navigate("/home")}>
              <ChevronLeft size={20} />
            </HeroIconButton>
            <div className="min-w-0">
              <div className="font-display text-[17px] font-bold text-white">
                Revenue
              </div>
              {updatedLabel && (
                <button
                  type="button"
                  onClick={refreshAll}
                  className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-[12px] text-white/60 transition-colors active:text-white/90"
                >
                  <RefreshCw
                    size={11}
                    className={invoicesQuery.isFetching ? "animate-spin" : undefined}
                    aria-hidden="true"
                  />
                  {updatedLabel}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/12 px-4 py-3">
            <div className="label-cap-light">Outstanding</div>
            <div className="mt-1 font-display text-[22px] font-black text-white">
              {money.format(outstanding)}
            </div>
          </div>
          <div className="rounded-2xl bg-white/12 px-4 py-3">
            <div className="label-cap-light">Revenue this month</div>
            <div className="mt-1 font-display text-[22px] font-black text-white">
              {money.format(paidThisMonth)}
            </div>
          </div>
        </div>
      </NavyHero>

      <div className="flex gap-2 overflow-x-auto px-5 pt-4 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors"
            style={{
              background:
                filter === f.key ? "var(--brand-primary)" : "var(--surface-2)",
              color: filter === f.key ? "#fff" : "var(--text-muted)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <main className="flex flex-1 flex-col gap-6 px-5 pb-28 pt-3">
        <section className="flex flex-col gap-2">
          {invoicesQuery.isError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              Failed to load invoices.{" "}
              {(invoicesQuery.error as Error | null)?.message ?? "Try again."}
            </div>
          ) : invoicesQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand-primary)]"
                aria-hidden="true"
              />
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              title="No invoices"
              message="Invoices sent to this client's customers will show up here."
            />
          ) : (
            <ul className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
              {visible.map((inv, idx) => (
                <li key={inv.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(inv.id)}
                    className={
                      "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-[var(--surface-2)]" +
                      (idx === visible.length - 1
                        ? ""
                        : " border-b border-[var(--divider)]")
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[15px] font-bold text-[var(--text)]">
                        {inv.contactName || inv.number || "Invoice"}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--text-faint)]">
                        <StatusBadge {...(STATUS_STYLE[inv.status] ?? STATUS_STYLE.draft)} />
                        {inv.dueDate && <span>Due {fmtDate(inv.dueDate)}</span>}
                      </div>
                    </div>
                    <div className="font-display text-[16px] font-extrabold tabular-nums text-[var(--text)]">
                      {money.format(inv.total)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <span className="sec-kicker px-1">
            Recent payments
            {txQuery.data
              ? ` (${txQuery.data.transactions.length.toLocaleString("en-US")}${txQuery.data.approximate ? "+" : ""})`
              : ""}
          </span>
          {txQuery.isLoading ? (
            <p className="px-1 text-sm text-[var(--text-muted)]">Loading.</p>
          ) : transactions.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-5 text-center text-[12.5px] text-[var(--text-muted)]">
              No payments yet.
            </div>
          ) : (
            <ul className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
              {transactions.slice(0, 15).map((tx, idx, arr) => (
                <li key={tx.id}>
                  <div
                    className={
                      "flex items-center gap-3 px-4 py-3" +
                      (idx === arr.length - 1
                        ? ""
                        : " border-b border-[var(--divider)]")
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold text-[var(--text)]">
                        {tx.contactName || "Payment"}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-[var(--text-faint)]">
                        {fmtDate(tx.createdAt)}
                        {tx.method ? ` · ${tx.method}` : ""}
                      </div>
                    </div>
                    <div className="font-display text-[15px] font-bold tabular-nums text-[var(--text)]">
                      {money.format(tx.amount)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {openId && (
        <InvoiceDetailSheet
          invoiceId={openId}
          enabled={useReal}
          onClose={() => setOpenId(null)}
        />
      )}
      </div>

      {/* Desktop client app (lg+): the Atelier ledger. */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <BillingDesktop />
      </div>
    </Shell>
  );
}

interface SheetProps {
  invoiceId: string;
  enabled: boolean;
  onClose: () => void;
}

function InvoiceDetailSheet({ invoiceId, enabled, onClose }: SheetProps) {
  const query = useInvoiceQuery(invoiceId, enabled);
  const inv = query.data?.invoice;

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-[var(--surface)] p-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-[var(--text)]">
            {inv?.number ? `Invoice ${inv.number}` : "Invoice"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] active:scale-[0.96]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {query.isLoading ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            Loading invoice.
          </p>
        ) : query.isError || !inv ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            Could not load this invoice.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <StatusBadge {...(STATUS_STYLE[inv.status] ?? STATUS_STYLE.draft)} />
              <span className="text-sm text-[var(--text-muted)]">
                {inv.contactName}
              </span>
            </div>

            {inv.items.length > 0 && (
              <ul className="flex flex-col gap-2 border-t border-[var(--divider)] pt-3">
                {inv.items.map((li, i) => (
                  <li key={i} className="flex justify-between gap-3 text-sm">
                    <span className="min-w-0 flex-1 text-[var(--text)]">
                      {li.name}
                      {li.qty > 1 && (
                        <span className="text-[var(--text-faint)]">
                          {" "}
                          × {li.qty}
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums font-semibold text-[var(--text)]">
                      {money.format(li.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <dl className="flex flex-col gap-2 border-t border-[var(--divider)] pt-3 text-sm">
              <Row label="Total" value={money.format(inv.total)} strong />
              {inv.amountPaid > 0 && (
                <Row label="Paid" value={money.format(inv.amountPaid)} />
              )}
              {inv.amountDue > 0 && (
                <Row label="Due" value={money.format(inv.amountDue)} />
              )}
              {inv.issueDate && (
                <Row label="Issued" value={fmtDate(inv.issueDate)} />
              )}
              {inv.dueDate && <Row label="Due date" value={fmtDate(inv.dueDate)} />}
              {inv.paidAt && <Row label="Paid on" value={fmtDate(inv.paidAt)} />}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="label-cap">{label}</dt>
      <dd
        className={
          "tabular-nums text-right " +
          (strong
            ? "font-display text-[16px] font-extrabold text-[var(--text)]"
            : "font-semibold text-[var(--text)]")
        }
      >
        {value}
      </dd>
    </div>
  );
}
