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
  OpsTaskStatus,
  OpsTasksFile,
} from "../../lib/types";
import { IconPlus } from "../icons";

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

  const updateRow = (slug: string, patch: Partial<OpsClientRow>) => {
    const prev = file.rows[slug] ?? {};
    setFile({
      rows: { ...file.rows, [slug]: { ...prev, ...patch } },
    });
  };

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
    <div className="ops-table-wrap">
      <table className="ops-table">
        <thead>
          <tr>
            <th>Client Name</th>
            <th>Retainer</th>
            <th>Start Date</th>
            <th>Ad Spend</th>
            <th>Next Report Due</th>
            <th>Next Call</th>
            <th>Status</th>
            <th style={{ minWidth: 200 }}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => {
            const row = file.rows[c.slug] ?? {};
            return (
              <tr key={c.slug}>
                <td className="ops-cell-name">{c.name}</td>
                <td>
                  <MoneyInput
                    value={row.retainer ?? null}
                    onChange={(v) => updateRow(c.slug, { retainer: v })}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    className="ops-input"
                    value={row.startDate ?? ""}
                    onChange={(e) =>
                      updateRow(c.slug, { startDate: e.target.value || null })
                    }
                  />
                </td>
                <td>
                  <MoneyInput
                    value={row.adSpend ?? null}
                    onChange={(v) => updateRow(c.slug, { adSpend: v })}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    className="ops-input"
                    value={row.nextReportDue ?? ""}
                    onChange={(e) =>
                      updateRow(c.slug, {
                        nextReportDue: e.target.value || null,
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    type="date"
                    className="ops-input"
                    value={row.nextCall ?? ""}
                    onChange={(e) =>
                      updateRow(c.slug, { nextCall: e.target.value || null })
                    }
                  />
                </td>
                <td>
                  <StatusPill status={c.status} />
                </td>
                <td>
                  <input
                    type="text"
                    className="ops-input ops-input-notes"
                    placeholder="—"
                    value={row.notes ?? ""}
                    onChange={(e) =>
                      updateRow(c.slug, { notes: e.target.value || null })
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status: ClientEntry["status"] }) {
  const meta =
    status === "live"
      ? { cls: "hml-green", label: "Live" }
      : status === "pre-launch"
        ? { cls: "hml-amber", label: "Pre-launch" }
        : { cls: "hml-neutral", label: "Paused" };
  return (
    <span className={`hml-pill ${meta.cls}`}>
      <span className="hml-pill-dot" />
      {meta.label}
    </span>
  );
}

// ─── Task Tracker ────────────────────────────────────────────

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

  const updateTask = (id: string, patch: Partial<OpsTask>) => {
    setFile({
      tasks: file.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
  };

  const addTask = () => {
    const t: OpsTask = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: "",
      clientSlug: null,
      assignedTo: null,
      dueDate: null,
      status: "todo",
      createdAt: Date.now(),
    };
    setFile({ tasks: [...file.tasks, t] });
  };

  const removeTask = (id: string) => {
    setFile({ tasks: file.tasks.filter((t) => t.id !== id) });
  };

  if (!loaded) return <div className="ops-loading">Loading…</div>;

  return (
    <div className="ops-table-wrap">
      <table className="ops-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Client</th>
            <th>Assigned To</th>
            <th>Due Date</th>
            <th>Status</th>
            <th style={{ width: 32 }} />
          </tr>
        </thead>
        <tbody>
          {file.tasks.length === 0 ? (
            <tr>
              <td colSpan={6} className="ops-empty-row">
                No tasks yet — add one below.
              </td>
            </tr>
          ) : (
            file.tasks.map((t) => (
              <tr key={t.id}>
                <td>
                  <input
                    type="text"
                    className="ops-input"
                    placeholder="Task description"
                    value={t.title}
                    onChange={(e) => updateTask(t.id, { title: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    className="ops-input"
                    value={t.clientSlug ?? ""}
                    onChange={(e) =>
                      updateTask(t.id, {
                        clientSlug: e.target.value || null,
                      })
                    }
                  >
                    <option value="">Internal</option>
                    {clients.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    className="ops-input"
                    placeholder="You / VA"
                    value={t.assignedTo ?? ""}
                    onChange={(e) =>
                      updateTask(t.id, {
                        assignedTo: e.target.value || null,
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    type="date"
                    className="ops-input"
                    value={t.dueDate ?? ""}
                    onChange={(e) =>
                      updateTask(t.id, { dueDate: e.target.value || null })
                    }
                  />
                </td>
                <td>
                  <TaskStatusSelect
                    value={t.status}
                    onChange={(v) => updateTask(t.id, { status: v })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="ops-row-del"
                    onClick={() => removeTask(t.id)}
                    title="Delete task"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="ops-table-footer">
        <button type="button" className="hml-btn" onClick={addTask}>
          <IconPlus size={12} /> Add task
        </button>
      </div>
    </div>
  );
}

function TaskStatusSelect({
  value,
  onChange,
}: {
  value: OpsTaskStatus;
  onChange: (v: OpsTaskStatus) => void;
}) {
  return (
    <select
      className={`ops-input ops-status-${value}`}
      value={value}
      onChange={(e) => onChange(e.target.value as OpsTaskStatus)}
    >
      <option value="todo">To Do</option>
      <option value="in-progress">In Progress</option>
      <option value="done">Done</option>
    </select>
  );
}

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
                No months tracked yet — add one below.
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

function formatMoney(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
