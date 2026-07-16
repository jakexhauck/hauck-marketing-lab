import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, CalendarDays, AlertTriangle } from "lucide-react";
import Shell from "../components/Shell";
import { PageHeader } from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import { PAGE_CONTAINER } from "../lib/layout";
import { cn } from "../lib/cn";
import { useAuth } from "../context/AuthContext";
import { useCustomersQuery } from "../hooks/useApi";
import { formatMoney, formatMoneyExact } from "../lib/formatMoney";
import { columnLabel, type ApiCustomer, type ApiCustomerColumn } from "../lib/customers";

// The Customers page: who has actually paid, and what for.
//
// Recurring leads (widest column, rich rows carrying the next-service date);
// every other stage renders as a plain list. The server decides that order and
// every number on the page (see functions/lib/customers.ts) — this file only
// renders, so a tile can never drift from the column beneath it.
//
// Desktop is side-by-side columns; below lg the same columns become a tab strip,
// because two columns cannot survive a phone.
//
// Rows open the existing contact Cockpit for now. The customer detail page
// (/customers/:contactId — job history, edit/delete, next service) is phase 4 of
// docs/build-plans/customers-page.md; pointing there before it exists would land
// on the catch-all and bounce the user to Home.

function centsToDollars(cents: number): number {
  return cents / 100;
}

function formatJobDate(iso: string | null): string {
  if (!iso) return "";
  // completed_on is a bare YYYY-MM-DD. Parsing it directly would drag it through
  // the viewer's timezone and show the previous day west of UTC.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatServiceDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// A recurring customer's next-service line. `none` renders nothing at all: they
// are recurring with nothing due, and inventing a nag for that is exactly the
// placeholder chatter the client should never see.
function NextServiceLine({ customer }: { customer: ApiCustomer }) {
  const { serviceState, nextServiceAt } = customer;
  if (!serviceState || serviceState === "none") return null;

  const amber = serviceState === "overdue" || serviceState === "unplanned";
  const Icon = amber ? AlertTriangle : CalendarDays;

  let text: string;
  if (serviceState === "booked") text = `Next service ${formatServiceDate(nextServiceAt)} · on the calendar`;
  else if (serviceState === "overdue") text = `Next service ${formatServiceDate(nextServiceAt)} · overdue`;
  else text = "No next service booked";

  return (
    <div
      className={cn(
        "mt-2 flex items-center gap-1.5 border-t border-dashed border-divider pt-2 text-[12px]",
        amber ? "text-warning" : "text-muted",
      )}
    >
      <Icon size={13} className="shrink-0" aria-hidden />
      <span className="truncate">{text}</span>
    </div>
  );
}

function RecurringRow({ customer, onOpen }: { customer: ApiCustomer; onOpen: () => void }) {
  const since = customer.firstJobOn
    ? new Date(customer.firstJobOn).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:border-brand/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium text-text">{customer.name}</div>
          <div className="mt-0.5 text-[11.5px] text-faint">
            {customer.jobCount === 0
              ? "No jobs logged"
              : `${customer.jobCount} ${customer.jobCount === 1 ? "job" : "jobs"}${since ? ` · since ${since}` : ""}`}
          </div>
        </div>
        <div className="shrink-0 text-right text-[13.5px] font-semibold tabular-figs text-text">
          {formatMoneyExact(centsToDollars(customer.totalCents))}
        </div>
      </div>
      <NextServiceLine customer={customer} />
    </button>
  );
}

function PlainRow({ customer, onOpen }: { customer: ApiCustomer; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-brand/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-medium text-text">{customer.name}</div>
        {customer.phone && <div className="mt-0.5 text-[11.5px] text-faint">{customer.phone}</div>}
      </div>
      <div className="text-[13.5px] font-semibold tabular-figs text-text">
        {formatMoneyExact(centsToDollars(customer.totalCents))}
      </div>
      <div className="w-12 text-right text-[11.5px] tabular-figs text-faint">
        {formatJobDate(customer.lastJobOn)}
      </div>
    </button>
  );
}

function Column({
  column,
  customers,
  filtering,
  onOpen,
}: {
  column: ApiCustomerColumn;
  customers: ApiCustomer[];
  filtering: boolean;
  onOpen: (c: ApiCustomer) => void;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-border bg-surface-2 p-1">
      <header className="flex items-center justify-between gap-2 px-2.5 pb-2 pt-2.5">
        <div className="flex items-center gap-2 font-display text-[13.5px] font-semibold text-text">
          <span
            className="h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ background: column.color ?? "var(--text-faint)" }}
            aria-hidden
          />
          {columnLabel(column.name)}
        </div>
        <div className="text-[12px] tabular-figs text-muted">
          {column.count} · {formatMoney(centsToDollars(column.totalCents))}
        </div>
      </header>
      <div className="flex flex-col gap-1 px-1 pb-1">
        {customers.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12.5px] text-faint">
            {filtering ? "No matches here" : "Nobody here yet"}
          </p>
        ) : (
          customers.map((c) =>
            column.recurring ? (
              <RecurringRow key={c.contactId} customer={c} onOpen={() => onOpen(c)} />
            ) : (
              <PlainRow key={c.contactId} customer={c} onOpen={() => onOpen(c)} />
            ),
          )
        )}
      </div>
    </section>
  );
}

export default function Customers() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const query = useCustomersQuery(Boolean(session));
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const columns = useMemo(() => query.data?.columns ?? [], [query.data]);

  const trimmed = search.trim();
  const matches = useMemo(() => {
    const q = trimmed.toLowerCase();
    const qDigits = trimmed.replace(/\D+/g, "");
    const by = new Map<string, ApiCustomer[]>();
    for (const col of columns) {
      by.set(
        col.id,
        !trimmed
          ? col.customers
          : col.customers.filter((c) => {
              if (c.name.toLowerCase().includes(q)) return true;
              if (c.email.toLowerCase().includes(q)) return true;
              if (qDigits.length > 0 && c.phone.replace(/\D+/g, "").includes(qDigits)) return true;
              return false;
            }),
      );
    }
    return by;
  }, [columns, trimmed]);

  const totals = useMemo(() => {
    let count = 0;
    let cents = 0;
    for (const c of columns) {
      count += c.count;
      cents += c.totalCents;
    }
    return { count, cents };
  }, [columns]);

  const visibleTotal = useMemo(
    () => [...matches.values()].reduce((n, list) => n + list.length, 0),
    [matches],
  );

  // Phone only. Searching from a tab whose column holds no match would show
  // "No matches here" while the header above it says "1 of 9 customers", because
  // the hit is sitting in the other column. Land on a tab that actually has one.
  const tabId = useMemo(() => {
    const current = activeTab ?? columns[0]?.id ?? "";
    if (!trimmed || (matches.get(current)?.length ?? 0) > 0) return current;
    return columns.find((c) => (matches.get(c.id)?.length ?? 0) > 0)?.id ?? current;
  }, [activeTab, columns, matches, trimmed]);

  const noCustomers = !query.isLoading && !query.isError && totals.count === 0;

  const description = trimmed
    ? `${visibleTotal} of ${totals.count} ${totals.count === 1 ? "customer" : "customers"}`
    : `${formatMoney(centsToDollars(totals.cents))} lifetime`;

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageHeader
          title="Customers"
          count={totals.count > 0 ? totals.count : undefined}
          description={totals.count > 0 ? description : undefined}
        />

        {query.isError ? (
          <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
            <span>
              Failed to load customers. {(query.error as Error | null)?.message ?? ""}
            </span>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="rounded-[var(--radius)] border border-danger/40 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-danger/10"
            >
              Retry
            </button>
          </div>
        ) : query.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
              aria-hidden
            />
          </div>
        ) : query.data?.configError === "pipeline_not_found" ? (
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface py-6">
            <EmptyState
              title="No customers"
              message="This account has no Customers pipeline set up yet."
            />
          </div>
        ) : noCustomers ? (
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface py-6">
            <EmptyState
              title="No customers yet"
              message="Close out a completed job to add your first."
            />
          </div>
        ) : (
          <>
            {query.data?.jobsUnavailable && (
              <div className="mb-4 flex items-center gap-2 rounded-[var(--radius-lg)] border border-warning/30 bg-warning-tint px-4 py-2.5 text-[13px] text-warning">
                <AlertTriangle size={15} className="shrink-0" aria-hidden />
                Job history is unavailable right now, so every total below reads zero.
              </div>
            )}

            {/* One count + revenue tile per stage. Two stages = the four tiles
                the page was designed around; a third stage adds its own pair
                rather than being left out of the maths. */}
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {columns.map((col) => (
                <div key={col.id} className="contents">
                  <div
                    className={cn(
                      "rounded-[var(--radius)] border p-4",
                      col.recurring
                        ? "border-brand/35 bg-brand-tint/55"
                        : "border-border bg-surface",
                    )}
                  >
                    <div className="label-cap mb-1.5">{columnLabel(col.name)}</div>
                    <div className="stat-num text-[25px]">{col.count}</div>
                  </div>
                  <div
                    className={cn(
                      "rounded-[var(--radius)] border p-4",
                      col.recurring
                        ? "border-brand/35 bg-brand-tint/55"
                        : "border-border bg-surface",
                    )}
                  >
                    <div className="label-cap mb-1.5">Revenue</div>
                    <div className="stat-num text-[25px]">
                      {formatMoney(centsToDollars(col.totalCents))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="relative mb-5 max-w-sm">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                aria-hidden
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, or phone"
                aria-label="Search customers"
                className="w-full rounded-[var(--radius)] border border-border bg-surface py-2.5 pl-9 pr-3 text-[14px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
            </div>

            {/* Phone: the columns become tabs. */}
            <div className="mb-3 flex gap-1.5 overflow-x-auto no-scrollbar lg:hidden">
              {columns.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setActiveTab(col.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                    col.id === tabId
                      ? "border-brand bg-brand text-white"
                      : "border-border bg-surface text-muted",
                  )}
                >
                  {columnLabel(col.name)}
                  {/* While searching, the badge counts matches, not the whole
                      column, so the tabs agree with the header and with the
                      list underneath them. */}
                  <span className="tabular-figs opacity-75">
                    {trimmed ? (matches.get(col.id)?.length ?? 0) : col.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="lg:hidden">
              {columns
                .filter((col) => col.id === tabId)
                .map((col) => (
                  <Column
                    key={col.id}
                    column={col}
                    customers={matches.get(col.id) ?? []}
                    filtering={Boolean(trimmed)}
                    onOpen={(c) => navigate(`/contacts/${c.contactId}`)}
                  />
                ))}
            </div>

            {/* Desktop: recurring first and widest, per the page's whole point. */}
            <div
              className="hidden gap-3.5 lg:grid"
              style={{
                gridTemplateColumns: columns
                  .map((c) => (c.recurring ? "1.35fr" : "1fr"))
                  .join(" "),
              }}
            >
              {columns.map((col) => (
                <Column
                  key={col.id}
                  column={col}
                  customers={matches.get(col.id) ?? []}
                  filtering={Boolean(trimmed)}
                  onOpen={(c) => navigate(`/customers/${c.contactId}`)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
