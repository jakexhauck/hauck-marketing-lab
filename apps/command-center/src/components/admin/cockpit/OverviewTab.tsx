import { Eye, Settings } from "lucide-react";
import { useAdminClientDetailQuery } from "../../../hooks/useApi";
import { formatDateTime, formatMoney } from "../../../lib/format";
import { timeAgo } from "../../../lib/timeAgo";
import {
  activeStaffCount,
  enabledSurfacesSummary,
  formatAccountAge,
} from "../../../lib/cockpitOverview";

// The cockpit's real Overview tab (Task 3.3). Every figure here comes from
// GET /api/admin/clients/:tenantId (admin-accessible, real): monthly spend,
// active staff count, account age, manual health flag, enabled surfaces, and
// the last 20 activity_log rows. Nothing here is sampled or fabricated -
// Ads/Leads/Inbox/Calendar/Revenue/Team stay honest placeholders until their
// endpoints accept an admin-supplied tenantId (Phase 5).
//
// Uses the same useAdminClientDetailQuery(tenantId) the cockpit header reads,
// so mounting this tab next to the header never fires a second network
// request - React Query serves both from the one cached response.
export default function OverviewTab({
  tenantId,
  onGoToConfig,
  onEnterLiveApp,
  previewBusy,
  previewErr,
}: {
  tenantId: string;
  onGoToConfig: () => void;
  onEnterLiveApp: () => void;
  previewBusy: boolean;
  previewErr: string | null;
}) {
  const detailQuery = useAdminClientDetailQuery(tenantId);

  if (detailQuery.isLoading) {
    return <div className="pk-empty">Loading overview...</div>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return <div className="pk-empty">Could not load this client's overview.</div>;
  }

  const { client, staff, entitlements, activity } = detailQuery.data;
  const surfaces = enabledSurfacesSummary(entitlements);

  return (
    <div>
      <div className="pk-report">
        <div className="pk-report-tile">
          <div className="pk-report-val">{formatMoney(client.monthlySpend)}</div>
          <div className="pk-report-label">Monthly spend</div>
        </div>
        <div className="pk-report-tile">
          <div className="pk-report-val">{activeStaffCount(staff)}</div>
          <div className="pk-report-label">Team size (active)</div>
        </div>
        <div className="pk-report-tile">
          <div className="pk-report-val">{formatAccountAge(client.createdAt)}</div>
          <div className="pk-report-label">Account age</div>
        </div>
      </div>

      <div className="pk-section">
        <div className="pk-section-h">Surfaces</div>
        <p className="text-[13px] leading-relaxed text-muted">
          {surfaces.count} of {surfaces.total} surfaces enabled
          {surfaces.count > 0 ? `: ${surfaces.labels.join(", ")}.` : "."}
        </p>
      </div>

      <div className="pk-section">
        <div className="pk-section-h">Recent activity</div>
        {activity.length === 0 ? (
          <div className="pk-empty">No recent activity.</div>
        ) : (
          <div className="pk-list">
            {activity.map((a) => (
              <div key={a.id} className="pk-li">
                <div className="pk-li-main">
                  <div className="pk-li-label">{a.summary || a.action}</div>
                  <div className="pk-li-sub">
                    {formatDateTime(a.createdAt)} &middot; {timeAgo(a.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pk-section">
        <div className="pk-section-h">Quick actions</div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onGoToConfig}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3.5 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand"
          >
            <Settings size={15} /> Open Config
          </button>
          <button
            type="button"
            onClick={() => void onEnterLiveApp()}
            disabled={previewBusy}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius)] bg-brand px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Eye size={15} /> {previewBusy ? "Opening..." : "Enter live app"}
          </button>
        </div>
        {previewErr && <p className="mt-2 text-[12px] text-danger">{previewErr}</p>}
      </div>
    </div>
  );
}
