import { useState } from "react";
import { Check } from "lucide-react";
import {
  SALES_OUTCOMES,
  OUTCOME_META,
  DEAL_COMPONENTS,
  DEAL_EXTRAS,
  describeDeal,
  money,
  outcomeLabel,
  type Deal,
  type DealComponentKey,
  type SalesCall,
  type SalesOutcome,
} from "../../../lib/salesCalls";
import { useLogSalesCall } from "../../../hooks/useSalesCalls";

// How the call ended.
//
// Picking an outcome does NOT save on its own. Each one asks for the thing that
// makes it useful first (a deal, a follow-up date, a reason), because an
// outcome without it is a row that has to be chased later, and the moment the
// call ends is the only moment anybody remembers the answer.
//
// Qualified is asked separately from the outcome and on every call. Sales Data
// counts qualified and closed as different things, and "a qualified prospect
// who did not buy" is the most useful row on that whole tracker.

interface Props {
  call: SalesCall;
  onLogged: () => void;
}

export default function OutcomePanel({ call, onLogged }: Props) {
  const log = useLogSalesCall();

  const [picked, setPicked] = useState<SalesOutcome | null>(call.outcome);
  const [qualified, setQualified] = useState<boolean | null>(call.qualified);
  const [deal, setDeal] = useState<Deal>(() => call.deal ?? {});
  const [cash, setCash] = useState(() =>
    call.cashCollected !== null ? String(call.cashCollected) : "",
  );
  const [followUpAt, setFollowUpAt] = useState(() => call.followUpAt?.slice(0, 16) ?? "");
  const [reason, setReason] = useState(call.notAFitReason ?? "");

  const meta = picked ? OUTCOME_META[picked] : null;

  // What each outcome needs before it can be logged. A no-show needs nothing,
  // which is right: there is nothing to know about a call that did not happen.
  const missing = (() => {
    if (!picked) return "Pick how the call ended.";
    if (meta?.needsFollowUp && !followUpAt) return "When is the follow-up?";
    if (meta?.needsReason && !reason.trim()) return "Why were they not a fit?";
    return null;
  })();

  const save = () => {
    if (!picked || missing) return;
    log.mutate(
      {
        id: call.id,
        ended: true,
        outcome: picked,
        qualified,
        deal: picked === "closed" ? (deal as Record<string, number | undefined>) : null,
        cashCollected: picked === "closed" && cash.trim() ? cash : null,
        followUpAt: picked === "follow_up" ? new Date(followUpAt).toISOString() : null,
        notAFitReason: picked === "not_a_fit" ? reason : null,
      },
      { onSuccess: onLogged },
    );
  };

  return (
    <>
      <h3 className="pk-section-h">How did it end?</h3>

      <div className="scw-outcomes">
        {SALES_OUTCOMES.map((outcome) => {
          const m = OUTCOME_META[outcome];
          const on = picked === outcome;
          return (
            <button
              key={outcome}
              type="button"
              className={`scw-oc${on ? " on" : ""}`}
              style={on ? { borderColor: m.swatch, color: m.swatch } : undefined}
              onClick={() => setPicked(outcome)}
            >
              <span className="scw-oc-dot" style={{ background: m.swatch }} aria-hidden />
              <span className="scw-oc-l">{m.label}</span>
              <span className="scw-oc-m">{m.meaning}</span>
            </button>
          );
        })}
      </div>

      {/* Asked on every call, not only the ones that closed. */}
      <div className="scw-qual">
        <span className="scw-qual-q">Were they a real prospect?</span>
        <div className="scw-qual-btns">
          <button
            type="button"
            className={`scw-qb${qualified === true ? " on" : ""}`}
            onClick={() => setQualified(qualified === true ? null : true)}
          >
            Qualified
          </button>
          <button
            type="button"
            className={`scw-qb${qualified === false ? " on" : ""}`}
            onClick={() => setQualified(qualified === false ? null : false)}
          >
            Not qualified
          </button>
        </div>
      </div>

      {picked === "closed" && (
        <DealBuilder deal={deal} onChange={setDeal} cash={cash} onCash={setCash} />
      )}

      {picked === "follow_up" && (
        <div className="scw-field">
          <label htmlFor="followup">Follow-up call</label>
          <input
            id="followup"
            type="datetime-local"
            className="pk-input"
            value={followUpAt}
            onChange={(e) => setFollowUpAt(e.target.value)}
          />
          <p className="scw-hint">
            They stay under Follow-ups owed until a later call with them is booked.
          </p>
        </div>
      )}

      {picked === "not_a_fit" && (
        <div className="scw-field">
          <label htmlFor="reason">Why not?</label>
          <textarea
            id="reason"
            className="pk-textarea"
            rows={3}
            value={reason}
            placeholder="No budget, too small, wrong service, already has an agency."
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}

      <div className="scw-log">
        {missing && <p className="scw-missing">{missing}</p>}
        <button
          type="button"
          className="scw-logbtn"
          onClick={save}
          disabled={!!missing || log.isPending}
        >
          <Check size={15} aria-hidden />
          {call.outcome ? "Update the log" : "Log the call"}
        </button>
        {call.outcome && (
          <p className="scw-hint">Logged as {outcomeLabel(call.outcome)}.</p>
        )}
      </div>
    </>
  );
}

// Tick what is in the deal; each component reveals its own amount.
//
// Components rather than named deal types, so a structure nobody has invented
// yet is simply a combination that has not come up. A retainer, a straight
// revenue split, an upfront fee plus a percentage of every job, pay per job.
function DealBuilder({
  deal,
  onChange,
  cash,
  onCash,
}: {
  deal: Deal;
  onChange: (d: Deal) => void;
  cash: string;
  onCash: (v: string) => void;
}) {
  const toggle = (key: DealComponentKey) => {
    const next = { ...deal };
    if (key in next) delete next[key];
    else next[key] = 0;
    onChange(next);
  };

  const setAmount = (key: keyof Deal, raw: string) => {
    const n = Number(raw.replace(/[$,\s]/g, ""));
    onChange({ ...deal, [key]: Number.isFinite(n) ? n : 0 });
  };

  const summary = describeDeal(deal);

  return (
    <div className="scw-deal">
      <h4 className="pk-section-h">The deal</h4>

      {DEAL_COMPONENTS.map((component) => {
        const on = component.key in deal;
        return (
          <div key={component.key} className={`scw-dc${on ? " on" : ""}`}>
            <label className="scw-dc-top">
              <input type="checkbox" checked={on} onChange={() => toggle(component.key)} />
              <span className="scw-dc-l">{component.label}</span>
              <span className="scw-dc-h">{component.hint}</span>
            </label>
            {on && (
              <div className="scw-dc-amt">
                {component.unit === "money" && <span>$</span>}
                <input
                  type="text"
                  inputMode="decimal"
                  className="pk-input"
                  value={deal[component.key] ?? ""}
                  onChange={(e) => setAmount(component.key, e.target.value)}
                  aria-label={component.label}
                />
                {component.unit === "percent" && <span>%</span>}
                {component.key === "monthlyRetainer" && <span>/mo</span>}
              </div>
            )}
          </div>
        );
      })}

      <div className="scw-extras">
        {DEAL_EXTRAS.map((extra) => (
          <div key={extra.key} className="scw-field">
            <label htmlFor={`x-${extra.key}`}>{extra.label}</label>
            <div className="scw-dc-amt">
              {extra.unit === "money" && <span>$</span>}
              <input
                id={`x-${extra.key}`}
                type="text"
                inputMode="numeric"
                className="pk-input"
                value={deal[extra.key] ?? ""}
                onChange={(e) => setAmount(extra.key, e.target.value)}
              />
              {extra.unit === "months" && <span>months</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Its own field, and the only money that reaches Sales Data. What was
          agreed and what was actually taken are different facts. */}
      <div className="scw-field scw-cash">
        <label htmlFor="cash">Cash collected today</label>
        <div className="scw-dc-amt">
          <span>$</span>
          <input
            id="cash"
            type="text"
            inputMode="decimal"
            className="pk-input"
            value={cash}
            onChange={(e) => onCash(e.target.value)}
          />
        </div>
        <p className="scw-hint">This is the number the Sales Data Cash column sums.</p>
      </div>

      {summary && (
        <p className="scw-dealsum">
          {summary}
          {cash.trim() ? `, ${money(Number(cash.replace(/[$,\s]/g, "")))} collected` : ""}
        </p>
      )}
    </div>
  );
}
