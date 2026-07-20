import { Mail, Phone, X } from "lucide-react";
import Avatar from "../../Avatar";
import DialLogger from "./DialLogger";
import TagField from "./TagField";
import SlotPicker from "./SlotPicker";
import { useSetterLeadDetailQuery } from "../../../hooks/useApi";
import { useNow } from "../../../context/NowContext";
import { e164, formatPhone } from "../../../lib/phone";
import { timeAgo } from "../../../lib/timeAgo";
import { formatOutcome } from "../../../lib/setterModel";
import { isOptimisticDial } from "../../../lib/setterCockpit";
import type { ApiSetterLead } from "../../../lib/api";

interface Props {
  tenantId: string;
  pipelineId: string;
  pipelineName: string;
  lead: ApiSetterLead;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-divider px-4 py-4 first:border-t-0">
      <h3 className="label-cap mb-2.5 text-faint">{title}</h3>
      {children}
    </section>
  );
}

// The lead cockpit: one selected lead's live identity, the call-logging
// form, tags, booking, and history, docked to the right of the board
// (src/routes/admin/SetterSuite.tsx). Reads its own detail off
// contactId (tags + full dial history are only on this per-lead endpoint,
// never the board list, see functions/api/admin/setter/lead/[contactId].ts),
// falling back to the board card's own fields while that request is in
// flight or if it errors, so switching leads never shows a blank panel.
export default function SetterCockpit({ tenantId, pipelineId, pipelineName, lead, onClose }: Props) {
  const now = useNow();
  const detailQuery = useSetterLeadDetailQuery(tenantId, lead.contactId, true);
  const detail = detailQuery.data?.lead;

  const name = detail?.name || lead.name;
  const phone = detail?.phone || lead.phone;
  const email = detail?.email || "";
  const tags = detail?.tags ?? [];
  const dials = detail?.dials ?? [];

  const telDigits = e164(phone);
  const hasPhone = telDigits.replace(/[^0-9]/g, "").length >= 10;

  return (
    <aside
      className="flex w-full shrink-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)] lg:w-[380px] lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)]"
      aria-label="Lead cockpit"
    >
      {/* Header: identity + click-to-call, stays put while the body scrolls. */}
      <div className="flex items-start gap-3 border-b border-divider px-4 pb-3.5 pt-4">
        <Avatar name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[15px] font-semibold text-text">{name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
            {hasPhone ? (
              <a
                href={`tel:${telDigits}`}
                className="inline-flex items-center gap-1 font-data text-brand-text hover:underline"
              >
                <Phone size={11} aria-hidden />
                {formatPhone(phone) || phone}
              </a>
            ) : (
              <span className="text-faint">No phone on file</span>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                className="inline-flex min-w-0 items-center gap-1 truncate text-brand-text hover:underline"
              >
                <Mail size={11} aria-hidden className="shrink-0" />
                <span className="truncate">{email}</span>
              </a>
            )}
          </div>
          <div className="mt-1.5 truncate text-[11px] text-faint">{lead.stageName}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close lead cockpit"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-text"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body: everything below scrolls on its own, the board above/behind
          it keeps whatever scroll position it was at. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Log this call">
          <DialLogger tenantId={tenantId} pipelineId={pipelineId} pipelineName={pipelineName} lead={lead} />
        </Section>

        <Section title="Tags">
          <TagField tenantId={tenantId} contactId={lead.contactId} tags={tags} dials={dials} />
        </Section>

        <Section title="Book an estimate">
          <SlotPicker tenantId={tenantId} contactId={lead.contactId} leadName={name} />
        </Section>

        <Section title="Call history">
          {detailQuery.isLoading ? (
            <p className="text-[12.5px] text-muted">Loading history...</p>
          ) : dials.length === 0 ? (
            <p className="text-[12.5px] text-faint">No dials logged yet.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {dials.map((d) => (
                <li
                  key={d.id}
                  className={
                    "rounded-[var(--radius)] border px-3 py-2.5 " +
                    (isOptimisticDial(d.id)
                      ? "border-dashed border-brand/40 bg-brand-tint/40"
                      : "border-border bg-surface-2")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-[12.5px] font-semibold text-text">
                      {formatOutcome(d.outcome)}
                    </span>
                    <span className="font-data shrink-0 text-[11px] text-faint">
                      {timeAgo(d.dialedAt, now)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className={
                        "rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide " +
                        (d.spoke ? "bg-positive-tint text-positive" : "bg-surface-3 text-faint")
                      }
                    >
                      {d.spoke ? "Spoke" : "No answer"}
                    </span>
                    {isOptimisticDial(d.id) && (
                      <span className="text-[10px] font-medium text-faint">Saving...</span>
                    )}
                  </div>
                  {d.note && (
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-[12px] text-muted">
                      {d.note}
                    </p>
                  )}
                  {d.tagsApplied.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {d.tagsApplied.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-muted"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </aside>
  );
}
