import { useMemo, useState } from "react";
import { Search, Phone, MessageSquare, MapPin } from "lucide-react";
import { PageHeader } from "../PageHeader";
import { Panel, LoadingState, EmptyState } from "../ui";
import Avatar from "../Avatar";
import { cn } from "../../lib/cn";
import { PAGE_CONTAINER } from "../../lib/layout";
import { useCustomers } from "../../hooks/useCustomers";
import { formatMoney, toIso, isoToLocalDate } from "../../lib/jobsPipeline";
import type { CustomerWithSchedule } from "../../lib/customers";
import { NotConnectedNotice } from "../../routes/sales/shared";
import RecurringScheduleEditor from "./RecurringScheduleEditor";
import CustomerJobHistory from "./CustomerJobHistory";

// The Customers master-detail desktop surface (lg+). A sticky master card on the
// left (search + segment chips + roster rows) drives a detail column on the
// right: who the customer is, their recurring schedule editor, and their job
// history. Selection is prop-driven for URL sync (Task 10) with a local
// fallback so the component also stands alone. Reproduces the Variant C mockup.

type Segment = "all" | "recurring" | "onetime";

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: "all", label: "All" },
  { value: "recurring", label: "Recurring" },
  { value: "onetime", label: "One-time" },
];

// "Weekly" / "Every 2 weeks" / "Every N weeks" for a cadence in weeks.
function cadenceLabel(weeks: number): string {
  if (weeks === 1) return "Weekly";
  return `Every ${weeks} weeks`;
}

function shortDate(iso: string): string {
  return isoToLocalDate(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function CustomersDesktop({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  const todayIso = toIso(new Date());
  const { customers, isLoading, connected } = useCustomers(todayIso);
  const [search, setSearch] = useState("");
  const [seg, setSeg] = useState<Segment>("all");
  const [internalId, setInternalId] = useState<string | undefined>(selectedId);

  const activeId = selectedId ?? internalId;

  function handleSelect(id: string) {
    setInternalId(id);
    onSelect?.(id);
  }

  const trimmed = search.trim();
  const searched = useMemo(() => {
    if (!trimmed) return customers;
    const q = trimmed.toLowerCase();
    const qDigits = trimmed.replace(/\D+/g, "");
    return customers.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.email.toLowerCase().includes(q)) return true;
      if (qDigits.length > 0 && c.phone.replace(/\D+/g, "").includes(qDigits))
        return true;
      return false;
    });
  }, [customers, trimmed]);

  const counts = useMemo(
    () => ({
      all: searched.length,
      recurring: searched.filter((c) => c.segment === "recurring").length,
      onetime: searched.filter((c) => c.segment === "onetime").length,
    }),
    [searched],
  );

  const visible = useMemo(
    () =>
      seg === "all"
        ? searched
        : searched.filter((c) => c.segment === seg),
    [searched, seg],
  );

  const selected: CustomerWithSchedule | null =
    customers.find((c) => c.id === activeId) ?? visible[0] ?? customers[0] ?? null;

  // No <Shell> here: the route (Customers / CustomerDetail) provides the shell.
  // This is a pure content component like ContactsDesktop, rendered inside the
  // route's Shell > lg:flex region. Rendering Shell here would double the sidebar.
  return (
    <div className={PAGE_CONTAINER}>
        <PageHeader
          title="Customers"
          description="Pick a customer to see their job history and manage their recurring schedule."
        />

        {!connected && (
          <NotConnectedNotice message="Your paying customers land here automatically once your sales pipeline is connected. Recurring schedules already work." />
        )}

        {isLoading ? (
          <LoadingState label="Loading customers" />
        ) : customers.length === 0 ? (
          <Panel className="mt-4">
            <EmptyState
              title="No customers yet"
              description="Customers appear here once a lead books or pays for their first job."
            />
          </Panel>
        ) : (
          <div className="mt-4 grid grid-cols-[340px_1fr] items-start gap-5">
            {/* Master */}
            <Panel className="sticky top-6 overflow-hidden">
              <div className="p-3 pb-2">
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search customers"
                    aria-label="Search customers"
                    className="w-full rounded-[var(--radius)] border border-border bg-surface py-2 pl-9 pr-3 text-[13.5px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                  />
                </div>
              </div>

              <div className="flex gap-1.5 border-b border-divider px-3 pb-2.5">
                {SEGMENTS.map((s) => {
                  const on = seg === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSeg(s.value)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1 rounded-lg border py-1.5 text-[12px] font-semibold transition-colors",
                        on
                          ? "border-transparent bg-brand-tint text-brand-text"
                          : "border-border bg-surface text-muted hover:text-text",
                      )}
                      aria-pressed={on}
                    >
                      {s.label}
                      <span
                        className={cn(
                          "font-data text-[11px]",
                          on ? "text-brand-text/80" : "text-faint",
                        )}
                      >
                        {counts[s.value]}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="max-h-[calc(100dvh-220px)] overflow-auto">
                {visible.length === 0 ? (
                  <div className="px-4 py-10 text-center text-[13px] text-muted">
                    No customers match "{trimmed}".
                  </div>
                ) : (
                  visible.map((c) => {
                    const on = c.id === selected?.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelect(c.id)}
                        className={cn(
                          "flex w-full items-center gap-3 border-b border-divider px-3.5 py-2.5 text-left transition-colors",
                          on ? "bg-brand-tint" : "hover:bg-surface-2",
                        )}
                        aria-pressed={on}
                      >
                        <Avatar name={c.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div
                            className={cn(
                              "truncate font-display text-[13.5px] font-semibold",
                              on ? "text-brand-text" : "text-text",
                            )}
                          >
                            {c.name}
                          </div>
                          <div className="mt-px flex items-center gap-1.5 text-[11.5px] text-faint">
                            <span
                              className={cn(
                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                c.segment === "recurring"
                                  ? "bg-brand"
                                  : "bg-faint",
                              )}
                              aria-hidden
                            />
                            {c.segment === "recurring" && c.rule
                              ? cadenceLabel(c.rule.cadenceWeeks)
                              : "One-time"}
                          </div>
                        </div>
                        <span className="font-data text-[12px] text-ledger tabular-nums">
                          {formatMoney(c.lifetimeValue)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </Panel>

            {/* Detail */}
            {selected && (
              <div className="flex flex-col gap-4">
                <CustomerDetailHeader customer={selected} />
                <RecurringScheduleEditor
                  key={selected.id}
                  customer={selected}
                  todayIso={todayIso}
                />
                <CustomerJobHistory customer={selected} />
              </div>
            )}
          </div>
        )}
      </div>
  );
}

function CustomerDetailHeader({ customer }: { customer: CustomerWithSchedule }) {
  const telDigits = customer.phone.replace(/[^0-9+]/g, "");
  return (
    <Panel className="p-5">
      <div className="flex items-center gap-3.5">
        <Avatar name={customer.name} size="lg" />
        <div className="min-w-0">
          <div className="font-display text-[19px] font-bold text-text">
            {customer.name}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
            {customer.business && <span>{customer.business} ·</span>}
            <MapPin size={13} className="shrink-0 text-faint" aria-hidden />
            {customer.city}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 gap-2">
          <a
            href={`tel:${telDigits}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-[13px] font-medium text-text transition-colors hover:bg-surface-2"
          >
            <Phone size={14} />
            Call
          </a>
          <a
            href={`sms:${telDigits}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-[13px] font-medium text-text transition-colors hover:bg-surface-2"
          >
            <MessageSquare size={14} />
            Text
          </a>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-divider pt-4">
        <Stat label="Lifetime value">
          <span className="font-data font-semibold text-ledger">
            {formatMoney(customer.lifetimeValue)}
          </span>
        </Stat>
        <Stat label="Total jobs">
          <span className="text-text">{customer.jobCount}</span>
        </Stat>
        <Stat label="Last job">
          <span className="text-[16px] text-muted">
            {shortDate(customer.lastJobAt)}
          </span>
        </Stat>
      </div>
    </Panel>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
        {label}
      </div>
      <div className="mt-1 font-display text-[20px] font-extrabold tracking-[-0.02em]">
        {children}
      </div>
    </div>
  );
}
