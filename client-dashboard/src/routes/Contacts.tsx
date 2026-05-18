import { useMemo, useState } from "react";
import { Phone, Mail } from "lucide-react";
import Shell from "../components/Shell";
import TopBar from "../components/TopBar";
import ViewTabs from "../components/ViewTabs";
import SearchBar from "../components/SearchBar";
import Avatar from "../components/Avatar";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../context/AuthContext";
import { useContactsQuery } from "../hooks/useApi";
import { formatPhone } from "../lib/phone";
import { timeAgo } from "../lib/timeAgo";
import type { ApiContact } from "../lib/api";

export default function Contacts() {
  const { session } = useAuth();
  const useReal = Boolean(session);
  const query = useContactsQuery(useReal);
  const [search, setSearch] = useState("");

  const contacts: ApiContact[] = useMemo(
    () => query.data?.contacts ?? [],
    [query.data],
  );

  const trimmed = search.trim();
  const visible = useMemo(() => {
    if (!trimmed) return contacts;
    const q = trimmed.toLowerCase();
    const qDigits = trimmed.replace(/\D+/g, "");
    return contacts.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.email.toLowerCase().includes(q)) return true;
      if (qDigits.length > 0) {
        const digits = c.phone.replace(/\D+/g, "");
        if (digits.includes(qDigits)) return true;
      }
      return false;
    });
  }, [contacts, trimmed, search]);

  return (
    <Shell>
      <TopBar />
      <ViewTabs />

      <div className="mb-2 mt-4 flex items-end justify-between px-5">
        <div className="flex flex-col gap-1">
          <span
            className="label-cap-strong"
            style={{ color: "var(--brand-primary)" }}
          >
            Contact Status
          </span>
          <h2 className="font-display text-xl font-bold tracking-tight text-[var(--text)]">
            {query.isLoading ? (
              <>Loading contacts...</>
            ) : trimmed ? (
              <>
                {visible.length} of {contacts.length}{" "}
                {contacts.length === 1 ? "contact" : "contacts"}
              </>
            ) : (
              <>
                {contacts.length} {contacts.length === 1 ? "contact" : "contacts"}
              </>
            )}
          </h2>
        </div>
      </div>

      <div className="px-5 pt-4">
        <SearchBar value={search} onChange={setSearch} />
      </div>

      <main className="mt-4 flex flex-1 flex-col px-5 pb-6">
        {query.isError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            Failed to load contacts.{" "}
            {(query.error as Error | null)?.message ?? "Try again."}
          </div>
        ) : query.isLoading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand)]"
              aria-hidden="true"
            />
          </div>
        ) : visible.length === 0 ? (
          trimmed ? (
            <EmptyState message={`No contacts match "${trimmed}"`} />
          ) : (
            <EmptyState message="No contacts yet." />
          )
        ) : (
          <ul className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            {visible.map((c, idx) => (
              <li key={c.id}>
                <ContactRow contact={c} isLast={idx === visible.length - 1} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </Shell>
  );
}

interface ContactRowProps {
  contact: ApiContact;
  isLast: boolean;
}

function ContactRow({ contact, isLast }: ContactRowProps) {
  const telDigits = contact.phone.replace(/[^0-9+]/g, "");
  const hasPhone = telDigits.length > 0;
  const hasEmail = contact.email.length > 0;

  return (
    <div
      className={
        "flex items-center gap-3 bg-[var(--surface)] px-4 py-3.5" +
        (isLast ? "" : " border-b border-[var(--divider)]")
      }
      style={{ minHeight: "64px" }}
    >
      <Avatar name={contact.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[15px] font-bold text-[var(--text)]">
          {contact.name}
        </div>
        <div className="mt-0.5 truncate text-xs text-[var(--text-faint)]">
          {hasPhone ? formatPhone(contact.phone) : hasEmail ? contact.email : "No contact info"}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {hasPhone && (
          <a
            href={`tel:${telDigits}`}
            aria-label={`Call ${contact.name}`}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] transition-colors active:scale-95 active:bg-[var(--surface-2)]"
          >
            <Phone size={16} aria-hidden="true" />
          </a>
        )}
        {hasEmail && (
          <a
            href={`mailto:${contact.email}`}
            aria-label={`Email ${contact.name}`}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] transition-colors active:scale-95 active:bg-[var(--surface-2)]"
          >
            <Mail size={16} aria-hidden="true" />
          </a>
        )}
        <span className="tabular-figs ml-1 hidden text-[10.5px] font-semibold text-[var(--text-faint)] sm:inline">
          {timeAgo(contact.lastActivityAt)}
        </span>
      </div>
    </div>
  );
}
