import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, Mail, Search } from "lucide-react";
import Shell from "../components/Shell";
import ContactsDesktop from "../components/contacts/ContactsDesktop";
import NavyHero from "../components/NavyHero";
import { HeroMark, HeroIconButton } from "../components/HeroUi";
import TestBanner from "../components/TestBanner";
import SearchBar from "../components/SearchBar";
import Avatar from "../components/Avatar";
import EmptyState from "../components/EmptyState";
import PullToRefresh from "../components/PullToRefresh";
import { useAuth } from "../context/AuthContext";
import { useNow } from "../context/NowContext";
import { useContactsQuery } from "../hooks/useApi";
import { APP_BRAND } from "../lib/appBrand";
import { formatPhone } from "../lib/phone";
import { timeAgo } from "../lib/timeAgo";
import type { ApiContact } from "../lib/api";

export default function Contacts() {
  const { session, mode } = useAuth();
  const useReal = Boolean(session);
  const query = useContactsQuery(useReal);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
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
          ContactsDesktop instead; both share the same query cache. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
      <PullToRefresh queryKeys={[["contacts"]]} />
      {isTest && <TestBanner />}

      <NavyHero flushTop={isTest}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <HeroMark initials={APP_BRAND.initials} />
            <div className="min-w-0">
              <div className="truncate font-display text-[17px] font-bold text-white">
                Contacts
              </div>
              <div className="truncate text-[12px] text-white/60">
                {query.isLoading
                  ? "Loading..."
                  : `${contacts.length} ${contacts.length === 1 ? "contact" : "contacts"}`}
              </div>
            </div>
          </div>
          <HeroIconButton
            label="Search contacts"
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
            placeholder="Search contacts"
          />
        </div>
      )}

      <main className="mt-4 flex flex-1 flex-col px-5 pb-28">
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

function ContactRow({ contact, isLast }: ContactRowProps) {
  const now = useNow();
  const navigate = useNavigate();
  const telDigits = contact.phone.replace(/[^0-9+]/g, "");
  const hasPhone = telDigits.length > 0;
  const hasEmail = contact.email.length > 0;
  const visibleTags = contact.tags.slice(0, 2);
  const extraTags = contact.tags.length - visibleTags.length;

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
        <div className="mt-0.5 truncate text-xs text-[var(--text-faint)]">
          {hasPhone ? formatPhone(contact.phone) : hasEmail ? contact.email : "No contact info"}
        </div>
        {visibleTags.length > 0 && (
          <div className="mt-1 flex items-center gap-1">
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex max-w-[110px] items-center truncate rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]"
              >
                {tag}
              </span>
            ))}
            {extraTags > 0 && (
              <span className="text-[10px] font-semibold text-[var(--text-faint)]">
                +{extraTags}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {hasPhone && (
          <a
            href={`tel:${telDigits}`}
            aria-label={`Call ${contact.name}`}
            onClick={(e) => e.stopPropagation()}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] transition-colors active:scale-95 active:bg-[var(--surface-2)]"
          >
            <Phone size={16} aria-hidden="true" />
          </a>
        )}
        {hasEmail && (
          <a
            href={`mailto:${contact.email}`}
            aria-label={`Email ${contact.name}`}
            onClick={(e) => e.stopPropagation()}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] transition-colors active:scale-95 active:bg-[var(--surface-2)]"
          >
            <Mail size={16} aria-hidden="true" />
          </a>
        )}
        <span className="tabular-figs ml-1 hidden text-[10.5px] font-semibold text-[var(--text-faint)] sm:inline">
          {timeAgo(contact.lastActivityAt, now)}
        </span>
      </div>
    </div>
  );
}
