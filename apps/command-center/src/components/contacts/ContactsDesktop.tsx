import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, Search } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import EmptyState from "../EmptyState";
import Avatar from "../Avatar";
import { useAuth } from "../../context/AuthContext";
import { useContactsQuery } from "../../hooks/useApi";
import { formatPhone } from "../../lib/phone";
import type { ApiContact } from "../../lib/api";

// The desktop Contacts directory (lg+): name, phone and a Message button that
// opens the SMS thread. The whole row links through to the contact detail. The
// phone keeps its own list layout; this renders only inside `hidden lg:flex`.
// No All / New / Customers / Past customers tabs (Jake, 2026-10-12): one list.
export default function ContactsDesktop() {
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
      if (qDigits.length > 0 && c.phone.replace(/\D+/g, "").includes(qDigits))
        return true;
      return false;
    });
  }, [contacts, trimmed]);

  return (
    <DesktopPage title="Contacts">
      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone"
          aria-label="Search contacts"
          className="w-full rounded-[var(--radius)] border border-border bg-surface py-2.5 pl-9 pr-3 text-[14px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
        />
      </div>

      {query.isLoadingError ? (
        <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
          Failed to load contacts.{" "}
          {(query.error as Error | null)?.message ?? "Try again."}
        </div>
      ) : query.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
            aria-hidden
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface py-6">
          <EmptyState
            title="No contacts"
            message={
              trimmed
                ? `No contacts match "${trimmed}"`
                : "New contacts will show up here as leads come in."
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-divider text-left">
                <th className="label-cap px-6 py-3 font-semibold">Name</th>
                <th className="label-cap hidden px-6 py-3 font-semibold lg:table-cell">
                  Phone
                </th>
                <th className="label-cap px-6 py-3 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="fx-stagger">
              {visible.map((c) => (
                <ContactRow key={c.id} contact={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DesktopPage>
  );
}

// Name, phone, and one action: Message, which opens the contact's SMS thread
// in the app's own Inbox. Source, tags, last active, email, call and mailto
// were cut (Jake, 2026-09-22): this list is for finding a person and texting
// them, and the rest was reading noise.
function ContactRow({ contact }: { contact: ApiContact }) {
  const navigate = useNavigate();
  const hasPhone = contact.phone.replace(/[^0-9+]/g, "").length > 0;

  const openDetail = () => navigate(`/contacts/${contact.id}`);

  return (
    <tr
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
      className="group cursor-pointer border-b border-divider transition-colors last:border-0 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
    >
      <td className="px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Avatar name={contact.name} size="md" />
          <span className="truncate font-display text-[14.5px] font-semibold text-text">
            {contact.name}
          </span>
        </div>
      </td>

      <td className="hidden px-6 py-3.5 lg:table-cell">
        <span className="whitespace-nowrap font-data text-[13px] text-muted tabular-nums">
          {hasPhone ? formatPhone(contact.phone) : "--"}
        </span>
      </td>

      <td className="px-6 py-3.5">
        <div className="flex items-center justify-end">
          {hasPhone && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/conversations/${encodeURIComponent(contact.id)}`);
              }}
              aria-label={`Message ${contact.name}`}
              className="inline-flex h-9 items-center gap-2 rounded-[var(--radius)] border border-border px-3.5 text-[13px] font-semibold text-muted transition-colors hover:border-brand hover:bg-brand-tint hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <MessageSquare size={15} aria-hidden />
              Message
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
