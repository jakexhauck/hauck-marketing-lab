import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useAdminClientDetailQuery } from "../../../../hooks/useApi";
import { DevicePreview, LiveSiteFrame, DeviceToggle } from "../../../../routes/website/shared";
import type { Device } from "../../../../routes/website/shared";

// Web Design > Site. The client's live website exactly as their customers see
// it, previewed inside the admin cockpit for one admin-supplied tenant. The URL
// comes from client.websiteUrl on GET /api/admin/clients/:tenantId (surfaced on
// AdminClientDetail); nothing here is fabricated. No URL set -> an honest empty
// pointing at Config, never filler.

// The host + path shown in the desktop browser frame's address bar, trailing
// slash trimmed. Falls back to the raw URL if it will not parse.
function addressLabel(url: string): string {
  try {
    const u = new URL(url);
    return (u.host + u.pathname).replace(/\/$/, "");
  } catch {
    return url;
  }
}

export default function SitePanel({ tenantId }: { tenantId: string }) {
  const detailQuery = useAdminClientDetailQuery(tenantId);
  const [device, setDevice] = useState<Device>("desktop");

  if (detailQuery.isLoading) {
    return <div className="pk-empty">Loading site...</div>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return <div className="pk-empty">Could not load this client's site.</div>;
  }

  const websiteUrl = detailQuery.data.client.websiteUrl;
  if (!websiteUrl) {
    return (
      <div className="pk-empty">
        No website URL is set for this client. Add it in Config.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <a
          href={websiteUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-text hover:underline"
        >
          {addressLabel(websiteUrl)}
          <ExternalLink size={14} />
        </a>
        <DeviceToggle value={device} onChange={setDevice} />
      </div>

      <DevicePreview url={addressLabel(websiteUrl)} device={device}>
        <LiveSiteFrame url={websiteUrl} device={device} />
      </DevicePreview>
    </div>
  );
}
