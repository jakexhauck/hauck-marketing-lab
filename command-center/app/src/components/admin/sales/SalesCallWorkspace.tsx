import { useEffect, useMemo, useRef, useState } from "react";
import { X, Phone, Mail, Clock, PlayCircle } from "lucide-react";
import {
  formatDay,
  formatDuration,
  formatTime,
  isInProgress,
  isLogged,
  type SalesCall,
} from "../../../lib/salesCalls";
import { useLogSalesCall, useSalesCallSettingsQuery } from "../../../hooks/useSalesCalls";
import OutcomePanel from "./OutcomePanel";

// The call workspace: the whole screen, for the twenty minutes that matter.
//
// Three columns, in the order attention moves during a real call:
//
//   left    who this is, and the timer
//   middle  the guided prompts and the scratchpad
//   right   how it ended
//
// Notes autosave. Losing what somebody said because a tab closed is the failure
// this page exists to prevent, so nothing here waits for a Save button: the
// save is debounced, and `started_at` lives in the database rather than in
// component state so a refresh mid-call resumes instead of restarting.

interface Props {
  call: SalesCall;
  onClose: () => void;
}

const AUTOSAVE_MS = 1200;

export default function SalesCallWorkspace({ call, onClose }: Props) {
  const log = useLogSalesCall();
  const settingsQuery = useSalesCallSettingsQuery();
  const sections = settingsQuery.data?.noteSections ?? [];

  // Local copies so typing is never at the mercy of a round trip. Seeded once
  // per call: re-seeding on every render would fight the person typing.
  const [answers, setAnswers] = useState<Record<string, string>>(() => call.sections ?? {});
  const [scratchpad, setScratchpad] = useState(() => call.scratchpad ?? "");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const live = isInProgress(call);
  const logged = isLogged(call);

  // Escape closes, but never mid-call: the whole point of the timer is that the
  // call is still happening, and a stray keystroke must not throw it away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !live) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [live, onClose]);

  // Debounced autosave for the notes. Fires only when something actually
  // changed from what the row already holds, so opening a call and reading it
  // never writes.
  const dirtyRef = useRef(false);
  useEffect(() => {
    const sameAnswers = JSON.stringify(answers) === JSON.stringify(call.sections ?? {});
    const sameScratch = scratchpad === (call.scratchpad ?? "");
    if (sameAnswers && sameScratch) return;
    dirtyRef.current = true;

    const t = setTimeout(() => {
      log.mutate(
        { id: call.id, sections: answers, scratchpad },
        { onSuccess: () => setSavedAt(Date.now()) },
      );
      dirtyRef.current = false;
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, scratchpad]);

  const start = () => log.mutate({ id: call.id, started: true });

  return (
    <div className="scw" role="dialog" aria-modal="true" aria-label={`Call with ${call.prospectName}`}>
      <div className="scw-bar">
        <div className="scw-bar-who">
          <strong>{call.prospectName}</strong>
          {call.businessName && <span>{call.businessName}</span>}
        </div>

        <CallTimer call={call} />

        <div className="scw-bar-right">
          {savedAt && !logged && <span className="scw-saved">Notes saved</span>}
          <button type="button" className="scw-close" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>
      </div>

      <div className="scw-grid">
        {/* ---- Who this is. Only what GoHighLevel actually holds. */}
        <aside className="scw-col scw-who">
          <h3 className="pk-section-h">Who you are talking to</h3>

          <div className="scw-facts">
            <Fact label="Booked for">
              {formatDay(call.scheduledAt)} at {formatTime(call.scheduledAt)}
            </Fact>
            {call.phone && (
              <Fact label="Phone">
                <a href={`tel:${call.phone}`} className="font-mono">
                  <Phone size={12} aria-hidden /> {call.phone}
                </a>
              </Fact>
            )}
            {call.email && (
              <Fact label="Email">
                <a href={`mailto:${call.email}`}>
                  <Mail size={12} aria-hidden /> {call.email}
                </a>
              </Fact>
            )}
            {call.source && <Fact label="Came from">{call.source}</Fact>}
            {call.timezone && <Fact label="Their timezone">{call.timezone}</Fact>}
          </div>

          {!live && !logged && (
            <button type="button" className="scw-start" onClick={start} disabled={log.isPending}>
              <PlayCircle size={16} aria-hidden /> Start Call
            </button>
          )}

          {!live && !logged && (
            <p className="scw-hint">
              Starting the call runs the timer and marks it in progress. It does not dial
              anyone or open a meeting.
            </p>
          )}
        </aside>

        {/* ---- The notes. */}
        <section className="scw-col scw-notes">
          <h3 className="pk-section-h">Notes</h3>

          {settingsQuery.isPending && <div className="pk-empty">Loading your prompts...</div>}

          {sections.map((section) => (
            <div key={section.id} className="scw-section">
              <label htmlFor={`sec-${section.id}`}>{section.label}</label>
              <textarea
                id={`sec-${section.id}`}
                className="pk-textarea"
                rows={2}
                value={answers[section.id] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [section.id]: e.target.value }))
                }
              />
            </div>
          ))}

          <div className="scw-section">
            <label htmlFor="scratchpad">Scratchpad</label>
            <textarea
              id="scratchpad"
              className="pk-textarea"
              rows={8}
              value={scratchpad}
              placeholder="Anything else, in their words."
              onChange={(e) => setScratchpad(e.target.value)}
            />
          </div>
        </section>

        {/* ---- How it ended. */}
        <aside className="scw-col scw-outcome">
          <OutcomePanel call={call} onLogged={onClose} />
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="scw-fact">
      <span className="scw-fact-l">{label}</span>
      <span className="scw-fact-v">{children}</span>
    </div>
  );
}

// The live timer, ticking from the stored started_at rather than from a local
// clock started on mount. That is what makes a refresh mid-call resume at the
// right number instead of starting again from zero.
function CallTimer({ call }: { call: SalesCall }) {
  const live = isInProgress(call);
  const [, force] = useState(0);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [live]);

  const seconds = useMemo(() => {
    if (call.durationSeconds !== null) return call.durationSeconds;
    if (!call.startedAt) return null;
    const started = Date.parse(call.startedAt);
    if (!Number.isFinite(started)) return null;
    return Math.max(0, Math.round((Date.now() - started) / 1000));
    // Recomputed every tick via the forced render above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.startedAt, call.durationSeconds, live, force]);

  if (seconds === null) return <div className="scw-timer idle">Not started</div>;

  return (
    <div className={`scw-timer${live ? " live" : ""}`}>
      <Clock size={14} aria-hidden />
      {formatDuration(seconds)}
      {live && <span className="scw-dot" aria-hidden />}
    </div>
  );
}
