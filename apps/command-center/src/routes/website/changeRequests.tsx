import {
  useRef,
  useState,
  type ReactNode,
  type MouseEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Pencil, Send, Inbox } from "lucide-react";
import { Panel, Badge, Button, EmptyState } from "../../components/ui";
import { cn } from "../../lib/cn";
import { DevicePreview, requestStatusMeta } from "./shared";
import type { ChangeRequest, Device } from "./shared";

// Shared change-request kit, folded out of the old standalone "Request a Change"
// tab so the Pages tab can host the same click-to-drop-a-pin interaction in
// place. ChangeCanvas is the live preview turned into a click target; the pins
// and note composer overlay it. RequestsRail is the "Your requests" side panel.
// Persistence still runs through useWebsiteRequests (GET/POST /api/website/
// requests); these components are presentational and take requests + add() in.

// Scoped styles for the teardrop pin: its rotate transform lives in a class so
// hover and the focus pulse can compose on top of it. The pulse only runs when
// motion is allowed; reduced-motion users still get the persistent focus ring.
export const CHANGE_PIN_CSS = `
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

export interface PinPulse {
  id: string;
  n: number;
}

// A request plus its stable 1-based number in the full list, so a pin and its
// rail card always share the same digit.
export interface NumberedRequest {
  r: ChangeRequest;
  num: number;
}

export function numberRequests(requests: ChangeRequest[]): NumberedRequest[] {
  return requests.map((r, i) => ({ r, num: i + 1 }));
}

// ---------------------------------------------------------------------------
// ChangeCanvas: the page preview as a pin target. Pins for the current page +
// device always render (so focusing a request highlights it); dropping a new
// pin and the note composer only activate in `active` (pin-drop) mode.
// ---------------------------------------------------------------------------
export function ChangeCanvas({
  pageId,
  device,
  url,
  active,
  requests,
  add,
  pulse,
  setPulse,
  children,
}: {
  // The page these pins belong to (SitePageKey in demo, path/slug when live).
  pageId: string;
  device: Device;
  // Address-bar label for the desktop browser frame.
  url: string;
  // Pin-drop mode: click-to-drop + composer are live only when true.
  active: boolean;
  requests: ChangeRequest[];
  add: (input: {
    page: string;
    device: Device;
    xPct: number;
    yPct: number;
    note: string;
  }) => Promise<ChangeRequest | null>;
  pulse: PinPulse | null;
  setPulse: Dispatch<SetStateAction<PinPulse | null>>;
  // The preview content (SiteMock / LiveSiteFrame / placeholder).
  children: ReactNode;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ xPct: number; yPct: number } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const numbered = numberRequests(requests);
  const visiblePins = numbered.filter(({ r }) => r.page === pageId && r.device === device);
  const nextNum = requests.length + 1;

  function handleCanvasClick(e: MouseEvent<HTMLDivElement>) {
    if (!active) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    setDraft({ xPct, yPct });
    setNote("");
  }

  async function sendRequest() {
    const text = note.trim();
    if (!text || !draft || saving) return;
    setSaving(true);
    const created = await add({
      page: pageId,
      device,
      xPct: draft.xPct,
      yPct: draft.yPct,
      note: text,
    });
    setSaving(false);
    setDraft(null);
    setNote("");
    if (created) setPulse((p) => ({ id: created.id, n: (p?.n ?? 0) + 1 }));
  }

  function cancelDraft() {
    setDraft(null);
    setNote("");
  }

  return (
    <div
      ref={canvasRef}
      onClick={handleCanvasClick}
      className={cn(
        "relative select-none",
        active && "cursor-crosshair",
        device === "mobile" ? "mx-auto w-[300px] max-w-full" : "w-full",
      )}
    >
      <DevicePreview url={url} device={device}>
        {children}
      </DevicePreview>

      {/* Hint pill, hidden once a composer is open. */}
      {active && !draft && (
        <div
          className="pointer-events-none absolute left-1/2 top-[54px] z-10 inline-flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-[var(--shadow-md)]"
          style={{ background: "rgba(20,22,31,.82)", backdropFilter: "blur(8px)" }}
        >
          <Pencil size={13} />
          Click anywhere to drop a pin
        </div>
      )}

      {/* Placed pins for the current page + device. */}
      {visiblePins.map(({ r, num }) => {
        const activePin = pulse?.id === r.id;
        return (
          <button
            key={r.id + (activePin ? `-p${pulse!.n}` : "")}
            type="button"
            aria-label={`Pin ${num}`}
            onClick={(e) => {
              e.stopPropagation();
              setPulse((p) => ({ id: r.id, n: (p?.n ?? 0) + 1 }));
            }}
            className={`wrc-pin absolute z-20 grid h-7 w-7 place-items-center rounded-[50%_50%_50%_2px] font-display text-[13px] font-bold text-white ${
              activePin ? "wrc-pin-pulse" : ""
            }`}
            style={{
              left: `${r.xPct}%`,
              top: `${r.yPct}%`,
              backgroundImage: "var(--grad-brand)",
              boxShadow: activePin
                ? "var(--shadow-brand), 0 0 0 3px rgba(255,255,255,.9), 0 0 0 7px rgba(79,70,229,.28)"
                : "var(--shadow-brand), 0 0 0 3px rgba(255,255,255,.9)",
            }}
          >
            <span>{num}</span>
          </button>
        );
      })}

      {/* Draft pin marking where the new request will land. */}
      {active && draft && (
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
      {active && draft && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-30 w-72 max-w-[calc(100%-1rem)] rounded-[var(--radius-lg)] border border-border-strong bg-surface p-4 shadow-[var(--shadow-lg)]"
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
              disabled={!note.trim() || saving}
              onClick={sendRequest}
            >
              <Send size={14} /> {saving ? "Sending" : "Send request"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RequestsRail: the "Your requests" side panel. Lists every request with its
// number, status, page, and device; clicking one calls onFocus so the parent can
// bring its pin into view (switching page/device if needed).
// ---------------------------------------------------------------------------
export function RequestsRail({
  requests,
  pulse,
  onFocus,
  unavailable,
  pageLabel,
}: {
  requests: ChangeRequest[];
  pulse: PinPulse | null;
  onFocus: (r: ChangeRequest) => void;
  unavailable: boolean;
  // Resolve a request's page identifier to a human label for the card.
  pageLabel: (pageId: string) => string;
}) {
  const numbered = numberRequests(requests);
  const openCount = requests.filter((r) => r.status === "open").length;

  return (
    <Panel className="overflow-hidden lg:sticky lg:top-5">
      <div className="border-b border-divider px-4 py-3.5">
        <h3 className="font-display text-[15px] text-text">Your requests</h3>
        <p className="mt-0.5 text-[12px] text-muted">
          {requests.length} {requests.length === 1 ? "request" : "requests"}, {openCount} open
        </p>
        {unavailable && (
          <p className="mt-1 text-[11.5px] text-warning">
            We could not save your requests just now. Please try again in a moment.
          </p>
        )}
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
                  onClick={() => onFocus(r)}
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
                      {pageLabel(r.page)}
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
          description="Turn on Request a change, then click anywhere on the page to drop your first pin."
        />
      )}
    </Panel>
  );
}
