import type { ReactNode } from "react";

// Shared shell + styles for the Fulfillment cockpit's Onboarding tab.
//
// The tab is deliberately not its own visual language: it borrows BillingTab's
// bento card, field and button treatment so the cockpit reads as one surface.
// Everything new here earns its place by saying something the other tabs cannot
// - the phase spine, the check rows and the group counters.

export type Tone = "indigo" | "green" | "sky" | "amber";

export function Card({
  icon,
  tone,
  title,
  note,
  right,
  children,
}: {
  icon: ReactNode;
  tone: Tone;
  title: string;
  note: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="onb-card">
      <header className="onb-card-head">
        <div className={`onb-card-ico ${tone}`} aria-hidden>
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="onb-card-title">{title}</h2>
          <p className="onb-card-note">{note}</p>
        </div>
        {right && <div className="onb-card-right">{right}</div>}
      </header>
      {children}
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  wide,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`onb-field${wide ? " wide" : ""}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <span className="onb-hint">{hint}</span>}
    </div>
  );
}

// Save state for a card that owns one Save button. Kept as a component so the
// three saving surfaces phrase success and failure identically.
export function SaveRow({
  pending,
  saved,
  error,
  onSave,
  label = "Save",
}: {
  pending: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
  label?: string;
}) {
  return (
    <div className="onb-saverow">
      {error && <span className="onb-err">{error}</span>}
      {saved && !pending && !error && <span className="onb-ok">Saved</span>}
      <button type="button" className="onb-btn primary" onClick={onSave} disabled={pending}>
        {pending ? "Saving..." : label}
      </button>
    </div>
  );
}

export function OnboardingStyle() {
  return (
    <style>{`
      .pk-kit .onb {
        --onb-indigo: #6366f1; --onb-indigo-tint: #eef0ff;
        --onb-green: #10b981;  --onb-green-tint: #e7f7f0;
        --onb-sky: #0ea5e9;    --onb-sky-tint: #e6f5fd;
        --onb-amber: #f59e0b;  --onb-amber-tint: #fdf3e2;
        --onb-rose: #ef4444;   --onb-rose-tint: #fdeaea;
        --onb-track: var(--surface-2);
        --onb-done-ink: #0a7d58; --onb-wait-ink: #9a6a12; --onb-fail-ink: #c23434;
        display: flex; flex-direction: column; gap: 16px;
        /* The cockpit's roster rail takes a fixed slice of the window, so this
           tab's real width has little to do with the viewport's. Every layout
           break below is measured against the tab itself. */
        container-type: inline-size;
      }
      [data-theme="dark"] .pk-kit .onb {
        --onb-indigo-tint: rgba(99,102,241,.18);
        --onb-green-tint: rgba(16,185,129,.15);
        --onb-sky-tint: rgba(14,165,233,.15);
        --onb-amber-tint: rgba(245,158,11,.15);
        --onb-rose-tint: rgba(239,68,68,.15);
        --onb-done-ink: #34d399; --onb-wait-ink: #fbbf24; --onb-fail-ink: #f87171;
      }

      .pk-kit .onb-card {
        background: var(--surface); border: 1px solid var(--border); border-radius: 22px;
        box-shadow: var(--shadow-md); padding: 20px 22px 22px;
      }
      .pk-kit .onb-card-head { display: flex; align-items: center; gap: 10px 12px; margin-bottom: 18px; flex-wrap: wrap; }
      .pk-kit .onb-card-ico { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; color: #fff; flex-shrink: 0; }
      .pk-kit .onb-card-ico svg { width: 18px; height: 18px; }
      .pk-kit .onb-card-ico.indigo { background: var(--onb-indigo); }
      .pk-kit .onb-card-ico.green  { background: var(--onb-green); }
      .pk-kit .onb-card-ico.sky    { background: var(--onb-sky); }
      .pk-kit .onb-card-ico.amber  { background: var(--onb-amber); }
      .pk-kit .onb-card-title { font-family: var(--font-display); font-weight: 600; font-size: 15px; color: var(--text); margin: 0; }
      .pk-kit .onb-card-note { font-size: 11.5px; color: var(--text-faint); margin: 0; }
      .pk-kit .onb-card-right { margin-left: auto; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }

      /* --- status strip ------------------------------------------------- */
      .pk-kit .onb-strip { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
      .pk-kit .onb-strip-main { flex: 1 1 340px; min-width: 0; }
      .pk-kit .onb-stage { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
      .pk-kit .onb-stage-title { font-family: var(--font-display); font-weight: 600; font-size: 20px; color: var(--text); }
      .pk-kit .onb-count { font-size: 13px; color: var(--text-faint); font-variant-numeric: tabular-nums; }
      .pk-kit .onb-pill {
        display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700;
        letter-spacing: .04em; text-transform: uppercase; padding: 4px 10px; border-radius: 999px;
      }
      .pk-kit .onb-pill.draft { background: var(--onb-amber-tint); color: var(--onb-wait-ink); }
      .pk-kit .onb-pill.provisioned { background: var(--onb-green-tint); color: var(--onb-done-ink); }

      /* The spine: one segment per phase, so a stalled client shows where. */
      .pk-kit .onb-spine { display: flex; gap: 10px; margin-top: 16px; }
      .pk-kit .onb-seg { flex: 1 1 0; min-width: 0; }
      .pk-kit .onb-seg-bar { height: 6px; border-radius: 999px; background: var(--onb-track); overflow: hidden; }
      .pk-kit .onb-seg-fill { height: 100%; border-radius: 999px; background: var(--onb-indigo); transition: width .3s ease; }
      .pk-kit .onb-seg.full .onb-seg-fill { background: var(--onb-green); }
      /* Four phases in the width that held three, so the name and the count stack
         instead of sharing a line: side by side, "CONNECTIONS" clipped to
         "CONNECTI...". Stacked, every phase reads in full and the counts line up
         down the row, which is the comparison being made anyway. */
      .pk-kit .onb-seg-label {
        display: flex; flex-direction: column; gap: 1px; margin-top: 7px;
        font-size: 10px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; color: var(--text-faint);
      }
      .pk-kit .onb-seg-label > span:first-child {
        min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .pk-kit .onb-seg-n { font-size: 11px; color: var(--text-muted); letter-spacing: 0; }
      .pk-kit .onb-seg.full .onb-seg-label { color: var(--onb-done-ink); }
      .pk-kit .onb-seg-n { font-variant-numeric: tabular-nums; }

      .pk-kit .onb-strip-side { flex: 0 1 300px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
      .pk-kit .onb-provision-note { font-size: 12px; color: var(--text-faint); text-align: right; line-height: 1.5; }
      .pk-kit .onb-provision-note b { color: var(--text); font-weight: 600; }

      /* --- buttons ------------------------------------------------------- */
      .pk-kit .onb-btn {
        display: inline-flex; align-items: center; gap: 8px; border: 0; cursor: pointer; font: inherit;
        font-weight: 600; font-size: 13.5px; padding: 10px 16px; border-radius: 12px; transition: .15s;
      }
      .pk-kit .onb-btn.primary { background: var(--onb-indigo); color: #fff; box-shadow: 0 8px 18px -8px rgba(99,102,241,.7); }
      .pk-kit .onb-btn.primary:hover { filter: brightness(1.05); }
      .pk-kit .onb-btn.danger { background: var(--onb-rose); color: #fff; box-shadow: 0 8px 18px -8px rgba(239,68,68,.7); }
      .pk-kit .onb-btn.ghost { background: var(--onb-indigo-tint); color: var(--onb-indigo); }
      .pk-kit .onb-btn.ghost:hover { filter: brightness(.97); }
      .pk-kit .onb-btn:disabled { opacity: .55; cursor: default; box-shadow: none; }
      .pk-kit .onb-btn:focus-visible { outline: 2px solid var(--onb-indigo); outline-offset: 2px; }

      .pk-kit .onb-ok { font-size: 12.5px; font-weight: 600; color: var(--positive); }
      .pk-kit .onb-err { font-size: 12.5px; font-weight: 600; color: var(--danger); }
      .pk-kit .onb-saverow { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 18px; flex-wrap: wrap; }

      /* --- checklist ------------------------------------------------------ */
      .pk-kit .onb-phase + .onb-phase { margin-top: 18px; }
      .pk-kit .onb-phase-name {
        font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
        color: var(--text-faint); margin-bottom: 8px;
      }
      .pk-kit .onb-task {
        display: flex; align-items: center; gap: 11px; width: 100%; text-align: left;
        padding: 11px 12px; border-radius: 14px; border: 1px solid var(--border);
        background: var(--surface); font: inherit; font-size: 13.5px; color: var(--text);
        cursor: pointer; transition: .12s;
      }
      .pk-kit .onb-task + .onb-task { margin-top: 8px; }
      .pk-kit .onb-task:hover { border-color: var(--onb-indigo); }
      .pk-kit .onb-task:focus-visible { outline: 2px solid var(--onb-indigo); outline-offset: 2px; }
      .pk-kit .onb-task.auto { cursor: default; }
      .pk-kit .onb-task.auto:hover { border-color: var(--border); }
      .pk-kit .onb-task.done { background: var(--onb-green-tint); border-color: transparent; }
      .pk-kit .onb-tick {
        width: 20px; height: 20px; border-radius: 7px; flex-shrink: 0; display: grid; place-items: center;
        border: 1.5px solid var(--border); color: transparent;
      }
      .pk-kit .onb-tick svg { width: 13px; height: 13px; }
      .pk-kit .onb-task.done .onb-tick { background: var(--onb-green); border-color: var(--onb-green); color: #fff; }
      .pk-kit .onb-task-label { flex: 1; min-width: 0; }
      .pk-kit .onb-task.done .onb-task-label { color: var(--onb-done-ink); font-weight: 600; }
      .pk-kit .onb-badge {
        font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
        padding: 3px 7px; border-radius: 999px; background: var(--onb-sky-tint); color: var(--onb-sky); flex-shrink: 0;
      }

      /* --- the way into the setup steps ----------------------------------- */
      .pk-kit a.onb-setup-link {
        display: flex; align-items: center; justify-content: space-between; gap: 16px;
        text-decoration: none; color: inherit; transition: border-color .12s, transform .12s;
      }
      .pk-kit a.onb-setup-link:hover { border-color: var(--onb-indigo); transform: translateY(-1px); }
      .pk-kit .onb-setup-link-main { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .pk-kit .onb-setup-link-icon {
        width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center;
        background: var(--onb-indigo-tint); color: var(--onb-indigo); flex-shrink: 0;
      }
      .pk-kit .onb-setup-link-main h3 {
        font-family: var(--font-display); font-size: 15px; font-weight: 650; color: var(--text);
      }
      .pk-kit .onb-setup-link-main p { font-size: 12.5px; color: var(--text-muted); margin-top: 2px; }
      .pk-kit .onb-setup-link-side {
        display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0;
      }
      .pk-kit .onb-setup-link-bar {
        display: block; width: 96px; height: 5px; border-radius: 999px;
        background: var(--onb-track); overflow: hidden;
      }
      .pk-kit .onb-setup-link-bar > span {
        display: block; height: 100%; border-radius: 999px; background: var(--onb-indigo);
        transition: width .3s ease;
      }

      /* --- go live -------------------------------------------------------- */
      .pk-kit .onb-golive {
        display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;
      }
      .pk-kit .onb-golive-main { min-width: 0; flex: 1 1 320px; }
      .pk-kit .onb-golive-main h3 {
        font-family: var(--font-display); font-size: 16px; font-weight: 650; color: var(--text);
      }
      .pk-kit .onb-golive-main p { font-size: 13px; color: var(--text-muted); margin-top: 4px; max-width: 62ch; }
      .pk-kit .onb-golive-side {
        display: flex; flex-direction: column; align-items: flex-end; gap: 6px; text-align: right;
      }

      /* --- the client's answers, read-only -------------------------------- */
      .pk-kit .onb-answers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 18px; }
      .pk-kit .onb-answer.wide { grid-column: 1 / -1; }
      .pk-kit .onb-answer dt { font-size: 11.5px; color: var(--text-faint); margin-bottom: 2px; }
      .pk-kit .onb-answer dd {
        font-size: 13.5px; color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere;
      }
      .pk-kit .onb-empty-line { font-size: 13px; color: var(--text-muted); }
      @media (max-width: 720px) {
        .pk-kit .onb-answers { grid-template-columns: minmax(0, 1fr); }
      }

      /* --- readiness ------------------------------------------------------ */
      .pk-kit .onb-check { display: flex; gap: 10px; align-items: flex-start; padding: 11px 0; }
      .pk-kit .onb-check + .onb-check { border-top: 1px solid var(--border); }
      .pk-kit .onb-check-dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; background: var(--onb-rose); }
      .pk-kit .onb-check.ok .onb-check-dot { background: var(--onb-green); }
      .pk-kit .onb-check-name { font-size: 13.5px; font-weight: 600; color: var(--text); }
      .pk-kit .onb-check-detail { font-size: 12px; color: var(--text-faint); margin-top: 2px; line-height: 1.5; }

      /* --- field groups --------------------------------------------------- */
      .pk-kit .onb-group { border-top: 1px solid var(--border); }
      .pk-kit .onb-group > summary {
        display: flex; align-items: center; gap: 10px; padding: 14px 2px; cursor: pointer;
        font-size: 13.5px; font-weight: 600; color: var(--text); list-style: none;
      }
      .pk-kit .onb-group > summary::-webkit-details-marker { display: none; }
      .pk-kit .onb-group > summary:focus-visible { outline: 2px solid var(--onb-indigo); outline-offset: 2px; border-radius: 8px; }
      .pk-kit .onb-group-chev { color: var(--text-faint); display: grid; place-items: center; transition: transform .15s; }
      .pk-kit .onb-group[open] > summary .onb-group-chev { transform: rotate(90deg); }
      .pk-kit .onb-group-count {
        margin-left: auto; font-size: 11px; font-weight: 700; letter-spacing: .04em; color: var(--text-faint);
        font-variant-numeric: tabular-nums;
      }
      .pk-kit .onb-group-count.full { color: var(--onb-done-ink); }
      .pk-kit .onb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; padding: 4px 2px 20px; }
      .pk-kit .onb-field { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
      .pk-kit .onb-field.wide { grid-column: 1 / -1; }
      .pk-kit .onb-field > label {
        font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-faint);
      }
      .pk-kit .onb-field input,
      .pk-kit .onb-field select,
      .pk-kit .onb-field textarea {
        width: 100%; border: 1px solid var(--border); background: var(--surface); font: inherit;
        font-size: 14px; font-weight: 500; color: var(--text); padding: 10px 12px; border-radius: 12px;
        transition: border-color .12s, box-shadow .12s;
      }
      .pk-kit .onb-field textarea { resize: vertical; min-height: 84px; line-height: 1.5; font-weight: 400; }
      .pk-kit .onb-field input:hover,
      .pk-kit .onb-field select:hover,
      .pk-kit .onb-field textarea:hover { border-color: var(--text-faint); }
      .pk-kit .onb-field input:focus,
      .pk-kit .onb-field select:focus,
      .pk-kit .onb-field textarea:focus { outline: 0; border-color: transparent; box-shadow: 0 0 0 2px var(--onb-indigo); }
      .pk-kit .onb-field input::placeholder,
      .pk-kit .onb-field textarea::placeholder { color: var(--text-faint); font-weight: 400; }
      .pk-kit .onb-hint { font-size: 11.5px; color: var(--text-faint); line-height: 1.5; }

      .pk-kit .onb-choices { display: flex; gap: 8px; flex-wrap: wrap; }
      .pk-kit .onb-choice {
        border: 1px solid var(--border); background: var(--surface); cursor: pointer; font: inherit;
        font-size: 13px; font-weight: 600; color: var(--text); padding: 9px 16px; border-radius: 999px; transition: .12s;
      }
      .pk-kit .onb-choice:hover { border-color: var(--onb-indigo); }
      .pk-kit .onb-choice.on { background: var(--onb-indigo-tint); border-color: transparent; color: var(--onb-indigo); }
      .pk-kit .onb-choice:focus-visible { outline: 2px solid var(--onb-indigo); outline-offset: 2px; }

      .pk-kit .onb-empty { font-size: 13px; color: var(--text-faint); line-height: 1.6; }

      @container (max-width: 900px) {
      }
      @container (max-width: 760px) {
        .pk-kit .onb-strip-side { flex-basis: 100%; align-items: flex-start; }
        .pk-kit .onb-card-right { justify-content: flex-start; }
        .pk-kit .onb-provision-note { text-align: left; }
      }
      @container (max-width: 560px) {
        .pk-kit .onb-grid { grid-template-columns: 1fr; }
      }
      /* The spine only stacks when three segments genuinely will not fit. */
      @container (max-width: 430px) {
        .pk-kit .onb-spine { flex-direction: column; gap: 12px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .pk-kit .onb-seg-fill, .pk-kit .onb-group-chev { transition: none; }
      }
    `}</style>
  );
}
