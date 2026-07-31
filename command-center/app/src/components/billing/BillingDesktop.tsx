import { useMemo, useState } from "react";
import { Receipt, Wallet, TrendingUp, Ticket } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import EmptyState from "../EmptyState";
import { useAuth } from "../../context/AuthContext";
import { useNow } from "../../context/NowContext";
import { useInvoicesQuery, useTransactionsQuery } from "../../hooks/useApi";
import {
  avgPaidInvoice,
  collectedYtd,
  lastMonthRevenue,
  momChangePct,
  outstandingTotal,
  revenueThisMonth,
  revenueTrend,
  topCustomers,
} from "../../lib/revenue";
import type { ApiInvoice, ApiTransaction } from "../../lib/api";

// The Atelier desktop Revenue ledger (lg+). The phone keeps its own NavyHero
// layout; this renders only inside `hidden lg:flex` from the Billing route.
// Gold is reserved strictly for money values, per the Ledger Rule.
//
// Layout = "Ledger Dashboard" (mockup A): a four-tile KPI band, a full-width
// revenue trend, an Invoices table beside a Top Customers rail, and a full-width
// Recent Payments table.

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

// Avatar colors for the Top Customers rail, assigned by rank. The data itself
// (name, jobs, amount) is derived from real settled payments; only the swatch
// is cosmetic. Falls back to the last color for any overflow.
const CUSTOMER_COLORS = ["#4f46e5", "#7c73f0", "#0ea5e9", "#f59e0b", "#10b981"];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
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
  positive: { wrap: "bg-positive-tint text-positive", dot: "bg-positive" },
  danger: { wrap: "bg-danger-tint text-danger", dot: "bg-danger" },
  brand: { wrap: "bg-brand-tint text-brand-text", dot: "bg-brand" },
  neutral: { wrap: "bg-surface-2 text-muted", dot: "bg-faint" },
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

// One ledger KPI tile. Money value uses gold tabular figures. An optional delta
// renders as a positive/negative pill under the value.
function MoneyKpi({
  label,
  value,
  sub,
  icon,
  deltaPct,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  deltaPct?: number;
}) {
  const up = (deltaPct ?? 0) >= 0;
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
      <div className="ledger text-[1.9rem] font-semibold leading-none">{value}</div>
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
        {deltaPct !== undefined && (
          <span
            className={
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold " +
              (up ? "bg-positive-tint text-positive" : "bg-danger-tint text-danger")
            }
          >
            {up ? "▲" : "▼"} {Math.abs(deltaPct)}%
          </span>
        )}
        <span className="truncate">{sub}</span>
      </div>
    </div>
  );
}

// Full-width revenue trend as an SVG area + line. Points come from `data`, so
// swapping the placeholder array for real monthly aggregates needs no layout
// change. The brand stroke and soft area gradient match the mockup.
function TrendChart({ data }: { data: { m: string; v: number }[] }) {
  const W = 900;
  const H = 220;
  const padTop = 24;
  const padBottom = 12;
  const max = Math.max(...data.map((d) => d.v));
  const min = Math.min(...data.map((d) => d.v));
  const span = max - min || 1;
  const x = (i: number) => (i / (data.length - 1)) * W;
  const y = (v: number) =>
    H - padBottom - ((v - min) / span) * (H - padTop - padBottom);
  const line = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${W.toFixed(1)},${H} L0,${H} Z`;
  const lastX = x(data.length - 1);
  const lastY = y(data[data.length - 1].v);

  return (
    <div className="px-3 pb-4 pt-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label="Monthly revenue, last 12 months"
      >
        <defs>
          <linearGradient id="revArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g stroke="var(--divider)" strokeWidth="1">
          <line x1="0" y1={H * 0.25} x2={W} y2={H * 0.25} />
          <line x1="0" y1={H * 0.5} x2={W} y2={H * 0.5} />
          <line x1="0" y1={H * 0.75} x2={W} y2={H * 0.75} />
        </g>
        <path d={area} fill="url(#revArea)" />
        <path
          d={line}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={lastX} cy={lastY} r="4.5" fill="var(--brand)" stroke="var(--surface)" strokeWidth="2" />
      </svg>
      <div className="flex justify-between px-1 pt-1.5 font-data text-[11px] tabular-nums text-faint">
        {data.map((d) => (
          <span key={d.m}>{d.m}</span>
        ))}
      </div>
    </div>
  );
}

// Top Customers rail: ranked list with an avatar, job count, revenue bar, and
// gold amount. Bars are relative to the top earner.
function TopCustomers({
  rows,
}: {
  rows: { name: string; jobs: number; amount: number; color: string }[];
}) {
  const top = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <div className="flex items-baseline gap-2 px-5 pb-2 pt-[18px]">
        <h2 className="font-display text-[15.5px] font-semibold text-text">
          Top customers
        </h2>
        <span className="text-[12px] font-medium text-faint">this year</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 pb-5 pt-1 text-[13px] text-faint">
          Paid customers will rank here as payments come in.
        </div>
      ) : (
      <div>
        {rows.map((r, i) => (
          <div
            key={r.name}
            className={
              "flex items-center gap-3 px-5 py-3 " +
              (i === rows.length - 1 ? "" : "border-b border-divider")
            }
          >
            <span
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] text-[13px] font-semibold text-white"
              style={{ background: r.color }}
              aria-hidden
            >
              {initials(r.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-text">
                {r.name}
              </div>
              <div className="mt-0.5 text-[11.5px] text-faint">
                {r.jobs} {r.jobs === 1 ? "job" : "jobs"}
              </div>
              <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round((r.amount / top) * 100)}%`,
                    background: "linear-gradient(90deg, var(--brand), var(--brand-2))",
                  }}
                />
              </div>
            </div>
            <span className="ledger shrink-0 text-[14px] font-semibold tabular-nums">
              {money.format(r.amount)}
            </span>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

export default function BillingDesktop() {
  const { session } = useAuth();
  const useReal = Boolean(session);
  const now = useNow();

  const [filter, setFilter] = useState("all");
  const [trendRange, setTrendRange] = useState<"6M" | "12M" | "YTD">("12M");

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
      filter === "all" ? invoices : invoices.filter((i) => i.status === filter),
    [invoices, filter],
  );

  // Every figure below is derived from the two live feeds (invoices +
  // transactions). Real sums only: a client with no history sees honest zeros
  // and empty states, never a fabricated trend.
  const outstanding = useMemo(() => outstandingTotal(invoices), [invoices]);
  const paidThisMonth = useMemo(
    () => revenueThisMonth(transactions, now),
    [transactions, now],
  );
  const lastMonth = useMemo(
    () => lastMonthRevenue(transactions, now),
    [transactions, now],
  );
  // No prior-month baseline => show no delta rather than a meaningless "0%".
  const momPct = useMemo(
    () => (lastMonth > 0 ? momChangePct(transactions, now) : undefined),
    [transactions, now, lastMonth],
  );
  const ytd = useMemo(() => collectedYtd(transactions, now), [transactions, now]);
  const avgInvoice = useMemo(() => avgPaidInvoice(invoices), [invoices]);
  const trend = useMemo(
    () => revenueTrend(transactions, now, 12),
    [transactions, now],
  );
  const customerRows = useMemo(
    () =>
      topCustomers(transactions, 5).map((r, i) => ({
        ...r,
        color: CUSTOMER_COLORS[i] ?? CUSTOMER_COLORS[CUSTOMER_COLORS.length - 1],
      })),
    [transactions],
  );
  // The trend range toggle just slices the 12-month series: 6M = last six
  // months, YTD = January through the current month.
  const shownTrend = useMemo(() => {
    if (trendRange === "6M") return trend.slice(-6);
    if (trendRange === "YTD") return trend.slice(-(new Date(now).getMonth() + 1));
    return trend;
  }, [trend, trendRange, now]);

  return (
    <DesktopPage title="Revenue">
      {/* KPI band. All four derive from the two live feeds. The MoM pill is
          hidden when there is no prior-month baseline to compare against. */}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyKpi
          label="Revenue this month"
          value={money.format(paidThisMonth)}
          sub={
            momPct !== undefined
              ? `vs ${money.format(lastMonth)} last month`
              : "Payments received this month"
          }
          deltaPct={momPct}
          icon={<Wallet size={16} />}
        />
        <MoneyKpi
          label="Outstanding"
          value={money.format(outstanding)}
          sub="Sent and overdue invoices"
          icon={<Receipt size={16} />}
        />
        <MoneyKpi
          label="Collected YTD"
          value={money.format(ytd)}
          sub="Payments received this year"
          icon={<TrendingUp size={16} />}
        />
        <MoneyKpi
          label="Avg invoice"
          value={money.format(avgInvoice)}
          sub="Across paid invoices"
          icon={<Ticket size={16} />}
        />
      </section>

      {/* Revenue trend (full width), derived from settled payments by month. */}
      <section className="mt-6">
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between px-5 pb-1 pt-[18px]">
            <h2 className="font-display text-[15.5px] font-semibold text-text">
              Revenue trend
            </h2>
            <div
              role="tablist"
              aria-label="Trend range"
              className="inline-flex items-center gap-1 rounded-[var(--radius)] border border-border bg-surface-2 p-1"
            >
              {(["6M", "12M", "YTD"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="tab"
                  aria-selected={r === trendRange}
                  onClick={() => setTrendRange(r)}
                  className={
                    "rounded-[var(--radius-sm)] px-3 py-1 text-[12px] font-semibold transition-colors " +
                    (r === trendRange
                      ? "bg-surface text-text shadow-[var(--shadow-sm)]"
                      : "text-muted hover:text-text")
                  }
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <TrendChart data={shownTrend} />
        </div>
      </section>

      {/* Invoices (full width) beside the Top Customers rail. */}
      <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        {/* Invoices */}
        <div>
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
        </div>

        {/* Top customers rail, derived from settled payments. */}
        <TopCustomers rows={customerRows} />
      </section>

      {/* Recent payments (full width) */}
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
