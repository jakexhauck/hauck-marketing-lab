import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Pencil,
  Send,
} from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { Button } from "../../components/ui/Button";
import SlotPicker, { dayLabel, endOf, timeLabel } from "../../components/admin/booking/SlotPicker";
import {
  useBookOnboardingCall,
  useNewClientKit,
  useOnboardingSlots,
  useSaveAgencyLinks,
} from "../../hooks/useNewClient";
import { AGENCY_LINKS, isSafeLink } from "../../lib/agencyLinks";

// Add a client (/admin/clients/new): the page you open when someone has just
// signed.
//
// Three things happen here, in the order they happen in real life: send them the
// intake form, send them the documents, and put the onboarding call in the
// diary. Everything else about standing a client up happens later, on their
// record, and only after they have answered.
//
// The client is NOT created here. Nothing on this page writes a tenant: the
// client fills the form, and approving their submission on the board is what
// creates them. The three-step form for a client with no intake form is one
// link at the foot of the page, where a rare path belongs.

export default function AdminNewClient() {
  const kit = useNewClientKit();

  return (
    <DesktopPage
      title="Add a client"
      subtitle="Send them the form, send the paperwork, book the call."
      actions={
        <Link to="/admin/onboarding">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={15} aria-hidden />
            Back to Onboarding
          </Button>
        </Link>
      }
    >
      <div className="mt-6 flex w-full max-w-[900px] flex-col gap-4">
        <SendTheForm funnelUrl={kit.data?.funnelUrl ?? null} loading={kit.isLoading} />
        <Paperwork links={kit.data?.links ?? {}} loading={kit.isLoading} />
        <BookTheCall calendarId={kit.data?.calendarId ?? ""} />
        <ByHand />
      </div>
    </DesktopPage>
  );
}

// --- 1. The form -------------------------------------------------------------

function SendTheForm({ funnelUrl, loading }: { funnelUrl: string | null; loading: boolean }) {
  return (
    <Card
      step={1}
      icon={<Send size={16} aria-hidden />}
      title="Send them the intake form"
      blurb="Seven steps, saved as they go. Their answers land on the Onboarding board when they finish."
    >
      {loading ? (
        <p className="text-[13px] text-muted">Loading...</p>
      ) : funnelUrl ? (
        <CopyRow value={funnelUrl} label="Intake form link" />
      ) : (
        // Deliberately no link at all rather than a plausible one. A guessed
        // address gets sent to a client and 404s in front of them.
        <p className="rounded-[var(--radius)] border border-border bg-surface-2 px-3.5 py-3 text-[13px] leading-snug text-muted">
          The intake form is not published yet, so there is no link to send. Publish it, then
          set <code className="font-mono text-[12px]">FUNNEL_URL</code> to its address and the
          link appears here.
        </p>
      )}
    </Card>
  );
}

// --- 2. The paperwork --------------------------------------------------------

function Paperwork({
  links,
  loading,
}: {
  links: Record<string, string>;
  loading: boolean;
}) {
  const save = useSaveAgencyLinks();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  // Seeded when editing opens, not on every render: a refetch mid-edit would
  // otherwise wipe what is half-pasted.
  useEffect(() => {
    if (editing) setDraft({ ...links });
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const anySet = AGENCY_LINKS.some((l) => isSafeLink(links[l.key] ?? ""));

  return (
    <Card
      step={2}
      icon={<FileText size={16} aria-hidden />}
      title="Send the paperwork"
      blurb="The same two documents every new client gets."
      right={
        !editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil size={14} aria-hidden />
            {anySet ? "Change links" : "Add links"}
          </Button>
        )
      }
    >
      {loading ? (
        <p className="text-[13px] text-muted">Loading...</p>
      ) : editing ? (
        <div className="flex flex-col gap-3.5">
          {AGENCY_LINKS.map((link) => (
            <div key={link.key}>
              <label htmlFor={`link-${link.key}`} className="label-cap block">
                {link.label}
              </label>
              <input
                id={`link-${link.key}`}
                value={draft[link.key] ?? ""}
                placeholder={link.placeholder}
                onChange={(e) => setDraft((p) => ({ ...p, [link.key]: e.target.value }))}
                className="mt-1 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[14px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
              <p className="mt-1 text-[12px] text-faint">{link.blurb}</p>
            </div>
          ))}

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="sm"
              loading={save.isPending}
              onClick={() =>
                save.mutate(draft, { onSuccess: () => setEditing(false) })
              }
            >
              Save links
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            {save.isError && (
              <span className="text-[12px] font-medium text-danger">
                {(save.error as Error)?.message ?? "That did not save."}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {AGENCY_LINKS.map((link) => {
            const url = links[link.key] ?? "";
            return isSafeLink(url) ? (
              <CopyRow key={link.key} value={url} label={link.label} />
            ) : (
              <p
                key={link.key}
                className="rounded-[var(--radius)] border border-dashed border-border px-3.5 py-2.5 text-[13px] text-muted"
              >
                <b className="font-semibold text-text">{link.label}</b>: no link yet. {link.blurb}
              </p>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// --- 3. The call -------------------------------------------------------------

function BookTheCall({ calendarId }: { calendarId: string }) {
  const slots = useOnboardingSlots(calendarId);
  const book = useBookOnboardingCall();

  const [slot, setSlot] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [booked, setBooked] = useState<string | null>(null);

  // Memoized on the query result, not rebuilt per render. An `?? []` inline
  // hands SlotPicker a new array identity every time, which re-runs its
  // day-picking effect on every render and spins.
  const days = useMemo(() => slots.data?.days ?? [], [slots.data]);

  if (booked) {
    return (
      <Card
        step={3}
        icon={<CalendarCheck size={16} aria-hidden />}
        title="Onboarding call booked"
        blurb="It is on the same calendar the intake form books, so it only exists once."
      >
        <p className="rounded-[var(--radius)] border border-positive/40 bg-positive/5 px-3.5 py-3 text-[14px] text-text">
          {contactName || "They"} are booked in for{" "}
          <b>
            {dayLabel(booked.slice(0, 10))} at {timeLabel(booked)}
          </b>
          . GoHighLevel sends them the reminders.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={() => {
            setBooked(null);
            setSlot("");
          }}
        >
          Book another
        </Button>
      </Card>
    );
  }

  return (
    <Card
      step={3}
      icon={<CalendarCheck size={16} aria-hidden />}
      title="Book their onboarding call"
      blurb="Real times from the calendar, so you can book them in while they are on the phone."
    >
      {slots.isLoading ? (
        <p className="text-[13px] text-muted">Reading the calendar...</p>
      ) : slots.isError ? (
        <p className="text-[13px] text-danger">
          Could not read the onboarding calendar&apos;s free times.
        </p>
      ) : days.length === 0 ? (
        <p className="text-[13px] text-muted">
          No free times on the onboarding calendar in the next month.
        </p>
      ) : (
        <>
          <SlotPicker days={days} slot={slot} onPickSlot={setSlot} />

          <div className="mt-5 grid grid-cols-1 gap-x-5 gap-y-3.5 border-t border-border pt-5 sm:grid-cols-2">
            <Field label="Business" value={businessName} onChange={setBusinessName} placeholder="Willis Windows" />
            <Field label="Their name" value={contactName} onChange={setContactName} placeholder="Dave Willis" required />
            <Field label="Email" value={email} onChange={setEmail} placeholder="dave@williswindows.com" type="email" />
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="(313) 555 0134" type="tel" />
          </div>

          <p className="mt-2 text-[12px] text-faint">
            An email or a phone number, so GoHighLevel has somewhere to send the reminders.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              disabled={!slot || (!email.trim() && !phone.trim()) || !contactName.trim()}
              loading={book.isPending}
              onClick={() =>
                book.mutate(
                  {
                    businessName,
                    contactName,
                    email,
                    phone,
                    startTime: slot,
                    endTime: endOf(slot),
                  },
                  { onSuccess: (res) => setBooked(res.startTime) },
                )
              }
            >
              <CalendarCheck size={15} aria-hidden />
              {slot ? `Book ${dayLabel(slot.slice(0, 10))} at ${timeLabel(slot)}` : "Pick a time"}
            </Button>
            {slots.data?.timezone && (
              <span className="text-[12px] text-muted">Times in {slots.data.timezone}</span>
            )}
            {book.isError && (
              <span className="text-[12px] font-medium text-danger">
                {(book.error as Error)?.message ?? "Could not book that time."}
              </span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

// --- The rare path -----------------------------------------------------------

function ByHand() {
  return (
    <p className="flex flex-wrap items-center gap-2 px-1 text-[13px] text-muted">
      <span>No intake form for this one?</span>
      <Link
        to="/admin/clients/new/manual"
        className="inline-flex items-center gap-1 font-medium text-brand-text underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
      >
        Set one up by hand
        <ArrowRight size={13} aria-hidden />
      </Link>
    </p>
  );
}

// --- Shared bits -------------------------------------------------------------

function Card({
  step,
  icon,
  title,
  blurb,
  right,
  children,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  blurb: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius)] bg-brand-tint text-brand-text"
            aria-hidden
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[16.5px] font-semibold text-text">
              <span className="mr-2 text-faint">{step}</span>
              {title}
            </h2>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">{blurb}</p>
          </div>
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

// A link with the one button anybody wants next to a link.
function CopyRow({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5">
      <Link2 size={15} className="shrink-0 text-faint" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] text-faint">{label}</span>
        <span className="block truncate font-mono text-[12.5px] text-text">{value}</span>
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => setCopied(true));
        }}
      >
        {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <a href={value} target="_blank" rel="noreferrer">
        <Button variant="ghost" size="sm">
          <ExternalLink size={14} aria-hidden />
          Open
        </Button>
      </a>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  const id = `bk-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="label-cap block">
        {label}
        {required && (
          <span className="ml-1 text-danger" aria-hidden>
            *
          </span>
        )}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[14px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
      />
    </div>
  );
}
