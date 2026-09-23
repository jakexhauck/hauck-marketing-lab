// The Onboarding wizard's own rules: what the Setup step offers, and how far
// along a client is.
//
// Setup counts as one item, done once both a bundle and a dialer are picked.
// The four checklist pillars count their own steps (src/lib/setupSteps.ts).
// Neither choice filters the checklist yet: which items each one adds or
// removes is still Jake's to decide.

import { SETUP_SECTIONS, type SetupSection, type SetupStepRow } from "./setupSteps";

export type Bundle = "ads" | "ads_website";
export type Dialer = "agency" | "client";

export const BUNDLES: { value: Bundle; label: string }[] = [
  { value: "ads", label: "Ads only" },
  { value: "ads_website", label: "Ads + Website" },
];

export const DIALERS: { value: Dialer; label: string }[] = [
  { value: "agency", label: "We dial" },
  { value: "client", label: "Client dials" },
];

export function isBundle(value: unknown): value is Bundle {
  return BUNDLES.some((b) => b.value === value);
}

export function isDialer(value: unknown): value is Dialer {
  return DIALERS.some((d) => d.value === value);
}

export function bundleLabel(value: string | null | undefined): string | null {
  return BUNDLES.find((b) => b.value === value)?.label ?? null;
}

export function dialerLabel(value: string | null | undefined): string | null {
  return DIALERS.find((d) => d.value === value)?.label ?? null;
}

export interface Progress {
  done: number;
  total: number;
}

export function pillarProgress(
  steps: SetupStepRow[],
  section: SetupSection,
  doneIds: Set<string>,
): Progress {
  const mine = steps.filter((s) => s.section === section);
  return { done: mine.filter((s) => doneIds.has(s.id)).length, total: mine.length };
}

export function setupDone(bundle: string | null, dialer: string | null): boolean {
  return isBundle(bundle) && isDialer(dialer);
}

export function clientProgress(
  steps: SetupStepRow[],
  doneIds: Set<string>,
  bundle: string | null,
  dialer: string | null,
): Progress {
  let done = setupDone(bundle, dialer) ? 1 : 0;
  let total = 1;
  for (const s of SETUP_SECTIONS) {
    const p = pillarProgress(steps, s.id, doneIds);
    done += p.done;
    total += p.total;
  }
  return { done, total };
}

export const pct = (p: Progress) => (p.total === 0 ? 0 : Math.round((p.done / p.total) * 100));
