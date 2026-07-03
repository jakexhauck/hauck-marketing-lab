import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe, Pencil, ChevronRight } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { WEBSITE_TABS } from "../../lib/pageTabs";
import { Panel, Button, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import { useClient } from "../../context/ClientContext";
import { useWebsitePages } from "../../hooks/useWebsitePages";
import { relativeTime } from "../../lib/format";
import {
  WEBSITE_CONTAINER,
  NotConnectedNotice,
  BrowserFrame,
  SiteMock,
  LiveSiteFrame,
  DeviceToggle,
  SITE_PAGES,
} from "./shared";
import type { Device, SitePageKey } from "./shared";

// Website > Pages (master-detail). The left rail lists every live page; the
// right side shows the selected page in a large browser preview, exactly as a
// customer sees it, with a shortcut to request a change. Demo renders the
// hand-authored SITE_PAGES over SiteMock; a real session lists the client's
// actual pages from their GHL site (useWebsitePages) and previews each by
// joining its path onto the tenant's website_url.

// Small "Live" pill (positive tone) with a soft pulsing dot, matching the
// mockup's page rows.
function LivePill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-positive-tint px-2 py-0.5 text-[10px] font-bold tracking-wide text-positive">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-positive" />
      </span>
      Live
    </span>
  );
}

// A page row in the left rail, shared by the demo and real lists.
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
        <div className="flex items-center gap-2">
          <span className="truncate font-display text-[14px] font-semibold text-text">
            {name}
          </span>
          <LivePill />
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-faint">{sub}</div>
      </div>
      <ChevronRight
        size={16}
        className={"shrink-0 transition-colors " + (selected ? "text-brand-text" : "text-faint")}
      />
    </button>
  );
}

export default function WebsitePages() {
  const demo = demoMode();
  const { client } = useClient();
  const websiteUrl = client.websiteUrl;
  const navigate = useNavigate();
  const [device, setDevice] = useState<Device>("desktop");

  // Demo selection (keys drive SiteMock) and real selection (page ids).
  const [selectedKey, setSelectedKey] = useState<SitePageKey>("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { pages, site, unavailable } = useWebsitePages();

  // Join a GHL page path onto the client's site origin for preview / open.
  const fullUrl = (path: string): string | null => {
    if (!websiteUrl) return null;
    try {
      return new URL(path, websiteUrl).toString();
    } catch {
      return null;
    }
  };
  const barLabel = (path: string): string => {
    const u = fullUrl(path);
    if (!u) return path;
    try {
      const parsed = new URL(u);
      return (parsed.host + parsed.pathname).replace(/\/$/, "");
    } catch {
      return path;
    }
  };

  return (
    <Shell>
      <div className={WEBSITE_CONTAINER}>
        <PageBar
          tabs={WEBSITE_TABS}
          count={demo ? SITE_PAGES.length : pages.length || undefined}
          description="Every page on your live website. Pick one to see it exactly as your customers do, then request a change if something needs updating."
        />

        {demo ? (
          <DemoPages
            device={device}
            setDevice={setDevice}
            selectedKey={selectedKey}
            setSelectedKey={setSelectedKey}
            navigate={navigate}
          />
        ) : pages.length === 0 ? (
          <>
            {unavailable && (
              <NotConnectedNotice message="We could not reach your site just now. Your live pages will list here once it is connected." />
            )}
            <Panel className="px-4 py-12">
              <EmptyState
                icon={<Globe size={22} />}
                title="Your pages will live here"
                description="Once your site is connected, every page will list here so you can preview it and request changes in a couple of clicks."
              />
            </Panel>
          </>
        ) : (
          (() => {
            const selected = pages.find((p) => p.id === selectedId) ?? pages[0];
            const preview = fullUrl(selected.path);
            return (
              <>
                {!websiteUrl && (
                  <NotConnectedNotice message="These are your live pages. Add your site address to preview them here." />
                )}
                <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_1fr]">
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
                      <DeviceToggle value={device} onChange={setDevice} />
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => navigate("/marketing/website/request")}
                      >
                        <Pencil size={15} /> Request a change to this page
                      </Button>
                    </div>

                    <BrowserFrame url={barLabel(selected.path)} device={device}>
                      {preview ? (
                        <LiveSiteFrame url={preview} device={device} />
                      ) : (
                        <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                          <Globe size={22} className="text-faint" />
                          <p className="text-[13px] text-muted">
                            Add your website address to preview this page.
                          </p>
                        </div>
                      )}
                    </BrowserFrame>

                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-muted">
                      {site?.updatedAt && (
                        <span>
                          Site updated{" "}
                          <b className="font-semibold text-text">{relativeTime(site.updatedAt)}</b>
                        </span>
                      )}
                      <span>
                        Address <b className="font-semibold text-text">{barLabel(selected.path)}</b>
                      </span>
                      <span>
                        Status <b className="font-semibold text-positive">Live</b>
                      </span>
                    </div>
                  </div>
                </div>
              </>
            );
          })()
        )}
      </div>
    </Shell>
  );
}

// The demo master-detail: the hand-authored SITE_PAGES over SiteMock. Unchanged
// from the original page; split out so the real path stays readable.
function DemoPages({
  device,
  setDevice,
  selectedKey,
  setSelectedKey,
  navigate,
}: {
  device: Device;
  setDevice: (d: Device) => void;
  selectedKey: SitePageKey;
  setSelectedKey: (k: SitePageKey) => void;
  navigate: (to: string) => void;
}) {
  const selected = SITE_PAGES.find((p) => p.key === selectedKey) ?? SITE_PAGES[0];
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_1fr]">
      <div className="flex flex-col gap-1.5">
        {SITE_PAGES.map((p) => (
          <PageRow
            key={p.key}
            name={p.name}
            sub={`${p.views} views this month`}
            selected={p.key === selectedKey}
            onClick={() => setSelectedKey(p.key)}
          />
        ))}
      </div>

      <div>
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <DeviceToggle value={device} onChange={setDevice} />
          <Button variant="primary" size="sm" onClick={() => navigate("/marketing/website/request")}>
            <Pencil size={15} /> Request a change to this page
          </Button>
        </div>

        <BrowserFrame url={selected.path} device={device}>
          <SiteMock page={selected.key} device={device} />
        </BrowserFrame>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-muted">
          <span>
            Last updated <b className="font-semibold text-text">{selected.updated}</b>
          </span>
          <span>
            <b className="font-semibold text-text tnum">{selected.views}</b> views this month
          </span>
          <span>
            Status <b className="font-semibold text-positive">Live</b>
          </span>
        </div>
      </div>
    </div>
  );
}
