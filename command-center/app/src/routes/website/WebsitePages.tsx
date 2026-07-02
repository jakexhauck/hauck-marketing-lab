import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe, Pencil, ChevronRight } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { WEBSITE_TABS } from "../../lib/pageTabs";
import { Panel, Button, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import {
  WEBSITE_CONTAINER,
  NotConnectedNotice,
  BrowserFrame,
  SiteMock,
  DeviceToggle,
  SITE_PAGES,
} from "./shared";
import type { Device, SitePageKey } from "./shared";

// Website > Pages (master-detail). The left rail lists every live page; the
// right side shows the selected page in a large browser preview, exactly as a
// customer sees it, with a shortcut to request a change. Demo shows the full
// layout; a real (unconnected) session shows the empty state + not-connected
// notice, mirroring the Social golden rule.

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

export default function WebsitePages() {
  const demo = demoMode();
  const navigate = useNavigate();
  const [selectedKey, setSelectedKey] = useState<SitePageKey>("home");
  const [device, setDevice] = useState<Device>("desktop");

  const selected = SITE_PAGES.find((p) => p.key === selectedKey) ?? SITE_PAGES[0];

  return (
    <Shell>
      <div className={WEBSITE_CONTAINER}>
        <PageBar
          tabs={WEBSITE_TABS}
          count={demo ? SITE_PAGES.length : undefined}
          description="Every page on your live website. Pick one to see it exactly as your customers do, then request a change if something needs updating."
        />

        {!demo && (
          <NotConnectedNotice message="Your live pages will list here once your site is connected." />
        )}

        {demo ? (
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_1fr]">
            {/* Master: page list */}
            <div className="flex flex-col gap-1.5">
              {SITE_PAGES.map((p) => {
                const isSel = p.key === selectedKey;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setSelectedKey(p.key)}
                    aria-current={isSel ? "true" : undefined}
                    className={
                      "flex items-center justify-between gap-2.5 rounded-[var(--radius)] border px-3.5 py-3 text-left transition-colors duration-150 " +
                      (isSel
                        ? "border-brand bg-brand-tint ring-1 ring-inset ring-brand"
                        : "border-border bg-surface hover:border-border-strong hover:bg-surface-2")
                    }
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-display text-[14px] font-semibold text-text">
                          {p.name}
                        </span>
                        <LivePill />
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-faint tnum">
                        {p.views} views this month
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      className={
                        "shrink-0 transition-colors " +
                        (isSel ? "text-brand-text" : "text-faint")
                      }
                    />
                  </button>
                );
              })}
            </div>

            {/* Detail: large preview of the selected page */}
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

              <BrowserFrame url={selected.path} device={device}>
                <SiteMock page={selected.key} device={device} />
              </BrowserFrame>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-muted">
                <span>
                  Last updated{" "}
                  <b className="font-semibold text-text">{selected.updated}</b>
                </span>
                <span>
                  <b className="font-semibold text-text tnum">{selected.views}</b> views
                  this month
                </span>
                <span>
                  Status <b className="font-semibold text-positive">Live</b>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <Panel className="px-4 py-12">
            <EmptyState
              icon={<Globe size={22} />}
              title="Your pages will live here"
              description="Once your site is connected, every page will list here so you can preview it and request changes in a couple of clicks."
            />
          </Panel>
        )}
      </div>
    </Shell>
  );
}
