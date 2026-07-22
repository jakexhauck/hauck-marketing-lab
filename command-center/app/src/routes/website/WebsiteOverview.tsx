import { useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { WEBSITE_TABS } from "../../lib/pageTabs";
import { Button } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import { useClient } from "../../context/ClientContext";
import {
  WEBSITE_CONTAINER,
  WEBSITE_DOMAIN,
  NotConnectedNotice,
  DevicePreview,
  SiteMock,
  LiveSiteFrame,
  DeviceToggle,
  type Device,
} from "./shared";

// Website > Overview (the storefront glance). The live site IS the page: a large
// browser preview with a "Live" badge, and nothing else. The numbers used to sit
// here too, but they live on Insights now, so Overview stays a clean, honest look
// at the site exactly as customers see it. Golden rule (see ./shared): a real
// session shows the real site or a neutral placeholder, never fabricated content.

// Neutral placeholder shown inside the browser frame before the site is connected.
function PreviewPlaceholder() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full" style={{ background: "#eef0f5" }}>
        <Globe size={22} style={{ color: "#8a90a3" }} />
      </div>
      <p className="text-[14px] font-semibold" style={{ color: "#14161f" }}>
        Your website preview will appear here
      </p>
      <p className="max-w-[42ch] text-[13px] leading-snug" style={{ color: "#6b7488" }}>
        Once we connect your site, you will see it live in this window, exactly as your customers do.
      </p>
    </div>
  );
}

export default function WebsiteOverview() {
  const demo = demoMode();
  const { client } = useClient();
  const websiteUrl = client.websiteUrl;
  const [device, setDevice] = useState<Device>("desktop");
  const mobile = device === "mobile";

  // The site is "connected" in demo (SiteMock) or when the client has a real URL.
  const connected = demo || Boolean(websiteUrl);
  // Address-bar label: the demo's fixed domain, or the client's real domain.
  const displayDomain = websiteUrl
    ? websiteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")
    : WEBSITE_DOMAIN;
  const liveHref = demo ? `https://${WEBSITE_DOMAIN}` : websiteUrl ?? "";

  return (
    <Shell>
      <div className={WEBSITE_CONTAINER}>
        <PageBar
          tabs={WEBSITE_TABS}
          actions={
            <Button
              variant="primary"
              size="md"
              disabled={!connected}
              onClick={() => liveHref && window.open(liveHref, "_blank", "noopener")}
            >
              <ExternalLink size={16} /> View live site
            </Button>
          }
        />

        {!demo && !websiteUrl && (
          <NotConnectedNotice message="A preview of your homepage will appear here once your site is connected." />
        )}

        {/* Storefront hero: the live site, front and centre */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="hidden text-[13px] text-muted sm:block">
            {connected
              ? "Your live site, exactly as visitors see it. Scroll through it and click any page."
              : "A preview of your homepage will appear here once your site is connected."}
          </p>
          <DeviceToggle value={device} onChange={setDevice} className="ml-auto" />
        </div>

        <div className="relative">
          {/* Live badge: shown on the desktop preview; the phone frame reads as a
              live device on its own, so we skip the badge in mobile. */}
          {connected && !mobile && (
            <span
              className="pointer-events-none absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur"
              style={{ background: "rgba(20,22,31,.82)" }}
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping" style={{ background: "#e5484d" }} />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: "#e5484d" }} />
              </span>
              Live
            </span>
          )}

          <DevicePreview url={demo ? WEBSITE_DOMAIN : displayDomain} device={device}>
            {demo ? (
              <SiteMock page="home" device={device} />
            ) : websiteUrl ? (
              <LiveSiteFrame url={websiteUrl} device={device} interactive />
            ) : (
              <PreviewPlaceholder />
            )}
          </DevicePreview>
        </div>
      </div>
    </Shell>
  );
}
