import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import Shell from "../components/Shell";
import ContactsDesktop from "../components/contacts/ContactsDesktop";
import { PageHeader } from "../components/PageHeader";
import { PAGE_CONTAINER } from "../lib/layout";
import TestBanner from "../components/TestBanner";
import SearchBar from "../components/SearchBar";
import Avatar from "../components/Avatar";
import EmptyState from "../components/EmptyState";
import PullToRefresh from "../components/PullToRefresh";
import { useAuth } from "../context/AuthContext";
import { useContactsQuery } from "../hooks/useApi";
import { formatPhone } from "../lib/phone";
import type { ApiContact } from "../lib/api";

export default function Contacts() {
  const { session, mode } = useAuth();
  const useReal = Boolean(session);
  const query = useContactsQuery(useReal);
  const [search, setSearch] = useState("");
  const isTest = mode === "test";

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
      {/* Phone layout (below lg). The desktop client app renders
          ContactsDesktop instead; both share the same query cache.

          Structure copied from Conversations (the reference converted page):
          full-bleed banner strip, then PAGE_CONTAINER holding the header panel
          and the content. This page used to render the old navy hero, so
          tapping Contacts visibly dropped you into a different-looking app. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
      <PullToRefresh queryKeys={[["contacts"]]} />
      {isTest && <TestBanner />}

      <div className={PAGE_CONTAINER}>
        <PageHeader
          title="Contacts"
          count={
            query.isLoading
              ? "Loading..."
              : `${contacts.length} ${contacts.length === 1 ? "contact" : "contacts"}`
          }
        />

        {/* Always shown rather than hidden behind a toggle: the magnifier in the
            old hero was a second, undiscoverable way to reach a search box the
            page has room for. */}
        <div className="mb-3">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search contacts"
          />
        </div>

      <main className="flex flex-1 flex-col">
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
            <EmptyState
              title="No contacts"
              message={`No contacts match "${trimmed}"`}
            />
          ) : (
            <EmptyState
              title="No contacts"
              message="New contacts will show up here as leads come in."
            />
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
      </div>
      </div>

      {/* Desktop client app (lg+): the Atelier directory. */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <ContactsDesktop />
      </div>
    </Shell>
  );
}

interface ContactRowProps {
  contact: ApiContact;
  isLast: boolean;
}

// Name, phone and a Message button into the SMS thread (Jake, 2026-09-22).
function ContactRow({ contact, isLast }: ContactRowProps) {
  const navigate = useNavigate();
  const hasPhone = contact.phone.replace(/[^0-9+]/g, "").length > 0;

  const openDetail = () => navigate(`/contacts/${contact.id}`);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail();
        }
      }}
      aria-label={`View ${contact.name}`}
      className={
        "flex cursor-pointer items-center gap-3 bg-[var(--surface)] px-4 py-3.5 text-left transition-colors active:bg-[var(--surface-2)]" +
        (isLast ? "" : " border-b border-[var(--divider)]")
      }
      style={{ minHeight: "64px" }}
    >
      <Avatar name={contact.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[15px] font-bold text-[var(--text)]">
          {contact.name}
        </div>
        <div className="mt-0.5 truncate text-[13px] text-[var(--text-muted)] tabular-nums">
          {hasPhone ? formatPhone(contact.phone) : "--"}
        </div>
      </div>
      {hasPhone && (
        <button
          type="button"
          aria-label={`Message ${contact.name}`}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/conversations/${encodeURIComponent(contact.id)}`);
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] transition-colors active:scale-95 active:bg-[var(--surface-2)]"
        >
          <MessageSquare size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
