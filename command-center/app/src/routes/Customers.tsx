import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import Shell from "../components/Shell";
import CustomersDesktop from "../components/customers/CustomersDesktop";
import NavyHero from "../components/NavyHero";
import { HeroMark, HeroIconButton } from "../components/HeroUi";
import SearchBar from "../components/SearchBar";
import Avatar from "../components/Avatar";
import EmptyState from "../components/EmptyState";
import { useCustomers } from "../hooks/useCustomers";
import { APP_BRAND } from "../lib/appBrand";
import { formatMoney, toIso } from "../lib/jobsPipeline";
import type { CustomerWithSchedule } from "../lib/customers";

// Customers, phone surface. Below lg: a simple searchable roster (name, segment,
// lifetime value) that taps through to /customers/:id. At lg+ the desktop
// client renders CustomersDesktop's master-detail surface instead; both read
// off the same useCustomers hook, so there is no separate phone data path.
// Not a bottom-bar tab (see lib/nav.ts), so there is no BottomNav here, same
// as Billing/Calendar.

export default function Customers() {
  const navigate = useNavigate();
  const todayIso = toIso(new Date());
  const { customers, isLoading } = useCustomers(todayIso);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const trimmed = search.trim();
  const visible = useMemo(() => {
    if (!trimmed) return customers;
    const q = trimmed.toLowerCase();
    const qDigits = trimmed.replace(/\D+/g, "");
    return customers.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.email.toLowerCase().includes(q)) return true;
      if (qDigits.length > 0) {
        const digits = c.phone.replace(/\D+/g, "");
        if (digits.includes(qDigits)) return true;
      }
      return false;
    });
  }, [customers, trimmed]);

  return (
    <Shell>
      {/* Phone layout (below lg). The desktop client app renders
          CustomersDesktop instead; both share the same data hook. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <NavyHero>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <HeroMark initials={APP_BRAND.initials} />
              <div className="min-w-0">
                <div className="truncate font-display text-[17px] font-bold text-white">
                  Customers
                </div>
                <div className="truncate text-[12px] text-white/60">
                  {isLoading
                    ? "Loading..."
                    : `${customers.length} ${customers.length === 1 ? "customer" : "customers"}`}
                </div>
              </div>
            </div>
            <HeroIconButton
              label="Search customers"
              onClick={() => setShowSearch((v) => !v)}
              pressed={showSearch}
            >
              <Search size={18} />
            </HeroIconButton>
          </div>
        </NavyHero>

        {(showSearch || trimmed) && (
          <div className="px-5 pt-4">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search customers"
            />
          </div>
        )}

        <main className="mt-4 flex flex-1 flex-col px-5 pb-10">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center py-16">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand)]"
                aria-hidden="true"
              />
            </div>
          ) : visible.length === 0 ? (
            trimmed ? (
              <EmptyState
                title="No customers"
                message={`No customers match "${trimmed}"`}
              />
            ) : (
              <EmptyState
                title="No customers yet"
                message="Customers appear here once a lead books or pays for their first job."
              />
            )
          ) : (
            <ul className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
              {visible.map((c, idx) => (
                <li key={c.id}>
                  <CustomerRow
                    customer={c}
                    isLast={idx === visible.length - 1}
                    onOpen={() => navigate(`/customers/${c.id}`)}
                  />
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>

      {/* Desktop client app (lg+): the Customers master-detail surface. */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <CustomersDesktop onSelect={(id) => navigate(`/customers/${id}`)} />
      </div>
    </Shell>
  );
}

interface CustomerRowProps {
  customer: CustomerWithSchedule;
  isLast: boolean;
  onOpen: () => void;
}

function CustomerRow({ customer, isLast, onOpen }: CustomerRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`View ${customer.name}`}
      className={
        "flex cursor-pointer items-center gap-3 bg-[var(--surface)] px-4 py-3.5 text-left transition-colors active:bg-[var(--surface-2)]" +
        (isLast ? "" : " border-b border-[var(--divider)]")
      }
      style={{ minHeight: "64px" }}
    >
      <Avatar name={customer.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[15px] font-bold text-[var(--text)]">
          {customer.name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-[var(--text-faint)]">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              backgroundColor:
                customer.segment === "recurring"
                  ? "var(--brand)"
                  : "var(--text-faint)",
            }}
            aria-hidden="true"
          />
          {customer.segment === "recurring" ? "Recurring" : "One-time"}
          {customer.business ? ` · ${customer.business}` : ""}
        </div>
      </div>
      <span className="tabular-figs shrink-0 text-[12.5px] font-semibold text-[var(--text-muted)]">
        {formatMoney(customer.lifetimeValue)}
      </span>
    </div>
  );
}
