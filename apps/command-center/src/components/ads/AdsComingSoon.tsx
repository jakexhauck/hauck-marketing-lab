import { Megaphone } from "lucide-react";

// What a client whose ads have not launched sees on every Paid Ads page, in
// place of a dashboard of zeros. "Launched" means Meta has recorded spend on
// their ad account (functions/lib/adsStatus.ts); until then there is no number
// worth showing, and a page of zeros reads like the ads are failing.
//
// Wording is Jake's (2026-09-22). No explainer line under it, by the house rule.
export default function AdsComingSoon() {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl text-white"
          style={{ backgroundImage: "var(--grad-brand)" }}
        >
          <Megaphone size={24} aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-display text-[20px] font-semibold text-[var(--text)]">
            Your ads haven't launched yet
          </h2>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
            Coming soon
          </div>
        </div>
      </div>
    </div>
  );
}
