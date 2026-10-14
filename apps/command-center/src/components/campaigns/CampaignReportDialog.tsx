import { Check } from "lucide-react";
import CampaignDialog from "./CampaignDialog";
import { ChannelChip, type DemoCampaign } from "../../routes/campaigns/shared";

// A sent campaign's results, opened from the Overview "Recently sent" list and
// the Campaigns list. Demo numbers; the shape stays when live data is wired.
export default function CampaignReportDialog({
  campaign,
  onClose,
}: {
  campaign: DemoCampaign | null;
  onClose: () => void;
}) {
  if (!campaign) return null;
  const c = campaign;
  const isSms = c.ch === "sms";
  const filled = c.body.replace(/{{first}}/g, "Mark");

  const kpis: { label: string; value: string; brand?: boolean }[] = [
    { label: "Delivered", value: c.sent ?? "—" },
    { label: isSms ? "Replies" : "Opened", value: isSms ? "31" : (c.rate ?? "—").replace(" opened", "") },
    { label: "Link clicks", value: isSms ? "54" : "96" },
    { label: "Jobs booked", value: (c.result ?? "0 jobs").replace(" jobs", ""), brand: true },
  ];

  const timeline = [
    `Delivered to ${c.sent ?? "your list"} customers`,
    "First open within 4 minutes",
    "Peak opens 9–11 AM",
    "14 link clicks in the first hour",
  ];

  return (
    <CampaignDialog
      open={!!campaign}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {c.title} <ChannelChip ch={c.ch} />
        </span>
      }
      subtitle={`${c.audience} · ${c.when}`}
      maxWidth="sm:max-w-2xl"
    >
      <div className="p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-[12px] border border-border bg-surface p-3.5">
              <div className="text-[12px] text-muted">{k.label}</div>
              <div className={`mt-1.5 font-data text-[22px] font-semibold tnum ${k.brand ? "text-brand-text" : "text-text"}`}>
                {k.value}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_240px]">
          <div className="overflow-hidden rounded-[12px] border border-border">
            <div className="border-b border-divider px-4 py-2.5 font-display text-[14px] font-semibold text-text">Timeline</div>
            {timeline.map((t) => (
              <div key={t} className="flex items-center gap-2.5 border-b border-divider px-4 py-2.5 text-[13px] text-text last:border-b-0">
                <Check size={15} className="shrink-0 text-positive" /> {t}
              </div>
            ))}
          </div>

          <div>
            <div className="label-cap mb-2">What customers saw</div>
            {isSms ? (
              <div className="rounded-[22px] border-[7px] border-[#1b1d29] bg-[#0c0d14] px-2 pb-3.5 pt-2.5">
                <div className="mb-2 flex justify-center">
                  <span className="h-[5px] w-11 rounded-full bg-[#2a2c3a]" />
                </div>
                <div className="max-w-[88%] rounded-[14px] rounded-bl-[4px] bg-[#26283a] px-2.5 py-2 text-[12.5px] leading-snug text-white">
                  <div className="mb-1 text-[10px] text-[#9aa0b8]">Willis Plumbing</div>
                  {filled}
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
                <div className="border-b border-divider bg-surface-2 px-3 py-2.5">
                  <div className="font-display text-[13px] font-semibold text-text">{c.subject ?? c.title}</div>
                  <div className="mt-0.5 text-[11px] text-faint">Willis Plumbing</div>
                </div>
                <div className="px-3 py-2.5 text-[12px] leading-relaxed text-muted">{filled}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </CampaignDialog>
  );
}
