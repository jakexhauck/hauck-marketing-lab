import { useMemo, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageSquare,
  Phone,
  Tag,
} from "lucide-react";
import Shell from "../components/Shell";
import NavyHero from "../components/NavyHero";
import { HeroIconButton } from "../components/HeroUi";
import BackButton from "../components/BackButton";
import Avatar from "../components/Avatar";
import { Skeleton } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useNow } from "../context/NowContext";
import { usePipelines } from "../context/PipelinesContext";
import {
  useContactsQuery,
  useConversationsQuery,
  useLeadsQuery,
} from "../hooks/useApi";
import { timeAgo } from "../lib/timeAgo";
import { e164, formatPhone } from "../lib/phone";
import type { ApiContact, ApiLead } from "../lib/api";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dateFmt.format(d);
}

export default function ContactDetail() {
  const { contactId = "" } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const useReal = Boolean(session);
  const now = useNow();
  const { pipelines } = usePipelines();

  // No contact-by-id endpoint exists, so the detail screen reads the contact
  // out of the shared contacts list cache. A cold deep link fetches the list
  // (the query is enabled), so the loading state covers that case too.
  const contactsQuery = useContactsQuery(useReal);
  const contact = useMemo<ApiContact | null>(
    () =>
      contactsQuery.data?.contacts.find((c) => c.id === contactId) ?? null,
    [contactsQuery.data, contactId],
  );

  // Opportunities tied to this contact come from the leads list (each lead
  // carries its contactId); the conversations list tells us whether an inbox
  // thread exists. Both are existing endpoints, so we link rather than invent.
  const leadsQuery = useLeadsQuery(useReal);
  const conversationsQuery = useConversationsQuery(useReal);

  const contactLeads = useMemo<ApiLead[]>(
    () =>
      (leadsQuery.data?.leads ?? []).filter((l) => l.contactId === contactId),
    [leadsQuery.data, contactId],
  );

  const hasConversation = useMemo(
    () =>
      (conversationsQuery.data?.conversations ?? []).some(
        (c) => c.contactId === contactId,
      ),
    [conversationsQuery.data, contactId],
  );

  const pending = !contact && (contactsQuery.isLoading || contactsQuery.isFetching);

  if (!contact && pending) {
    return (
      <Shell>
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <BackButton to="/contacts" label="Contacts" />
          </header>
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
        </div>
      </Shell>
    );
  }

  if (!contact) {
    return (
      <Shell>
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <BackButton to="/contacts" label="Contacts" />
          </header>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <h1 className="font-display text-xl font-bold text-[var(--text)]">
              Contact not found
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              This contact may have been removed, or the link is incorrect.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  const telDigits = e164(contact.phone);
  const hasPhone = telDigits.replace(/[^0-9]/g, "").length >= 10;
  const phoneDisplay = formatPhone(contact.phone) || contact.phone;
  const hasEmail = contact.email.trim().length > 0;

  return (
    <Shell>
      <div className="flex min-h-0 flex-1 flex-col">
        <NavyHero>
          <div className="flex items-center justify-between">
            <HeroIconButton
              label="Back to contacts"
              onClick={() => navigate("/contacts")}
            >
              <ChevronLeft size={20} />
            </HeroIconButton>
            {hasPhone && (
              <a
                href={`tel:${telDigits}`}
                aria-label={`Call ${contact.name}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white transition-colors active:scale-[0.96]"
                style={{ background: "rgba(255,255,255,0.14)" }}
              >
                <Phone size={18} />
              </a>
            )}
          </div>

          <div className="mt-4 flex items-center gap-4">
            <Avatar name={contact.name} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-2xl font-bold tracking-tight text-white">
                {contact.name}
              </h1>
              {contact.source && (
                <div className="mt-1.5 truncate text-xs text-white/60">
                  {contact.source}
                </div>
              )}
            </div>
          </div>
        </NavyHero>

        <div className="flex flex-col gap-5 px-5 py-5 pb-28">
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
                href={hasEmail ? `mailto:${contact.email}` : undefined}
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
                href={`mailto:${contact.email}`}
                className="flex items-center gap-3 break-all text-base font-semibold underline"
                style={{ color: "var(--brand-text)" }}
              >
                <Mail size={16} aria-hidden="true" />
                <span>{contact.email}</span>
              </a>
            )}
            {!hasPhone && !hasEmail && (
              <p className="text-sm text-[var(--text-muted)]">
                No phone or email on file for this contact.
              </p>
            )}

            {contact.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--divider)] pt-3">
                <Tag
                  size={13}
                  aria-hidden="true"
                  className="text-[var(--text-muted)]"
                />
                {contact.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <dl className="flex flex-col gap-2 border-t border-[var(--divider)] pt-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="label-cap">Added</dt>
                <dd className="text-right font-semibold text-[var(--text)]">
                  {formatDate(contact.createdAt)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="label-cap">Last activity</dt>
                <dd className="text-right font-semibold text-[var(--text)]">
                  {timeAgo(contact.lastActivityAt, now)}
                </dd>
              </div>
            </dl>
          </section>

          {/* Inbox thread (only when one exists) */}
          {hasConversation && (
            <section className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h2 className="label-cap">Conversation</h2>
              <button
                type="button"
                onClick={() => navigate(`/conversations/${contact.id}`)}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left transition-colors active:bg-[var(--surface-2)]"
              >
                <span className="flex items-center gap-3">
                  <MessageSquare
                    size={16}
                    aria-hidden="true"
                    className="text-[var(--text-muted)]"
                  />
                  <span className="text-sm font-semibold text-[var(--text)]">
                    View conversation
                  </span>
                </span>
                <ChevronRight
                  size={16}
                  aria-hidden="true"
                  className="text-[var(--text-faint)]"
                />
              </button>
            </section>
          )}

          {/* Linked opportunities (only when any exist) */}
          {contactLeads.length > 0 && (
            <section className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h2 className="label-cap">
                {contactLeads.length === 1
                  ? "Opportunity"
                  : `Opportunities (${contactLeads.length})`}
              </h2>
              <ul className="flex flex-col gap-2">
                {contactLeads.map((lead) => {
                  const pipeline = pipelines.find(
                    (p) => p.id === lead.pipelineId,
                  );
                  const stage = pipeline?.stages.find(
                    (s) => s.id === lead.pipelineStageId,
                  );
                  const label =
                    [pipeline?.name, stage?.name].filter(Boolean).join(" · ") ||
                    "Opportunity";
                  return (
                    <li key={lead.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/lead/${lead.id}`)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left transition-colors active:bg-[var(--surface-2)]"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]">
                          {label}
                        </span>
                        <ChevronRight
                          size={16}
                          aria-hidden="true"
                          className="shrink-0 text-[var(--text-faint)]"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </Shell>
  );
}

interface ActionTileProps {
  href?: string;
  icon: ReactNode;
  label: string;
}

// A prominent quick-action tile. Renders as a link when actionable, and as a
// disabled placeholder when the contact lacks the channel (no phone or email).
function ActionTile({ href, icon, label }: ActionTileProps) {
  const base =
    "flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-4 text-[13px] font-semibold transition-colors";
  if (!href) {
    return (
      <div
        aria-disabled="true"
        className={
          base +
          " cursor-not-allowed border-[var(--border)] bg-[var(--surface)] text-[var(--text-faint)]"
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
