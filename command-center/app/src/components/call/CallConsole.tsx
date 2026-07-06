import { useEffect, useMemo, useRef, useState } from "react";
import { Phone, User, X, Loader2 } from "lucide-react";
import { formatPhone } from "../../lib/phone";
import { isUnknownCaller, OUTCOMES, type OutcomeDef } from "../../lib/callConsole";
import type { IncomingCall } from "../../hooks/useIncomingCall";
import {
  useUpsertContact,
  useCreateNote,
  useCreateSalesLead,
  useMoveSalesLeadStage,
  useCreateTask,
  useCreateAppointment,
} from "../../hooks/useApi";
import { useLeadsHub } from "../../hooks/useLeadsHub";
import { useToast } from "../../context/ToastContext";
import { SlotPickerModal } from "../SlotPickerModal";
import { cn } from "../../lib/cn";

// The Call Console: whoever answered the phone works from here for the whole
// call. Unknown callers (a bare contact GHL just created, no name yet) get a
// capture form; known callers see who they are. Every outcome tap logs the
// call and routes the opportunity, creating one first if this is the
// caller's first contact with no opportunity yet.

interface CallConsoleProps {
  call: IncomingCall;
  onClose: () => void;
}

const VISIT_CALENDAR_NAME = "Home Estimate";
const VISIT_DURATION_MINUTES = 60;

const fieldClass =
  "w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-[13.5px] text-text outline-none placeholder:text-faint focus:border-brand/50";

export default function CallConsole({ call, onClose }: CallConsoleProps) {
  const unknown = isUnknownCaller(call.name, call.phone);
  const { leads } = useLeadsHub();
  const { showToast } = useToast();

  const upsertContact = useUpsertContact();
  const createNote = useCreateNote();
  const createSalesLead = useCreateSalesLead();
  const moveStage = useMoveSalesLeadStage();
  const createTask = useCreateTask();
  const createAppointment = useCreateAppointment();

  // Auto-note the instant the console opens for an unknown caller, so nothing
  // is lost if no one fills the capture form. Guarded with a ref (not state)
  // so React strict-mode's dev double-mount never posts it twice.
  const notedRef = useRef(false);
  useEffect(() => {
    if (!unknown || notedRef.current) return;
    notedRef.current = true;
    createNote.mutate(
      {
        contactId: call.contactId,
        body: "New inbound caller, needs details",
      },
      { onError: (e) => console.warn("[call] auto-note failed", e) },
    );
    // Fires once per mount, keyed to the caller this console was opened for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unknown, call.contactId]);

  // Capture form (unknown callers only).
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [whatTheyWant, setWhatTheyWant] = useState("");
  const [source, setSource] = useState("");

  function saveDetails() {
    upsertContact.mutate(
      {
        contactId: call.contactId,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        email: email.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        source: source.trim() || undefined,
      },
      {
        onSuccess: () => {
          if (whatTheyWant.trim()) {
            createNote.mutate({ contactId: call.contactId, body: whatTheyWant.trim() });
          }
          showToast("Contact details saved");
        },
        onError: () => showToast("Could not save contact details, please try again"),
      },
    );
  }

  // Outcome routing. Only one outcome button is ever "live" at a time, so a
  // single activeKey tracks which one to disable while its write is pending.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [priceKey, setPriceKey] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [callbackKey, setCallbackKey] = useState<string | null>(null);
  const [callbackDraft, setCallbackDraft] = useState("");
  const [visitOutcome, setVisitOutcome] = useState<OutcomeDef | null>(null);

  const existingLead = useMemo(
    () => leads.find((l) => l.contactId === call.contactId),
    [leads, call.contactId],
  );

  const displayName =
    [firstName, lastName].filter(Boolean).join(" ").trim() || call.name || call.phone;

  const writePending =
    moveStage.isPending ||
    createSalesLead.isPending ||
    createTask.isPending ||
    createAppointment.isPending;

  // Shared routing step: move the caller's existing opportunity, or create one
  // first if this is their first contact with no opportunity yet.
  function route(def: OutcomeDef, opts: { monetaryValue?: number } = {}) {
    setActiveKey(def.key);
    const onDone = () => {
      showToast(`Logged: ${def.label}`);
      onClose();
    };
    const onErr = () => {
      setActiveKey(null);
      showToast("Could not log that outcome, please try again");
    };

    if (existingLead) {
      moveStage.mutate(
        {
          leadId: existingLead.id,
          status: def.status,
          stageName: def.stageName || undefined,
          pipelineName: def.pipelineName,
          monetaryValue: opts.monetaryValue,
        },
        { onSuccess: onDone, onError: onErr },
      );
    } else {
      createSalesLead.mutate(
        {
          contactId: call.contactId,
          pipelineName: def.pipelineName ?? "Organic Pipeline",
          stageName: def.status === "lost" ? "Not Qualified" : def.stageName,
          name: displayName,
          monetaryValue: opts.monetaryValue,
          status: def.status,
        },
        { onSuccess: onDone, onError: onErr },
      );
    }
  }

  function runOutcome(def: OutcomeDef) {
    if (def.needsPrice) {
      setPriceKey(def.key);
      return;
    }
    if (def.needsTime) {
      setVisitOutcome(def);
      return;
    }
    if (def.needsCallback) {
      setCallbackKey(def.key);
      return;
    }
    route(def);
  }

  function confirmPrice(def: OutcomeDef) {
    const value = Number(priceDraft);
    if (!Number.isFinite(value) || value <= 0) return;
    setPriceKey(null);
    setPriceDraft("");
    route(def, { monetaryValue: value });
  }

  function confirmCallback(def: OutcomeDef) {
    if (!callbackDraft) return;
    setActiveKey(def.key);
    createTask.mutate(
      { contactId: call.contactId, title: "Call back", dueDate: callbackDraft },
      {
        onSuccess: () => {
          setCallbackKey(null);
          setCallbackDraft("");
          route(def);
        },
        onError: () => {
          setActiveKey(null);
          showToast("Could not schedule the callback, please try again");
        },
      },
    );
  }

  function confirmVisit(times: { startTime: string; endTime: string }) {
    const def = visitOutcome;
    if (!def) return;
    setActiveKey(def.key);
    createAppointment.mutate(
      {
        contactId: call.contactId,
        calendarName: VISIT_CALENDAR_NAME,
        startTime: times.startTime,
        endTime: times.endTime,
        title: "Home estimate",
      },
      {
        onSuccess: () => {
          setVisitOutcome(null);
          route(def);
        },
        onError: () => {
          setActiveKey(null);
          showToast("Could not book the visit, please try again");
        },
      },
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[65] grid place-items-center bg-[rgba(15,18,48,0.42)] p-4 sm:p-5"
        onClick={onClose}
      >
        <div
          className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-lg)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start gap-3 border-b border-border px-5 pb-3.5 pt-5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand/10 text-brand">
              <Phone size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="label-cap text-faint">Incoming call</div>
              <div className="font-display text-[17px] font-semibold text-text">
                {formatPhone(call.phone) || call.phone}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted">
                <User size={12} aria-hidden />
                {call.name || "Unknown caller"}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-surface-2 text-muted"
              aria-label="Close call console"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {unknown ? (
              <div className="mb-5">
                <h3 className="label-cap mb-2.5 text-faint">Capture details</h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <input
                    className={fieldClass}
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                  <input
                    className={fieldClass}
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                  <input
                    className={fieldClass}
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <input
                    className={fieldClass}
                    placeholder="ZIP"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                  <input
                    className={cn(fieldClass, "sm:col-span-2")}
                    placeholder="How did they hear about us"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  />
                  <textarea
                    className={cn(fieldClass, "sm:col-span-2 min-h-[70px] resize-none")}
                    placeholder="What they want"
                    value={whatTheyWant}
                    onChange={(e) => setWhatTheyWant(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={saveDetails}
                  disabled={upsertContact.isPending}
                  className="mt-3 inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 font-display text-[13px] font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-50"
                  style={{ backgroundImage: "var(--grad-brand)" }}
                >
                  {upsertContact.isPending && <Loader2 size={14} className="animate-spin" />}
                  Save details
                </button>
              </div>
            ) : (
              <div className="mb-5 rounded-[12px] border border-border bg-surface-2 px-3.5 py-3 text-[13px] text-text">
                <span className="font-semibold">{call.name}</span> is already a known
                contact.
                {existingLead && (
                  <span className="text-muted"> Existing lead: {existingLead.name}.</span>
                )}
              </div>
            )}

            <h3 className="label-cap mb-2.5 text-faint">Log the outcome</h3>
            <div className="flex flex-col gap-2">
              {OUTCOMES.map((def) => {
                const pending = activeKey === def.key && writePending;
                if (def.needsPrice && priceKey === def.key) {
                  return (
                    <div
                      key={def.key}
                      className="flex flex-col gap-2 rounded-[10px] border border-brand/40 bg-brand/5 px-3 py-2.5 sm:flex-row sm:items-center"
                    >
                      <input
                        className={cn(fieldClass, "sm:flex-1")}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        placeholder="Job price"
                        value={priceDraft}
                        onChange={(e) => setPriceDraft(e.target.value)}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPriceKey(null);
                            setPriceDraft("");
                          }}
                          className="rounded-[10px] border border-border bg-surface px-3 py-2 font-display text-[12.5px] font-semibold text-text"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmPrice(def)}
                          disabled={!priceDraft || Number(priceDraft) <= 0}
                          className="rounded-[10px] px-3 py-2 font-display text-[12.5px] font-semibold text-white disabled:opacity-50"
                          style={{ backgroundImage: "var(--grad-brand)" }}
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  );
                }
                if (def.needsCallback && callbackKey === def.key) {
                  return (
                    <div
                      key={def.key}
                      className="flex flex-col gap-2 rounded-[10px] border border-brand/40 bg-brand/5 px-3 py-2.5 sm:flex-row sm:items-center"
                    >
                      <input
                        className={cn(fieldClass, "sm:flex-1")}
                        type="datetime-local"
                        value={callbackDraft}
                        onChange={(e) => setCallbackDraft(e.target.value)}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCallbackKey(null);
                            setCallbackDraft("");
                          }}
                          className="rounded-[10px] border border-border bg-surface px-3 py-2 font-display text-[12.5px] font-semibold text-text"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmCallback(def)}
                          disabled={!callbackDraft || pending}
                          className="rounded-[10px] px-3 py-2 font-display text-[12.5px] font-semibold text-white disabled:opacity-50"
                          style={{ backgroundImage: "var(--grad-brand)" }}
                        >
                          {pending ? "Saving…" : "Confirm"}
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <button
                    key={def.key}
                    type="button"
                    onClick={() => runOutcome(def)}
                    disabled={pending}
                    className="inline-flex items-center justify-between gap-2 rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-left font-display text-[13.5px] font-semibold text-text transition-colors hover:border-brand/40 disabled:opacity-50"
                  >
                    {def.label}
                    {pending && <Loader2 size={14} className="animate-spin text-muted" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {visitOutcome && (
        <SlotPickerModal
          title="Book in-person visit"
          subtitle={`For ${displayName}`}
          calendarName={VISIT_CALENDAR_NAME}
          durationMinutes={VISIT_DURATION_MINUTES}
          confirmLabel="Book visit"
          pending={createAppointment.isPending}
          onClose={() => setVisitOutcome(null)}
          onConfirm={confirmVisit}
        />
      )}
    </>
  );
}
