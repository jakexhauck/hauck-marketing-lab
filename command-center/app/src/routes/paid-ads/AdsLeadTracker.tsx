import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { PAID_ADS_CONTAINER } from "./shared";
import { PAID_ADS_TABS } from "../../lib/pageTabs";
import { cn } from "../../lib/cn";
import { formatMoneyExact } from "../../lib/formatMoney";
import { useAuth } from "../../context/AuthContext";
import { useAdsTrackerQuery } from "../../hooks/useApi";
import type { AdTrackerRange, LeadTrackerLead, LeadTrackerWhen } from "../../lib/api";
import {
  ErrorNote,
  RANGES,
  STATUS_META,
  Segmented,
  Spinner,
  formatLeadDate,
  formatWhen,
  isOverdue,
} from "./trackerShared";
import { SAMPLE_LEADS } from "./sampleLeads";

// Paid Ads > Lead Tracker. The sheet's Lead Tracker tab: every ad lead, newest
// first, with the ad that earned it and a status that follows the pipeline
// automatically (the sheet made the owner type it; the app derives it).

// The When cell. An appointment prints its time plainly; an overdue follow-up
// is called out, because a follow-up that has slipped is the row on this page
// worth acting on. Nothing booked and no task yet reads "-", never a guess.
function WhenCell({ when }: { when: LeadTrackerWhen | null }) {
  const text = when ? formatWhen(when.at) : "";
  if (!text) return <span className="text-faint">-</span>;
  const overdue = when!.kind === "follow_up" && isOverdue(when!.at);
  return (
    <span
      className={cn("tnum", overdue ? "font-semibold text-warning" : "text-text")}
      title={when!.label}
    >
      {text}
      {overdue && <span className="ml-1.5 text-[11px] font-semibold">overdue</span>}
    </span>
  );
}

export default function AdsLeadTracker() {
  const { session } = useAuth();
  const [range, setRange] = useState<AdTrackerRange>("all");
  const [search, setSearch] = useState("");
  // Level is irrelevant to the lead list; keep it at the cheap default.
  const query = useAdsTrackerQuery(range, "ad", Boolean(session));

  const realLeads: LeadTrackerLead[] = useMemo(() => query.data?.leads ?? [], [query.data]);
  // Fall back to a clearly-badged sample set when there are no real leads yet,
  // so the page can be judged with data in it. DEV/localhost only: a real client
  // in production must never see fabricated leads (the golden rule). Vanishes the
  // moment real leads flow, and is never mixed with real leads.
  const usingSample =
    import.meta.env.DEV && !query.isLoading && !query.isError && realLeads.length === 0;
  const leads = usingSample ? SAMPLE_LEADS : realLeads;

  const trimmed = search.trim();
  const visible = useMemo(() => {
    if (!trimmed) return leads;
    const q = trimmed.toLowerCase();
    const qDigits = trimmed.replace(/\D+/g, "");
    return leads.filter((l) => {
      if (l.name.toLowerCase().includes(q)) return true;
      if (l.email.toLowerCase().includes(q)) return true;
      if ((l.adName ?? "").toLowerCase().includes(q)) return true;
      if ((l.campaignName ?? "").toLowerCase().includes(q)) return true;
      if (qDigits.length > 0 && l.phone.replace(/\D+/g, "").includes(qDigits)) return true;
      return false;
    });
  }, [leads, trimmed]);

  const data = query.data;

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageBar
          tabs={PAID_ADS_TABS}
          description="Every lead from your ads. Status follows your pipeline automatically; revenue fills in when a job is closed out."
          actions={<Segmented options={RANGES} value={range} onChange={setRange} label="Date range" />}
          filters={
            <label className="relative flex-1 max-w-xs">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads or ads"
                aria-label="Search leads"
                className="w-full rounded-[var(--radius)] border border-border bg-surface py-2 pl-9 pr-3 text-[13.5px] text-text placeholder:text-faint focus:border-brand focus:outline-none"
              />
            </label>
          }
        />

        {query.isError ? (
          <ErrorNote message={(query.error as Error | null)?.message} />
        ) : query.isLoading && !data ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-[13px] text-muted">
            {trimmed ? "No leads match your search." : "No leads in this range yet."}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {usingSample && (
              <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-warning">
                <span className="inline-flex rounded-full bg-warning/20 px-2 py-0.5 text-[11px] font-semibold">
                  Sample data
                </span>
                This is what your leads will look like. Real leads replace it automatically as they come in.
              </div>
            )}
            <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-[11px] text-faint">
                  <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Lead</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Phone</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Email</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Status</th>
                  <th className="px-3 py-2.5 text-left font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((lead) => {
                  const status = STATUS_META[lead.status];
                  return (
                    <tr
                      key={lead.contactId}
                      className="border-b border-border/60 last:border-b-0 hover:bg-surface"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-faint tnum">
                        {formatLeadDate(lead.createdAt)}
                      </td>
                      <td className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2.5 font-medium text-text">
                        {lead.name}
                      </td>
                      <td className="max-w-[220px] px-3 py-2.5">
                        <div className="truncate text-text">{lead.phone || "-"}</div>
                      </td>
                      <td className="max-w-[240px] px-3 py-2.5">
                        <div className="truncate text-text">{lead.email || "-"}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            status.chip,
                          )}
                        >
                          {status.label}
                        </span>
                        {lead.status === "won" && lead.value > 0 && (
                          <span className="ml-2 font-semibold text-text tnum">
                            {formatMoneyExact(lead.value)}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <WhenCell when={lead.when} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
