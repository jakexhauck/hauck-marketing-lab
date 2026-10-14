// Client-side Web Push enablement. Must be triggered from a user gesture (a
// tap) for iOS to honour the permission prompt. Returns a coarse status the UI
// can react to. Inert / safe to call on unsupported browsers.

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

// "failed" = permission is fine but the subscription could not be created or
// saved server-side; pushes will NOT arrive, so the UI must not claim success.
export type PushEnableResult = "granted" | "denied" | "unsupported" | "failed";

// Convert a base64url VAPID public key (as served by /api/push/key) into the
// Uint8Array applicationServerKey that pushManager.subscribe expects.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window
  );
}

// iOS is the only platform that refuses Web Push to a plain browser tab: it
// exposes the Push API exclusively to apps installed on the home screen.
// Android Chrome and every desktop browser subscribe straight from the tab, so
// the "install first" step must be asked of iPhones and iPads only.
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports a desktop Mac user agent; touch points give it away.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

// The device's chosen GHL identity (the "who are you?" step stores it under
// hml_identity; the same value GHL puts in assignedTo). Sent at subscribe time
// so the server can route "assigned rep only" pushes to the right phone.
function storedIdentity(): string {
  try {
    return localStorage.getItem("hml_identity")?.trim() ?? "";
  } catch {
    return "";
  }
}

export async function enablePush(): Promise<PushEnableResult> {
  if (!pushSupported()) return "unsupported";

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "denied";

  try {
    const reg = await navigator.serviceWorker.ready;

    const keyRes = await fetch(`${API_BASE}/api/push/key`, {
      credentials: "include",
    });
    if (!keyRes.ok) return "failed";
    const { publicKey } = (await keyRes.json()) as { publicKey?: string };
    if (!publicKey) return "failed";

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const identity = storedIdentity();
    const save = await fetch(`${API_BASE}/api/push/subscribe`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(identity ? { "x-identity": identity } : {}),
      },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    // If the server never stored the subscription, no push will ever arrive.
    // Drop the local subscription so the UI's "granted but unsubscribed"
    // detection offers a retry instead of reporting phantom success.
    if (!save.ok) {
      await sub.unsubscribe().catch(() => false);
      return "failed";
    }

    return "granted";
  } catch {
    return "failed";
  }
}

// Best-effort teardown, called at sign-out while the session cookie is still
// valid: a logged-out phone must stop receiving lead PII. Unsubscribes locally
// and removes the server row keyed by endpoint.
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => false);
    await fetch(`${API_BASE}/api/push/unsubscribe`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    // Offline or server error: the local unsubscribe (when it ran) already
    // kills delivery; the server row goes stale and gets pruned on next send.
  }
}

// Remove the unread-count badge from the installed app's icon. Called at
// sign-out so a logged-out phone does not keep advertising unread leads.
export function clearAppBadge(): void {
  const nav = navigator as Navigator & {
    clearAppBadge?: () => Promise<void>;
  };
  if (typeof nav.clearAppBadge === "function") {
    void nav.clearAppBadge().catch(() => {});
  }
}

// Whether this installation currently holds a push subscription. Used to spot
// the "permission granted but not subscribed" state (e.g. after a sign-out
// unsubscribed the device) so the prompt can offer re-enabling.
export async function hasPushSubscription(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return Boolean(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

// True only when the app is running as an installed PWA. Web Push on iOS only
// works in this mode, so the Enable button is gated on it.
export function isInstalledPwa(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(display-mode: standalone)").matches;
}

// Whether notification permission has already been granted in this browser.
export function pushAlreadyGranted(): boolean {
  return (
    typeof Notification !== "undefined" && Notification.permission === "granted"
  );
}
