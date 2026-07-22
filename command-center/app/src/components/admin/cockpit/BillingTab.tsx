import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeftRight,
  BadgeCheck,
  CalendarDays,
  Check,
  DollarSign,
  LineChart,
} from "lucide-react";
import {
  useAdminClientBillingQuery,
  useAdminClientBillingSave,
} from "../../../hooks/useApi";
import {
  billingDateHint,
  billingFormFrom,
  emptyBillingForm,
  formatMoney,
  parseMoneyInput,
  sanitizeBillingPatch,
  type BillingForm,
} from "../../../lib/billing";

// Billing service tab inside the Fulfillment cockpit
// (/admin/delivery/:tenantId?tab=billing). One client's commercial record in
// four grouped cards: Deal, Cash, Dates & Renewal, Status. Ported from
// docs/mockups/admin-redesign/client-billing-B.html into the .pk-kit admin
// theme.
//
// Phase 1 is manual entry: every value here is typed by the admin and this is
// the source of truth. The date fields are deliberately free text (typed exactly
// as the deal notes read) rather than date pickers; the amber "in N days" hint
// only appears when a value happens to parse as a real, imminent date.
//
// The whole record saves at once (one Save button) because it is one logical
// record, unlike ClientConfigPanel's independent per-card sections.

// Suggested channels. Free text in the database on purpose, so Jake can add a
// channel without a migration; this list is only the dropdown's starting point.
const SOURCE_OPTIONS = [
  "Cold Call",
  "Referral",
  "Inbound Form",
  "Facebook Ad",
  "SMS",
  "Cold Email",
  "Other",
];

export default function BillingTab({ tenantId }: { tenantId: string }) {
  const billingQuery = useAdminClientBillingQuery(tenantId);
  const save = useAdminClientBillingSave(tenantId);

  const [form, setForm] = useState<BillingForm>(emptyBillingForm());
  // Seed the form once the record lands, and re-seed when the admin switches to
  // another client (the tab stays mounted across roster clicks).
  const loaded = billingQuery.data?.billing;
  useEffect(() => {
    setForm(loaded ? billingFormFrom(loaded) : emptyBillingForm());
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, tenantId]);

  const set = <K extends keyof BillingForm>(key: K, value: BillingForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Recomputed per render against the real clock: this is presentation only,
  // never stored. billingDateHint returns null for free text or a far date.
  const hint = useMemo(() => billingDateHint(form.billingDate, new Date()), [form.billingDate]);

  if (billingQuery.isLoading) {
    return <div className="pk-empty">Loading billing...</div>;
  }

  if (billingQuery.isError) {
    return <div className="pk-empty">Could not load this client's billing record.</div>;
  }

  const onSave = () => save.mutate(sanitizeBillingPatch(form));

  return (
    <div className="bill">
      <BillingStyle />

      <div className="bill-toolbar">
        <div>
          <div className="bill-tb-title">Billing Record</div>
          <div className="bill-tb-sub">Grouped by deal, cash, dates and status.</div>
        </div>
        <div className="bill-toolbar-right">
          {save.isError && (
            <span className="bill-err">
              {save.error instanceof Error ? save.error.message : "Could not save"}
            </span>
          )}
          {save.isSuccess && !save.isPending && <span className="bill-saved">Saved</span>}
          <Link
            className="bill-btn ghost"
            to={`/admin/delivery/${tenantId}?tab=paid-ads&sub=ad-tracking`}
          >
            <LineChart size={16} />
            Open Ad Tracking
          </Link>
          <button
            type="button"
            className="bill-btn primary"
            onClick={onSave}
            disabled={save.isPending}
          >
            <Check size={16} />
            {save.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="bill-cards">
        <Card icon={<ArrowLeftRight />} tone="indigo" title="Deal" note="How this client came in">
          <div className="bill-fields">
            <div className="bill-fields two">
              <Field label="Source" htmlFor="bill-source">
                <select
                  id="bill-source"
                  value={SOURCE_OPTIONS.includes(form.source) ? form.source : ""}
                  onChange={(e) => set("source", e.target.value)}
                >
                  <option value="">Not set</option>
                  {/* A source typed before this list existed still shows. */}
                  {form.source && !SOURCE_OPTIONS.includes(form.source) && (
                    <option value={form.source}>{form.source}</option>
                  )}
                  {SOURCE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date Closed" htmlFor="bill-closed">
                <input
                  id="bill-closed"
                  type="text"
                  value={form.dateClosed}
                  placeholder="Jun 12, 2026"
                  onChange={(e) => set("dateClosed", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Service" htmlFor="bill-service">
              <input
                id="bill-service"
                type="text"
                value={form.service}
                placeholder="What we run for them"
                onChange={(e) => set("service", e.target.value)}
              />
            </Field>
            <Field label="Payment Arrangement" htmlFor="bill-arr">
              <input
                id="bill-arr"
                type="text"
                value={form.paymentArrangement}
                placeholder="3k for 6 months, 2k upfront + 1k after 30 days"
                onChange={(e) => set("paymentArrangement", e.target.value)}
              />
            </Field>
          </div>
        </Card>

        <Card icon={<DollarSign />} tone="green" title="Cash" note="Collected and outstanding">
          <div className="bill-fields">
            <div className="bill-fields two">
              <MoneyField
                label="Upfront Cash"
                id="bill-upfront"
                value={form.upfrontCash}
                onChange={(v) => set("upfrontCash", v)}
              />
              <MoneyField
                label="Remaining to Collect"
                id="bill-remain"
                value={form.remainingCash}
                onChange={(v) => set("remainingCash", v)}
              />
            </div>
            <MoneyField
              label="Total Cash Collected"
              id="bill-total"
              value={form.totalCashCollected}
              onChange={(v) => set("totalCashCollected", v)}
            />
          </div>
        </Card>

        <Card
          icon={<CalendarDays />}
          tone="sky"
          title="Dates & Renewal"
          note="Billing cadence and touchpoints"
        >
          <div className="bill-fields two">
            <div className={`bill-field${hint ? " near" : ""}`}>
              <div className="bill-lblrow">
                <label htmlFor="bill-billing">Billing Date</label>
                {hint && <span className="bill-datehint">{hint.label}</span>}
              </div>
              <input
                id="bill-billing"
                type="text"
                value={form.billingDate}
                placeholder="Jul 22, 2026"
                onChange={(e) => set("billingDate", e.target.value)}
              />
            </div>
            <Field label="Renewal Date" htmlFor="bill-renewal">
              <input
                id="bill-renewal"
                type="text"
                value={form.renewalDate}
                placeholder="Dec 12, 2026"
                onChange={(e) => set("renewalDate", e.target.value)}
              />
            </Field>
            <Field label="Last Touchpoint" htmlFor="bill-touch">
              <input
                id="bill-touch"
                type="text"
                value={form.lastTouchpoint}
                placeholder="Jul 14, 2026"
                onChange={(e) => set("lastTouchpoint", e.target.value)}
              />
            </Field>
            <Field label="Churn Date" htmlFor="bill-churn">
              <input
                id="bill-churn"
                type="text"
                value={form.churnDate}
                placeholder="Still active"
                onChange={(e) => set("churnDate", e.target.value)}
              />
            </Field>
          </div>
        </Card>

        <Card icon={<BadgeCheck />} tone="amber" title="Status" note="Account standing and notes">
          <div className="bill-fields">
            <div className="bill-field">
              <label htmlFor="bill-status">Status</label>
              <div className={`bill-pillselect ${form.status}`}>
                <span className="bill-pdot" aria-hidden />
                <select
                  id="bill-status"
                  value={form.status}
                  onChange={(e) => set("status", e.target.value as BillingForm["status"])}
                >
                  <option value="active">Active</option>
                  <option value="churned">Churned</option>
                </select>
              </div>
            </div>
            <Field label="Notes" htmlFor="bill-notes">
              <textarea
                id="bill-notes"
                value={form.notes}
                placeholder="Anything worth remembering about this account"
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({
  icon,
  tone,
  title,
  note,
  children,
}: {
  icon: React.ReactNode;
  tone: "indigo" | "green" | "sky" | "amber";
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bill-bento">
      <div className="bill-bento-head">
        <div className={`bill-bento-ico ${tone}`} aria-hidden>
          {icon}
        </div>
        <div>
          <div className="bill-bento-title">{title}</div>
          <div className="bill-bento-note">{note}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bill-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

// A whole-dollar cash cell. Kept as the raw typed string while focused (so a
// half-typed "1,2" survives) and regrouped on blur, matching the mockup.
function MoneyField({
  label,
  id,
  value,
  onChange,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="bill-field">
      <label htmlFor={id}>{label}</label>
      <div className="bill-money">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={value}
          placeholder="0"
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onChange(value.trim() ? formatMoney(parseMoneyInput(value)) : "")}
        />
      </div>
    </div>
  );
}

// Ported from docs/mockups/admin-redesign/client-billing-B.html, scoped to
// .pk-kit so it reads the admin theme tokens and works in light and dark. The
// mockup palette is light-only, so the tints carry dark overrides.
function BillingStyle() {
  return (
    <style>{`
      .pk-kit .bill {
        --bill-indigo: #6366f1; --bill-indigo-tint: #eef0ff;
        --bill-green: #10b981;  --bill-green-tint: #e7f7f0;
        --bill-sky: #0ea5e9;    --bill-sky-tint: #e6f5fd;
        --bill-amber: #f59e0b;  --bill-amber-tint: #fdf3e2;
        --bill-rose: #ef4444;   --bill-rose-tint: #fdeaea;
        --bill-active-ink: #0a7d58; --bill-churn-ink: #c23434; --bill-hint-ink: #9a6a12;
      }
      [data-theme="dark"] .pk-kit .bill {
        --bill-indigo-tint: rgba(99,102,241,.18);
        --bill-green-tint: rgba(16,185,129,.15);
        --bill-sky-tint: rgba(14,165,233,.15);
        --bill-amber-tint: rgba(245,158,11,.15);
        --bill-rose-tint: rgba(239,68,68,.15);
        --bill-active-ink: #34d399; --bill-churn-ink: #f87171; --bill-hint-ink: #fbbf24;
      }

      .pk-kit .bill-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
      .pk-kit .bill-tb-title { font-family: var(--font-display); font-weight: 600; font-size: 16px; color: var(--text); }
      .pk-kit .bill-tb-sub { font-size: 12.5px; color: var(--text-faint); margin-top: 2px; }
      .pk-kit .bill-toolbar-right { margin-left: auto; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .pk-kit .bill-saved { font-size: 12.5px; font-weight: 600; color: var(--positive); }
      .pk-kit .bill-err { font-size: 12.5px; font-weight: 600; color: var(--danger); }

      .pk-kit .bill-btn {
        display: inline-flex; align-items: center; gap: 8px; border: 0; cursor: pointer;
        font: inherit; font-weight: 600; font-size: 13.5px; padding: 10px 16px;
        border-radius: 12px; transition: .15s; text-decoration: none;
      }
      .pk-kit .bill-btn.primary { background: var(--bill-indigo); color: #fff; box-shadow: 0 8px 18px -8px rgba(99,102,241,.7); }
      .pk-kit .bill-btn.primary:hover { filter: brightness(1.05); }
      .pk-kit .bill-btn.primary:disabled { opacity: .6; cursor: default; }
      .pk-kit .bill-btn.ghost { background: var(--bill-indigo-tint); color: var(--bill-indigo); }
      .pk-kit .bill-btn.ghost:hover { filter: brightness(.97); }

      .pk-kit .bill-cards { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; }
      .pk-kit .bill-bento {
        background: var(--surface); border: 1px solid var(--border); border-radius: 22px;
        box-shadow: var(--shadow-md); padding: 20px 22px 22px; display: flex; flex-direction: column;
      }
      .pk-kit .bill-bento-head { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
      .pk-kit .bill-bento-ico { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; color: #fff; flex-shrink: 0; }
      .pk-kit .bill-bento-ico svg { width: 18px; height: 18px; }
      .pk-kit .bill-bento-ico.indigo { background: var(--bill-indigo); }
      .pk-kit .bill-bento-ico.green { background: var(--bill-green); }
      .pk-kit .bill-bento-ico.sky { background: var(--bill-sky); }
      .pk-kit .bill-bento-ico.amber { background: var(--bill-amber); }
      .pk-kit .bill-bento-title { font-family: var(--font-display); font-weight: 600; font-size: 15px; color: var(--text); }
      .pk-kit .bill-bento-note { font-size: 11.5px; color: var(--text-faint); }

      .pk-kit .bill-fields { display: flex; flex-direction: column; gap: 14px; }
      .pk-kit .bill-fields.two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
      .pk-kit .bill-field { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
      .pk-kit .bill-field > label,
      .pk-kit .bill-lblrow > label {
        font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-faint);
      }
      .pk-kit .bill-lblrow { display: flex; align-items: center; }

      .pk-kit .bill-field input,
      .pk-kit .bill-field select,
      .pk-kit .bill-field textarea {
        width: 100%; border: 1px solid var(--border); background: var(--surface); font: inherit;
        font-size: 14px; font-weight: 500; color: var(--text); padding: 10px 12px; border-radius: 12px;
        transition: border-color .12s, box-shadow .12s;
      }
      .pk-kit .bill-field textarea { resize: vertical; min-height: 88px; line-height: 1.5; font-weight: 400; }
      .pk-kit .bill-field input:hover,
      .pk-kit .bill-field select:hover,
      .pk-kit .bill-field textarea:hover { border-color: var(--text-faint); }
      .pk-kit .bill-field input:focus,
      .pk-kit .bill-field select:focus,
      .pk-kit .bill-field textarea:focus { outline: 0; border-color: transparent; box-shadow: 0 0 0 2px var(--bill-indigo); }
      .pk-kit .bill-field input::placeholder,
      .pk-kit .bill-field textarea::placeholder { color: var(--text-faint); font-weight: 400; }
      .pk-kit .bill-field select { cursor: pointer; }

      .pk-kit .bill-money { position: relative; }
      .pk-kit .bill-money::before {
        content: "$"; position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
        color: var(--text-faint); font-weight: 600; font-size: 13.5px; pointer-events: none;
      }
      .pk-kit .bill-money input { padding-left: 24px; font-variant-numeric: tabular-nums lining-nums; font-weight: 600; }

      .pk-kit .bill-field.near input { background: var(--bill-amber-tint); border-color: var(--bill-amber); }
      .pk-kit .bill-field.near input:focus { border-color: transparent; box-shadow: 0 0 0 2px var(--bill-amber); }
      .pk-kit .bill-datehint {
        display: inline-flex; align-items: center; font-size: 10px; font-weight: 700; letter-spacing: .03em;
        color: var(--bill-hint-ink); background: var(--bill-amber-tint); padding: 2px 7px;
        border-radius: 999px; margin-left: 7px;
      }

      .pk-kit .bill-pillselect { position: relative; display: inline-flex; align-self: flex-start; }
      .pk-kit .bill-pillselect select {
        appearance: none; border: 0; cursor: pointer; font: inherit; font-weight: 700; font-size: 14px;
        letter-spacing: .02em; padding: 12px 34px 12px 34px; border-radius: 14px; transition: .12s; width: auto;
      }
      .pk-kit .bill-pillselect .bill-pdot {
        position: absolute; left: 15px; top: 50%; transform: translateY(-50%);
        width: 9px; height: 9px; border-radius: 50%; pointer-events: none;
      }
      .pk-kit .bill-pillselect.active select { background: var(--bill-green-tint); color: var(--bill-active-ink); }
      .pk-kit .bill-pillselect.active .bill-pdot { background: var(--bill-green); box-shadow: 0 0 0 3px rgba(16,185,129,.2); }
      .pk-kit .bill-pillselect.churned select { background: var(--bill-rose-tint); color: var(--bill-churn-ink); }
      .pk-kit .bill-pillselect.churned .bill-pdot { background: var(--bill-rose); box-shadow: 0 0 0 3px rgba(239,68,68,.18); }
      .pk-kit .bill-pillselect select:focus { outline: 0; box-shadow: 0 0 0 2px currentColor; }

      @media (max-width: 980px) { .pk-kit .bill-cards { grid-template-columns: 1fr; } }
      @media (max-width: 620px) { .pk-kit .bill-fields.two { grid-template-columns: 1fr; } }
    `}</style>
  );
}
