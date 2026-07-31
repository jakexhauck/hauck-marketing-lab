import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, MessageSquare, Phone, Search } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import EmptyState from "../EmptyState";
import Avatar from "../Avatar";
import { useAuth } from "../../context/AuthContext";
import { useNow } from "../../context/NowContext";
import { usePipelines } from "../../context/PipelinesContext";
import { useContactsQuery, usePipelineLeadsQuery } from "../../hooks/useApi";
import { classifyOrigin, ORIGIN_BY_KEY } from "../../lib/inboxFilters";
import {
  contactSegment,
  SEGMENT_LABELS,
  SEGMENT_ORDER,
  type ContactSegment,
} from "../../lib/contactSegments";
import { formatPhone } from "../../lib/phone";
import { timeAgo } from "../../lib/timeAgo";
import type { ApiContact } from "../../lib/api";

// The Atelier desktop Contacts directory (lg+). One big searchable list: each
// row shows who the contact is, where they came from (source badge, reusing the
// Unified Inbox origin taxonomy), their tags, phone and last activity, with
// call / text / email quick actions that surface on hover. The whole row links
// through to the contact detail. The phone keeps its own list layout; this
// renders only inside `hidden lg:flex` from the Contacts route.
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
          placeholder="Search by name, email, or phone"
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
                  Source
                </th>
                <th className="label-cap hidden px-6 py-3 font-semibold xl:table-cell">
                  Tags
                </th>
                <th className="label-cap hidden px-6 py-3 font-semibold lg:table-cell">
                  Phone
                </th>
                <th className="label-cap hidden px-6 py-3 font-semibold lg:table-cell">
                  Last active
                </th>
                <th className="label-cap px-6 py-3 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="fx-stagger">
              {visible.map((c) => (
                <ContactRow key={c.id} contact={c} now={now} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DesktopPage>
  );
}

function SourceBadge({ contact }: { contact: ApiContact }) {
  const meta = ORIGIN_BY_KEY[classifyOrigin(contact.source, contact.tags)];
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-muted">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: meta.swatch }}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}

function ContactRow({ contact, now }: { contact: ApiContact; now: number }) {
  const navigate = useNavigate();
  const telDigits = contact.phone.replace(/[^0-9+]/g, "");
  const hasPhone = telDigits.length > 0;
  const hasEmail = contact.email.length > 0;
  const visibleTags = contact.tags.slice(0, 3);
  const extraTags = contact.tags.length - visibleTags.length;

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
      {/* Name + email */}
      <td className="px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Avatar name={contact.name} size="md" />
          <div className="min-w-0">
            <div className="truncate font-display text-[14.5px] font-semibold text-text">
              {contact.name}
            </div>
            {hasEmail && (
              <div className="truncate text-[12.5px] text-muted">
                {contact.email}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Source */}
      <td className="hidden px-6 py-3.5 lg:table-cell">
        <SourceBadge contact={contact} />
      </td>

      {/* Tags */}
      <td className="hidden px-6 py-3.5 xl:table-cell">
        {visibleTags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex max-w-[140px] items-center truncate rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold text-muted"
              >
                {tag}
              </span>
            ))}
            {extraTags > 0 && (
              <span className="text-[11px] font-semibold text-faint">
                +{extraTags}
              </span>
            )}
          </div>
        ) : (
          <span className="text-[13px] text-faint">--</span>
        )}
      </td>

      {/* Phone */}
      <td className="hidden px-6 py-3.5 lg:table-cell">
        <span className="whitespace-nowrap font-data text-[13px] text-muted tabular-nums">
          {hasPhone ? formatPhone(contact.phone) : "--"}
        </span>
      </td>

      {/* Last active */}
      <td className="hidden px-6 py-3.5 lg:table-cell">
        <span className="font-data text-[12px] text-faint tabular-nums">
          {timeAgo(contact.lastActivityAt, now)}
        </span>
      </td>

      {/* Actions (surface on row hover / focus) */}
      <td className="px-6 py-3.5">
        <div className="flex items-center justify-end gap-2 opacity-40 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {hasPhone && (
            <a
              href={`tel:${telDigits}`}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Call ${contact.name}`}
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-border text-muted transition-colors hover:border-brand hover:bg-brand-tint hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <Phone size={16} aria-hidden />
            </a>
          )}
          {hasPhone && (
            <a
              href={`sms:${telDigits}`}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Text ${contact.name}`}
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-border text-muted transition-colors hover:border-brand hover:bg-brand-tint hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <MessageSquare size={16} aria-hidden />
            </a>
          )}
          {hasEmail && (
            <a
              href={`mailto:${contact.email}`}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Email ${contact.name}`}
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-border text-muted transition-colors hover:border-brand hover:bg-brand-tint hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <Mail size={16} aria-hidden />
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}
