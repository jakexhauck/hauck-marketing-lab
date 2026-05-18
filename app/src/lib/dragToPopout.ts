import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";

const TEAR_OFF_THRESHOLD_PX = 100;

export interface DragToPopoutOptions {
  /** Called after the threshold is crossed. Receives the cursor position in
   *  screen coords so the caller can place the new window roughly there. */
  onTearOff: (screen: { x: number; y: number }) => void | Promise<void>;
}

/**
 * Wire a mousedown handler that detects when the user has dragged the cursor
 * outside the main window's bounds by `TEAR_OFF_THRESHOLD_PX`. On crossing,
 * cancels normal interaction and fires `onTearOff`.
 *
 * Note: we deliberately do NOT call `appWindow.startDragging()` because that
 * blocks the JS event loop until release. Instead we track the cursor via
 * mousemove + screen-coordinate math relative to the window's bounds.
 */
export function startDragToPopout(opts: DragToPopoutOptions): () => void {
  let cancelled = false;
  let fired = false;
  let bounds: { x: number; y: number; w: number; h: number } | null = null;

  (async () => {
    try {
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      const size = await win.innerSize();
      bounds = { x: pos.x, y: pos.y, w: size.width, h: size.height };
    } catch {
      // ignore — without bounds we just bail on the next mousemove
    }
  })();

  // Use clientX/clientY from the renderer and add the window's screen origin
  // to approximate cursor screen position.
  const onMove = (e: MouseEvent) => {
    if (cancelled || fired || !bounds) return;
    // Renderer-local coords; convert to screen using bounds.
    const screenX = bounds.x + e.clientX;
    const screenY = bounds.y + e.clientY;
    const minX = bounds.x;
    const minY = bounds.y;
    const maxX = bounds.x + bounds.w;
    const maxY = bounds.y + bounds.h;

    const dx = Math.max(0, minX - screenX, screenX - maxX);
    const dy = Math.max(0, minY - screenY, screenY - maxY);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > TEAR_OFF_THRESHOLD_PX) {
      fired = true;
      cleanup();
      void opts.onTearOff({ x: screenX, y: screenY });
    }
  };

  const onUp = () => {
    cleanup();
  };

  const cleanup = () => {
    if (cancelled) return;
    cancelled = true;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);

  return cleanup;
}

export { PhysicalPosition };
