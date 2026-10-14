// A short tactile confirmation for the actions that change state (mark Won,
// move stage, send a message, create a lead, switch tabs). Supported browsers
// (Android/Chrome) give a brief buzz so the action feels acknowledged; iOS
// Safari ignores Vibration, and some embedded webviews throw, so this is a
// best-effort no-op where unsupported.
export function haptic(ms = 50): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // A missing buzz is harmless; never let it break the action.
  }
}
