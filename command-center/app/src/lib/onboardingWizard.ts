// The Onboarding wizard's own rules: what Software setup offers, and how far
// along a client is.
//
// Progress is the four checklist pillars' steps (src/lib/setupSteps.ts).
// Software setup is its own pop-up, not a pillar: its Submit ticks Software
// Account Made, which is how it counts. Neither choice changes the checklist
// or the client's app yet: what each one does is still Jake's to decide.

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

export function clientProgress(steps: SetupStepRow[], doneIds: Set<string>): Progress {
  let done = 0;
  let total = 0;
  for (const s of SETUP_SECTIONS) {
    const p = pillarProgress(steps, s.id, doneIds);
    done += p.done;
    total += p.total;
  }
  return { done, total };
}

export const pct = (p: Progress) => (p.total === 0 ? 0 : Math.round((p.done / p.total) * 100));
