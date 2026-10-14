import { Inbox } from "lucide-react";
import { Panel, Badge, EmptyState } from "../../../ui";
import { useAdminWebsiteRequestsQuery } from "../../../../hooks/useApi";
import { requestStatusMeta } from "../../../../routes/website/shared";
import { timeAgo } from "../../../../lib/timeAgo";

// Web Design > Change Requests. The pins a client dropped on their live site,
// read-only, for the Fulfillment cockpit. The operator sees exactly what the
// client filed; the edit itself is made in GHL, so there is no action here.
// Honest empty when the client has filed nothing.

export default function ChangeRequestsPanel({ tenantId }: { tenantId: string }) {
  const query = useAdminWebsiteRequestsQuery(tenantId);

  if (query.isLoading) {
    return <div className="pk-empty">Loading change requests...</div>;
  }
  if (query.isError || !query.data) {
    return <div className="pk-empty">Could not load this client's change requests.</div>;
  }

  const { requests, unavailable } = query.data;

  if (unavailable) {
    return <div className="pk-empty">Could not load this client's change requests.</div>;
  }

  const openCount = requests.filter((r) => r.status === "open").length;

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">
          {requests.length} {requests.length === 1 ? "request" : "requests"}
          {requests.length > 0 && `, ${openCount} open`}
        </p>
        <span className="text-[12px] text-faint">Read-only. Make the edit in GHL.</span>
      </div>

      {requests.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {requests.map((r, i) => {
            const meta = requestStatusMeta(r.status);
            return (
              <li key={r.id}>
                <Panel className="p-3.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-display text-[13px] text-text">
                      <span
                        className="grid h-5 w-5 place-items-center rounded-[6px] text-[11px] font-bold text-white"
                        style={{ backgroundImage: "var(--grad-brand)" }}
                      >
                        {i + 1}
                      </span>
                      {r.page}
                    </span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  <p className="text-[12.5px] leading-snug text-muted">{r.note}</p>
                  <div className="mt-2 text-[11px] text-faint">
                    {timeAgo(r.createdAt)} · {r.device === "mobile" ? "Mobile" : "Desktop"} view
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      ) : (
        <Panel className="px-4 py-12">
          <EmptyState
            icon={<Inbox size={22} />}
            title="No change requests yet"
            description="When this client drops a pin on their site to request a change, it appears here."
          />
        </Panel>
      )}
    </div>
  );
}
