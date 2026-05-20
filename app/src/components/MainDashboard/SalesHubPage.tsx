// Sales Hub — read-only kanban of the GoHighLevel pipeline the user has
// designated as their sales pipeline. Choice is stored per-machine in
// the GHL config and re-pickable from the page itself.
//
// On top of the pipeline mirror, the Sales Hub also owns the **booking
// calendar** picker. Picking a GHL calendar here arms `ghlCalendarSync`,
// which polls GHL → advances the matching opportunity to "Call Booked",
// pushes the event to Google Calendar, and persists a row in
// `ops/appointments.json`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/tauri";
import type {
  GhlCalendar,
  GhlConfigStatus,
  OpsAppointmentRow,
} from "../../lib/types";
import {
  runSync as runGhlCalendarSync,
  SYNC_EVENT as GHL_SYNC_EVENT,
  type SyncSummary,
} from "../../lib/ghlCalendarSync";
import { PipelineHubPage } from "./PipelineHubPage";

interface SalesHubPageProps {
  root: string | null;
}

export function SalesHubPage({ root }: SalesHubPageProps) {
  const appointmentsByOpp = useAppointmentsByOpportunity(root);
  return (
    <div>
      <BookingCalendarBanner root={root} />
      <PipelineHubPage
        hubKey="sales"
        title="Sales Hub"
        subtitle="Live mirror of your GoHighLevel sales pipeline. New bookings auto-advance to Call Booked."
        appointmentsByOpportunityId={appointmentsByOpp}
      />
    </div>
  );
}

/** Polls ops/appointments.json on a tight interval so kanban badges stay
 *  current even when the sync runs in the background. Local file read, so
 *  the 15s interval is cheap. */
function useAppointmentsByOpportunity(
  root: string | null,
): Map<string, OpsAppointmentRow> {
  const [map, setMap] = useState<Map<string, OpsAppointmentRow>>(new Map());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!root) {
      setMap(new Map());
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const file = await api.readOpsAppointments(root);
        if (cancelled || !mountedRef.current) return;
        const next = new Map<string, OpsAppointmentRow>();
        for (const row of Object.values(file.appointments)) {
          if (row.opportunityId) next.set(row.opportunityId, row);
        }
        setMap(next);
      } catch {
        if (!cancelled && mountedRef.current) setMap(new Map());
      }
    };
    void load();
    const t = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [root]);

  return useMemo(() => map, [map]);
}

type BannerState =
  | { kind: "loading" }
  | { kind: "unconfigured" }
  | {
      kind: "ready";
      calendars: GhlCalendar[];
      selectedId: string | null;
      saving: boolean;
      pickerOpen: boolean;
    }
  | { kind: "error"; message: string };

function BookingCalendarBanner({ root }: { root: string | null }) {
  const [state, setState] = useState<BannerState>({ kind: "loading" });
  const [lastSync, setLastSync] = useState<SyncSummary | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [manualBusy, setManualBusy] = useState(false);

  // Mirror the background sync's last result so the banner can surface
  // "Up to date · N appts" or any errors the swallowed tick wrapper hid.
  useEffect(() => {
    const onSync = (ev: Event) => {
      const detail = (ev as CustomEvent<SyncSummary>).detail;
      if (!detail) return;
      setLastSync(detail);
      setLastSyncAt(new Date());
    };
    window.addEventListener(GHL_SYNC_EVENT, onSync);
    return () => window.removeEventListener(GHL_SYNC_EVENT, onSync);
  }, []);

  const runManualSync = useCallback(async () => {
    if (!root || manualBusy) return;
    setManualBusy(true);
    try {
      const summary = await runGhlCalendarSync(root);
      // Banner state isn't fed by the event-listener when the sync is a quiet
      // no-op (no changes, no errors), so push it here directly.
      setLastSync(summary);
      setLastSyncAt(new Date());
    } finally {
      setManualBusy(false);
    }
  }, [root, manualBusy]);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    let status: GhlConfigStatus;
    try {
      status = await api.ghlGetConfigStatus();
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (!status.configured) {
      setState({ kind: "unconfigured" });
      return;
    }
    try {
      const calendars = await api.ghlListCalendars();
      setState({
        kind: "ready",
        calendars,
        selectedId: status.bookingCalendarId ?? null,
        saving: false,
        pickerOpen: !status.bookingCalendarId,
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = useCallback(
    async (calendarId: string | null) => {
      setState((s) => (s.kind === "ready" ? { ...s, saving: true } : s));
      try {
        await api.ghlSetBookingCalendar(calendarId);
        await load();
      } catch (err) {
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [load],
  );

  if (state.kind === "loading" || state.kind === "unconfigured") {
    // Loading is a flash; "unconfigured" is already messaged by the kanban
    // below ("Not connected to GoHighLevel"). No need for a second banner.
    return null;
  }

  if (state.kind === "error") {
    return (
      <div
        style={{
          margin: "16px 24px 0",
          padding: "10px 14px",
          fontSize: 12,
          color: "var(--text-faint)",
          border: "1px dashed var(--border)",
          borderRadius: 8,
        }}
      >
        Booking calendar setup failed — {state.message}.{" "}
        <button
          type="button"
          onClick={() => void load()}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text)",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const { calendars, selectedId, saving, pickerOpen } = state;
  const selected = calendars.find((c) => c.id === selectedId) ?? null;

  // Picker mode: no calendar locked in yet, or user clicked Change.
  if (pickerOpen) {
    return (
      <section
        style={{
          margin: "16px 24px 0",
          padding: "12px 16px",
          borderRadius: 10,
          background: "var(--panel-bg, #0f1117)",
          border: "1px solid var(--border)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 12.5, letterSpacing: "0.04em" }}>
            <span style={{ opacity: 0.6, marginRight: 6 }}>BOOKING CALENDAR</span>
            <span style={{ fontWeight: 600 }}>
              {selected ? `Currently: ${selected.name}` : "Pick a GHL calendar to auto-sync"}
            </span>
          </div>
          {selected && (
            <button
              type="button"
              onClick={() => {
                if (state.kind === "ready")
                  setState({ ...state, pickerOpen: false });
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-faint)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Cancel
            </button>
          )}
        </header>
        {calendars.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
            No calendars found in your GHL location. Create one in GoHighLevel
            (Settings → Calendars), then{" "}
            <button
              type="button"
              onClick={() => void load()}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text)",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              refresh
            </button>
            .
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 8,
            }}
          >
            {calendars.map((c) => {
              const isCurrent = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={saving}
                  onClick={() => void choose(c.id)}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `1px solid ${isCurrent ? "var(--accent, #7aa2f7)" : "var(--border)"}`,
                    background: isCurrent
                      ? "rgba(122, 162, 247, 0.08)"
                      : "transparent",
                    color: "var(--text)",
                    cursor: saving ? "wait" : "pointer",
                    fontSize: 12.5,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-faint)",
                      marginTop: 4,
                    }}
                  >
                    {c.calendarType ?? "calendar"} ·{" "}
                    {c.isActive === false ? "inactive" : "active"}
                    {isCurrent ? " · current" : ""}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {selected && (
          <button
            type="button"
            onClick={() => void choose(null)}
            disabled={saving}
            style={{
              marginTop: 10,
              background: "transparent",
              border: "none",
              color: "var(--text-faint)",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            Clear selection (pause auto-sync)
          </button>
        )}
      </section>
    );
  }

  // Collapsed mode: just show the current selection + a Change link.
  const syncStatusColor = lastSync
    ? lastSync.ok
      ? "var(--text-faint)"
      : "var(--hml-red, #f7768e)"
    : "var(--text-faint)";
  const syncStatusText = manualBusy
    ? "Syncing…"
    : lastSync
      ? lastSync.ok
        ? `Last sync · ${formatSyncTime(lastSyncAt)} · ${lastSync.message}`
        : `Sync failed · ${lastSync.errors[0] ?? lastSync.message}`
      : "Auto-syncs every 90s while open.";

  return (
    <section
      style={{
        margin: "16px 24px 0",
        padding: "10px 16px",
        borderRadius: 10,
        background: "var(--panel-bg, #0f1117)",
        border: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 12.5,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div>
          <span style={{ opacity: 0.6, marginRight: 8, letterSpacing: "0.04em" }}>
            📅 BOOKING CALENDAR
          </span>
          <span style={{ fontWeight: 600 }}>
            {selected?.name ?? "(none)"}
          </span>
          <span style={{ opacity: 0.55, marginLeft: 10 }}>
            New bookings auto-advance to{" "}
            <span style={{ fontWeight: 600 }}>Call Booked</span>.
          </span>
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            color: syncStatusColor,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={syncStatusText}
        >
          {syncStatusText}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => void runManualSync()}
          disabled={manualBusy || !root}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text)",
            cursor: manualBusy || !root ? "wait" : "pointer",
            fontSize: 11.5,
            padding: "4px 10px",
          }}
          title="Pull the latest from GoHighLevel now"
        >
          {manualBusy ? "Syncing…" : "Sync now"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (state.kind === "ready") setState({ ...state, pickerOpen: true });
          }}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text)",
            cursor: "pointer",
            fontSize: 11.5,
            padding: "4px 10px",
          }}
        >
          Change
        </button>
      </div>
    </section>
  );
}

function formatSyncTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
