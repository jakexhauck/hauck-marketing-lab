import { Check, ArrowRight, HelpCircle, PartyPopper } from "lucide-react";
import type { ActionBoard as Board, ActionItem, Severity } from "../../../lib/settingsActions";

// The split screen: work on the left, reassurance on the right.
//
// Everything here is sized so the left column is read first and the right is
// read at a glance. The right column is deliberately quiet, small text and a
// tick, because "nine things are fine" needs to take up almost no attention.
//
// One rule enforced visually: "Can't verify" sits apart from "Working" and is
// grey, never green. A credential we cannot test is not a credential we know is
// good, and the layout must not imply otherwise.

const SEVERITY_LABEL: Record<Severity, string> = {
  "client-down": "client down",
  down: "broken",
  drift: "not applied",
  setup: "not set up",
};

export function ActionBoard({
  board,
  onAct,
}: {
  board: Board;
  onAct: (item: ActionItem) => void;
}) {
  const { needs, working, unverified } = board;

  return (
    <div className="cx-board">
      <section className="cx-board-left">
        <h2 className="cx-colhead">
          Needs you
          <span className={`cx-count ${needs.length ? "on" : ""}`}>{needs.length}</span>
        </h2>

        {needs.length === 0 ? (
          <div className="cx-allclear">
            <PartyPopper size={22} aria-hidden />
            <div>
              <strong>Nothing needs you.</strong>
              <p>Every connection this app declares is either working or deliberately unused.</p>
            </div>
          </div>
        ) : (
          <ul className="cx-jobs">
            {needs.map((item) => (
              <li key={item.id} className={`cx-job cx-job-${item.severity}`}>
                <div className="cx-job-main">
                  <div className="cx-job-title">
                    <span className={`cx-sev cx-sev-${item.severity}`}>
                      {SEVERITY_LABEL[item.severity]}
                    </span>
                    {item.title}
                  </div>
                  <p className="cx-job-why">{item.why}</p>
                </div>
                <button type="button" className="cx-job-btn" onClick={() => onAct(item)}>
                  {item.actionLabel}
                  <ArrowRight size={13} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cx-board-right">
        <h2 className="cx-colhead cx-colhead-calm">
          Working
          <span className="cx-count">{working.length}</span>
        </h2>
        <ul className="cx-calm">
          {working.map((w) => (
            <li key={w.id} title={w.detail}>
              <Check size={13} aria-hidden />
              {w.label}
            </li>
          ))}
          {working.length === 0 && <li className="cx-calm-none">Nothing confirmed working yet.</li>}
        </ul>

        {unverified.length > 0 && (
          <>
            <h2 className="cx-colhead cx-colhead-calm cx-colhead-grey">
              Can&apos;t verify
              <span className="cx-count">{unverified.length}</span>
            </h2>
            <ul className="cx-calm cx-calm-grey">
              {unverified.map((u) => (
                <li key={u.id} title={u.detail}>
                  <HelpCircle size={13} aria-hidden />
                  {u.label}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
