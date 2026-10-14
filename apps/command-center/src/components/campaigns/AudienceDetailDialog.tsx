import CampaignDialog from "./CampaignDialog";
import { demoMode } from "../../demo/demoMode";
import { DEMO_AUDIENCE_MEMBERS } from "../../routes/campaigns/shared";
import type { AudienceSegment } from "../../lib/campaignsAudiences";

// Read-only detail for a customer list, opened from an Audiences card. Shows the
// segment description + live count. A sample of members is illustrative only, so
// it renders in demo/preview; a real session shows the description alone (we do
// not fabricate individual customers).
export default function AudienceDetailDialog({
  audience,
  onClose,
}: {
  audience: AudienceSegment | null;
  onClose: () => void;
}) {
  const demo = demoMode();
  if (!audience) return null;
  const a = audience;
  const count = a.count.toLocaleString("en-US");

  return (
    <CampaignDialog open={!!audience} onClose={onClose} title={`${a.name} · ${count}`} maxWidth="sm:max-w-lg">
      <div>
        <div className="border-b border-divider p-5">
          <p className="text-[13px] leading-snug text-muted">{a.desc}</p>
        </div>
        {demo ? (
          <>
            <div className="px-5 pt-4 label-cap">A sample of who's in this list</div>
            <ul className="px-2 py-2">
              {DEMO_AUDIENCE_MEMBERS.map((m) => (
                <li key={m.name} className="flex items-center gap-3 rounded-[10px] px-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-muted">
                    {m.initials}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-text">{m.name}</div>
                    <div className="text-[12px] text-faint">{m.sub}</div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-5 pb-5 text-center text-[12px] text-faint">Showing 6 of {count}</div>
          </>
        ) : (
          <div className="px-5 py-4 text-[12px] text-faint">
            {count} customers in this list. We reach them when we run a matching campaign for you.
          </div>
        )}
      </div>
    </CampaignDialog>
  );
}
