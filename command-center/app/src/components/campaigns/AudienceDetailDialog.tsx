import { Plus } from "lucide-react";
import { Button } from "../ui";
import CampaignDialog from "./CampaignDialog";
import { DEMO_AUDIENCE_MEMBERS, type DemoAudience } from "../../routes/campaigns/shared";

// Who's in a customer list, opened from an Audiences card. Shows a sample of
// members plus a "send to this list" entry into the New campaign flow.
export default function AudienceDetailDialog({
  audience,
  onClose,
  onSend,
}: {
  audience: DemoAudience | null;
  onClose: () => void;
  onSend: () => void;
}) {
  if (!audience) return null;
  const a = audience;

  return (
    <CampaignDialog open={!!audience} onClose={onClose} title={`${a.name} · ${a.count}`} maxWidth="sm:max-w-lg">
      <div>
        <div className="border-b border-divider p-5">
          <p className="text-[13px] leading-snug text-muted">{a.desc}</p>
          <Button variant="primary" size="sm" className="mt-3" onClick={onSend}>
            <Plus size={15} /> Send to this list
          </Button>
        </div>
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
        <div className="px-5 pb-5 text-center text-[12px] text-faint">Showing 6 of {a.count}</div>
      </div>
    </CampaignDialog>
  );
}
