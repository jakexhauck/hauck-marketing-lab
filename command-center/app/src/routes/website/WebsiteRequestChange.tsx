import { useRef, useState, type MouseEvent } from "react";
import { Pencil, Send, Inbox } from "lucide-react";
import Shell from "../../components/Shell";
import { PageHeader } from "../../components/PageHeader";
import { Panel, Badge, Button, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import {
  WEBSITE_CONTAINER,
  WEBSITE_DOMAIN,
  NotConnectedNotice,
  BrowserFrame,
  SiteMock,
  DeviceToggle,
  requestStatusMeta,
  SEED_REQUESTS,
} from "./shared";
import type { Device, ChangeRequest, SitePageKey } from "./shared";

// Website > Request a Change (the signature feature). The client clicks anywhere
// on their live site to drop a numbered pin and leave a note; each note becomes a
// request in the rail. Per the Social golden rule, the interactive canvas (built
// on fabricated demo content) only renders in demo mode; a real session shows the
// not-connected notice plus an empty state. Persistence here is client-side React
// state only, seeded from SEED_REQUESTS until the real backend lands.

// This screen always previews the home page; the pin coordinates are stored as
// percentages of the canvas (plus the device) so they land correctly at any size.
const PAGE: SitePageKey = "home";

// Scoped styles for the teardrop pin: its rotate transform lives in a class so
// hover and the focus pulse can compose on top of it. The pulse only runs when
// motion is allowed; reduced-motion users still get the persistent focus ring.
const WRC_CSS = `
.wrc-pin { transform: translate(-50%, -100%) rotate(-45deg); }
.wrc-pin > span { transform: rotate(45deg); }
@media (prefers-reduced-motion: no-preference) {
  .wrc-pin { transition: transform 0.12s var(--ease); }
  .wrc-pin:hover { transform: translate(-50%, -100%) rotate(-45deg) scale(1.08); }
  .wrc-pin-pulse { animation: wrcPinPulse 0.7s var(--ease) 2; }
  @keyframes wrcPinPulse {
    0%, 100% { transform: translate(-50%, -100%) rotate(-45deg) scale(1); }
    50% { transform: translate(-50%, -100%) rotate(-45deg) scale(1.28); }
  }
}
`;

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

export default function WebsiteRequestChange() {
  const demo = demoMode();
  const canvasRef = useRef<HTMLDivElement>(null);

  const [device, setDevice] = useState<Device>("desktop");
  const [requests, setRequests] = useState<ChangeRequest[]>(demo ? SEED_REQUESTS : []);
  // The open composer's drop point (percentages of the canvas), or null.
  const [draft, setDraft] = useState<{ xPct: number; yPct: number } | null>(null);
  const [note, setNote] = useState("");
  // The currently focused request: drives the pin pulse + rail selection. `n`
  // bumps on every focus so re-clicking the same pin restarts the animation.
  const [pulse, setPulse] = useState<{ id: string; n: number } | null>(null);

  const openCount = requests.filter((r) => r.status === "open").length;
  // Pins keep their position in the full list as their number, so a pin and its
  // rail card always share the same digit even when the canvas is filtered.
  const numbered = requests.map((r, i) => ({ r, num: i + 1 }));
  const visiblePins = numbered.filter(({ r }) => r.page === PAGE && r.device === device);
  const nextNum = requests.length + 1;

  function focus(r: ChangeRequest) {
    if (r.device !== device) setDevice(r.device);
    setPulse((p) => ({ id: r.id, n: (p?.n ?? 0) + 1 }));
  }

  function handleCanvasClick(e: MouseEvent<HTMLDivElement>) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    setDraft({ xPct, yPct });
    setNote("");
  }

  function sendRequest() {
    const text = note.trim();
    if (!text || !draft) return;
    const id = `req-${Date.now()}`;
    const created: ChangeRequest = {
      id,
      page: PAGE,
      device,
      xPct: draft.xPct,
      yPct: draft.yPct,
      note: text,
      status: "open",
      ts: "Just now",
    };
    setRequests((prev) => [...prev, created]);
    setDraft(null);
    setNote("");
    setPulse((p) => ({ id, n: (p?.n ?? 0) + 1 }));
  }

  function cancelDraft() {
    setDraft(null);
    setNote("");
  }

  return (
    <Shell>
      <div className={WEBSITE_CONTAINER}>
        <style>{WRC_CSS}</style>

        <PageHeader
          title="Request a change"
          description="Click anywhere on your site to point at exactly what you'd like changed. Drop a pin, leave a note, and we'll handle the rest."
        />

        {!demo && (
          <NotConnectedNotice message="Once your site is connected, you can click any spot on it to request a change, and your requests will live here." />
        )}

        {demo ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <DeviceToggle value={device} onChange={setDevice} />
              <p className="text-[12.5px] text-faint">
                Tip: click a request in the list to find its pin on the page.
              </p>
            </div>

            <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
              {/* Canvas: the live site as a click target. */}
              <div
                ref={canvasRef}
                onClick={handleCanvasClick}
                className="relative cursor-crosshair select-none"
              >
                <BrowserFrame url={WEBSITE_DOMAIN} device={device}>
                  <SiteMock page={PAGE} device={device} />
                </BrowserFrame>

                {/* Hint pill, hidden once a composer is open. */}
                {!draft && (
                  <div
                    className="pointer-events-none absolute left-1/2 top-[54px] z-10 inline-flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[var(--shadow-md)]"
                    style={{ background: "rgba(20,22,31,.82)", backdropFilter: "blur(8px)" }}
                  >
                    <Pencil size={13} />
                    Click anywhere to drop a pin
                  </div>
                )}

                {/* Placed pins for the current device. */}
                {visiblePins.map(({ r, num }) => {
                  const active = pulse?.id === r.id;
                  return (
                    <button
                      key={r.id + (active ? `-p${pulse!.n}` : "")}
                      type="button"
                      aria-label={`Pin ${num}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        focus(r);
                      }}
                      className={`wrc-pin absolute z-20 grid h-7 w-7 place-items-center rounded-[50%_50%_50%_2px] font-display text-[13px] font-bold text-white ${
                        active ? "wrc-pin-pulse" : ""
                      }`}
                      style={{
                        left: `${r.xPct}%`,
                        top: `${r.yPct}%`,
                        backgroundImage: "var(--grad-brand)",
                        boxShadow: active
                          ? "var(--shadow-brand), 0 0 0 3px rgba(255,255,255,.9), 0 0 0 7px rgba(79,70,229,.28)"
                          : "var(--shadow-brand), 0 0 0 3px rgba(255,255,255,.9)",
                      }}
                    >
                      <span>{num}</span>
                    </button>
                  );
                })}

                {/* Draft pin marking where the new request will land. */}
                {draft && (
                  <div
                    className="wrc-pin pointer-events-none absolute z-20 grid h-7 w-7 place-items-center rounded-[50%_50%_50%_2px] font-display text-[13px] font-bold text-white opacity-90"
                    style={{
                      left: `${draft.xPct}%`,
                      top: `${draft.yPct}%`,
                      backgroundImage: "var(--grad-brand)",
                      boxShadow: "var(--shadow-brand), 0 0 0 3px rgba(255,255,255,.9)",
                    }}
                  >
                    <span>{nextNum}</span>
                  </div>
                )}

                {/* Composer popover anchored to the drop point. */}
                {draft && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute z-30 w-72 rounded-[var(--radius-lg)] border border-border-strong bg-surface p-4 shadow-[var(--shadow-lg)]"
                    style={{
                      left: `${clamp(draft.xPct, 18, 82)}%`,
                      top: `${clamp(draft.yPct + 3, 4, 74)}%`,
                      transform: "translateX(-50%)",
                    }}
                  >
                    <div className="mb-2.5 flex items-center gap-2">
                      <span
                        className="grid h-5 w-5 place-items-center rounded-[6px] font-display text-[11px] font-bold text-white"
                        style={{ backgroundImage: "var(--grad-brand)" }}
                      >
                        {nextNum}
                      </span>
                      <h4 className="font-display text-[13.5px] text-text">
                        What would you like changed here?
                      </h4>
                    </div>
                    <textarea
                      autoFocus
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") cancelDraft();
                      }}
                      placeholder="For example: make this headline bigger, or swap this photo."
                      className="min-h-[74px] w-full resize-y rounded-[var(--radius-sm)] border border-border-strong bg-surface p-2.5 text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                    />
                    <div className="mt-2.5 flex gap-2">
                      <Button variant="secondary" size="sm" className="flex-1" onClick={cancelDraft}>
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1"
                        disabled={!note.trim()}
                        onClick={sendRequest}
                      >
                        <Send size={14} /> Send request
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Requests rail. */}
              <Panel className="overflow-hidden lg:sticky lg:top-5">
                <div className="border-b border-divider px-4 py-3.5">
                  <h3 className="font-display text-[15px] text-text">Your requests</h3>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {requests.length} {requests.length === 1 ? "request" : "requests"}, {openCount}{" "}
                    open
                  </p>
                </div>

                {requests.length > 0 ? (
                  <ul className="flex max-h-[560px] flex-col gap-2.5 overflow-auto p-3">
                    {numbered.map(({ r, num }) => {
                      const meta = requestStatusMeta(r.status);
                      const active = pulse?.id === r.id;
                      return (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => focus(r)}
                            className={`w-full rounded-[var(--radius)] border p-3 text-left transition-colors ${
                              active
                                ? "border-brand bg-brand-tint/40"
                                : "border-border hover:border-border-strong hover:bg-surface-2"
                            }`}
                          >
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <span className="flex items-center gap-2 font-display text-[13px] text-text">
                                <span
                                  className="grid h-5 w-5 place-items-center rounded-[6px] text-[11px] font-bold text-white"
                                  style={{ backgroundImage: "var(--grad-brand)" }}
                                >
                                  {num}
                                </span>
                                Request {num}
                              </span>
                              <Badge tone={meta.tone}>{meta.label}</Badge>
                            </div>
                            <p className="text-[12.5px] leading-snug text-muted">{r.note}</p>
                            <div className="mt-2 text-[11px] text-faint">
                              {r.ts} · {r.device === "mobile" ? "Mobile" : "Desktop"} view
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <EmptyState
                    icon={<Inbox size={22} />}
                    title="No requests yet"
                    description="Click anywhere on your site to drop your first pin and leave a note."
                  />
                )}
              </Panel>
            </div>
          </>
        ) : (
          <Panel className="px-4 py-12">
            <EmptyState
              icon={<Pencil size={22} />}
              title="Request a change to your site"
              description="Once your website is connected, you can click any spot on it to drop a pin and tell us exactly what to change. Your requests will track here."
            />
          </Panel>
        )}
      </div>
    </Shell>
  );
}
