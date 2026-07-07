import { useState } from "react";
import { Globe, ChevronRight } from "lucide-react";
import { Panel, EmptyState } from "../../../ui";
import { useAdminClientDetailQuery, useAdminWebsitePagesQuery } from "../../../../hooks/useApi";
import { DevicePreview, LiveSiteFrame, DeviceToggle } from "../../../../routes/website/shared";
import type { Device } from "../../../../routes/website/shared";
import { relativeTime } from "../../../../lib/format";

// Web Design > Pages. One client's live pages (from their GHL Sites) in the
// Fulfillment cockpit, each previewed by joining its path onto the client's
// website_url. Read-only: the operator sees exactly what the client's own Pages
// tab shows. GHL unreadable -> honest empty; no website URL -> the list still
// shows, with a note that a preview needs the site address.

// The host + path shown in the desktop browser frame's address bar.
function addressLabel(fullUrl: string): string {
  try {
    const u = new URL(fullUrl);
    return (u.host + u.pathname).replace(/\/$/, "");
  } catch {
    return fullUrl;
  }
}

function PageRow({
  name,
  sub,
  selected,
  onClick,
}: {
  name: string;
  sub: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "true" : undefined}
      className={
        "flex items-center justify-between gap-2.5 rounded-[var(--radius)] border px-3.5 py-3 text-left transition-colors duration-150 " +
        (selected
          ? "border-brand bg-brand-tint ring-1 ring-inset ring-brand"
          : "border-border bg-surface hover:border-border-strong hover:bg-surface-2")
      }
    >
      <div className="min-w-0">
        <div className="truncate font-display text-[14px] font-semibold text-text">{name}</div>
        <div className="mt-0.5 truncate text-[11.5px] text-faint">{sub}</div>
      </div>
      <ChevronRight
        size={16}
        className={"shrink-0 transition-colors " + (selected ? "text-brand-text" : "text-faint")}
      />
    </button>
  );
}

export default function PagesPanel({ tenantId }: { tenantId: string }) {
  const detailQuery = useAdminClientDetailQuery(tenantId);
  const pagesQuery = useAdminWebsitePagesQuery(tenantId);
  const [device, setDevice] = useState<Device>("desktop");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (detailQuery.isLoading || pagesQuery.isLoading) {
    return <div className="pk-empty">Loading pages...</div>;
  }
  if (pagesQuery.isError || !pagesQuery.data) {
    return <div className="pk-empty">Could not load this client's pages.</div>;
  }

  const { pages, site, unavailable } = pagesQuery.data;
  const websiteUrl = detailQuery.data?.client.websiteUrl ?? null;

  if (unavailable) {
    return (
      <Panel className="px-4 py-12">
        <EmptyState
          icon={<Globe size={22} />}
          title="Could not load this client's pages from GHL"
          description="Their GoHighLevel Sites could not be read just now. Check the client's GHL connection, then try again."
        />
      </Panel>
    );
  }

  if (pages.length === 0) {
    return (
      <Panel className="px-4 py-12">
        <EmptyState
          icon={<Globe size={22} />}
          title="No live pages for this client yet"
          description="Once a site is published in their GoHighLevel Sites, every page lists here."
        />
      </Panel>
    );
  }

  const fullUrl = (path: string): string | null => {
    if (!websiteUrl) return null;
    try {
      return new URL(path, websiteUrl).toString();
    } catch {
      return null;
    }
  };

  const selected = pages.find((p) => p.id === selectedId) ?? pages[0];
  const preview = fullUrl(selected.path);
  const barLabel = preview ? addressLabel(preview) : selected.path;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
      <div className="flex flex-col gap-1.5">
        {pages.map((p) => (
          <PageRow
            key={p.id}
            name={p.name}
            sub={p.path}
            selected={p.id === selected.id}
            onClick={() => setSelectedId(p.id)}
          />
        ))}
      </div>

      <div>
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-text">{barLabel}</span>
          <DeviceToggle value={device} onChange={setDevice} />
        </div>

        {preview ? (
          <DevicePreview url={barLabel} device={device}>
            <LiveSiteFrame url={preview} device={device} />
          </DevicePreview>
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface px-6 py-16 text-center">
            <Globe size={22} className="text-faint" />
            <p className="text-[13px] text-muted">
              Add this client's website address in Config to preview their pages.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-muted">
          {site?.updatedAt && (
            <span>
              Site updated{" "}
              <b className="font-semibold text-text">{relativeTime(site.updatedAt)}</b>
            </span>
          )}
          <span>
            Address <b className="font-semibold text-text">{barLabel}</b>
          </span>
        </div>
      </div>
    </div>
  );
}
