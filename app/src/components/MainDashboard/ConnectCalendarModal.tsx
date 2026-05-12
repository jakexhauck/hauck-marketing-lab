import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (apiKey: string, calendarId: string, label: string) => Promise<void>;
}

export function ConnectCalendarModal({ open, onClose, onSave }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [label, setLabel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setApiKey("");
      setCalendarId("");
      setLabel("");
      setShowKey(false);
      setError(null);
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleSave() {
    if (saving) return;
    setError(null);
    const trimmedKey = apiKey.trim();
    const trimmedId = calendarId.trim();
    if (!trimmedKey) {
      setError("API key is required.");
      return;
    }
    if (!trimmedId || !trimmedId.includes("@")) {
      setError("Calendar ID must look like your-email@gmail.com or xxxxx@group.calendar.google.com");
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmedKey, trimmedId, label.trim() || "Google Calendar");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  return (
    <div
      className="md-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="md-modal-card" role="dialog" aria-modal="true">
        <div className="md-modal-title">Connect Google Calendar</div>
        <p className="md-modal-help">
          Enable the Google Calendar API in Google Cloud Console, create an API key restricted to
          Calendar API, then make the target calendar public (Settings → Access permissions → See
          all event details). Paste your API key and Calendar ID below.{" "}
          <button
            type="button"
            className="md-modal-link-chip"
            onClick={() =>
              window.open("https://console.cloud.google.com/apis/credentials", "_blank")
            }
          >
            Open Google Cloud Console ↗
          </button>
        </p>
        <label className="md-modal-label">API Key</label>
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <input
            type={showKey ? "text" : "password"}
            className="md-modal-input"
            placeholder="AIza..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={saving}
            autoFocus
            spellCheck={false}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="md-modal-cancel"
            onClick={() => setShowKey((v) => !v)}
            disabled={saving}
            style={{ flexShrink: 0 }}
          >
            {showKey ? "hide" : "show"}
          </button>
        </div>
        <label className="md-modal-label">Calendar ID</label>
        <input
          type="text"
          className="md-modal-input"
          placeholder="your-email@gmail.com or xxxxx@group.calendar.google.com"
          value={calendarId}
          onChange={(e) => setCalendarId(e.target.value)}
          disabled={saving}
          spellCheck={false}
        />
        <label className="md-modal-label">Label (optional)</label>
        <input
          type="text"
          className="md-modal-input"
          placeholder="Google Calendar"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={saving}
        />
        <div className="md-modal-actions">
          <button
            type="button"
            className="md-modal-cancel"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="md-modal-save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Connecting…" : "Save"}
          </button>
        </div>
        {error ? <div className="md-modal-error">{error}</div> : null}
      </div>
    </div>
  );
}
