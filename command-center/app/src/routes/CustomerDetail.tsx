import { useMemo, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Mail, MapPin, MessageSquare, Phone } from "lucide-react";
import Shell from "../components/Shell";
import CustomersDesktop from "../components/customers/CustomersDesktop";
import NavyHero from "../components/NavyHero";
import { HeroIconButton } from "../components/HeroUi";
import BackButton from "../components/BackButton";
import Avatar from "../components/Avatar";
import { Skeleton } from "../components/ui";
import RecurringScheduleEditor from "../components/customers/RecurringScheduleEditor";
import CustomerJobHistory from "../components/customers/CustomerJobHistory";
import { useCustomers } from "../hooks/useCustomers";
import { formatMoney, isoToLocalDate, toIso } from "../lib/jobsPipeline";
import { e164, formatPhone } from "../lib/phone";

// Customers, phone detail. Below lg: header (avatar, name, business/city, call
// / text), then the same RecurringScheduleEditor + CustomerJobHistory panels
// the desktop detail column uses. At lg+ this renders CustomersDesktop with
// this customer preselected, so a deep link (e.g. shared from the mobile app)
// opens the same customer on desktop.

function shortDate(iso: string): string {
  return isoToLocalDate(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CustomerDetail() {
  const { customerId = "" } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const todayIso = toIso(new Date());
  const { customers, isLoading } = useCustomers(todayIso);

  const customer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  const handleSelect = (id: string) => navigate(`/customers/${id}`);

  if (!customer) {
    return (
      <Shell>
        <div className="flex min-h-0 flex-1 flex-col lg:hidden">
          <header className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <BackButton to="/customers" label="Customers" />
          </header>
          {isLoading ? (
            <div className="flex flex-col gap-5 px-5 py-6">
              <div className="flex items-center gap-4">
                <Skeleton className="h-14 w-14 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <h1 className="font-display text-xl font-bold text-[var(--text)]">
                Customer not found
              </h1>
              <p className="text-sm text-[var(--text-muted)]">
                This customer may have been removed, or the link is incorrect.
              </p>
            </div>
          )}
        </div>

        <div className="hidden min-h-0 flex-1 lg:flex">
          <CustomersDesktop selectedId={customerId} onSelect={handleSelect} />
        </div>
      </Shell>
    );
  }

  const telDigits = e164(customer.phone);
  const hasPhone = telDigits.replace(/[^0-9]/g, "").length >= 10;
  const phoneDisplay = formatPhone(customer.phone) || customer.phone;
  const hasEmail = customer.email.trim().length > 0;

  return (
    <Shell>
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <NavyHero>
          <div className="flex items-center justify-between">
            <HeroIconButton
              label="Back to customers"
              onClick={() => navigate("/customers")}
            >
              <ChevronLeft size={20} />
            </HeroIconButton>
            {hasPhone && (
              <a
                href={`tel:${telDigits}`}
                aria-label={`Call ${customer.name}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white transition-colors active:scale-[0.96]"
                style={{ background: "rgba(255,255,255,0.14)" }}
              >
                <Phone size={18} />
              </a>
            )}
          </div>

          <div className="mt-4 flex items-center gap-4">
            <Avatar name={customer.name} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-2xl font-bold tracking-tight text-white">
                {customer.name}
              </h1>
              <div className="mt-1.5 flex items-center gap-1 truncate text-xs text-white/60">
                {customer.business && <span>{customer.business} ·</span>}
                <MapPin size={12} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{customer.city}</span>
              </div>
            </div>
          </div>
        </NavyHero>

        <div className="flex flex-col gap-5 px-5 py-5 pb-10">
          {/* Quick stats */}
          <section className="grid grid-cols-3 gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <Stat label="Lifetime value">{formatMoney(customer.lifetimeValue)}</Stat>
            <Stat label="Total jobs">{customer.jobCount}</Stat>
            <Stat label="Last job">{shortDate(customer.lastJobAt)}</Stat>
          </section>

          {/* Primary actions */}
          {(hasPhone || hasEmail) && (
            <section className="grid grid-cols-3 gap-3">
              <ActionTile
                href={hasPhone ? `tel:${telDigits}` : undefined}
                icon={<Phone size={18} aria-hidden="true" />}
                label="Call"
              />
              <ActionTile
                href={hasPhone ? `sms:${telDigits}` : undefined}
                icon={<MessageSquare size={18} aria-hidden="true" />}
                label="Text"
              />
              <ActionTile
                href={hasEmail ? `mailto:${customer.email}` : undefined}
                icon={<Mail size={18} aria-hidden="true" />}
                label="Email"
              />
            </section>
          )}

          {/* Contact details */}
          <section className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            {hasPhone && (
              <a
                href={`tel:${telDigits}`}
                className="flex items-center gap-3 text-base font-semibold underline"
                style={{ color: "var(--brand-text)" }}
              >
                <Phone size={16} aria-hidden="true" />
                <span>{phoneDisplay}</span>
              </a>
            )}
            {hasEmail && (
              <a
                href={`mailto:${customer.email}`}
                className="flex items-center gap-3 break-all text-base font-semibold underline"
                style={{ color: "var(--brand-text)" }}
              >
                <Mail size={16} aria-hidden="true" />
                <span>{customer.email}</span>
              </a>
            )}
            {!hasPhone && !hasEmail && (
              <p className="text-sm text-[var(--text-muted)]">
                No phone or email on file for this customer.
              </p>
            )}
          </section>

          <RecurringScheduleEditor
            key={customer.id}
            customer={customer}
            todayIso={todayIso}
          />
          <CustomerJobHistory customer={customer} />
        </div>
      </div>

      {/* Desktop client app (lg+): the Customers master-detail surface, this
          customer preselected. */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <CustomersDesktop selectedId={customerId} onSelect={handleSelect} />
      </div>
    </Shell>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-faint)]">
        {label}
      </div>
      <div className="mt-1 truncate font-display text-[14.5px] font-bold text-[var(--text)]">
        {children}
      </div>
    </div>
  );
}

interface ActionTileProps {
  href?: string;
  icon: ReactNode;
  label: string;
}

// A prominent quick-action tile. Renders as a link when actionable, and as a
// disabled placeholder when the customer lacks the channel (no phone or email).
function ActionTile({ href, icon, label }: ActionTileProps) {
  const base =
    "flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-4 text-[13px] font-semibold transition-colors";
  if (!href) {
    return (
      <div
        aria-disabled="true"
        className={
          base +
          " cursor-not-allowed border-[var(--border)] bg-[var(--surface)] text-[var(--text-faint)] opacity-70"
        }
      >
        {icon}
        <span>{label}</span>
        <span className="text-[10px] font-medium normal-case">Not available</span>
      </div>
    );
  }
  return (
    <a
      href={href}
      className={
        base +
        " border-[var(--border)] bg-[var(--surface)] text-[var(--text)] active:scale-[0.97] active:bg-[var(--surface-2)]"
      }
    >
      <span style={{ color: "var(--brand-text)" }}>{icon}</span>
      <span>{label}</span>
    </a>
  );
}
