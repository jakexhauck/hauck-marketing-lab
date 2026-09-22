import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, Search } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import EmptyState from "../EmptyState";
import Avatar from "../Avatar";
import { useAuth } from "../../context/AuthContext";
import { useNow } from "../../context/NowContext";
import { usePipelines } from "../../context/PipelinesContext";
import { useContactsQuery, usePipelineLeadsQuery } from "../../hooks/useApi";
import {
  contactSegment,
  SEGMENT_LABELS,
  SEGMENT_ORDER,
  type ContactSegment,
} from "../../lib/contactSegments";
import { formatPhone } from "../../lib/phone";
import type { ApiContact } from "../../lib/api";

// The desktop Contacts directory (lg+): name, phone and a Message button that
// opens the SMS thread. The whole row links through to the contact detail. The
// phone keeps its own list layout; this renders only inside `hidden lg:flex`.
export default function ContactsDesktop() {
  const { session } = useAuth();
  const now = useNow();
  const useReal = Boolean(session);
  const query = useContactsQuery(useReal);
  const [search, setSearch] = useState("");

  const contacts: ApiContact[] = useMemo(
    () => query.data?.contacts ?? [],
    [query.data],
  );

  // Saved segments ("Smart Lists") derived from pipeline opportunities: a contact
  // is a customer if it has a won opportunity, new if it has an open one, past if
  // it is a customer gone quiet. Read against the selected pipeline. A contact
  // with no opportunity is only ever in "All" (we never fabricate membership).
  const [segment, setSegment] = useState<ContactSegment>("all");
  const { selectedId } = usePipelines();
  const leadsQuery = usePipelineLeadsQuery(selectedId, useReal);
  const membership = useMemo(() => {
    const wonIds = new Set<string>();
    const openIds = new Set<string>();
    for (const l of leadsQuery.data?.leads ?? []) {
      if (l.status === "won") wonIds.add(l.contactId);
      else if (l.status === "open") openIds.add(l.contactId);
    }
    return { wonIds, openIds };
  }, [leadsQuery.data]);

  const bySegment = useMemo(() => {
    const counts: Record<ContactSegment, number> = {
      all: contacts.length,
      new: 0,
      customers: 0,
      past: 0,
    };
    for (const c of contacts) {
      const seg = contactSegment(c, membership, now);
      if (seg) counts[seg] += 1;
    }
    return counts;
  }, [contacts, membership, now]);

  const segmented = useMemo(
    () =>
      segment === "all"
        ? contacts
        : contacts.filter((c) => contactSegment(c, membership, now) === segment),
    [contacts, membership, now, segment],
  );

  const trimmed = search.trim();
  const visible = useMemo(() => {
    if (!trimmed) return segmented;
    const q = trimmed.toLowerCase();
    const qDigits = trimmed.replace(/\D+/g, "");
    return segmented.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.email.toLowerCase().includes(q)) return true;
      if (qDigits.length > 0 && c.phone.replace(/\D+/g, "").includes(qDigits))
        return true;
      return false;
    });
  }, [segmented, trimmed]);

  return (
    <DesktopPage title="Contacts">
      {/* Lifecycle segments (Smart Lists). Same underline treatment as the
          in-page tab bars so the app reads as one system. */}
      <nav
        aria-label="Contact segments"
        className="mb-5 flex gap-6 overflow-x-auto border-b border-[var(--border)]"
        style={{ scrollbarWidth: "none" }}
      >
        {SEGMENT_ORDER.map((key) => {
          const on = segment === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSegment(key)}
              aria-current={on ? "true" : undefined}
              className={[
                "relative shrink-0 whitespace-nowrap px-0.5 pb-3 pt-2 text-[13.5px] transition-colors",
                on
                  ? "font-semibold text-[var(--text)]"
                  : "font-medium text-[var(--text-muted)] hover:text-[var(--text)]",
              ].join(" ")}
            >
              {SEGMENT_LABELS[key]}
              <span className="ml-1.5 text-[12px] tabular-nums text-[var(--text-faint)]">
                {bySegment[key]}
              </span>
              {on && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-t-full"
                  style={{ backgroundImage: "var(--grad-brand)" }}
                />
              )}
            </button>
          );
        })}
      </nav>

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

      {query.isError ? (
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
