import { X, Mail, Phone, Globe } from "lucide-react";
import Avatar from "../../components/Avatar";
import { useOrganicDetail } from "../../hooks/useOrganic";
import { landingPath, type OrganicLead } from "../../lib/organic";

// What one website lead actually said and typed.
//
// The message and the answers come from two different places in GHL (the
// contact's conversation, and the contact's custom fields), so they are two
// distinct blocks here rather than one merged list. See
// functions/api/organic/[contactId].ts for why.

export default function OrganicDetailModal({
  lead,
  onClose,
}: {
  lead: OrganicLead;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useOrganicDetail(lead.contactId);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-[var(--surface)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
          <Avatar name={lead.name} size="sm" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-[16px] font-semibold text-text">
              {lead.name}
            </h2>
            <div className="text-[11.5px] text-faint">{lead.stageName || "Organic lead"}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-faint transition-colors hover:bg-surface-2 hover:text-text"
          >
            <X size={18} />
          </button>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
        >
          {isError ? (
            <p className="py-8 text-center text-[13px] text-muted">
              Could not load this lead.
            </p>
          ) : isLoading || !data ? (
            <p className="py-8 text-center text-[13px] text-faint">Loading...</p>
          ) : (
            <div className="flex flex-col gap-5">
              <ContactBlock
                phone={data.phone || lead.phone}
                email={data.email || lead.email}
                landingUrl={data.landingUrl}
              />

              <Block title="What they said">
                {data.messages.length === 0 ? (
                  <p className="text-[13px] text-faint">
                    No message came through with this lead.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {data.messages.map((m) => (
                      <li key={m.id}>
                        <p
                          className={
                            m.direction === "inbound"
                              ? "inline-block rounded-[4px_12px_12px_12px] bg-surface-2 px-3 py-2 text-[13px] text-text"
                              : "inline-block rounded-[12px_4px_12px_12px] bg-brand-tint px-3 py-2 text-[13px] text-brand-text"
                          }
                        >
                          {m.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Block>

              <Block title="What they filled in">
                {data.answersUnavailable ? (
                  // Never render an empty panel here: "they typed nothing" and
                  // "we were not allowed to read it" look identical otherwise,
                  // and only one of them is the client's problem.
                  <p className="text-[13px] text-faint">
                    Form answers cannot be read yet: the GoHighLevel connection is
                    missing the custom fields permission.
                  </p>
                ) : data.answers.length === 0 ? (
                  <p className="text-[13px] text-faint">
                    No extra details came through with this lead.
                  </p>
                ) : (
                  <dl className="flex flex-col gap-2.5">
                    {data.answers.map((a) => (
                      <div key={a.label}>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                          {a.label}
                        </dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-[13px] text-text">
                          {a.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Block>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ContactBlock({
  phone,
  email,
  landingUrl,
}: {
  phone: string;
  email: string;
  landingUrl: string;
}) {
  const path = landingPath(landingUrl);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 px-3.5 py-3">
      {phone && (
        <a
          href={`tel:${phone}`}
          className="flex items-center gap-2.5 text-[13px] text-text transition-colors hover:text-brand-text"
        >
          <Phone size={14} className="shrink-0 text-faint" />
          <span className="font-data tnum">{phone}</span>
        </a>
      )}
      {email && (
        <a
          href={`mailto:${email}`}
          className="flex items-center gap-2.5 text-[13px] text-text transition-colors hover:text-brand-text"
        >
          <Mail size={14} className="shrink-0 text-faint" />
          <span className="truncate">{email}</span>
        </a>
      )}
      {path && (
        <div className="flex items-center gap-2.5 text-[13px] text-muted">
          <Globe size={14} className="shrink-0 text-faint" />
          <span className="truncate" title={landingUrl}>
            Came from {path}
          </span>
        </div>
      )}
    </div>
  );
}
