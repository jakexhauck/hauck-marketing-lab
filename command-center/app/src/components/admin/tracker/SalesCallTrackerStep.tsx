import { useState } from "react";
import { Button } from "../../ui/Button";
import { useCallTrackerQuery, useCallTrackerSave } from "../../../hooks/useApi";
import { billingFormFrom, sanitizeBillingPatch, type BillingForm } from "../../../lib/billing";
import type { AdminClientBilling } from "../../../lib/api";

// The post-call form's second step on a PIF or Deposit (2026-10-09, Jake):
// the Client Tracker row for the new client, asked for while the deal is
// fresh. Opens on what was saved, or on a prefill off the meeting (name, call
// date, cash). Saves to pending_clients until the client exists, then to their
// client_billing; functions/api/admin/client-tracker/pending/[callId].ts.

const FIELD =
  "w-full rounded-[var(--radius)] bg-surface-2 px-3.5 py-2.5 text-[13.5px] text-text outline-none " +
  "transition-shadow placeholder:text-faint focus:shadow-[0_0_0_2px_var(--brand)]";

const SOURCES = ["Cold Call", "Cold SMS", "Referral", "Inbound Form", "Facebook Ad"];

type Form = BillingForm & { firstName: string; lastName: string };

function formFrom(b: AdminClientBilling): Form {
  return { ...billingFormFrom(b), firstName: b.firstName, lastName: b.lastName };
}

export default function SalesCallTrackerStep({ callId, onDone }: { callId: string; onDone: () => void }) {
  const tracker = useCallTrackerQuery(callId);
  if (tracker.isLoading) return <p className="py-6 text-center text-[13px] text-muted">Loading...</p>;
  if (tracker.isError || !tracker.data) {
    return <p className="py-6 text-center text-[13px] text-danger">The tracker row did not load.</p>;
  }
  return <TrackerFields callId={callId} initial={formFrom(tracker.data.billing)} onDone={onDone} />;
}

function TrackerFields({ callId, initial, onDone }: { callId: string; initial: Form; onDone: () => void }) {
  const save = useCallTrackerSave();
  const [form, setForm] = useState<Form>(initial);
  const bind = (key: keyof Form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const submit = () =>
    save.mutate(
      {
        callId,
        patch: {
          ...sanitizeBillingPatch(form),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
        },
      },
      { onSuccess: onDone },
    );

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
        <Field label="First Name">
          <input className={FIELD} {...bind("firstName")} />
        </Field>
        <Field label="Last Name">
          <input className={FIELD} {...bind("lastName")} />
        </Field>
        <Field label="Source">
          <input className={FIELD} list="sct-sources" {...bind("source")} />
          <datalist id="sct-sources">
            {SOURCES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Date Closed">
          <input className={FIELD} {...bind("dateClosed")} />
        </Field>
        <Field label="Upfront Cash Collected">
          <input className={FIELD} inputMode="decimal" placeholder="$0" {...bind("upfrontCash")} />
        </Field>
        <Field label="Remaining Cash to Collect">
          <input className={FIELD} inputMode="decimal" placeholder="$0" {...bind("remainingCash")} />
        </Field>
        <Field label="Total Cash Collected">
          <input className={FIELD} inputMode="decimal" placeholder="$0" {...bind("totalCashCollected")} />
        </Field>
        <Field label="Service">
          <input className={FIELD} {...bind("service")} />
        </Field>
        <Field label="Billing Date">
          <input className={FIELD} {...bind("billingDate")} />
        </Field>
        <Field label="Renewal Date">
          <input className={FIELD} {...bind("renewalDate")} />
        </Field>
      </div>

      <Field label="Payment Arrangement">
        <input className={FIELD} {...bind("paymentArrangement")} />
      </Field>

      <Field label="Notes">
        <textarea className={`${FIELD} min-h-[80px] resize-y leading-relaxed`} {...bind("notes")} />
      </Field>

      {save.isError && (
        <p className="text-[12.5px] font-medium text-danger">
          {(save.error as Error)?.message || "That did not save."}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>
          Skip
        </Button>
        <Button type="button" variant="primary" size="sm" loading={save.isPending} onClick={submit}>
          Save
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12.5px] font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}
