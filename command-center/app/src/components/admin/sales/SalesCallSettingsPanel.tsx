import { useEffect, useState } from "react";
import { GripVertical, Plus, Trash2, TriangleAlert } from "lucide-react";
import {
  useSalesCallSettingsQuery,
  useSaveSalesCallSettings,
} from "../../../hooks/useSalesCalls";
import { useColdCallCalendarsQuery } from "../../../hooks/useColdCall";
import type { NoteSection } from "../../../lib/salesCalls";

// Settings for Sales Calls, living on the Cold Call Settings page because that
// is where the agency's own selling is already configured (the dialing script
// sits right above it) and because the calendar being chosen here is the same
// account a cold caller books into.
//
// Two settings:
//
//   The demo calendar. Not a convenience: the agency account also carries an
//   Onboarding calendar that a personal Google account syncs flight bookings
//   into. Point Sales Calls at that one and it lists a flight to Atlanta as a
//   demo call with a Start Call button next to it. So the choice is explicit,
//   and until it is made the page says so rather than guessing.
//
//   The guided note prompts. Answers on a call are keyed by a section's id, so
//   renaming a prompt keeps every old answer readable, and removing one hides
//   the prompt without destroying what was said under it.

export default function SalesCallSettingsPanel() {
  const settingsQuery = useSalesCallSettingsQuery();
  const calendarsQuery = useColdCallCalendarsQuery();
  const save = useSaveSalesCallSettings();

  const [sections, setSections] = useState<NoteSection[]>([]);
  const [dirty, setDirty] = useState(false);

  // Seed once the settings land, and never again while the owner is editing:
  // re-seeding on every query settle would throw away a half-typed prompt.
  useEffect(() => {
    if (settingsQuery.data && !dirty) setSections(settingsQuery.data.noteSections);
  }, [settingsQuery.data, dirty]);

  const calendars = calendarsQuery.data?.calendars ?? [];
  const chosen = settingsQuery.data?.demoCalendarId ?? "";

  const pickCalendar = (id: string) => save.mutate({ demoCalendarId: id || null });

  const edit = (index: number, label: string) => {
    setDirty(true);
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, label } : s)));
  };

  const remove = (index: number) => {
    setDirty(true);
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= sections.length) return;
    setDirty(true);
    setSections((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const add = () => {
    setDirty(true);
    // The id is what old answers are keyed by, so it has to be unique and
    // stable. Derived from the position plus the clock rather than from the
    // label, which the owner is about to change anyway.
    setSections((prev) => [
      ...prev,
      { id: `s${prev.length + 1}-${Date.now().toString(36)}`, label: "" },
    ]);
  };

  const saveSections = () => {
    const cleaned = sections
      .map((s) => ({ ...s, label: s.label.trim() }))
      .filter((s) => s.label);
    if (!cleaned.length) return;
    save.mutate({ noteSections: cleaned }, { onSuccess: () => setDirty(false) });
  };

  const nothingNamed = sections.every((s) => !s.label.trim());

  return (
    <div className="scs">
      <SettingsStyle />

      {/* ---- Which calendar ---- */}
      <section className="pk-card scs-card">
        <h3 className="pk-section-h">Demo call calendar</h3>
        <p className="scs-lede">
          Which calendar on the agency account holds demo calls. Sales Calls reads this one
          and nothing else.
        </p>

        {calendarsQuery.isPending && <div className="pk-empty">Loading calendars...</div>}

        {calendarsQuery.data?.configured === false && (
          <div className="pk-empty">
            The agency booking account is not connected yet, so there are no calendars to
            choose from.
          </div>
        )}

        {calendars.length > 0 && (
          <>
            <div className="scs-cals">
              {calendars.map((cal) => (
                <label key={cal.id} className={`scs-cal${chosen === cal.id ? " on" : ""}`}>
                  <input
                    type="radio"
                    name="demo-calendar"
                    checked={chosen === cal.id}
                    onChange={() => pickCalendar(cal.id)}
                  />
                  <span className="scs-cal-n">{cal.name}</span>
                </label>
              ))}
            </div>

            {/* The trap that made this a setting in the first place. */}
            <p className="scs-warn">
              <TriangleAlert size={13} aria-hidden />
              Pick the calendar prospects actually book demo calls on. If another calendar
              syncs a personal Google account, its events show up here as demo calls.
            </p>
          </>
        )}

        {!chosen && calendars.length > 0 && (
          <p className="scs-unset">Nothing chosen yet, so the Sales Calls page is empty.</p>
        )}
      </section>

      {/* ---- The prompts ---- */}
      <section className="pk-card scs-card">
        <h3 className="pk-section-h">Call notes</h3>
        <p className="scs-lede">
          The prompts you fill in while you are on a demo call. Renaming one keeps the
          answers already written under it; removing one hides the prompt without deleting
          what was said.
        </p>

        <div className="scs-sections">
          {sections.map((section, i) => (
            <div key={section.id} className="scs-row">
              <div className="scs-grip" aria-hidden>
                <GripVertical size={14} />
              </div>
              <input
                type="text"
                className="pk-input"
                value={section.label}
                placeholder="What do you want to ask?"
                onChange={(e) => edit(i, e.target.value)}
                aria-label={`Prompt ${i + 1}`}
              />
              <div className="scs-rowbtns">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === sections.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => remove(i)}
                  aria-label={`Remove ${section.label || "prompt"}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button type="button" className="scs-add" onClick={add}>
          <Plus size={14} aria-hidden /> Add a prompt
        </button>

        <div className="scs-actions">
          {nothingNamed && sections.length > 0 && (
            <span className="scs-hint">Give a prompt a name before saving.</span>
          )}
          {save.isError && <span className="scs-hint">Could not save. Try again.</span>}
          <button
            type="button"
            className="pk-btn-save"
            onClick={saveSections}
            disabled={!dirty || nothingNamed || save.isPending}
          >
            {save.isPending ? "Saving..." : "Save prompts"}
          </button>
        </div>
      </section>
    </div>
  );
}

function SettingsStyle() {
  return (
    <style>{`
      .pk-kit .scs { display: flex; flex-direction: column; gap: 16px; }
      .pk-kit .scs-card { padding: 18px 20px; }
      .pk-kit .scs-lede { font-size: 12.5px; color: var(--text-muted); margin: 4px 0 14px; line-height: 1.55; max-width: 62ch; }

      .pk-kit .scs-cals { display: flex; flex-direction: column; gap: 8px; }
      .pk-kit .scs-cal {
        display: flex; align-items: center; gap: 10px; cursor: pointer;
        border: 1.5px solid var(--border); background: var(--surface-2);
        border-radius: 12px; padding: 11px 14px;
      }
      .pk-kit .scs-cal.on { border-color: var(--brand-text); background: var(--brand-tint); }
      .pk-kit .scs-cal-n { font-size: 13.5px; font-weight: 600; }

      .pk-kit .scs-warn {
        display: flex; align-items: flex-start; gap: 7px; font-size: 11.5px;
        color: var(--text-faint); margin-top: 11px; line-height: 1.55; max-width: 62ch;
      }
      .pk-kit .scs-warn svg { flex-shrink: 0; margin-top: 2px; }
      .pk-kit .scs-unset { font-size: 12px; color: var(--warning, #b45309); margin-top: 10px; }

      .pk-kit .scs-sections { display: flex; flex-direction: column; gap: 8px; }
      .pk-kit .scs-row { display: flex; align-items: center; gap: 8px; }
      .pk-kit .scs-grip { color: var(--text-faint); display: flex; }
      .pk-kit .scs-row .pk-input { flex: 1; }
      .pk-kit .scs-rowbtns { display: flex; gap: 3px; }
      .pk-kit .scs-rowbtns button {
        border: 0; background: transparent; color: var(--text-faint); cursor: pointer;
        padding: 6px 8px; border-radius: 8px; font: inherit; font-size: 13px;
        display: inline-flex; align-items: center;
      }
      .pk-kit .scs-rowbtns button:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }
      .pk-kit .scs-rowbtns button:disabled { opacity: .3; cursor: not-allowed; }
      .pk-kit .scs-rowbtns button.danger:hover { color: var(--danger); background: var(--danger-tint); }

      .pk-kit .scs-add {
        display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent;
        color: var(--brand-text); font-family: inherit; font-weight: 600; font-size: 12.5px;
        padding: 10px 0; cursor: pointer;
      }

      .pk-kit .scs-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 8px; }
      .pk-kit .scs-hint { font-size: 12px; color: var(--text-faint); }
    `}</style>
  );
}
