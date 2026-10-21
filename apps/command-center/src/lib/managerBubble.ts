// The Manager bubble (Jake, 2026-10-20; docs/build-plans/four-agents-and-handoffs.md):
// the agency Manager's chat in the corner of every admin page. These are its
// two rules, pure so they are tested without a browser.

// The remembered open state, as localStorage holds it. Anything but our own
// "1" (nothing saved, a cleared profile, junk) reads as closed.
export const BUBBLE_KEY = "hml.managerBubble.open";

export function bubbleOpen(stored: string | null): boolean {
  return stored === "1";
}

// On the Manager's own page the full chat is already on screen.
export function hideBubbleOn(path: string): boolean {
  return /^\/admin\/agents\/manager\/?$/.test(path);
}
