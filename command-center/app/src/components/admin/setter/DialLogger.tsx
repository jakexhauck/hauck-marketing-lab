import { useState } from "react";
import { Loader2, Phone, PhoneOff } from "lucide-react";
import { useLogSetterDial } from "../../../hooks/useApi";
import { useToast } from "../../../context/ToastContext";
import {
  OUTCOMES,
  defaultSpokeForOutcome,
  isContradictoryDial,
  type SetterOutcome,
} from "../../../lib/setterCockpit";
import type { ApiSetterLead } from "../../../lib/api";

interface Props {
  tenantId: string;
  pipelineId: string;
  pipelineName: string;
  lead: ApiSetterLead;
}

// Log this call: the five outcome buttons, a spoke override, and an
// optional note, submitted together as one setter_dials row. Picking an
// outcome sets spoke to the server's own default (functions/api/admin/setter
// /dials.ts:validateDialBody rejects no_answer + spoke:true as
// "contradictory") so the common path never needs the override touched; the
// toggle stays visible for the setter to correct a default that does not
// match what actually happened on the call.
export default function DialLogger({ tenantId, pipelineId, pipelineName, lead }: Props) {
  const { showToast } = useToast();
  const logDial = useLogSetterDial();

  const [outcome, setOutcome] = useState<SetterOutcome | null>(null);
  const [spoke, setSpoke] = useState(true);
  const [note, setNote] = useState("");

  const pickOutcome = (value: SetterOutcome) => {
    setOutcome(value);
    setSpoke(defaultSpokeForOutcome(value));
  };

  const contradictory = outcome !== null && isContradictoryDial(outcome, spoke);
  const canSubmit = outcome !== null && !contradictory && !logDial.isPending;

  const submit = () => {
    if (!outcome || contradictory) return;
    const outcomeDef = OUTCOMES.find((o) => o.value === outcome);
    logDial.mutate(
      {
        tenantId,
        pipelineId,
        leadId: lead.id,
        contactId: lead.contactId,
        opportunityId: lead.id,
        pipelineName,
        stageName: lead.stageName,
        spoke,
        outcome,
        note: note.trim() ? note.trim() : null,
      },
      {
        onSuccess: () => {
          showToast(`Logged: ${outcomeDef?.label ?? outcome}`);
          setOutcome(null);
          setSpoke(true);
          setNote("");
        },
        onError: (err) => {
          const body =
            err && typeof err === "object" && "body" in err
              ? (err as { body?: { error?: string } }).body
              : null;
          if (body?.error === "contradictory") {
            showToast(
              "No answer cannot be logged as spoke with. Turn off the spoke override or pick a different outcome.",
            );
          } else {
            showToast("Could not log that call, please try again");
          }
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {OUTCOMES.map((o) => {
          const on = outcome === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => pickOutcome(o.value)}
              className={
                "rounded-[var(--radius)] border px-3 py-2.5 text-left font-display text-[13px] font-semibold transition-colors " +
                (on
                  ? "border-brand bg-brand-tint text-brand-text"
                  : "border-border bg-surface text-text hover:border-brand/40")
              }
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <label className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5">
        <span className="flex items-center gap-2 text-[13px] font-medium text-text">
          {spoke ? (
            <Phone size={14} className="text-positive" aria-hidden />
          ) : (
            <PhoneOff size={14} className="text-faint" aria-hidden />
          )}
          Spoke with them
        </span>
        <span
          role="switch"
          aria-checked={spoke}
          onClick={() => setSpoke((s) => !s)}
          className={
            "relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors " +
            (spoke ? "bg-positive" : "bg-surface-3")
          }
        >
          <span
            className={
              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[var(--shadow-sm)] transition-all " +
              (spoke ? "left-[18px]" : "left-0.5")
            }
          />
        </span>
      </label>

      {contradictory && (
        <p className="text-[12px] font-medium text-danger">
          No answer cannot be paired with Spoke with them. Turn the toggle off or pick a
          different outcome.
        </p>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note about this call (optional)"
        className="min-h-[64px] w-full resize-y rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand/50"
      />

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="inline-flex items-center justify-center gap-2 rounded-[var(--radius)] px-3.5 py-2.5 font-display text-[13px] font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-50"
        style={{ backgroundImage: "var(--grad-brand)" }}
      >
        {logDial.isPending && <Loader2 size={14} className="animate-spin" />}
        {logDial.isPending ? "Logging..." : "Log dial"}
      </button>
    </div>
  );
}
