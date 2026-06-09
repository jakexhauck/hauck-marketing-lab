// Client-side Web Push enablement. Must be triggered from a user gesture (a
// tap) for iOS to honour the permission prompt. Returns a coarse status the UI
// can react to. Inert / safe to call on unsupported browsers.

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

export async function enablePush(): Promise<
  "granted" | "denied" | "unsupported"
> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "denied";

  const reg = await navigator.serviceWorker.ready;

  const keyRes = (await fetch("/api/push/key", {
    credentials: "include",
  }).then((r) => r.json())) as { publicKey?: string };
  if (!keyRes.publicKey) return "denied";

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
  });

  await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });

  return "granted";
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
