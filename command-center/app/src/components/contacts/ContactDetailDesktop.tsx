import { forwardRef, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Copy,
  Download,
  FileText,
  GitMerge,
  List,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Star,
  Trash2,
} from "lucide-react";
import Avatar from "../Avatar";
import NoteList from "../NoteList";
import PipelineStepper from "./PipelineStepper";
import EditContactModal from "./EditContactModal";
import AddTaskModal from "./AddTaskModal";
import { useAuth } from "../../context/AuthContext";
import { useNow } from "../../context/NowContext";
import { useToast } from "../../context/ToastContext";
import { usePipelines } from "../../context/PipelinesContext";
import {
  useContactsQuery,
  useConversationMessagesQuery,
  useConversationsQuery,
  useLeadsQuery,
} from "../../hooks/useApi";
import { e164, formatPhone } from "../../lib/phone";
import { timeAgo } from "../../lib/timeAgo";
import type { ApiContact, ApiLead } from "../../lib/api";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const msgTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dateFmt.format(d);
}

// The desktop (lg+) contact record: the "Cockpit" three-pane layout. Identity,
// details and quick comms on the left; the read-only pipeline stage plus Notes /
// Conversation in the center; quick actions, the linked opportunity and a More
// menu on the right. Reads the same query caches the phone screen uses. Renders
// inside the Contacts route's `hidden lg:flex` wrapper, itself inside <Shell>.
export default function ContactDetailDesktop() {
  const { contactId = "" } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const useReal = Boolean(session);
  const now = useNow();
  const { pipelines } = usePipelines();
  const { showToast } = useToast();

  const [tab, setTab] = useState<"notes" | "convo">("notes");
  const [editing, setEditing] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const notesRef = useRef<HTMLDivElement | null>(null);

  const contactsQuery = useContactsQuery(useReal);
  const contact = useMemo<ApiContact | null>(
    () => contactsQuery.data?.contacts.find((c) => c.id === contactId) ?? null,
    [contactsQuery.data, contactId],
  );

  const leadsQuery = useLeadsQuery(useReal);
  const contactLeads = useMemo<ApiLead[]>(
    () => (leadsQuery.data?.leads ?? []).filter((l) => l.contactId === contactId),
    [leadsQuery.data, contactId],
  );
  const primaryLead = contactLeads[0] ?? null;

  const conversationsQuery = useConversationsQuery(useReal);
  const hasConversation = useMemo(
    () =>
      (conversationsQuery.data?.conversations ?? []).some(
        (c) => c.contactId === contactId,
      ),
    [conversationsQuery.data, contactId],
  );
  const messagesQuery = useConversationMessagesQuery(
    contactId,
    useReal && hasConversation,
  );

  const pipeline = pipelines.find((p) => p.id === primaryLead?.pipelineId);
  const stages = pipeline?.stages ?? [];
  const currentStage = stages.find(
    (s) => s.id === primaryLead?.pipelineStageId,
  );

  const pending =
    !contact && (contactsQuery.isLoading || contactsQuery.isFetching);

  if (!contact && pending) {
    return (
      <Scroll>
        <BackRow onBack={() => navigate("/contacts")} />
        <div className="h-40 animate-pulse rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)]" />
      </Scroll>
    );
  }

  if (!contact) {
    return (
      <Scroll>
        <BackRow onBack={() => navigate("/contacts")} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
          <h1 className="font-display text-xl font-bold text-[var(--text)]">
            Contact not found
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            This contact may have been removed, or the link is incorrect.
          </p>
        </div>
      </Scroll>
    );
  }

  const telDigits = e164(contact.phone);
  const hasPhone = telDigits.replace(/[^0-9]/g, "").length >= 10;
  const phoneDisplay = formatPhone(contact.phone) || contact.phone;
  const hasEmail = contact.email.trim().length > 0;
  const isHot = contact.tags.some((t) => t.toLowerCase().includes("hot"));
  const messages = messagesQuery.data?.messages ?? [];

  function copyPhone() {
    if (!hasPhone) return;
    void navigator.clipboard?.writeText(telDigits).then(
      () => showToast("Phone copied"),
      () => showToast("Could not copy"),
    );
  }

  function goToNotes() {
    setTab("notes");
    notesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <Scroll>
      <BackRow onBack={() => navigate("/contacts")} />

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[288px_1fr_288px]">
        {/* LEFT: identity + comms + details */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-[76px]">
          <Card className="text-center">
            <Avatar name={contact.name} size="lg" className="mx-auto mb-3" />
            <h1 className="truncate font-display text-[20px] font-bold tracking-tight text-[var(--text)]">
              {contact.name}
            </h1>
            {contact.source && (
              <div className="mt-0.5 truncate text-[12.5px] text-[var(--text-muted)]">
                {contact.source}
              </div>
            )}
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
              {isHot && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-tint)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--danger)]">
                  <Star size={11} aria-hidden="true" />
                  Hot
                </span>
              )}
              {currentStage && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[var(--text-muted)]">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--brand)" }}
                    aria-hidden="true"
                  />
                  {currentStage.name}
                </span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <CommTile
                href={hasPhone ? `tel:${telDigits}` : undefined}
                icon={<Phone size={15} aria-hidden="true" />}
                label="Call"
              />
              <CommTile
                href={hasPhone ? `sms:${telDigits}` : undefined}
                icon={<MessageSquare size={15} aria-hidden="true" />}
                label="Text"
              />
              <CommTile
                href={hasEmail ? `mailto:${contact.email}` : undefined}
                icon={<Mail size={15} aria-hidden="true" />}
                label="Email"
              />
            </div>
          </Card>

          <Card>
            <CardHead
              title="Details"
              action={
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label="Edit contact"
                  className="text-[var(--brand-text)] hover:opacity-80"
                >
                  <Pencil size={13} aria-hidden="true" />
                </button>
              }
            />
            <dl className="flex flex-col">
              <KV label="Phone">
                {hasPhone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-data">{phoneDisplay}</span>
                    <button
                      type="button"
                      onClick={copyPhone}
                      aria-label="Copy phone number"
                      className="text-[var(--text-faint)] hover:text-[var(--text)]"
                    >
                      <Copy size={12} aria-hidden="true" />
                    </button>
                  </span>
                ) : (
                  <span className="text-[var(--text-faint)]">--</span>
                )}
              </KV>
              <KV label="Email">
                {hasEmail ? (
                  <span className="break-all font-data text-[11.5px]">
                    {contact.email}
                  </span>
                ) : (
                  <span className="text-[var(--text-faint)]">--</span>
                )}
              </KV>
              <KV label="Added">{formatDate(contact.createdAt)}</KV>
              <KV label="Last activity">
                {timeAgo(contact.lastActivityAt, now)}
              </KV>
            </dl>
            {contact.tags.length > 0 && (
              <div className="mt-3.5 flex flex-wrap gap-1.5 border-t border-[var(--divider)] pt-3.5">
                {contact.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </Card>
        </aside>

        {/* CENTER: read-only pipeline + Notes / Conversation */}
        <div className="flex min-w-0 flex-col gap-4">
          <PipelineStepper
            pipelineName={pipeline?.name ?? "Pipeline"}
            stages={stages}
            currentStageId={primaryLead?.pipelineStageId}
          />

          <Card ref={notesRef}>
            <div className="mb-4 flex gap-6 border-b border-[var(--border)]">
              <TabButton on={tab === "notes"} onClick={() => setTab("notes")}>
                Notes
              </TabButton>
              <TabButton on={tab === "convo"} onClick={() => setTab("convo")}>
                Conversation
              </TabButton>
            </div>

            {tab === "notes" ? (
              <NoteList contactId={contact.id} onToast={showToast} />
            ) : hasConversation ? (
              <div className="flex flex-col gap-3">
                {messagesQuery.isLoading ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    Loading messages.
                  </p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    No messages yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {messages.slice(-6).map((m) => {
                      const out = m.direction === "outbound";
                      return (
                        <div
                          key={m.id}
                          className={
                            "max-w-[80%] rounded-[14px] px-3 py-2 text-[13px] leading-snug " +
                            (out
                              ? "self-end text-white"
                              : "self-start border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]")
                          }
                          style={
                            out
                              ? { backgroundImage: "var(--grad-brand)" }
                              : undefined
                          }
                        >
                          <span className="whitespace-pre-wrap break-words">
                            {m.body}
                          </span>
                          <span
                            className={
                              "mt-1 block text-[10px] " +
                              (out ? "text-white/70" : "text-[var(--text-faint)]")
                            }
                          >
                            {msgTimeFmt.format(new Date(m.at))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => navigate(`/conversations/${contact.id}`)}
                  className="inline-flex items-center gap-1 self-start text-[12.5px] font-semibold text-[var(--brand-text)] hover:underline"
                >
                  Open full conversation
                  <ChevronRight size={13} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                No conversation yet.
              </p>
            )}
          </Card>
        </div>

        {/* RIGHT: quick actions + opportunity + more */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-[76px]">
          <Card>
            <CardLabel>Quick actions</CardLabel>
            <div className="flex flex-col gap-2.5">
              <ActBtn
                primary
                icon={<Calendar size={17} aria-hidden="true" />}
                label="Book appointment"
                onClick={() => showToast("Coming soon")}
              />
              <ActBtn
                icon={<FileText size={17} aria-hidden="true" />}
                label="Add note"
                onClick={goToNotes}
              />
              <ActBtn
                icon={<CheckSquare size={17} aria-hidden="true" />}
                label="Add task"
                onClick={() => setAddingTask(true)}
              />
              <ActBtn
                icon={<Pencil size={17} aria-hidden="true" />}
                label="Edit contact"
                onClick={() => setEditing(true)}
              />
              <ActBtn
                icon={<List size={17} aria-hidden="true" />}
                label="Add to list"
                onClick={() => showToast("Coming soon")}
              />
            </div>
          </Card>

          <Card>
            <CardLabel>
              {contactLeads.length > 1 ? "Opportunities" : "Opportunity"}
            </CardLabel>
            {contactLeads.length === 0 ? (
              <p className="text-[13px] text-[var(--text-muted)]">
                No opportunity yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {contactLeads.map((lead) => {
                  const lp = pipelines.find((p) => p.id === lead.pipelineId);
                  const ls = lp?.stages.find(
                    (s) => s.id === lead.pipelineStageId,
                  );
                  const sub = [
                    lead.value != null ? usd.format(lead.value) : null,
                    ls?.name,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <RecRow
                      key={lead.id}
                      icon={<Briefcase size={15} aria-hidden="true" />}
                      title={lead.name || "Opportunity"}
                      sub={sub || undefined}
                      onClick={() => navigate(`/lead/${lead.id}`)}
                    />
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardLabel>More</CardLabel>
            <div className="flex flex-col gap-2.5">
              <ActBtn
                icon={<GitMerge size={17} aria-hidden="true" />}
                label="Merge duplicate"
                onClick={() => showToast("Coming soon")}
              />
              <ActBtn
                icon={<Download size={17} aria-hidden="true" />}
                label="Export"
                onClick={() => showToast("Coming soon")}
              />
              <ActBtn
                danger
                icon={<Trash2 size={17} aria-hidden="true" />}
                label="Delete contact"
                onClick={() => showToast("Coming soon")}
              />
            </div>
          </Card>
        </aside>
      </div>

      {editing && (
        <EditContactModal
          contact={contact}
          onClose={() => setEditing(false)}
          onSaved={showToast}
        />
      )}
      {addingTask && (
        <AddTaskModal
          contactId={contact.id}
          onClose={() => setAddingTask(false)}
          onSaved={showToast}
        />
      )}
    </Scroll>
  );
}

/* ---------- small building blocks ---------- */

function Scroll({ children }: { children: ReactNode }) {
  return (
    <div className="fx-rise flex flex-1 flex-col overflow-y-auto px-6 pb-12 pt-5">
      {children}
    </div>
  );
}

function BackRow({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
    >
      <ChevronLeft size={15} aria-hidden="true" />
      Contacts
    </button>
  );
}

const Card = forwardRef<
  HTMLDivElement,
  { children: ReactNode; className?: string }
>(function Card({ children, className }, ref) {
  return (
    <div
      ref={ref}
      className={
        "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-[18px] shadow-[var(--shadow-sm)] " +
        (className ?? "")
      }
    >
      {children}
    </div>
  );
});

function CardHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center justify-between">
      <h3 className="font-display text-[14px] font-semibold tracking-[-0.01em] text-[var(--text)]">
        {title}
      </h3>
      {action}
    </div>
  );
}

function CardLabel({ children }: { children: ReactNode }) {
  return <span className="label-cap mb-3 block">{children}</span>;
}

function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--divider)] py-2 text-[13px] last:border-0">
      <dt className="text-[var(--text-faint)]">{label}</dt>
      <dd className="m-0 text-right font-semibold text-[var(--text)]">
        {children}
      </dd>
    </div>
  );
}

function TabButton({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={on ? "true" : undefined}
      className={
        "relative pb-3 pt-1.5 text-[13.5px] transition-colors " +
        (on
          ? "font-semibold text-[var(--text)]"
          : "font-medium text-[var(--text-muted)] hover:text-[var(--text)]")
      }
    >
      {children}
      {on && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -bottom-px h-0.5 rounded-t-full"
          style={{ backgroundImage: "var(--grad-brand)" }}
        />
      )}
    </button>
  );
}

function CommTile({
  href,
  icon,
  label,
}: {
  href?: string;
  icon: ReactNode;
  label: string;
}) {
  const base =
    "flex flex-col items-center justify-center gap-1.5 rounded-[14px] border px-2 py-2.5 text-[12.5px] font-semibold transition-all";
  if (!href) {
    return (
      <div
        aria-disabled="true"
        className={
          base +
          " cursor-not-allowed border-[var(--border)] bg-[var(--surface)] text-[var(--text-faint)] opacity-60"
        }
      >
        {icon}
        {label}
      </div>
    );
  }
  return (
    <a
      href={href}
      className={
        base +
        " border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:-translate-y-0.5 hover:border-[var(--brand)] hover:bg-[var(--brand-tint)] hover:text-[var(--brand-text)] hover:shadow-[var(--shadow-md)]"
      }
    >
      <span className="text-[var(--brand-text)]">{icon}</span>
      {label}
    </a>
  );
}

function ActBtn({
  icon,
  label,
  onClick,
  primary,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  if (primary) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex w-full items-center justify-center gap-2.5 rounded-[var(--radius)] px-3 py-2.5 text-[13.5px] font-semibold text-white shadow-[var(--shadow-brand)] transition-[filter] hover:brightness-105"
        style={{ backgroundImage: "var(--grad-brand)" }}
      >
        {icon}
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "group inline-flex w-full items-center gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-left text-[13.5px] font-semibold text-[var(--text)] transition-all " +
        (danger
          ? "hover:border-[var(--danger)] hover:bg-[var(--danger-tint)] hover:text-[var(--danger)]"
          : "hover:border-[var(--brand)] hover:bg-[var(--brand-tint)] hover:text-[var(--brand-text)] hover:shadow-[var(--shadow-sm)]")
      }
    >
      <span
        className={
          "text-[var(--text-muted)] " +
          (danger
            ? "group-hover:text-[var(--danger)]"
            : "group-hover:text-[var(--brand-text)]")
        }
      >
        {icon}
      </span>
      {label}
    </button>
  );
}

function RecRow({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
    >
      <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] bg-[var(--brand-tint)] text-[var(--brand-text)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-[var(--text)]">
          {title}
        </span>
        {sub && (
          <span className="block truncate font-data text-[12px] text-[var(--text-faint)]">
            {sub}
          </span>
        )}
      </span>
      <ChevronRight
        size={15}
        aria-hidden="true"
        className="shrink-0 text-[var(--text-faint)]"
      />
    </button>
  );
}
