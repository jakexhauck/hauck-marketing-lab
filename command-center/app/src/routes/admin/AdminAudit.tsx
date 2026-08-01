import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminPage from "../../components/admin/AdminPage";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { useAdminAuditQuery, useAdminClientsQuery } from "../../hooks/useApi";
import {
  KNOWN_AUDIT_ACTIONS,
  auditActionLabel,
  describeAuditRange,
  formatAuditTimestamp,
  hasAuditPayload,
  isOutboundAction,
  mergeActionOptions,
  prettyAuditPayload,
  summarizeAuditPayload,
} from "../../lib/auditLog";

const PAGE_SIZE = 50;

// /admin/audit: the reader for admin_audit_log.
//
// This surface exists because the Setter Suite can send real SMS and email as
// the client, with no approval step and no undo, and this table is the only
// record that it happened. It is reached from Settings rather than the
// sidebar: occasional-use, not daily.
//
// The one thing this page must never do is imply it knows who acted. There
// are no per-setter accounts, so every row names the admin account that was
// signed in, which today means the account owner regardless of who was at the
// keyboard. The notice below says that in as many words.
export default function AdminAudit() {
  const [tenantId, setTenantId] = useState("");
  const [action, setAction] = useState("");
  const [offset, setOffset] = useState(0);

  const clientsQuery = useAdminClientsQuery(true);
  const clients = clientsQuery.data?.clients ?? [];

  const auditQuery = useAdminAuditQuery({
    limit: PAGE_SIZE,
    offset,
    tenantId: tenantId || undefined,
    action: action || undefined,
  });

  const entries = auditQuery.data?.entries ?? [];
  const total = auditQuery.data?.total ?? 0;
  const hasMore = auditQuery.data?.hasMore ?? false;

  // The curated action list plus anything actually present in the loaded page,
  // so a newly added action can be filtered the first time it is seen.
  const actionOptions = useMemo(
    () => mergeActionOptions(KNOWN_AUDIT_ACTIONS, entries.map((e) => e.action)),
    [entries],
  );

  const filtered = !!tenantId || !!action;

  // Any filter change invalidates the current page position.
  const changeTenant = (value: string) => {
    setTenantId(value);
    setOffset(0);
  };
  const changeAction = (value: string) => {
    setAction(value);
    setOffset(0);
  };
  const clearFilters = () => {
    setTenantId("");
    setAction("");
    setOffset(0);
  };

  return (
    <div className="pk-root">
      {/* Back to Settings sits in the header's action slot rather than as a
          loose link under the title: it is chrome, and it belongs with the
          chrome. */}
      <AdminPage
        section="Admin Audit Log"
        actions={
          <Link to="/admin/settings" className="pk-link font-[inherit]">
            <ArrowLeft size={14} aria-hidden />
            Back to Settings
          </Link>
        }
      />

      {/* The honesty notice. Do not soften this: a reader who assumes the
          Account column names a person will draw the wrong conclusion from
          every row. */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/35 bg-warning-tint px-4 py-3 text-[13px] text-warning">
        <ShieldAlert size={17} className="mt-0.5 shrink-0" aria-hidden />
        <div className="space-y-1.5">
          <p className="font-semibold">This log names an account, not a person.</p>
          <p className="opacity-90">
            There are no per-setter accounts yet. Every action is attributed to whichever admin
            account was signed in, so a message a hired setter sent will show the account owner&apos;s
            name. Use this to see what was done and when. It cannot tell you who was at the
            keyboard.
          </p>
          <p className="opacity-90">
            Messages sent from the Setter Suite go out as the client immediately, with no approval
            step and no undo.
          </p>
        </div>
      </div>

      {/* Filters. Tenant and action, so setter.send can be isolated. */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px] text-muted">
        <label className="flex items-center gap-2">
          Client
          <select
            className="pk-select"
            value={tenantId}
            onChange={(e) => changeTenant(e.target.value)}
            aria-label="Filter by client"
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          Action
          <select
            className="pk-select"
            value={action}
            onChange={(e) => changeAction(e.target.value)}
            aria-label="Filter by action"
          >
            <option value="">All actions</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        {filtered && (
          <button type="button" className="pk-link font-[inherit]" onClick={clearFilters}>
            Clear filters
          </button>
        )}

        {clientsQuery.isError && (
          <span className="text-warning">Client names could not be loaded.</span>
        )}
      </div>

      {/* Loading, failed and empty are three different answers. An empty table
          must never stand in for a request that is still running or that
          failed, on a page whose whole job is proving what happened. */}
      {auditQuery.isLoading ? (
        <div className="pk-empty">Loading the audit log...</div>
      ) : auditQuery.isError ? (
        <div className="pk-empty">
          <p>Could not load the audit log. Nothing here is proof of anything until it loads.</p>
          <button
            type="button"
            className="pk-link mt-3 font-[inherit]"
            onClick={() => auditQuery.refetch()}
          >
            Try again
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="pk-empty">
          {filtered
            ? "No entries match these filters."
            : "No admin actions have been recorded yet."}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-divider">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["When", "Account", "Action", "Client", "Details"].map((h) => (
                    <th
                      key={h}
                      className="label-cap whitespace-nowrap border-b border-divider bg-[var(--rail)] px-4 py-2.5 text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-divider align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-[13px] tnum text-muted">
                      {formatAuditTimestamp(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-[13px]">
                      <div className="font-semibold text-text">
                        {entry.adminName ?? entry.adminEmail ?? "Unknown account"}
                      </div>
                      {entry.adminEmail && entry.adminName && (
                        <div className="text-[12px] text-muted">{entry.adminEmail}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-text">
                          {auditActionLabel(entry.action)}
                        </span>
                        {isOutboundAction(entry.action) && (
                          <span className="inline-flex items-center rounded-full bg-warning-tint px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-warning">
                            Sent
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11.5px] text-muted">{entry.action}</div>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-muted">
                      {entry.tenantName ?? (entry.tenantId ? entry.tenantId : "Agency-wide")}
                    </td>
                    {/* Payload is arbitrary JSON and a setter.send row carries a
                        whole message body, so the cell is width-capped and the
                        full value only expands on request. */}
                    <td className="max-w-[360px] px-4 py-3 text-[13px] text-muted">
                      {hasAuditPayload(entry.payload) ? (
                        <details className="group">
                          <summary className="flex cursor-pointer list-none items-baseline gap-2">
                            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] group-open:hidden">
                              {summarizeAuditPayload(entry.payload)}
                            </span>
                            <span className="shrink-0 text-[12px] font-semibold text-text underline decoration-dotted underline-offset-2">
                              <span className="group-open:hidden">Show</span>
                              <span className="hidden group-open:inline">Hide</span>
                            </span>
                          </summary>
                          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-2)] p-2.5 font-mono text-[11.5px] leading-relaxed">
                            {prettyAuditPayload(entry.payload)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-[12px]">No details</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
            <span>{describeAuditRange(offset, entries.length, total)}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="pk-link font-[inherit] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={offset === 0 || auditQuery.isFetching}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Newer
              </button>
              <button
                type="button"
                className="pk-link font-[inherit] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!hasMore || auditQuery.isFetching}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Older
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
