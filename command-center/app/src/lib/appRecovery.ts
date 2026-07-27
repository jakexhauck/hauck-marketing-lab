import { PERSIST_CACHE_KEY, queryClient } from "./queryClient";

// Getting the app back when the app cannot get itself back.
//
// Both halves of this file used to live inside the React tree, which is exactly
// where they are no use. A service worker serves the last deploy's bundle; if
// that bundle throws while mounting, React renders nothing, so a component whose
// job is "notice a new deploy and reload" never mounts. The tab is then pinned
// to the broken version, and the only way out is DevTools. That is what happened
// on 2026-07-26: an empty #root, one worker, two caches, no way out from inside.
//
// So the update check runs before createRoot, and the reset runs from an error
// boundary that has no dependency on anything the app sets up.

// ---------------------------------------------------------------------------
// Half one: notice a new deploy, and reload into it.
// ---------------------------------------------------------------------------

// sw.ts already calls skipWaiting() + clientsClaim(), so a new deploy's worker
// takes control the moment it is found. The auto-injected registerSW.js only
// registers it and never reloads the page, so the open tab keeps executing the
// previous deploy's in-memory JS. This bridges that last step.
//
// Trigger: iOS suspends PWAs and resumes them without checking for a new worker,
// so somebody who never fully closes the app can run stale code for days.
// Forcing registration.update() on every return to the foreground (plus a slow
// heartbeat for tabs left open for hours) makes the browser go and look.
//
// Apply: when the found worker activates and claims the page, controllerchange
// fires and we reload. wasControlled guards the first claim on a fresh visit,
// where a reload would be a pointless flash and could loop.
export function startUpdateChecks(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  const wasControlled = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!wasControlled || reloading) return;
    reloading = true;
    window.location.reload();
  });

  let reg: ServiceWorkerRegistration | undefined;
  const check = () => {
    if (document.visibilityState === "visible") void reg?.update().catch(() => {});
  };
  void navigator.serviceWorker.getRegistration().then((r) => {
    reg = r ?? undefined;
    check();
  });
  document.addEventListener("visibilitychange", check);
  window.setInterval(check, 60 * 60 * 1000);

  // Deliberately never torn down. This is the page's lifetime, not a
  // component's, and there is nothing to clean up when the page goes away.
}

// ---------------------------------------------------------------------------
// Half two: the reset, for when the bundle itself is the problem.
// ---------------------------------------------------------------------------

// Everything that could be serving or storing the broken version. Wider than
// clearAllCaches() on purpose: that one is for switching account, this one is
// for "the code on this device is wrong", so it takes the worker and every
// cache rather than the two the app writes to by name.
//
// Each step is independently guarded. A reset that gives up halfway because
// storage was unavailable would leave the user exactly where they started.
export async function resetClient(): Promise<void> {
  try {
    queryClient.clear();
  } catch {
    // The client may itself be the thing that failed to construct.
  }

  try {
    // Both the real key and the demo view's, since a broken bundle cannot be
    // trusted to say which mode it was in.
    localStorage.removeItem(PERSIST_CACHE_KEY);
    localStorage.removeItem(`${PERSIST_CACHE_KEY}_demo`);
  } catch {
    // Storage unavailable: nothing persisted to clear.
  }

  if (typeof caches !== "undefined") {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n).catch(() => false)));
    } catch {
      // Cache API unavailable or blocked.
    }
  }

  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    } catch {
      // No worker to remove.
    }
  }
}

// The reset, then back to the top of the app. `/` rather than a reload, because
// the route that crashed is a plausible suspect and reloading it would land
// straight back on the same screen.
export async function resetAndReload(): Promise<void> {
  await resetClient();
  window.location.replace("/");
}
