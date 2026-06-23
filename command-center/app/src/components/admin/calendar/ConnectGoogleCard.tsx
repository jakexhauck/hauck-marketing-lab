import { CalendarCheck, Link2, Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../../lib/api";

export default function ConnectGoogleCard({
  connected,
  email,
  onChange,
}: {
  connected: boolean;
  email: string | null;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const disconnect = async () => {
    setBusy(true);
    try {
      await api("/api/admin/calendar/disconnect", { method: "POST" });
      onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 shadow-[var(--shadow-sm)]">
      <span className="grid h-9 w-9 place-items-center rounded-[var(--radius)] bg-brand-tint text-brand-text">
        <CalendarCheck size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-text">
          {connected ? "Google Calendar connected" : "Google Calendar (optional)"}
        </div>
        <div className="truncate text-[12.5px] text-muted">
          {connected
            ? `Blocks sync to ${email ?? "your Google account"}. Your Google events show below.`
            : "Connect to mirror blocks to your phone and see your Google events here."}
        </div>
      </div>
      {connected ? (
        <button
          onClick={() => void disconnect()}
          disabled={busy}
          className="flex items-center gap-2 rounded-[var(--radius)] border border-border px-3 py-2 text-[13px] font-semibold text-muted transition-colors hover:bg-danger-tint hover:text-danger disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : null} Disconnect
        </button>
      ) : (
        <a
          href="/api/admin/calendar/oauth/start"
          className="flex items-center gap-2 rounded-[var(--radius)] bg-brand px-3 py-2 text-[13px] font-semibold text-brand-fg transition-opacity hover:opacity-90"
        >
          <Link2 size={15} /> Connect Google Calendar
        </a>
      )}
    </div>
  );
}
