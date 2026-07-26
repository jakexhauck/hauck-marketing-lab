import { Phone, Mail, Clock, PlayCircle, PencilLine } from "lucide-react";
import {
  OUTCOME_META,
  describeDeal,
  formatDay,
  formatDuration,
  formatTime,
  isInProgress,
  isLogged,
  money,
  needsLogging,
  type SalesCall,
} from "../../../lib/salesCalls";

// One booked demo call.
//
// The card's whole job is to say, at a glance, what this call needs from Jake
// right now: run it, log it, or nothing. So the button is not decoration, it is
// the state:
//
//   in progress -> Resume, because losing a live call is the one unforgivable
//                  failure on this page
//   today       -> Start Call
//   past+unlogged -> Log it, because a call nobody logged is a hole in Sales Data
//   logged      -> no button, just what happened
//   future      -> no button; starting a call that has not happened is a mis-click

interface Props {
  call: SalesCall;
  // Absent on the Upcoming view, where nothing is actionable yet.
  onOpen?: (call: SalesCall) => void;
  // Show the date as well as the time. Today's view does not need it.
  showDay?: boolean;
  now?: Date;
}

export default function SalesCallCard({ call, onOpen, showDay = false, now = new Date() }: Props) {
  const logged = isLogged(call);
  const live = isInProgress(call);
  const owes = needsLogging(call, now);
  const cancelled = ["cancelled", "canceled"].includes(call.appointmentStatus);

  const action = live ? "resume" : owes ? "log" : onOpen && !logged ? "start" : null;

  return (
    <div className="pk-li">
      <div className="pk-li-main">
        <div className="pk-li-label">
          {call.prospectName}
          {call.businessName && <span className="scc-biz">{call.businessName}</span>}
          {live && <span className="scc-live">On the call</span>}
          {cancelled && <span className="scc-cancelled">Cancelled</span>}
        </div>

        <div className="pk-li-sub scc-meta">
          {call.phone && (
            <span className="scc-chip font-mono">
              <Phone size={12} aria-hidden /> {call.phone}
            </span>
          )}
          {call.email && (
            <span className="scc-chip">
              <Mail size={12} aria-hidden /> {call.email}
            </span>
          )}
          {call.source && <span className="scc-chip">{call.source}</span>}
          {call.timezone && <span className="scc-chip">{call.timezone.split("/").pop()}</span>}
        </div>

        {/* What happened, once it has. A logged call stops asking for attention
            and starts being a record. */}
        {logged && call.outcome && (
          <div className="scc-result">
            <span
              className="scc-pill"
              style={{
                background: `color-mix(in srgb, ${OUTCOME_META[call.outcome].swatch} 16%, transparent)`,
                color: OUTCOME_META[call.outcome].swatch,
              }}
            >
              {OUTCOME_META[call.outcome].label}
            </span>
            {call.cashCollected ? (
              <span className="scc-cash">{money(call.cashCollected)} collected</span>
            ) : null}
            {call.deal && <span className="scc-deal">{describeDeal(call.deal)}</span>}
            {call.durationSeconds ? (
              <span className="scc-dur">
                <Clock size={11} aria-hidden /> {formatDuration(call.durationSeconds)}
              </span>
            ) : null}
          </div>
        )}
      </div>

      <div className="pk-li-meta scc-right">
        <div className="scc-when">
          <div className="scc-time">{formatTime(call.scheduledAt)}</div>
          {showDay && <div className="scc-date">{formatDay(call.scheduledAt)}</div>}
        </div>

        {action && onOpen && (
          <button
            type="button"
            className={`scc-btn${action === "log" ? " ghost" : ""}`}
            onClick={() => onOpen(call)}
          >
            {action === "log" ? (
              <>
                <PencilLine size={14} aria-hidden /> Log it
              </>
            ) : (
              <>
                <PlayCircle size={14} aria-hidden />
                {action === "resume" ? "Resume" : "Start Call"}
              </>
            )}
          </button>
        )}

        {/* A logged call is still worth reopening: the notes are the point. */}
        {logged && onOpen && (
          <button type="button" className="scc-btn ghost" onClick={() => onOpen(call)}>
            Notes
          </button>
        )}
      </div>
    </div>
  );
}
