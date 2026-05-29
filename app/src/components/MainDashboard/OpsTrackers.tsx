import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../../lib/tauri";
import type {
  ClientEntry,
  OpsClientRow,
  OpsClientsFile,
  OpsRevenueFile,
  OpsRevenueRow,
  OpsTask,
  OpsTaskLane,
  OpsTasksFile,
} from "../../lib/types";
import { IconFolder, IconGrip, IconMore, IconPlus } from "../icons";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";

interface PageProps {
  root: string | null;
  clients: ClientEntry[];
}

export function ClientsTrackerPage({ root, clients }: PageProps) {
  return (
    <TrackerPageShell
      eyebrow="Workspace"
      title="Client Dashboard"
      subtitle="Retainer, ad spend, and the next thing due for every client."
      root={root}
    >
      {(r) => <ClientsTracker root={r} clients={clients} />}
    </TrackerPageShell>
  );
}

export function TasksTrackerPage({ root, clients }: PageProps) {
  return (
    <TrackerPageShell
      eyebrow="Workspace"
      title="Task Tracker"
      subtitle="What you and the VA are working on, and what's due next."
      root={root}
    >
      {(r) => <TasksTracker root={r} clients={clients} />}
    </TrackerPageShell>
  );
}

export function RevenueTrackerPage({ root, clients }: PageProps) {
  return (
    <TrackerPageShell
      eyebrow="Workspace"
      title="Revenue"
      subtitle="Monthly revenue, expenses, and net. Stripe wiring lands here later."
      root={root}
    >
      {(r) => <RevenueTracker root={r} clients={clients} />}
    </TrackerPageShell>
  );
}

function TrackerPageShell({
  eyebrow,
  title,
  subtitle,
  root,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  root: string | null;
  children: (root: string) => ReactNode;
}) {
  return (
    <div className="hml-content">
      <section className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <span className="hml-eyebrow-dot" />
            {eyebrow}
          </div>
          <h1 className="hml-page-title">{title}</h1>
          <div className="hml-page-subtitle">{subtitle}</div>
        </div>
      </section>
      <section className="hml-panel ops-panel ops-page-panel">
        <div className="hml-panel-body ops-body">
          {root ? (
            children(root)
          ) : (
            <div className="hml-empty">
              <div className="hml-empty-title">No folder selected</div>
              <div className="hml-empty-sub">
                Pick a media-buying folder in Settings to load the tracker.
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── shared hooks ────────────────────────────────────────────

/**
 * Loads `file` once, then writes back any local mutations after `debounceMs`
 * of inactivity. Caller mutates via `setFile(next)` and the hook handles
 * persistence + cancellation on unmount.
 */
function usePersistedFile<T>(
  load: () => Promise<T>,
  write: (next: T) => Promise<void>,
  empty: T,
  debounceMs = 400,
): [T, (next: T) => void, boolean] {
  const [file, setFileState] = useState<T>(empty);
  const [loaded, setLoaded] = useState(false);
  // Prevents the first auto-save from firing on the loaded snapshot itself.
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const latestRef = useRef<T>(empty);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await load();
        if (cancelled) return;
        setFileState(next);
        latestRef.current = next;
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFile = useCallback(
    (next: T) => {
      dirtyRef.current = true;
      latestRef.current = next;
      setFileState(next);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void write(latestRef.current).catch((err) => {
          // eslint-disable-next-line no-console
          console.error("ops persist failed", err);
        });
      }, debounceMs);
    },
    [write, debounceMs],
  );

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      // Flush any pending change so we don't lose the tail edit on unmount.
      if (dirtyRef.current) {
        void write(latestRef.current).catch(() => undefined);
      }
    },
    [write],
  );

  return [file, setFile, loaded];
}

// ─── Client Dashboard ────────────────────────────────────────

function ClientsTracker({
  root,
  clients,
}: {
  root: string;
  clients: ClientEntry[];
}) {
  const load = useCallback(() => api.readOpsClients(root), [root]);
  const write = useCallback(
    (next: OpsClientsFile) => api.writeOpsClients(root, next),
    [root],
  );
  const [file, setFile, loaded] = usePersistedFile<OpsClientsFile>(
    load,
    write,
    { rows: {} },
  );
  const [showPaused, setShowPaused] = useState(false);

  const updateRow = useCallback(
    (slug: string, patch: Partial<OpsClientRow>) => {
      const prev = file.rows[slug] ?? {};
      setFile({ rows: { ...file.rows, [slug]: { ...prev, ...patch } } });
    },
    [file, setFile],
  );

  const live = useMemo(
    () => clients.filter((c) => c.status === "live"),
    [clients],
  );
  const pre = useMemo(
    () => clients.filter((c) => c.status === "pre-launch"),
    [clients],
  );
  const paused = useMemo(
    () => clients.filter((c) => c.status === "paused"),
    [clients],
  );

  const totals = useMemo(() => {
    let mrr = 0;
    let spend = 0;
    for (const c of live) {
      const r = file.rows[c.slug] ?? {};
      mrr += r.retainer ?? 0;
      spend += r.adSpend ?? 0;
    }
    return { mrr, spend };
  }, [live, file.rows]);

  if (!loaded) return <div className="ops-loading">Loading…</div>;

  if (clients.length === 0) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-title">No clients yet</div>
        <div className="hml-empty-sub">
          Add a client from the sidebar and they'll show up here.
        </div>
      </div>
    );
  }

  return (
    <div className="pc-sections">
      <style>{PC_CSS}</style>

      <ClientSection
        eyebrow="Live · generating"
        accent="var(--signal-go)"
        title={`${live.length} active client${live.length === 1 ? "" : "s"}`}
        summary={
          live.length > 0
            ? `${formatMoney(totals.mrr)} MRR · ${formatMoney(totals.spend)} ad spend`
            : undefined
        }
        emptyLabel="No live clients yet."
        clients={live}
        rows={file.rows}
        updateRow={updateRow}
      />

      <ClientSection
        eyebrow="Pre-launch"
        accent="var(--copper)"
        title={`${pre.length} onboarding in progress`}
        emptyLabel="Nobody in onboarding right now."
        clients={pre}
        rows={file.rows}
        updateRow={updateRow}
      />

      {paused.length > 0 && (
        <section className="pc-section">
          <button
            type="button"
            className="pc-section-head pc-section-collapsible"
            onClick={() => setShowPaused((p) => !p)}
          >
            <div>
              <div className="pc-section-eyebrow">
                <span
                  className="hml-eyebrow-dot"
                  style={{ background: "var(--text-faint)" }}
                />
                Paused · {paused.length}
              </div>
            </div>
            <span className="pc-toggle">{showPaused ? "Hide" : "Show"}</span>
          </button>
          {showPaused && (
            <div className="pc-rows">
              {paused.map((c) => (
                <ClientRow
                  key={c.slug}
                  client={c}
                  row={file.rows[c.slug] ?? {}}
                  updateRow={updateRow}
                  dimmed
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ─── section + row components ──────────────────────────────

function ClientSection({
  eyebrow,
  accent,
  title,
  summary,
  emptyLabel,
  clients,
  rows,
  updateRow,
}: {
  eyebrow: string;
  accent: string;
  title: string;
  summary?: string;
  emptyLabel: string;
  clients: ClientEntry[];
  rows: Record<string, OpsClientRow>;
  updateRow: (slug: string, patch: Partial<OpsClientRow>) => void;
}) {
  return (
    <section className="pc-section">
      <header className="pc-section-head">
        <div>
          <div className="pc-section-eyebrow">
            <span className="hml-eyebrow-dot" style={{ background: accent }} />
            {eyebrow}
          </div>
          <h2 className="pc-section-title">{title}</h2>
        </div>
        {summary && <div className="pc-section-summary">{summary}</div>}
      </header>
      <div className="pc-rows">
        {clients.length === 0 ? (
          <div className="pc-section-empty">{emptyLabel}</div>
        ) : (
          clients.map((c) => (
            <ClientRow
              key={c.slug}
              client={c}
              row={rows[c.slug] ?? {}}
              updateRow={updateRow}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ClientRow({
  client,
  row,
  updateRow,
  dimmed,
}: {
  client: ClientEntry;
  row: OpsClientRow;
  updateRow: (slug: string, patch: Partial<OpsClientRow>) => void;
  dimmed?: boolean;
}) {
  const meta = pillMeta(client.status);
  const weekly = computeWeeklyDue(row.adsLaunchedAt, row.weeklyReportSentAt);
  const monthly = computeMonthlyDue(row.adsLaunchedAt, row.monthlyReportSentAt);
  const today = todayYMD();

  const markWeeklySent = () => {
    updateRow(client.slug, { weeklyReportSentAt: today });
  };
  const markMonthlySent = () => {
    updateRow(client.slug, { monthlyReportSentAt: today });
  };

  return (
    <div className={`pc-row${dimmed ? " pc-row-dim" : ""}`}>
      <div className="pc-row-stripe" style={{ background: meta.accent }} />

      <div className="pc-row-id">
        <div className="pc-avatar">{avatarChar(client.name)}</div>
        <div className="pc-row-id-text">
          <div className="pc-row-name">{client.name}</div>
          <span className={`hml-pill ${meta.cls}`}>
            <span className="hml-pill-dot" />
            {meta.label}
          </span>
        </div>
      </div>

      <div className="pc-row-metrics">
        <FieldStack label="Retainer">
          <MoneyInput
            value={row.retainer ?? null}
            onChange={(v) => updateRow(client.slug, { retainer: v })}
          />
        </FieldStack>
        <FieldStack label="Ad spend">
          <MoneyInput
            value={row.adSpend ?? null}
            onChange={(v) => updateRow(client.slug, { adSpend: v })}
          />
        </FieldStack>
        <FieldStack label="Launched">
          <input
            type="date"
            className="pc-input pc-input-date"
            value={row.adsLaunchedAt ?? ""}
            onChange={(e) =>
              updateRow(client.slug, {
                adsLaunchedAt: e.target.value || null,
              })
            }
          />
        </FieldStack>
      </div>

      <div className="pc-row-reports">
        <ReportCell
          badge="W"
          tone="copper"
          label="Weekly due"
          dueDate={weekly}
          today={today}
          onMarkSent={markWeeklySent}
          disabled={!row.adsLaunchedAt}
        />
        <ReportCell
          badge="M"
          tone="muted"
          label="Monthly due"
          dueDate={monthly}
          today={today}
          onMarkSent={markMonthlySent}
          disabled={!row.adsLaunchedAt}
        />
      </div>

      <div className="pc-row-call">
        <FieldStack label="Next call">
          <input
            type="date"
            className="pc-input pc-input-date pc-input-call"
            value={row.nextCall ?? ""}
            onChange={(e) =>
              updateRow(client.slug, {
                nextCall: e.target.value || null,
                // Clear any GCal binding when the date is hand-edited so we
                // don't claim a calendar event we no longer match.
                nextCallEventId: row.nextCallEventId ? null : undefined,
              })
            }
          />
        </FieldStack>
      </div>

      <div className="pc-row-actions">
        {client.drive_folder_url && (
          <a
            href={client.drive_folder_url}
            target="_blank"
            rel="noreferrer"
            className="hml-btn"
            title="Open Drive folder"
          >
            <IconFolder size={12} />
            Drive
          </a>
        )}
        <button type="button" className="hml-icon-btn" aria-label="More">
          <IconMore size={14} />
        </button>
      </div>

      <div className="pc-row-notes">
        <input
          type="text"
          className="pc-input pc-input-notes"
          placeholder="Add a note…"
          value={row.notes ?? ""}
          onChange={(e) =>
            updateRow(client.slug, { notes: e.target.value || null })
          }
        />
      </div>
    </div>
  );
}

function FieldStack({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pc-field">
      <div className="pc-field-label">{label}</div>
      {children}
    </div>
  );
}

function ReportCell({
  badge,
  tone,
  label,
  dueDate,
  today,
  onMarkSent,
  disabled,
}: {
  badge: string;
  tone: "copper" | "muted";
  label: string;
  dueDate: string | null;
  today: string;
  onMarkSent: () => void;
  disabled?: boolean;
}) {
  const overdue = !!dueDate && dueDate < today;
  const dueSoon = !!dueDate && !overdue && daysBetween(today, dueDate) <= 2;

  return (
    <div
      className={`pc-report${overdue ? " pc-report-overdue" : ""}${
        dueSoon ? " pc-report-soon" : ""
      }${disabled ? " pc-report-disabled" : ""}`}
    >
      <button
        type="button"
        className="pc-report-check"
        onClick={onMarkSent}
        disabled={disabled || !dueDate}
        title={disabled ? "Set an ads-launch date to start the cadence." : "Mark sent"}
      >
        <span
          className={`pc-badge${tone === "copper" ? " pc-badge-copper" : ""}`}
        >
          {badge}
        </span>
      </button>
      <div className="pc-report-body">
        <div className="pc-report-label">{label}</div>
        <div className="pc-report-date">
          {dueDate
            ? formatDueDate(dueDate)
            : disabled
              ? "Awaiting launch"
              : "—"}
          {overdue && <span className="pc-overdue-flag">overdue</span>}
        </div>
      </div>
    </div>
  );
}

// ─── pure helpers ──────────────────────────────────────────

function pillMeta(status: ClientEntry["status"]) {
  if (status === "live")
    return { cls: "hml-green", label: "Live", accent: "var(--signal-go)" };
  if (status === "pre-launch")
    return { cls: "hml-amber", label: "Pre-launch", accent: "var(--copper)" };
  return { cls: "hml-neutral", label: "Paused", accent: "var(--text-faint)" };
}

function avatarChar(name: string): string {
  return name.charAt(0).toUpperCase() || "•";
}

function daysBetween(fromYMD: string, toYMD: string): number {
  const a = new Date(fromYMD + "T00:00:00");
  const b = new Date(toYMD + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function addDaysYMD(ymd: string, days: number): string {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addMonthsYMD(ymd: string, months: number): string {
  const d = new Date(ymd + "T00:00:00");
  const target = d.getMonth() + months;
  d.setMonth(target);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Next weekly report due: 7d after the most recent sent-or-launched date. */
export function computeWeeklyDue(
  launched: string | null | undefined,
  sentAt: string | null | undefined,
): string | null {
  if (!launched) return null;
  const base = sentAt || launched;
  return addDaysYMD(base, 7);
}

/** Next monthly report due: 1mo after the most recent sent-or-launched date. */
export function computeMonthlyDue(
  launched: string | null | undefined,
  sentAt: string | null | undefined,
): string | null {
  if (!launched) return null;
  const base = sentAt || launched;
  return addMonthsYMD(base, 1);
}

function formatDueDate(ymd: string): string {
  const d = new Date(ymd + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const PC_CSS = `
.pc-sections {
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding: 20px 22px 24px;
}
.pc-section { display: flex; flex-direction: column; }
.pc-section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
}
.pc-section-collapsible {
  background: none;
  border: none;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
  width: 100%;
  cursor: pointer;
  font-family: inherit;
  color: inherit;
  text-align: left;
  align-items: center;
  padding: 0 0 12px 0;
}
.pc-section-collapsible:hover .pc-toggle { color: var(--copper, #b478ff); }
.pc-section-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-faint, #6a6a76);
  margin-bottom: 6px;
}
.pc-section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text, #ececf0);
  letter-spacing: -0.005em;
  margin: 0;
}
.pc-section-summary {
  font-size: 12.5px;
  color: var(--text-muted, #9c9ca8);
  font-variant-numeric: tabular-nums;
  font-family: var(--mono);
}
.pc-toggle {
  font-size: 11.5px;
  color: var(--text-faint, #6a6a76);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.pc-section-empty {
  padding: 18px 22px;
  font-size: 12.5px;
  color: var(--text-faint, #6a6a76);
  background: rgba(255,255,255,0.015);
  border: 1px dashed var(--border, rgba(255,255,255,0.06));
  border-radius: 10px;
}

.pc-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pc-row {
  position: relative;
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr) 280px 120px 84px;
  grid-template-areas:
    "id metrics reports call actions"
    "notes notes notes notes notes";
  column-gap: 18px;
  row-gap: 10px;
  align-items: center;
  background: var(--bg-surface, #131318);
  border: 1px solid var(--border, rgba(255,255,255,0.06));
  border-radius: 10px;
  padding: 14px 18px 12px 22px;
  transition: border-color 140ms ease;
}
.pc-row:hover { border-color: rgba(180, 120, 255, 0.18); }
.pc-row-dim { opacity: 0.62; }
.pc-row-dim:hover { opacity: 1; }
.pc-row-stripe {
  position: absolute;
  left: 0; top: 12px; bottom: 12px;
  width: 3px;
  border-radius: 2px;
}

.pc-row-id { grid-area: id; display: flex; align-items: center; gap: 12px; min-width: 0; }
.pc-row-id-text { min-width: 0; }
.pc-row-name {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--text, #ececf0);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-avatar {
  width: 40px;
  height: 40px;
  border-radius: 9px;
  background: linear-gradient(135deg, rgba(180,120,255,0.18), rgba(180,120,255,0.04));
  border: 1px solid rgba(180, 120, 255, 0.22);
  color: var(--copper, #b478ff);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  flex-shrink: 0;
}

.pc-row-metrics {
  grid-area: metrics;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  min-width: 0;
}
.pc-row-reports {
  grid-area: reports;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
}
.pc-row-call { grid-area: call; min-width: 0; }
.pc-row-actions {
  grid-area: actions;
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}
.pc-row-notes {
  grid-area: notes;
  margin-top: 2px;
  padding-top: 10px;
  border-top: 1px dashed var(--border, rgba(255,255,255,0.05));
}

.pc-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pc-field-label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint, #6a6a76);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pc-input {
  background: rgba(255,255,255,0.02);
  border: 1px solid transparent;
  color: var(--text, #ececf0);
  font-family: inherit;
  font-size: 13px;
  padding: 5px 8px;
  border-radius: 5px;
  width: 100%;
  outline: none;
  transition: background 120ms ease, border-color 120ms ease;
  font-variant-numeric: tabular-nums;
}
.pc-input:hover { background: rgba(255,255,255,0.035); }
.pc-input:focus {
  background: rgba(255,255,255,0.04);
  border-color: rgba(180, 120, 255, 0.4);
}
.pc-input-date {
  font-family: var(--mono);
  font-size: 12px;
  color-scheme: dark;
  min-width: 0;
}
.pc-input-date::-webkit-inner-spin-button,
.pc-input-date::-webkit-clear-button {
  display: none;
  -webkit-appearance: none;
}
.pc-input-call::-webkit-calendar-picker-indicator {
  filter: invert(0.8) sepia(0.4) saturate(2) hue-rotate(2deg);
  cursor: pointer;
}
.pc-input-notes { font-size: 12.5px; color: var(--text-muted, #9c9ca8); }
.pc-input-notes::placeholder { color: var(--text-faint, #6a6a76); }

/* ── report cell ── */
.pc-report {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 6px 8px 6px 6px;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: border-color 120ms ease, background 120ms ease;
}
.pc-report:hover { background: rgba(255,255,255,0.02); }
.pc-report-overdue {
  border-color: rgba(196, 132, 123, 0.32);
  background: rgba(196, 132, 123, 0.06);
}
.pc-report-soon { border-color: rgba(180, 120, 255, 0.22); }
.pc-report-disabled { opacity: 0.5; }

.pc-report-check {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  border-radius: 5px;
  transition: background 120ms ease, transform 120ms ease;
}
.pc-report-check:hover:not(:disabled) {
  background: rgba(180, 120, 255, 0.12);
  transform: scale(1.05);
}
.pc-report-check:disabled { cursor: not-allowed; }

.pc-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 5px;
  border-radius: 4px;
  background: rgba(255,255,255,0.06);
  color: var(--text-faint, #6a6a76);
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.pc-badge-copper {
  background: rgba(180, 120, 255, 0.18);
  color: var(--copper, #b478ff);
}

.pc-report-body { min-width: 0; flex: 1; }
.pc-report-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint, #6a6a76);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pc-report-date {
  font-size: 12.5px;
  color: var(--text-mid, #c2c2cc);
  font-variant-numeric: tabular-nums;
  font-family: var(--mono);
  letter-spacing: 0.01em;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pc-overdue-flag {
  font-size: 9px;
  font-family: var(--sans);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--signal-stop, #c4847b);
}
.pc-report-overdue .pc-report-date { color: var(--signal-stop, #c4847b); }

/* Re-skin the existing ops MoneyInput inside the new row so it doesn't
   look like a fat form field. */
.pc-row .ops-money {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255,255,255,0.02);
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 4px 6px;
  transition: background 120ms ease, border-color 120ms ease;
}
.pc-row .ops-money:hover { background: rgba(255,255,255,0.035); }
.pc-row .ops-money:focus-within {
  background: rgba(255,255,255,0.04);
  border-color: rgba(180, 120, 255, 0.4);
}
.pc-row .ops-money-prefix {
  font-size: 12px;
  color: var(--text-faint, #6a6a76);
  font-family: var(--mono);
}
.pc-row .ops-money .ops-input {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 13px;
  color: var(--text, #ececf0);
  font-variant-numeric: tabular-nums;
  min-width: 0;
  width: 100%;
}
.pc-row .ops-money .ops-input:focus { outline: none; }
/* Kill native number-input spinners — they crowd the cell and look broken. */
.pc-row .ops-money .ops-input::-webkit-outer-spin-button,
.pc-row .ops-money .ops-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.pc-row .ops-money .ops-input[type="number"] {
  -moz-appearance: textfield;
  appearance: textfield;
}

@media (max-width: 1280px) {
  .pc-row {
    grid-template-columns: 200px minmax(0, 1fr) 230px;
    grid-template-areas:
      "id metrics reports"
      "id call    actions"
      "notes notes notes";
    column-gap: 18px;
  }
}
`;

// ─── Task Tracker ────────────────────────────────────────────

function laneOf(t: OpsTask): OpsTaskLane {
  return t.lane ?? "active";
}

function TasksTracker({
  root,
  clients,
}: {
  root: string;
  clients: ClientEntry[];
}) {
  const load = useCallback(() => api.readOpsTasks(root), [root]);
  const write = useCallback(
    (next: OpsTasksFile) => api.writeOpsTasks(root, next),
    [root],
  );
  const [file, setFile, loaded] = usePersistedFile<OpsTasksFile>(
    load,
    write,
    { tasks: [] },
  );

  const [lane, setLane] = useState<OpsTaskLane>("active");
  const todayStamp = todayYMD();
  const mondayStamp = mondayYMD();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverCat, setDragOverCat] = useState<string | null>(null);

  const knownSlugs = useMemo(
    () => new Set(clients.map((c) => c.slug)),
    [clients],
  );

  // Tasks with a clientSlug that no longer maps to a known client get folded
  // into Internal so they don't silently vanish.
  const categoryOf = useCallback(
    (t: OpsTask): string | null =>
      t.clientSlug && knownSlugs.has(t.clientSlug) ? t.clientSlug : null,
    [knownSlugs],
  );

  const categories = useMemo(
    () => [
      { slug: null as string | null, name: "Internal" },
      ...clients.map((c) => ({ slug: c.slug as string | null, name: c.name })),
    ],
    [clients],
  );

  /**
   * Moves `fromId` either before a target task or to the end of a category.
   * Cross-category moves update `clientSlug`; intra-category is a pure reorder.
   */
  const moveTask = (
    fromId: string,
    target:
      | { kind: "before-task"; id: string }
      | { kind: "into-category"; slug: string | null },
  ) => {
    const fromIdx = file.tasks.findIndex((t) => t.id === fromId);
    if (fromIdx < 0) return;
    const fromTask = file.tasks[fromIdx];
    const filtered = file.tasks.filter((_, i) => i !== fromIdx);

    let insertAt: number;
    let newSlug: string | null;

    if (target.kind === "before-task") {
      const refIdx = filtered.findIndex((t) => t.id === target.id);
      if (refIdx < 0) return;
      insertAt = refIdx;
      // Use the category we render the ref under (orphans → Internal),
      // not its raw stored slug.
      newSlug = categoryOf(filtered[refIdx]);
    } else {
      let lastIdxInCat = -1;
      filtered.forEach((t, i) => {
        if (laneOf(t) === lane && categoryOf(t) === target.slug) {
          lastIdxInCat = i;
        }
      });
      insertAt = lastIdxInCat >= 0 ? lastIdxInCat + 1 : filtered.length;
      newSlug = target.slug;
    }

    const updated: OpsTask = { ...fromTask, clientSlug: newSlug };
    const next = [...filtered];
    next.splice(insertAt, 0, updated);
    setFile({ tasks: next });
  };

  const updateTask = (id: string, patch: Partial<OpsTask>) => {
    setFile({
      tasks: file.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
  };

  const addTask = (clientSlug: string | null) => {
    const t: OpsTask = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: "",
      clientSlug,
      status: "todo",
      lane,
      createdAt: Date.now(),
      ...(lane === "weekly" ? { weeklyDay: 1 } : {}),
    };
    setFile({ tasks: [...file.tasks, t] });
  };

  const removeTask = (id: string) => {
    setFile({ tasks: file.tasks.filter((t) => t.id !== id) });
    setPendingDeleteId(null);
  };

  const requestDelete = (t: OpsTask) => {
    // Done tasks delete immediately. Anything still in flight opens the
    // confirm modal so a fat-finger doesn't nuke active work.
    if (t.status === "done") {
      removeTask(t.id);
      return;
    }
    setPendingDeleteId(t.id);
  };

  const cancelDelete = () => setPendingDeleteId(null);
  const pendingTask = file.tasks.find((t) => t.id === pendingDeleteId) ?? null;

  if (!loaded) return <div className="ops-loading">Loading…</div>;

  const activeCount = file.tasks.filter((t) => laneOf(t) === "active").length;
  const backburnerCount = file.tasks.filter((t) => laneOf(t) === "backburner").length;
  const dailyCount = file.tasks.filter((t) => laneOf(t) === "daily").length;
  const weeklyCount = file.tasks.filter((t) => laneOf(t) === "weekly").length;

  const tasksByCategory = new Map<string | null, OpsTask[]>();
  for (const cat of categories) tasksByCategory.set(cat.slug, []);
  for (const t of file.tasks) {
    if (laneOf(t) !== lane) continue;
    const slug = categoryOf(t);
    if (!tasksByCategory.has(slug)) tasksByCategory.set(slug, []);
    tasksByCategory.get(slug)!.push(t);
  }

  const catKey = (slug: string | null) => slug ?? "__internal__";

  return (
    <div className="ops-tasks">
      <style>{tasksTabsCSS}</style>

      <div className="ops-tabs" role="tablist" aria-label="Task lane">
        <button
          type="button"
          role="tab"
          aria-selected={lane === "active"}
          className={`ops-tab${lane === "active" ? " ops-tab-on" : ""}`}
          onClick={() => setLane("active")}
        >
          Active
          <span className="ops-tab-count">{activeCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={lane === "backburner"}
          className={`ops-tab${lane === "backburner" ? " ops-tab-on" : ""}`}
          onClick={() => setLane("backburner")}
        >
          Back burner
          <span className="ops-tab-count">{backburnerCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={lane === "daily"}
          className={`ops-tab${lane === "daily" ? " ops-tab-on" : ""}`}
          onClick={() => setLane("daily")}
        >
          Daily routine
          <span className="ops-tab-count">{dailyCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={lane === "weekly"}
          className={`ops-tab${lane === "weekly" ? " ops-tab-on" : ""}`}
          onClick={() => setLane("weekly")}
          title="Recurs every Monday"
        >
          Weekly routine
          <span className="ops-tab-count">{weeklyCount}</span>
        </button>
      </div>

      <div className="ops-cat-list">
        {(lane === "daily" || lane === "weekly"
          ? [
              {
                slug: null as string | null,
                name: lane === "daily" ? "Daily routine" : "Weekly routine",
                hideHeader: true,
              },
            ]
          : categories.map((c) => ({ ...c, hideHeader: false }))
        ).map((cat) => {
          const tasks =
            lane === "daily" || lane === "weekly"
              ? file.tasks.filter((t) => laneOf(t) === lane)
              : tasksByCategory.get(cat.slug) ?? [];
          const headerDropActive =
            !cat.hideHeader &&
            dragOverCat === catKey(cat.slug) &&
            dragId !== null;
          return (
            <section key={catKey(cat.slug)} className="ops-cat">
              {cat.hideHeader ? (
                <header className="ops-cat-header ops-cat-header-bare">
                  <button
                    type="button"
                    className="ops-cat-add"
                    onClick={() => addTask(null)}
                    title={lane === "weekly" ? "Add weekly task" : "Add daily task"}
                  >
                    <IconPlus size={11} /> Add task
                  </button>
                </header>
              ) : (
              <header
                className={`ops-cat-header${headerDropActive ? " ops-cat-header-drop" : ""}`}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  if (dragOverCat !== catKey(cat.slug)) {
                    setDragOverCat(catKey(cat.slug));
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) {
                    moveTask(dragId, {
                      kind: "into-category",
                      slug: cat.slug,
                    });
                  }
                  setDragId(null);
                  setDragOverId(null);
                  setDragOverCat(null);
                }}
                onDragLeave={() => {
                  if (dragOverCat === catKey(cat.slug)) setDragOverCat(null);
                }}
              >
                <span className="ops-cat-name">{cat.name}</span>
                <span className="ops-cat-count">{tasks.length}</span>
                <button
                  type="button"
                  className="ops-cat-add"
                  onClick={() => addTask(cat.slug)}
                  title={`Add task to ${cat.name}`}
                >
                  <IconPlus size={11} /> Add task
                </button>
              </header>
              )}
              {tasks.length === 0 ? (
                <div className="ops-cat-empty">No tasks here yet.</div>
              ) : (
                <table className="ops-table ops-cat-table">
                  <colgroup>
                    <col style={{ width: 24 }} />
                    <col style={{ width: 36 }} />
                    <col />
                    <col style={{ width: lane === "weekly" ? 64 : 36 }} />
                    <col style={{ width: 32 }} />
                  </colgroup>
                  <tbody>
                    {tasks.map((t) => (
                      <tr
                        key={t.id}
                        className={`${dragId === t.id ? "ops-row-dragging " : ""}${
                          dragOverId === t.id && dragId && dragId !== t.id
                            ? "ops-row-drop-target"
                            : ""
                        }`}
                        onDragOver={(e) => {
                          if (!dragId) return;
                          e.preventDefault();
                          if (dragOverId !== t.id) setDragOverId(t.id);
                          if (dragOverCat !== null) setDragOverCat(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragId && dragId !== t.id) {
                            moveTask(dragId, { kind: "before-task", id: t.id });
                          }
                          setDragId(null);
                          setDragOverId(null);
                          setDragOverCat(null);
                        }}
                        onDragLeave={() => {
                          if (dragOverId === t.id) setDragOverId(null);
                        }}
                      >
                        <td className="ops-cell-grip">
                          <span
                            className="ops-grip"
                            draggable
                            title="Drag to reorder or move to another category"
                            onDragStart={(e) => {
                              setDragId(t.id);
                              e.dataTransfer.effectAllowed = "move";
                              try {
                                e.dataTransfer.setData("text/plain", t.id);
                              } catch {
                                /* some browsers throw on read-only dataTransfer */
                              }
                            }}
                            onDragEnd={() => {
                              setDragId(null);
                              setDragOverId(null);
                              setDragOverCat(null);
                            }}
                          >
                            <IconGrip size={12} />
                          </span>
                        </td>
                        <td className="ops-cell-check">
                          <input
                            type="checkbox"
                            className="ops-check"
                            aria-label="Done"
                            checked={
                              lane === "daily"
                                ? t.lastCompletedDate === todayStamp
                                : lane === "weekly"
                                  ? t.lastCompletedWeek === mondayStamp
                                  : t.status === "done"
                            }
                            onChange={(e) => {
                              if (lane === "daily") {
                                updateTask(t.id, {
                                  lastCompletedDate: e.target.checked
                                    ? todayStamp
                                    : null,
                                });
                              } else if (lane === "weekly") {
                                updateTask(t.id, {
                                  lastCompletedWeek: e.target.checked
                                    ? mondayStamp
                                    : null,
                                });
                              } else {
                                updateTask(t.id, {
                                  status: e.target.checked ? "done" : "todo",
                                });
                              }
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className={`ops-input${
                              (lane === "daily"
                                ? t.lastCompletedDate === todayStamp
                                : lane === "weekly"
                                  ? t.lastCompletedWeek === mondayStamp
                                  : t.status === "done")
                                ? " ops-input-done"
                                : ""
                            }`}
                            placeholder="Task description"
                            value={t.title}
                            onChange={(e) =>
                              updateTask(t.id, { title: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          {lane === "weekly" ? (
                            <select
                              className="ops-row-dow"
                              value={t.weeklyDay ?? 1}
                              onChange={(e) =>
                                updateTask(t.id, {
                                  weeklyDay: Number(e.target.value),
                                })
                              }
                              title="Day of week this task recurs on"
                            >
                              <option value={1}>Mon</option>
                              <option value={2}>Tue</option>
                              <option value={3}>Wed</option>
                              <option value={4}>Thu</option>
                              <option value={5}>Fri</option>
                              <option value={6}>Sat</option>
                              <option value={0}>Sun</option>
                            </select>
                          ) : lane === "daily" ? (
                            <span className="ops-row-move" style={{ visibility: "hidden" }} />
                          ) : (
                            <button
                              type="button"
                              className="ops-row-move"
                              onClick={() =>
                                updateTask(t.id, {
                                  lane: lane === "active" ? "backburner" : "active",
                                })
                              }
                              title={
                                lane === "active"
                                  ? "Move to back burner"
                                  : "Move back to active"
                              }
                            >
                              {lane === "active" ? "→" : "←"}
                            </button>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="ops-row-del"
                            onClick={() => requestDelete(t)}
                            title={t.status === "done" ? "Delete task" : "Remove task"}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}
      </div>

      <ConfirmDeleteModal
        open={pendingTask !== null}
        itemKind="task"
        itemLabel={pendingTask?.title?.trim() || "(untitled task)"}
        onConfirm={() => {
          if (pendingDeleteId) removeTask(pendingDeleteId);
        }}
        onCancel={cancelDelete}
      />
    </div>
  );
}

const tasksTabsCSS = `
.ops-tasks { display: flex; flex-direction: column; }
.ops-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--hml-border, rgba(255,255,255,0.08));
}
.ops-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 8px 14px;
  margin-bottom: -1px;
  color: var(--hml-text-mid, #9a9a9c);
  font-size: 12.5px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  letter-spacing: 0.02em;
  transition: color 120ms ease, border-color 120ms ease;
}
.ops-tab:hover { color: var(--hml-text, #e7e7e8); }
.ops-tab-on {
  color: var(--hml-text, #e7e7e8);
  border-bottom-color: var(--hml-accent, #6aa9ff);
}
.ops-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--hml-row-hover, rgba(255,255,255,0.07));
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}
.ops-tab-on .ops-tab-count {
  background: rgba(106, 169, 255, 0.18);
  color: var(--hml-accent, #6aa9ff);
}
.ops-row-move {
  width: 26px;
  height: 26px;
  border-radius: 5px;
  border: 1px solid var(--hml-border, rgba(255,255,255,0.12));
  background: transparent;
  color: var(--hml-text-faint, #6a6a6c);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.ops-row-move:hover {
  background: var(--hml-row-hover, rgba(255,255,255,0.05));
  color: var(--hml-accent, #6aa9ff);
  border-color: var(--hml-accent, #6aa9ff);
}
.ops-row-dow {
  width: 58px;
  height: 26px;
  padding: 0 4px;
  border-radius: 5px;
  border: 1px solid var(--hml-border, rgba(255,255,255,0.12));
  background: transparent;
  color: var(--hml-text-mid, #9a9a9c);
  font-family: inherit;
  font-size: 11.5px;
  line-height: 1;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.ops-row-dow:hover {
  color: var(--hml-text, #e7e7e8);
  border-color: var(--hml-accent, #6aa9ff);
}
.ops-row-dow:focus {
  outline: none;
  border-color: var(--hml-accent, #6aa9ff);
}
.ops-cell-grip {
  text-align: center;
  width: 24px;
  padding-left: 4px;
  padding-right: 0;
}
.ops-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 22px;
  border-radius: 4px;
  color: var(--hml-text-faint, rgba(255,255,255,0.28));
  cursor: grab;
  user-select: none;
  transition: color 120ms ease, background 120ms ease;
}
.ops-grip:hover {
  color: var(--hml-text, #e7e7e8);
  background: var(--hml-row-hover, rgba(255,255,255,0.05));
}
.ops-grip:active { cursor: grabbing; }
.ops-row-dragging { opacity: 0.4; }
.ops-row-drop-target > td {
  box-shadow: inset 0 2px 0 0 var(--hml-accent, #6aa9ff);
}

.ops-cat-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.ops-cat {
  display: flex;
  flex-direction: column;
}
.ops-cat-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px 8px;
  border-bottom: 1px solid var(--hml-border, rgba(255,255,255,0.06));
  transition: box-shadow 120ms ease, background 120ms ease;
}
.ops-cat-header-drop {
  background: rgba(106, 169, 255, 0.06);
  box-shadow: inset 0 -2px 0 0 var(--hml-accent, #6aa9ff);
}
.ops-cat-header-bare {
  border-bottom: none;
  padding: 0 0 6px;
}
.ops-cat-header-bare .ops-cat-add {
  margin-left: 0;
}
.ops-cat-name {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hml-text-mid, #9a9a9c);
}
.ops-cat-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--hml-row-hover, rgba(255,255,255,0.06));
  color: var(--hml-text-faint, #6a6a6c);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}
.ops-cat-add {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 3px 8px;
  color: var(--hml-text-faint, #6a6a6c);
  font-size: 11.5px;
  font-family: inherit;
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
}
.ops-cat-add:hover {
  color: var(--hml-accent, #6aa9ff);
  border-color: var(--hml-border, rgba(255,255,255,0.12));
  background: var(--hml-row-hover, rgba(255,255,255,0.04));
}
.ops-cat-empty {
  padding: 10px 4px 4px;
  font-size: 12px;
  color: var(--hml-text-faint, #6a6a6c);
  font-style: italic;
}
.ops-cat-table {
  margin-top: 2px;
}
`;

// ─── Revenue Tracker ─────────────────────────────────────────

function RevenueTracker({
  root,
  clients,
}: {
  root: string;
  clients: ClientEntry[];
}) {
  const load = useCallback(() => api.readOpsRevenue(root), [root]);
  const write = useCallback(
    (next: OpsRevenueFile) => api.writeOpsRevenue(root, next),
    [root],
  );
  const [file, setFile, loaded] = usePersistedFile<OpsRevenueFile>(
    load,
    write,
    { months: [] },
  );

  const liveClientCount = useMemo(
    () => clients.filter((c) => c.status !== "paused").length,
    [clients],
  );

  const updateRow = (idx: number, patch: Partial<OpsRevenueRow>) => {
    setFile({
      months: file.months.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    });
  };

  const addRow = () => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setFile({
      months: [
        ...file.months,
        {
          month: ym,
          revenue: null,
          expenses: null,
          clientsOverride: null,
          notes: null,
        },
      ],
    });
  };

  const removeRow = (idx: number) => {
    setFile({ months: file.months.filter((_, i) => i !== idx) });
  };

  if (!loaded) return <div className="ops-loading">Loading…</div>;

  // Sort newest first for display while preserving original indices for edits.
  const indexedRows = file.months
    .map((m, i) => ({ row: m, i }))
    .sort((a, b) => b.row.month.localeCompare(a.row.month));

  return (
    <div className="ops-table-wrap">
      <table className="ops-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>Revenue</th>
            <th>Expenses</th>
            <th>Net Profit</th>
            <th># of Clients</th>
            <th>Revenue / Client</th>
            <th style={{ width: 32 }} />
          </tr>
        </thead>
        <tbody>
          {indexedRows.length === 0 ? (
            <tr>
              <td colSpan={7} className="ops-empty-row">
                No months tracked yet. Add one below.
              </td>
            </tr>
          ) : (
            indexedRows.map(({ row, i }) => {
              const revenue = row.revenue ?? 0;
              const expenses = row.expenses ?? 0;
              const net = revenue - expenses;
              const clientCount = row.clientsOverride ?? liveClientCount;
              const perClient =
                clientCount > 0 && revenue > 0 ? revenue / clientCount : null;
              return (
                <tr key={`${row.month}-${i}`}>
                  <td>
                    <input
                      type="month"
                      className="ops-input"
                      value={row.month}
                      onChange={(e) =>
                        updateRow(i, { month: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <MoneyInput
                      value={row.revenue ?? null}
                      onChange={(v) => updateRow(i, { revenue: v })}
                    />
                  </td>
                  <td>
                    <MoneyInput
                      value={row.expenses ?? null}
                      onChange={(v) => updateRow(i, { expenses: v })}
                    />
                  </td>
                  <td
                    className={`ops-cell-derived${
                      net < 0 ? " ops-neg" : net > 0 ? " ops-pos" : ""
                    }`}
                  >
                    {row.revenue == null && row.expenses == null
                      ? "—"
                      : formatMoney(net)}
                  </td>
                  <td>
                    <input
                      type="number"
                      className="ops-input ops-input-num"
                      placeholder={String(liveClientCount)}
                      value={row.clientsOverride ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateRow(i, {
                          clientsOverride: v === "" ? null : Number(v),
                        });
                      }}
                    />
                  </td>
                  <td className="ops-cell-derived">
                    {perClient == null ? "—" : formatMoney(perClient)}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ops-row-del"
                      onClick={() => removeRow(i)}
                      title="Delete month"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      <div className="ops-table-footer">
        <button type="button" className="hml-btn" onClick={addRow}>
          <IconPlus size={12} /> Add month
        </button>
      </div>
    </div>
  );
}

// ─── shared cell widgets ─────────────────────────────────────

function MoneyInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="ops-money">
      <span className="ops-money-prefix">$</span>
      <input
        type="number"
        step="0.01"
        className="ops-input ops-input-num"
        placeholder="0"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : Number(v));
        }}
      />
    </div>
  );
}

export function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Day-of-week index in local time: 0 = Sun … 6 = Sat. */
export function todayDow(): number {
  return new Date().getDay();
}

/** YYYY-MM-DD of the Monday that starts the current week (local time).
 *  Used as the bucket key for `lane: "weekly"` task completion. */
export function mondayYMD(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const shift = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + shift);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
