import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "../../ui/Button";
import { useSaveSalesCallForm } from "../../../hooks/useApi";
import type { SalesCallFormInput } from "../../../lib/api";
import type { SheetCall } from "../../../../functions/lib/salesSheetRows";
import { DISPOSITION_STATUSES } from "../../../../functions/lib/salesDisposition";

// The post-call form, over Sales Data. Same fields the GHL form had, in the
// same order, saved straight onto the meeting (PATCH /api/admin/tracker/
// sales-data). Opens on whatever was last saved, so reopening a meeting is how
// a mistake gets fixed.

const FIELD =
  "w-full rounded-[var(--radius)] bg-surface-2 px-3.5 py-2.5 text-[13.5px] text-text outline-none " +
  "transition-shadow placeholder:text-faint focus:shadow-[0_0_0_2px_var(--brand)]";

function money(value: number | null): string {
  return value === null || value === undefined ? "" : String(value);
}

export default function SalesCallForm({
  call,
  date,
  onClose,
}: {
  call: SheetCall;
  date: string;
  onClose: () => void;
}) {
  const save = useSaveSalesCallForm();
  const [form, setForm] = useState<SalesCallFormInput>(() => ({
    status: call.form.status,
    cashCollected: money(call.form.cashCollected),
    revenueGenerated: money(call.form.revenueGenerated),
    paymentPlatform: call.form.paymentPlatform,
    recordingLink: call.form.recordingLink,
    notes: call.form.notes,
  }));
  const set = (key: keyof SalesCallFormInput) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () =>
    save.mutate({ id: call.id, form }, { onSuccess: onClose });

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="scf-title"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid max-h-[calc(100vh-32px)] w-full max-w-[520px] gap-4 overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <h2 id="scf-title" className="font-display text-[16px] font-semibold text-text">
              {call.name}
            </h2>
            <div className="text-[12.5px] text-faint">{date}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-muted hover:bg-surface-2 hover:text-text"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <fieldset>
          <legend className="mb-2 text-[12.5px] font-semibold text-muted">Status</legend>
          <div role="radiogroup" aria-label="Status" className="flex flex-wrap gap-2">
            {DISPOSITION_STATUSES.map((s) => {
              const on = form.status === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set("status")(s.key)}
                  className={
                    "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors " +
                    (on
                      ? "border-brand bg-brand-tint text-text"
                      : "border-border bg-surface-2 text-muted hover:border-border-strong hover:text-text")
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
          <Field label="Cash Collected">
            <input
              className={FIELD}
              inputMode="decimal"
              placeholder="$0"
              value={form.cashCollected}
              onChange={(e) => set("cashCollected")(e.target.value)}
            />
          </Field>
          <Field label="Revenue Generated">
            <input
              className={FIELD}
              inputMode="decimal"
              placeholder="$0"
              value={form.revenueGenerated}
              onChange={(e) => set("revenueGenerated")(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Payment Platform">
          <input
            className={FIELD}
            value={form.paymentPlatform}
            onChange={(e) => set("paymentPlatform")(e.target.value)}
          />
        </Field>

        <Field label="Call Recording">
          <input
            className={FIELD}
            type="url"
            placeholder="https://"
            value={form.recordingLink}
            onChange={(e) => set("recordingLink")(e.target.value)}
          />
        </Field>

        <Field label="Feedback">
          <textarea
            className={`${FIELD} min-h-[96px] resize-y leading-relaxed`}
            value={form.notes}
            onChange={(e) => set("notes")(e.target.value)}
          />
        </Field>

        {save.isError && (
          <p className="text-[12.5px] font-medium text-danger">
            {(save.error as Error)?.message || "That did not save."}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={save.isPending} disabled={!form.status}>
            Save
          </Button>
        </div>
      </form>
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
