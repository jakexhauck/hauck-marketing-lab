import { useState, type Dispatch, type SetStateAction } from "react";
import { Globe, Pencil, ChevronRight } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { WEBSITE_TABS } from "../../lib/pageTabs";
import { Panel, Button, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import { useClient } from "../../context/ClientContext";
import { useWebsitePages } from "../../hooks/useWebsitePages";
import { useWebsiteRequests, type NewRequestInput } from "../../hooks/useWebsiteRequests";
import { relativeTime } from "../../lib/format";
import {
  WEBSITE_CONTAINER,
  NotConnectedNotice,
  SiteMock,
  LiveSiteFrame,
  DeviceToggle,
  SITE_PAGES,
} from "./shared";
import type { ChangeRequest, Device, SitePageKey } from "./shared";
import {
  CHANGE_PIN_CSS,
  ChangeCanvas,
  RequestsRail,
  type PinPulse,
} from "./changeRequests";

// Website > Pages (master-detail + in-place change requests). The left rail lists
// every live page; the middle shows the selected page in a browser or phone
// preview, exactly as a customer sees it; the right rail lists submitted change
// requests. "Request a change to this page" turns the preview into a pin target
// (ChangeCanvas) so clients point at exactly what to change on THAT page, in
// place, instead of navigating away. Demo renders SITE_PAGES over SiteMock; a
// real session lists the client's actual pages (useWebsitePages) and previews
// each by joining its path onto the tenant's website_url. Pins persist through
// useWebsiteRequests (GET/POST /api/website/requests).

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

// The toolbar above the preview: device toggle + the pin-mode toggle. Turning
// pin mode on makes the preview a click target; the label flips to "Done".
function PreviewToolbar({
  device,
  setDevice,
  pinMode,
  setPinMode,
  canPin,
}: {
  device: Device;
  setDevice: (d: Device) => void;
  pinMode: boolean;
  setPinMode: (v: boolean) => void;
  canPin: boolean;
}) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
      <DeviceToggle value={device} onChange={setDevice} />
      <Button
        variant={pinMode ? "secondary" : "primary"}
        size="sm"
        disabled={!canPin}
        onClick={() => setPinMode(!pinMode)}
      >
        <Pencil size={15} /> {pinMode ? "Done" : "Request a change to this page"}
      </Button>
    </div>
  );
}

export default function WebsitePages() {
  const demo = demoMode();
  const { client } = useClient();
  const websiteUrl = client.websiteUrl;
  const [device, setDevice] = useState<Device>("desktop");

  // Demo selection (keys drive SiteMock) and real selection (page ids).
  const [selectedKey, setSelectedKey] = useState<SitePageKey>("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // In-place change requests: pin-drop mode + the focused pin, shared by the
  // canvas (pins) and the rail (list highlight).
  const [pinMode, setPinMode] = useState(false);
  const [pulse, setPulse] = useState<PinPulse | null>(null);

  const { pages, site, unavailable } = useWebsitePages();
  const { requests, add, unavailable: requestsUnavailable } = useWebsiteRequests();

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

  // Resolve a request's page identifier to a human label for the rail card.
  const pageLabel = (pageId: string): string => {
    if (demo) return SITE_PAGES.find((p) => p.key === pageId)?.name ?? pageId;
    return pages.find((p) => p.path === pageId)?.name ?? pageId;
  };

  // Focus a request from the rail: switch to its page + device so its pin shows,
  // then pulse it. Kept here (not in the rail) because it owns page/device state.
  const focusRequest = (r: ChangeRequest) => {
    if (r.device !== device) setDevice(r.device);
    if (demo) {
      if (SITE_PAGES.some((p) => p.key === r.page)) setSelectedKey(r.page as SitePageKey);
    } else {
      const match = pages.find((p) => p.path === r.page);
      if (match) setSelectedId(match.id);
    }
    setPulse((p) => ({ id: r.id, n: (p?.n ?? 0) + 1 }));
  };

  return (
    <Shell>
      <div className={WEBSITE_CONTAINER}>
        <style>{CHANGE_PIN_CSS}</style>
        <PageBar
          tabs={WEBSITE_TABS}
          count={demo ? SITE_PAGES.length : pages.length || undefined}
          description="Every page on your live website. Pick one to see it exactly as your customers do, then point at anything you'd like changed and we'll handle the rest."
        />

        {demo ? (
          <DemoPages
            device={device}
            setDevice={setDevice}
            selectedKey={selectedKey}
            setSelectedKey={setSelectedKey}
            pinMode={pinMode}
            setPinMode={setPinMode}
            requests={requests}
            add={add}
            requestsUnavailable={requestsUnavailable}
            pulse={pulse}
            setPulse={setPulse}
            focusRequest={focusRequest}
            pageLabel={pageLabel}
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
            const canPin = Boolean(preview);
            return (
              <>
                {!websiteUrl && (
                  <NotConnectedNotice message="These are your live pages. Add your site address to preview them and request changes here." />
                )}
                <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)_320px]">
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
                    <PreviewToolbar
                      device={device}
                      setDevice={setDevice}
                      pinMode={pinMode}
                      setPinMode={setPinMode}
                      canPin={canPin}
                    />

                    <ChangeCanvas
                      pageId={selected.path}
                      device={device}
                      url={barLabel(selected.path)}
                      active={pinMode && canPin}
                      requests={requests}
                      add={add}
                      pulse={pulse}
                      setPulse={setPulse}
                    >
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
                    </ChangeCanvas>

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

                  <RequestsRail
                    requests={requests}
                    pulse={pulse}
                    onFocus={focusRequest}
                    unavailable={requestsUnavailable}
                    pageLabel={pageLabel}
                  />
                </div>
              </>
            );
          })()
        )}
      </div>
    </Shell>
  );
}

// The demo master-detail + pin board: the hand-authored SITE_PAGES over SiteMock,
// with the same in-place change-request interaction as the real path.
function DemoPages({
  device,
  setDevice,
  selectedKey,
  setSelectedKey,
  pinMode,
  setPinMode,
  requests,
  add,
  requestsUnavailable,
  pulse,
  setPulse,
  focusRequest,
  pageLabel,
}: {
  device: Device;
  setDevice: (d: Device) => void;
  selectedKey: SitePageKey;
  setSelectedKey: (k: SitePageKey) => void;
  pinMode: boolean;
  setPinMode: (v: boolean) => void;
  requests: ChangeRequest[];
  add: (input: NewRequestInput) => Promise<ChangeRequest | null>;
  requestsUnavailable: boolean;
  pulse: PinPulse | null;
  setPulse: Dispatch<SetStateAction<PinPulse | null>>;
  focusRequest: (r: ChangeRequest) => void;
  pageLabel: (pageId: string) => string;
}) {
  const selected = SITE_PAGES.find((p) => p.key === selectedKey) ?? SITE_PAGES[0];
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)_320px]">
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
        <PreviewToolbar
          device={device}
          setDevice={setDevice}
          pinMode={pinMode}
          setPinMode={setPinMode}
          canPin
        />

        <ChangeCanvas
          pageId={selected.key}
          device={device}
          url={selected.path}
          active={pinMode}
          requests={requests}
          add={add}
          pulse={pulse}
          setPulse={setPulse}
        >
          <SiteMock page={selected.key} device={device} />
        </ChangeCanvas>

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

      <RequestsRail
        requests={requests}
        pulse={pulse}
        onFocus={focusRequest}
        unavailable={requestsUnavailable}
        pageLabel={pageLabel}
      />
    </div>
  );
}
