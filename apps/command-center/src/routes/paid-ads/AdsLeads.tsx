import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserPlus, CheckCircle2, Phone, FileText } from "lucide-react";
import Shell from "../../components/Shell";
import { PageHeader } from "../../components/PageHeader";
import { Panel, PanelHeader } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import { api } from "../../lib/api";
import { timeAgo } from "../../lib/timeAgo";
import {
  PAID_ADS_CONTAINER,
  NotConnectedNotice,
  StatusChip,
  STAGE_TO_BUCKET,
  DEMO_LEADS,
  type DemoLead,
} from "./shared";

// A row from GET /api/ads/leads (ApiLead plus the resolved GHL stage name).
interface ApiAdLeadRow {
  id: string;
  name: string;
  stageName?: string;
  lastActivityAt: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase()) || "?";
}

// Map a live opportunity to the table's row shape. The channel (call vs form)
// and the ad name are not on the opportunity feed, so they take neutral values;
// the bucket comes from the real GHL stage.
function mapRow(o: ApiAdLeadRow): DemoLead {
  return {
    name: o.name,
    initials: initialsOf(o.name),
    avatar: "linear-gradient(135deg,#4f46e5,#7c73f0)",
    when: timeAgo(o.lastActivityAt),
    how: "form",
    fromAd: "Paid ad",
    bucket: STAGE_TO_BUCKET[o.stageName ?? ""] ?? "new",
  };
}

// "Leads": the real people the ads brought in. Status uses the 6 plain buckets
// that roll up the real GHL pipeline stages (Paid Ad's -> Sales). See shared.tsx
// and docs/build-plans/18-paid-ads-hub.md.

interface Stat {
  label: string;
  value: string;
  icon: ReactNode;
  chipBg: string;
  chipFg: string;
}

const STATS: Stat[] = [
  { label: "total leads", value: "32", icon: <UserPlus />, chipBg: "#eceaff", chipFg: "#4f46e5" },
  { label: "already booked", value: "7", icon: <CheckCircle2 />, chipBg: "#e6f6ec", chipFg: "#16a34a" },
  { label: "phone calls", value: "18", icon: <Phone />, chipBg: "#fef3e2", chipFg: "#d97706" },
  { label: "form fill-ins", value: "14", icon: <FileText />, chipBg: "#e2f3fc", chipFg: "#0ea5e9" },
];

export default function AdsLeads() {
  const demo = demoMode();
  const { data } = useQuery({
    queryKey: ["ads-leads"],
    enabled: !demo,
    staleTime: 30_000,
    queryFn: () => api<{ leads: ApiAdLeadRow[] }>("/api/ads/leads"),
  });

  const rows = demo ? DEMO_LEADS : (data?.leads ?? []).map(mapRow);
  const hasLeads = rows.length > 0;

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageHeader
          title="Leads"
        />

        {!demo && !hasLeads && (
          <NotConnectedNotice message="Once your ads are connected, every lead they bring in, the calls and the form fill-ins, lands right here." />
        )}

        {demo && (
          <div className="mb-4 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {STATS.map((s) => (
              <Panel key={s.label} className="flex items-center gap-3 p-4">
                <span
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] [&>svg]:h-[19px] [&>svg]:w-[19px]"
                  style={{ backgroundColor: s.chipBg, color: s.chipFg }}
                >
                  {s.icon}
                </span>
                <div>
                  <div className="font-display text-[22px] font-extrabold leading-none tracking-tight text-text tnum">{s.value}</div>
                  <div className="mt-1 text-[11.5px] text-faint">{s.label}</div>
                </div>
              </Panel>
            ))}
          </div>
        )}

        {hasLeads && (
          <Panel className="overflow-hidden p-0">
            <PanelHeader title="Who reached out" action={<span className="label-cap">Newest first</span>} />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Name", "When", "How", "From ad", "Status"].map((h) => (
                      <th key={h} className="label-cap whitespace-nowrap border-b border-divider bg-[var(--rail)] px-4 py-2.5 text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((lead) => (
                    <tr key={lead.name} className="border-b border-divider transition-colors last:border-0 hover:bg-[var(--rail)]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] font-display text-[12px] font-bold text-white" style={{ backgroundImage: lead.avatar }}>
                            {lead.initials}
                          </span>
                          <span className="text-[13.5px] font-semibold text-text">{lead.name}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[13px] text-muted">{lead.when}</td>
                      <td className="px-4 py-3">
                        {lead.how === "call" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-tint px-2.5 py-1 text-[12px] font-semibold text-brand-text">
                            <Phone size={13} /> Call
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold" style={{ backgroundColor: "#e2f3fc", color: "#0369a1" }}>
                            <FileText size={13} /> Form
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[13px] text-muted">{lead.fromAd}</td>
                      <td className="px-4 py-3">
                        <StatusChip bucket={lead.bucket} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    </Shell>
  );
}
