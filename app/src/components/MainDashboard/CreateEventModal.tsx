import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/tauri";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional default date (YYYY-MM-DD); falls back to today. */
  defaultDate?: Date;
  onCreated: () => void;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Build an RFC3339 string for the local TZ from a YYYY-MM-DD date + HH:MM time. */
function toRfc3339Local(dateStr: string, timeStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  const dt = new Date(y, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, 0, 0);
  const offsetMin = -dt.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return `${dateStr}T${timeStr}:00${offset}`;
}

export function CreateEventModal({ open, onClose, defaultDate, onCreated }: Props) {
  const today = useMemo(() => new Date(), []);
  const initialDate = defaultDate ?? today;

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => ymd(initialDate));
  const [endDate, setEndDate] = useState(() => ymd(initialDate));
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const d = defaultDate ?? new Date();
    setTitle("");
    setDate(ymd(d));
    setEndDate(ymd(d));
    setStart("09:00");
    setEnd("10:00");
    setAllDay(false);
    setDescription("");
    setError(null);
    setSaving(false);
  }, [open, defaultDate]);

  if (!open) return null;

  async function handleSave() {
    if (saving) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      let startIso: string;
      let endIso: string;
      if (allDay) {
        startIso = `${date}T00:00:00+00:00`;
        // Google expects exclusive end-date for all-day events.
        const [y, m, d] = endDate.split("-").map(Number);
        const next = new Date(y, (m ?? 1) - 1, (d ?? 1) + 1);
        endIso = `${ymd(next)}T00:00:00+00:00`;
      } else {
        startIso = toRfc3339Local(date, start);
        endIso = toRfc3339Local(date, end);
        if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
          setError("End time must be after start time.");
          setSaving(false);
          return;
        }
      }
      await api.googleCalendarCreateEvent({
        title: trimmedTitle,
        startIso,
        endIso,
        description: description.trim() || null,
        allDay,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div
      className="md-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="md-modal-card" role="dialog" aria-modal="true">
        <div className="md-modal-title">New calendar block</div>

        <label className="md-modal-label">Title</label>
        <input
          type="text"
          className="md-modal-input"
          placeholder="Deep work — outreach"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
          autoFocus
        />

        <label className="md-modal-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            disabled={saving}
          />
          All day
        </label>

        {allDay ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="md-modal-label">Start date</label>
              <input
                type="date"
                className="md-modal-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <label className="md-modal-label">End date</label>
              <input
                type="date"
                className="md-modal-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
        ) : (
          <>
            <label className="md-modal-label">Date</label>
            <input
              type="date"
              className="md-modal-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={saving}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="md-modal-label">Start</label>
                <input
                  type="time"
                  className="md-modal-input"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="md-modal-label">End</label>
                <input
                  type="time"
                  className="md-modal-input"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
          </>
        )}

        <label className="md-modal-label">Notes (optional)</label>
        <textarea
          className="md-modal-input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={saving}
          placeholder="Anything you want on the event description"
        />

        <div className="md-modal-actions">
          <button type="button" className="md-modal-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="md-modal-save" onClick={handleSave} disabled={saving}>
            {saving ? "Creating…" : "Create block"}
          </button>
        </div>
        {error ? <div className="md-modal-error">{error}</div> : null}
      </div>
    </div>
  );
}
