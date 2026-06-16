import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Users } from "lucide-react";
import type { ApiContact } from "@hauck/core";
import { useContactsQuery } from "@/hooks/useApi";
import { formatPhone } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Input, EmptyState, ErrorState } from "@/components/ui";
import { ContactsTable, ContactsTableSkeleton } from "@/components/contacts/ContactsTable";
import { ContactDrawer } from "@/components/contacts/ContactDrawer";

// Contacts: a dense contact book table with a right-hand detail drawer. The open
// contact lives in ?contact=<id> so the command palette can deep-link to it.
export function Contacts() {
  const [params, setParams] = useSearchParams();
  const activeId = params.get("contact") ?? undefined;

  const [query, setQuery] = useState("");

  const contactsQuery = useContactsQuery();
  const contacts = useMemo(
    () => contactsQuery.data?.contacts ?? [],
    [contactsQuery.data],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      const phone = formatPhone(c.phone).toLowerCase();
      return (
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        phone.includes(q)
      );
    });
  }, [contacts, query]);

  // The drawer reads straight off the loaded row; if the URL points at a contact
  // that is not in the current list (e.g. a stale deep-link), there is nothing to show.
  const active = useMemo(
    () => (activeId ? contacts.find((c) => c.id === activeId) : undefined),
    [contacts, activeId],
  );

  function openContact(contact: ApiContact) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("contact", contact.id);
        return next;
      },
      { replace: false },
    );
  }

  function closeContact() {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("contact");
        return next;
      },
      { replace: false },
    );
  }

  return (
    <div>
      <PageHeader
        title="Contacts"
        count={contactsQuery.isSuccess ? filtered.length : undefined}
        filters={
          <div className="relative w-full max-w-sm">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, or phone…"
              className="pl-9"
              aria-label="Search contacts"
            />
          </div>
        }
      />

      {contactsQuery.isLoading ? (
        <ContactsTableSkeleton />
      ) : contactsQuery.isError ? (
        <ErrorState
          title="Couldn't load contacts"
          description="The request failed. Check your connection and try again."
          onRetry={() => void contactsQuery.refetch()}
        />
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={<Users size={22} />}
          title="No contacts"
          description="Contacts will appear here as they come in from your sources."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={22} />}
          title="No matches"
          description={`Nothing matches "${query.trim()}".`}
        />
      ) : (
        <ContactsTable contacts={filtered} onOpen={openContact} />
      )}

      {active && <ContactDrawer contact={active} onClose={closeContact} />}
    </div>
  );
}
