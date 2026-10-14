import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, RefreshCw, Smartphone } from "lucide-react";

// Renders one client-app page live, inside the admin cockpit.
//
// The frame authenticates with the short-lived read-only preview token handed
// to it in the URL fragment (see src/lib/previewFrame.ts). A fragment is never
// sent to the server, so the token stays out of logs; the framed app reads it at
// boot, holds it in memory, and strips it from its own URL.
//
// Phone width is done by constraining the frame's own width, not by scaling a
// desktop render, so what shows is the real mobile layout at a real viewport.

const PHONE_WIDTH = 420;

export default function PagePreviewFrame({
  path,
  label,
  token,
  tokenError,
}: {
  path: string;
  label: string;
  token: string | null;
  tokenError: string | null;
}) {
  const [width, setWidth] = useState<"desktop" | "phone">("desktop");
  const [loading, setLoading] = useState(true);
  // Bumped to force a remount, which is the only reliable way to reload a
  // same-origin iframe we must not reach into.
  const [reloadKey, setReloadKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // The token rides in the fragment, so it never reaches the server as part of
  // the request line. Recomputed when the page or token changes, which is what
  // navigates the frame.
  const src = useMemo(() => {
    if (!token) return null;
    const joiner = path.includes("#") ? "&" : "#";
    return `${path}${joiner}preview_token=${encodeURIComponent(token)}`;
  }, [path, token]);

  useEffect(() => {
    setLoading(true);
  }, [src, reloadKey]);

  // Deliberately no "open in a new tab": that would navigate a real top-level
  // tab to a URL containing the token, and Chrome commits a navigation to its
  // on-disk history before any script can strip the fragment. An iframe's URL is
  // never recorded that way, so the token stays confined to the frame. Use
  // "Enter live app" in the header for a full-screen look; that path swaps the
  // session properly instead of passing a token through the address bar.

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-text">{label}</div>
          <code className="text-[12px] text-muted">{path}</code>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-[var(--radius)] border border-border bg-surface p-0.5">
            <button
              type="button"
              onClick={() => setWidth("desktop")}
              aria-pressed={width === "desktop"}
              title="Desktop width"
              className={`inline-flex items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                width === "desktop" ? "bg-brand-tint text-brand-text" : "text-muted hover:text-text"
              }`}
            >
              <Monitor size={14} /> Desktop
            </button>
            <button
              type="button"
              onClick={() => setWidth("phone")}
              aria-pressed={width === "phone"}
              title="Phone width"
              className={`inline-flex items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                width === "phone" ? "bg-brand-tint text-brand-text" : "text-muted hover:text-text"
              }`}
            >
              <Smartphone size={14} /> Phone
            </button>
          </div>

          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            title="Reload this page"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-2.5 py-1.5 text-[12.5px] font-semibold text-muted transition-colors hover:border-brand hover:text-text"
          >
            <RefreshCw size={14} /> Reload
          </button>

        </div>
      </div>

      <div className="relative flex-1 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-2">
        {tokenError ? (
          <div className="pk-empty">{tokenError}</div>
        ) : !src ? (
          <div className="pk-empty">Preparing the preview...</div>
        ) : (
          <>
            {loading && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-surface-2 text-[13px] text-muted">
                Loading {label}...
              </div>
            )}
            <div className="flex h-full justify-center overflow-auto">
              <iframe
                key={`${src}-${reloadKey}`}
                ref={frameRef}
                src={src}
                title={`${label} preview`}
                onLoad={() => setLoading(false)}
                className="h-full border-0 bg-bg"
                style={{
                  width: width === "phone" ? PHONE_WIDTH : "100%",
                  maxWidth: "100%",
                  // A phone-width frame keeps a visible edge so it reads as a
                  // device, not a squashed desktop page.
                  boxShadow: width === "phone" ? "0 0 0 1px var(--border)" : undefined,
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
